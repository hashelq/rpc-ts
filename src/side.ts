import {
  RTMethodHandler,
  RTEventHandler,
  Callback,
  Message,
  MessageType,
  Event,
  Method,
  RequestData,
  ResponseData,
  RPCError,
  RequestData__RT,
  Message__RT,
  ResponseData__RT,
  EventData__RT,
  EventData,
} from "./types.js";
import { isLeft } from "fp-ts/lib/Either.js";
import AbstractSocket from "./sockets/abstract.js";

function jsonOrNull(data: string): any | null {
  try {
    return JSON.parse(data);
  } catch (e: any) {
    return null;
  }
}

export default abstract class Side<
  Socket extends AbstractSocket,
  CS extends { socket: Socket },
  CBIndexType,
> {
  protected methodHandlers: Map<
    string,
    RTMethodHandler<(data: any, source: CS) => Promise<unknown>>
  > = new Map();
  protected eventHandlers: Map<
    string,
    RTEventHandler<(data: any, source: CS) => void>
  > = new Map();
  protected callbacks: Map<CBIndexType, Callback<Error | RPCError>> = new Map();
  private methodIndex = 0;

  private safeMode: boolean;

  public methodTimeout: number;

  public debugLoggerSend?: (data: string, socket: Socket) => void;
  public debugLoggerReceive?: (data: string, source: CS) => void;

  constructor({
    safeMode,
    methodTimeout,
  }: {
    safeMode: boolean;
    methodTimeout?: number;
  }) {
    this.methodTimeout = methodTimeout;
    this.safeMode = safeMode;
  }

  abstract genCallbackIndex(socket: Socket, q: number): CBIndexType;

  private handleProtocolError(message: string) {
    if (this.safeMode) return;

    throw new Error(message);
  }

  protected async onMessageMethod(request: RequestData, source: CS) {
    const handler = this.methodHandlers.get(request.n);
    let payload = undefined;
    let error = undefined;

    if (!handler) {
      error = `Method not implemented: ${request.n}`;
    } else {
      const { fn, rtRequest } = handler;
      const dataInput = rtRequest.decode(request.p);

      if (isLeft(dataInput)) error = `Method payload malformed`;
      else {
        const input = dataInput.right;

        try {
          payload = await fn(input, source);
        } catch (e: any) {
          if (e instanceof RPCError) error = e.error;
          else throw e;
        }
      }
    }

    const response: ResponseData = {
      i: request.i,
      p: payload,
      e: error,
    };
    const toSend: Message = {
      t: MessageType.Response,
      c: response,
    };

    const jdata = JSON.stringify(toSend);

    // FIMXE: unhandled send error
    source.socket.send(jdata);

    if (this.debugLoggerSend) this.debugLoggerSend(jdata, source.socket);
  }

  protected onMessageResponse(response: ResponseData, source: CS) {
    const index = this.genCallbackIndex(source.socket, response.i);
    const callback = this.callbacks.get(index);

    if (callback === undefined)
      return this.handleProtocolError(`No callback found: ${response.i}`);

    const { resolve, reject, rtResponse } = callback;

    if (response.e !== undefined)
      reject(new RPCError(response.e));
    else {
      const decoded = rtResponse.decode(response.p);

      if (isLeft(decoded))
        return this.handleProtocolError("Response body malformed.");

      resolve(decoded.right);
    }

    this.callbacks.delete(index);
  }

  protected onMessageEvent(event: EventData, source: CS) {
    const eventHandler = this.eventHandlers.get(event.n);
    if (eventHandler) {
      const { fn, rtData } = eventHandler;

      const decoded = rtData.decode(event.d);
      if (isLeft(decoded))
        return this.handleProtocolError("Event body malformed.");

      fn(decoded.right, source);
    }
  }

  protected onMessage(raw: string, source: CS) {
    if (this.debugLoggerReceive) this.debugLoggerReceive(raw, source);

    const message: object | null = jsonOrNull(raw.toString());
    if (message === null)
      return this.handleProtocolError("Failed to parse a JSON message body.");

    const decodedMsg = Message__RT.decode(message);
    if (isLeft(decodedMsg))
      return this.handleProtocolError("Message body malformed.");

    const content = decodedMsg.right.c;

    switch (decodedMsg.right.t) {
      case MessageType.Method:
        const decodedReq = RequestData__RT.decode(content);
        if (isLeft(decodedReq))
          return this.handleProtocolError("Method body malformed.");

        this.onMessageMethod(decodedReq.right, source);
        break;

      case MessageType.Response:
        const decodedRes = ResponseData__RT.decode(content);
        if (isLeft(decodedRes))
          return this.handleProtocolError("Response body malformed.");

        this.onMessageResponse(decodedRes.right, source);
        break;

      case MessageType.Event:
        const decodedEvt = EventData__RT.decode(content);
        if (isLeft(decodedEvt))
          return this.handleProtocolError("Event body malformed.");

        this.onMessageEvent(decodedEvt.right, source);
        break;

      default:
    }
  }

  protected async _sendEvent<E extends Event<any>>(
    socket: Socket,
    event: E,
  ): Promise<void> {
    const toSend: Message = {
      t: MessageType.Event,
      c: {
        n: event.name,
        d: event.data
      },
    };
    const data = JSON.stringify(toSend);
    if (this.debugLoggerSend) this.debugLoggerSend(data, socket);
    return await socket.send(data);
  }

  protected _call<Req, Resp, M extends Method<Req, Resp>>(
    socket: Socket,
    method: M,
  ) {
    return new Promise(async (resolve, reject) => {
      const data: RequestData = {
        i: this.methodIndex++,
        n: method.name,
        p: method.request,
      };
      const index = this.genCallbackIndex(socket, data.i);
      const toSend: Message = {
        t: MessageType.Method,
        c: data,
      };

      // send
      const jdata = JSON.stringify(toSend);
      try {
        await socket.send(jdata);
      } catch (e: any) {
        reject(e);
      }

      if (this.debugLoggerSend) this.debugLoggerSend(jdata, socket);

      // wait
      this.callbacks.set(index, {
        rtResponse: method.rtResponse,
        resolve,
        reject,
        startedAt: new Date(),
      });

      // Timeout for a timeout!
      // IDEA: clear timeout?
      setTimeout(() => {
        const callback = this.callbacks.get(index);
        if (callback) {
          callback.reject(new Error("timeout"));

          this.callbacks.delete(index);
        }
      }, this.methodTimeout);
    });
  }

  public onMethod<A, B, Req extends A, Res extends B>(
    methodClass: new () => Method<A, B>,
    fn: (data: Req, source: CS) => Promise<Res>,
  ) {
    const signature = new methodClass();

    if (signature.rtRequest === undefined)
      throw new Error("rtRequest of a method cannot be undefined!");

    if (signature.rtResponse === undefined)
      throw new Error("rtResponse of a method cannot be undefined!");

    const name = signature.name;
    this.methodHandlers.set(name, {
      rtRequest: signature.rtRequest,
      fn,
    });
  }

  public onEvent<A, Data extends A>(
    eventClass: new () => Event<A>,
    fn: (data: Data, source: CS) => void,
  ) {
    const signature = new eventClass();

    if (signature.rtData === undefined)
      throw new Error("rtData of an event cannot be undefined!");

    const name = signature.name;
    this.eventHandlers.set(name, { rtData: signature.rtData, fn });
  }
}

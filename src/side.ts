import { RTMethodHandler, RTEventHandler, Callback, Message, MessageType, Event, Method, RequestData, ResponseData, RPCError, RequestData__RT, Message__RT, ResponseData__RT, EventData__RT, EventData } from './types.js';
import { isLeft } from 'fp-ts/lib/Either.js';
import { WebSocket } from 'ws';

function jsonOrNull(data: string): any | null {
    try { return JSON.parse(data) }
    catch (e: any) { return null }
}

export default abstract class Side<CS extends { socket: WebSocket }, CBIndexType> {
    protected methodHandlers: Map<string, RTMethodHandler<(data: any, source: CS) => Promise<unknown>>> = new Map();
    protected eventHandlers: Map<string, RTEventHandler<(data: any, source: CS) => void>> = new Map();
    protected callbacks: Map<CBIndexType, Callback<Error | RPCError>> = new Map();
    private methodIndex = 0;

    private safeMode: boolean;

    public methodTimeout: number; 

    public debugLoggerSend?: (data: string, socket: WebSocket) => void;
    public debugLoggerReceive?: (data: string, source: CS) => void;

    constructor({ safeMode, methodTimeout }: { safeMode: boolean, methodTimeout?: number }) {
        this.methodTimeout = methodTimeout;
        this.safeMode = safeMode;
    }

    abstract genCallbackIndex(socket: WebSocket, q: number): CBIndexType;

    private handleProtocolError(message: string) {
        if (this.safeMode)
            return;

      throw new Error(message);
    }

    protected async onMessageMethod(request: RequestData, source: CS) {
        const handler = this.methodHandlers.get(request.name);
        let payload = undefined;
        let error = undefined;

        if (!handler) {
            error = `Method not implemented: ${request.name}`;
        } else {
            const { fn, rtRequest } = handler;
            const dataInput = rtRequest.decode(request.payload);

            if (isLeft(dataInput))
                error = `Method payload malformed`;
            else {
                const input = dataInput.right;

                try {
                    payload = await fn(input, source);
                } catch (e: any) {
                    if (e instanceof RPCError)
                        error = e.error;
                    else
                        throw e;
                }
            }
        }

        const response: ResponseData = { index: request.index, payload, errorRPC: error };
        const toSend: Message = {
            type: MessageType.Response,
            content: response
        };
        
        const jdata = JSON.stringify(toSend);
        
        // FIMXE: unhandled send error
        source.socket.send(jdata);

        if (this.debugLoggerSend) this.debugLoggerSend(jdata, source.socket);
    }

    protected onMessageResponse(response: ResponseData, source: CS) {
        const index = this.genCallbackIndex(source.socket, response.index)
        const callback = this.callbacks.get(index);

        if (callback === undefined)
          return this.handleProtocolError(`No callback found: ${response.index}`);

        const { resolve, reject, rtResponse } = callback;

        if (response.errorRPC !== undefined)
            reject(new RPCError(response.errorRPC));
        else {
            const decoded = rtResponse.decode(response.payload);

            if (isLeft(decoded))
                return this.handleProtocolError("Response body malformed.");

            resolve(decoded.right);
        }

        this.callbacks.delete(index);
    }

    protected onMessageEvent(event: EventData, source: CS) {
        const eventHandler = this.eventHandlers.get(event.name);
        if (eventHandler) {
            const { fn, rtData } = eventHandler;

            const decoded = rtData.decode(event.data);
            if (isLeft(decoded))
                return this.handleProtocolError("Event body malformed.");

            fn(decoded.right, source);
        };
    }

    protected onMessage(raw: string, source: CS) {
        if (this.debugLoggerReceive) this.debugLoggerReceive(raw, source);

        const message: object | null = jsonOrNull(raw.toString());
        if (message === null)
            return this.handleProtocolError("Failed to parse a JSON message body.");

        const decodedMsg = Message__RT.decode(message);
        if (isLeft(decodedMsg))
            return this.handleProtocolError("Message body malformed.");

        const content = decodedMsg.right.content;

        switch (decodedMsg.right.type) {
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

    protected _sendEvent<E extends Event<any>>(socket: WebSocket, event: E): Promise<void> {
        return new Promise((res, rej) => {
          const toSend: Message = {
              type: MessageType.Event,
              content: event
          };
          const data = JSON.stringify(toSend);
          if (this.debugLoggerSend) this.debugLoggerSend(data, socket);
          socket.send(data, x => x ? rej(x) : res());
        })
    }

    protected _call<Req, Resp, M extends Method<Req, Resp>>(socket: WebSocket, method: M) {
        return new Promise((resolve, reject) => {
            const data: RequestData = { index: this.methodIndex++, name: method.name, payload: method.request };
            const index = this.genCallbackIndex(socket, data.index);
            const toSend: Message = {
                type: MessageType.Method,
                content: data
            };

            // send
            const jdata = JSON.stringify(toSend);
            socket.send(jdata, x => x ? reject(x) : undefined);
            
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
                    callback.reject(new Error('timeout'));

                    this.callbacks.delete(index);
                };
            }, this.methodTimeout);
        });
    }

    public onMethod<A, B, Req extends A, Res extends B>(methodClass: ( new() => Method<A, B> ), fn: (data: Req, source: CS) => Promise<Res>) {
        const signature = new methodClass;

        if (signature.rtRequest === undefined)
            throw new Error("rtRequest of a method cannot be undefined!");

        if (signature.rtResponse === undefined)
            throw new Error("rtResponse of a method cannot be undefined!");

        const name = signature.name;
        this.methodHandlers.set(name, {
            rtRequest: signature.rtRequest,
            fn
        });
    }

    public onEvent<A, Data extends A>(eventClass: ( new() => Event<A> ), fn: (data: Data, source: CS) => void) {
        const signature = new eventClass;

        if (signature.rtData === undefined)
            throw new Error("rtData of an event cannot be undefined!");

        const name = signature.name;
        this.eventHandlers.set(name, { rtData: signature.rtData, fn });
    }
}

import { RTMethodHandler, RTEventHandler, Callback, Message, MessageType, Event, Method, RequestData, ResponseData, RPCError, RequestData__RT, Message__RT, ResponseData__RT, EventData__RT, EventData } from './types.js';
import { isLeft } from 'fp-ts/lib/Either.js';
import { WebSocket } from 'ws';

function jsonOrNull(data: string): any | null {
    try { return JSON.parse(data) }
    catch (e: any) { return null }
}

export default abstract class Side<CS extends { socket: WebSocket }> {
    protected methodHandlers: Map<string, RTMethodHandler<(data: any, source: CS) => Promise<unknown>>> = new Map();
    protected eventHandlers: Map<string, RTEventHandler<(data: any, source: CS) => void>> = new Map();
    protected callbacks: Map<number, Callback<Error | RPCError>> = new Map();
    protected methodIndex = 0;

    private safeMode: boolean;

    public methodTimeout: number;

    constructor({ safeMode, methodTimeout }: { safeMode: boolean, methodTimeout?: number }) {
        this.methodTimeout = methodTimeout;
        this.safeMode = safeMode;
    }

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
        
        source.socket.send(JSON.stringify(toSend));
    }

    protected onMessageResponse(response: ResponseData) {
        const callback = this.callbacks.get(response.index);

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

        this.callbacks.delete(response.index);
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

                this.onMessageResponse(decodedRes.right);
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

    protected _sendEvent<E extends Event<any>>(socket: WebSocket, event: E) {
        const toSend: Message = {
            type: MessageType.Event,
            content: event
        };
        socket.send(JSON.stringify(toSend));
    }

    protected _call<Req, Resp, M extends Method<Req, Resp>>(socket: WebSocket, method: M) {
        const data: RequestData = { index: this.methodIndex++, name: method.name, payload: method.request };
        const toSend: Message = {
            type: MessageType.Method,
            content: data
        };

        // send
        socket.send(JSON.stringify(toSend));

        // wait
        return new Promise((resolve, reject) => {
            this.callbacks.set(data.index, {
                rtResponse: method.rtResponse,
                resolve,
                reject,
                startedAt: new Date(),
            });

            // Timeout for a timeout!
            // IDEA: clear timeout?
            setTimeout(() => {
                const callback = this.callbacks.get(data.index);
                if (callback) {
                    callback.reject(new Error('timeout'));

                    this.callbacks.delete(data.index);
                };
            }, this.methodTimeout);
        });
    }

    public onMethod<A, B, Req extends A, Res extends B>(signature: Method<A, B>, fn: (data: Req, source: CS) => Promise<Res>) {
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

    public onEvent<A, Data extends A>(signature: Event<A>, fn: (data: Data, source: CS) => void) {
        if (signature.rtData === undefined)
            throw new Error("rtData of an event cannot be undefined!");

        const name = signature.name;
        this.eventHandlers.set(name, { rtData: signature.rtData, fn });
    }
}

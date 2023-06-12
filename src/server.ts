import { WebSocketServer, WebSocket } from 'ws';
import { Callback, ClientMessage, ClientMessageType, Event, Method, RequestData, ResponseData, RPCError, ServerMessage, ServerMessageType } from './types';

const DEFAULT_TIMEOUT = 60 * 1000;

function jsonOrNull(data: string): any | null {
    try { return JSON.parse(data) }
    catch (e: any) { return null }
}

export default class Server {
    private wss: WebSocketServer;
    private methodHandlers: Map<string, (clientID: number, clientWS: WebSocket, data: any) => object> = new Map();
    private eventHandlers: Map<string, (clientID: number, clientWS: WebSocket, data: any) => void> = new Map();
    private callbacks: Map<number, Callback<Error | RPCError>> = new Map();

    private clientIndex = 0;
    private methodIndex = 0;

    public clients: Map<number, WebSocket> = new Map();

    public methodTimeout: number;

    public onNewClient: (clientID: number, clientWS: WebSocket) => void;

    constructor({
        port,
        methodTimeout = DEFAULT_TIMEOUT,
        onNewClient
    }: {
        port: number,
        methodTimeout?: number,
        onNewClient?: (clientID: number, clientWS: WebSocket) => void
    }) {
        this.wss = new WebSocketServer({ port });
        this.methodTimeout = methodTimeout;

        this.onNewClient = onNewClient;

        this.wss.on('connection', (ws: WebSocket) => {
            const clientID = this.clientIndex++;

            this.clients.set(clientID, ws);

            const handlers = {
                'error': (error: any) => {
                    console.error('error', error);
                },

                'message': (message: string) => this.onMessage(clientID, ws, message),

                'close': () => {
                    this.clients.delete(clientID)
                }
            };

            for (const event in handlers) {
                ws.on(event, handlers[event]);
            }

            if (this.onNewClient)
                this.onNewClient(clientID, ws);
        });
    }

    private onMessageMethod(clientID: number, clientWS: WebSocket, request: RequestData) {
        const handler = this.methodHandlers.get(request.name);
        let payload = undefined;
        let error = undefined;

        if (!handler) {
            error = `server method not implemented: ${request.name}`;
        } else {
            try {
                payload = handler(clientID, clientWS, request.payload);
            } catch (e: any) {
                if (e instanceof RPCError)
                    error = e.error;
                else
                    throw e;
            }
        }

        const response: ResponseData = { index: request.index, payload, errorRPC: error };
        const toSend: ServerMessage = {
            type: ServerMessageType.Response,
            content: response
        };
        clientWS.send(JSON.stringify(toSend));
    }

    private onMessageResponse(response: ResponseData) {
        const callback = this.callbacks.get(response.index);

        if (callback === undefined)
            throw new Error('No callback found');

        if (response.errorRPC !== undefined)
            callback.reject(new RPCError(response.errorRPC));
        else
            callback.resolve(response.payload);

        this.callbacks.delete(response.index);
    }

    private onMessageEvent(clientID: number, ws: WebSocket, event: Event<any>) {
        const eventHandler = this.eventHandlers.get(event.name);

        if (eventHandler)
            eventHandler(clientID, ws, event.data);
    }

    private onMessage(clientID: number, ws: WebSocket, raw: string) {
        const message: ClientMessage | null = jsonOrNull(raw.toString());
        if (message === null)
            return;

        const content = message.content;

        switch (message.type) {
            case ClientMessageType.Method:
                const request = RequestData.from_object(content as any);
                this.onMessageMethod(clientID, ws, request);
                break;

            case ClientMessageType.Response:
                this.onMessageResponse(content as ResponseData);
                break;

            case ClientMessageType.Event:
                this.onMessageEvent(clientID, ws, content as Event<any>);
                break;

            default:
        }
    }

    public call<Req, Resp, M extends Method<Req, Resp>>(clientWS: WebSocket, method: M) {
        const data: RequestData = RequestData.from_method(method, this.methodIndex++);
        const toSend: ServerMessage = {
            type: ServerMessageType.Method,
            content: data
        };

        // send
        clientWS.send(JSON.stringify(toSend));

        // wait
        return new Promise((resolve, reject) => {
            this.callbacks.set(data.index, {
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

    sendEvent<E extends Event<any>>(client: WebSocket, event: E) {
        const toSend: ServerMessage = {
            type: ServerMessageType.Event,
            content: event
        };
        client.send(JSON.stringify(toSend));
    }

    broadcastEvent<E extends Event<any>>(event: E) {
        Array.from(this.clients).map(
            ([_, x]) => event.withs(this, x)
        );
    }

    public onMethod<Req, Res, T extends Method<Req, Res>>(signature: T, fn: (cientID: number, clientWS: WebSocket, data: Req) => Res) {
        const name = signature.name;
        this.methodHandlers.set(name, fn as (data: any) => any);
    }

    public onEvent<Data, T extends Event<Data>>(signature: T, fn: (clientID: number, clientWS: WebSocket, data: Data) => void) {
        const name = signature.name;
        this.eventHandlers.set(name, fn);
    }
};

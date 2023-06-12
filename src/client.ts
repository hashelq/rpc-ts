import WebSocket from 'isomorphic-ws';
import { Callback, Method, RequestData, ResponseData, RPCError, Event, ServerMessage, ServerMessageType, ClientMessage, ClientMessageType } from './types';

const DEFAULT_TIMEOUT = 60 * 1000;

enum ClientState {
    NotConnected,
    Connected,
    Connecting
}

enum ConnectError {
    AlreadyConnected,
    AlreadyConnecting,
    Connected
}

export default class Client {
    private endpoint: string;
    private state: ClientState = ClientState.NotConnected;
    private ws: WebSocket | undefined;
    private methodHandlers: Map<string, (data: any) => object> = new Map();
    private eventHandlers: Map<string, (data: any) => void> = new Map();
    private callbacks: Map<number, Callback<Error | RPCError>> = new Map();

    public timeout: number = DEFAULT_TIMEOUT;
    public throwOnNoEventHandlers = true;
    public throwOnNoMethodHandlers = true;

    private methodIndex = 0;

    constructor({
        endpoint,
        timeout = DEFAULT_TIMEOUT,
        throwOnNoEventHandlers = true,
        throwOnNoMethodHandlers = true
    }: {
        endpoint: string,
        timeout?: number,
        throwOnNoEventHandlers?: boolean,
        throwOnNoMethodHandlers?: boolean
    }) {
        this.endpoint = endpoint;
        this.timeout = timeout;
        this.throwOnNoEventHandlers = throwOnNoEventHandlers;
        this.throwOnNoMethodHandlers = throwOnNoMethodHandlers;
    }

    connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            switch (this.state) {
                case ClientState.NotConnected:
                    this.state = ClientState.Connecting;

                    const ws = new WebSocket(this.endpoint);

                    ws.on('open', () => {
                        this.state = ClientState.Connected;
                        this.ws = ws;

                        resolve();
                    });

                    ws.on('close', reject);

                    ws.on('message', (a: any) => this.onMessage(a));

                    this.ws = ws;
                    break;

                case ClientState.Connected:
                    reject(ConnectError.AlreadyConnected);
                    break;

                case ClientState.Connecting:
                    reject(ConnectError.AlreadyConnecting);
                    break;
            }
        })
    }

    private onMessageMethod(request: RequestData) {
        const handler = this.methodHandlers.get(request.name);
        let payload = undefined;
        let error = undefined;

        if (!handler) {
            error = `client method not implemented: ${request.name}`;
        } else {
            try {
                payload = handler(request.payload);
            } catch (e: any) {
                if (e instanceof RPCError)
                    error = e.error;
                else
                    throw e;
            }
        }

        const response: ResponseData = { index: request.index, payload, errorRPC: error };
        const toSend: ClientMessage = {
            type: ClientMessageType.Response,
            content: response
        };
        this.send(JSON.stringify(toSend));

        if (error && this.throwOnNoMethodHandlers)
            throw new RPCError('client method not implemented: ' + request.name);
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

    private onMessageEvent(event: Event<any>) {
        const handler = this.eventHandlers.get(event.name);

        if (!handler) {
            if (this.throwOnNoEventHandlers)
                throw new Error('No handler for event: ' + event.name);
        } else {
            handler(event);
        };
    }

    private onMessage(message: string) {
        const serverMessage: ServerMessage = JSON.parse(message);
        const content: object = serverMessage.content;

        switch (serverMessage.type) {
            case ServerMessageType.Method:
                this.onMessageMethod(content as RequestData);
                break;
            case ServerMessageType.Response:
                this.onMessageResponse(content as ResponseData);
                break;

            case ServerMessageType.Event:
                this.onMessageEvent(content as Event<any>);
                break;

            default:
                throw new Error('unimplemented ServerMessageType: ' + serverMessage.type);
        };
    }

    private send(data: string) {
        if (!this.ws)
            throw new Error('Websocket client is not opened yet!');

        this.ws.send(data);
    }

    public onEvent<Data, E extends Event<Data>>(event: E, fn: (a: Data) => void) {
        this.eventHandlers.set(event.name, fn);
    }

    public onMethod<Req, Res, T extends Method<Req, Res>>(signature: T, fn: (data: Req) => Res) {
        const name = signature.name;
        this.methodHandlers.set(name, fn as (data: any) => any);
    }

    public async sendEvent<E extends Event<any>>(event: E) {
        const message: ClientMessage = {
            type: ClientMessageType.Event,
            content: event
        };

        this.ws.send(JSON.stringify(message));
    }

    public call<Req, Resp, M extends Method<Req, Resp>>(method: M) {
        const data: RequestData = RequestData.from_method(method, this.methodIndex++);
        const toSend: ClientMessage = {
            type: ClientMessageType.Method,
            content: data
        };

        this.send(JSON.stringify(toSend));

        return new Promise((resolve, reject) => {
            this.callbacks.set(data.index, {
                resolve,
                reject,
                startedAt: new Date(),
            });

            // IDEA: clear timeout?
            setTimeout(() => {
                const callback = this.callbacks.get(data.index);
                if (callback) {
                    callback.reject(new Error('timeout'));

                    this.callbacks.delete(data.index);
                };
            }, this.timeout);
        });
    }
}

export {
    ClientState,
    ConnectError,
}

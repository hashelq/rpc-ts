import WebSocket from 'isomorphic-ws';
import Side from './side.js';
import { Method, Event } from './types.js';
import AbstractSocket from './sockets/abstract.js';

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

export default class Client<Socket extends AbstractSocket = any> extends Side<Socket, { socket: Socket }, number> {
    public state: ClientState = ClientState.NotConnected;
    public socket: Socket | undefined;

    constructor({
        socket,
        methodTimeout = DEFAULT_TIMEOUT
    }: {
        socket: Socket,
        methodTimeout?: number,
    }) {
        super({ safeMode: false, methodTimeout: methodTimeout });
        this.socket = socket;
    }

    connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            switch (this.state) {
                case ClientState.NotConnected:
                    this.state = ClientState.Connecting;
                    this.socket.on("open", () => {
                        this.state = ClientState.Connected;
                        resolve();
                    })
                    this.socket.on("close", reject);
                    this.socket.on("message", (data: string) => this.onMessage(data, { socket: this.socket }));
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

    genCallbackIndex(_: Socket, q: number): number {
        return q;
    }

    public sendEvent<E extends Event<any>>(event: E) {
        return this._sendEvent(this.socket, event);
    }

    public call<Req, Resp, M extends Method<Req, Resp>>(method: M) {
        return this._call(this.socket, method);
    };

    public close() {
        return this.socket.close();
    }
}

export {
    ClientState,
    ConnectError,
}

import WebSocket from 'isomorphic-ws';
import Side from './side.js';
import { Method, Event } from './types.js';

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

export default class Client extends Side<{ socket: WebSocket }> {
    public endpoint: string;
    public state: ClientState = ClientState.NotConnected;
    public ws: WebSocket | undefined;

    constructor({
        endpoint,
        methodTimeout = DEFAULT_TIMEOUT
    }: {
        endpoint: string,
        methodTimeout?: number,
    }) {
        super({ safeMode: false, methodTimeout: methodTimeout });
        this.endpoint = endpoint;
    }

    connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            switch (this.state) {
                case ClientState.NotConnected:
                    this.state = ClientState.Connecting;

                    const ws = new WebSocket(this.endpoint);

                    ws.onopen = () => {
                        this.state = ClientState.Connected;
                        this.ws = ws;

                        resolve();
                    };

                    ws.onclose = reject;

                    ws.onmessage = (a: any) => this.onMessage(a.data, { socket: ws });

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

    public sendEvent<E extends Event<any>>(event: E) {
        return this._sendEvent(this.ws, event);
    }

    public call<Req, Resp, M extends Method<Req, Resp>>(method: M) {
        return this._call(this.ws, method);
    };

    public close() {
      return this.ws.close();
    }
}

export {
    ClientState,
    ConnectError,
}

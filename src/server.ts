import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import Side from './side.js';
import { Event, Method } from './types.js';

const DEFAULT_TIMEOUT = 60 * 1000;

type CBIndexType = string;

export default class Server<S = void> extends Side<{ id: number, socket: WebSocket, session: S }, CBIndexType> {
    public wss: WebSocketServer;

    private clientIndex = 0;
    public clients: Map<number, WebSocket> = new Map();

    constructor({
        port,
        methodTimeout = DEFAULT_TIMEOUT,
        sessionInit
    }: {
        port: number,
        methodTimeout?: number,
        sessionInit?: (clientID: number, clientWS: WebSocket, request: IncomingMessage) => S
    }) {
        super({ safeMode: true, methodTimeout});
        this.wss = new WebSocketServer({ port });

        this.wss.on('connection', (ws: WebSocket, request: IncomingMessage) => {
            const clientID = this.clientIndex++;
            (<any> ws).tag = clientID;

            this.clients.set(clientID, ws);

            const source = {
              id: clientID,
              socket: ws,
              session: sessionInit(clientID, ws, request)
            };

            const handlers = {
                'error': (error: any) => {
                    console.error('error', error);
                },

                'message': (message: string) => this.onMessage(message, source),

                'close': () => {
                    this.clients.delete(clientID)
                }
            };

            for (const event in handlers) {
                ws.on(event, handlers[event]);
            }
        });
    } 

    genCallbackIndex(socket: WebSocket, q: number): CBIndexType {
        let w = <any> socket;

        if (w.tag === undefined)
          throw new Error(`Got a ws on server without a tag!`);

        return `${w.tag}-${q}`;
    }

    public sendEvent<E extends Event<any>>(clientWS: WebSocket, event: E) {
        return this._sendEvent(clientWS, event);
    }

    public call<Req, Resp, M extends Method<Req, Resp>>(clientWS: WebSocket, method: M) {
        return this._call(clientWS, method);
    };

    broadcastEvent<E extends Event<any>>(event: E) {
        Array.from(this.clients).map(
            ([_, x]) => event.withs(this, x)
        );
    }

    public close() {
        return this.wss.close();
    }
};

import { WebSocketServer, WebSocket } from 'ws';
import Side from './side';
import { Event, Method } from './types';

const DEFAULT_TIMEOUT = 60 * 1000;

export default class Server<S = void> extends Side<{ id: number, socket: WebSocket, session: S }> {
    private wss: WebSocketServer;

    private clientIndex = 0;
    public clients: Map<number, WebSocket> = new Map();
    public onNewClient: (clientID: number, clientWS: WebSocket) => void;

    public sessionInitializer: (id: number) => S;

    constructor({
        port,
        methodTimeout = DEFAULT_TIMEOUT,
        onNewClient,
        sessionInitializer,
    }: {
        port: number,
        methodTimeout?: number,
        onNewClient?: (clientID: number, clientWS: WebSocket) => void,
        sessionInitializer: (id: number) => S
    }) {
        super({ safeMode: true, methodTimeout});
        this.wss = new WebSocketServer({ port });

        this.sessionInitializer = sessionInitializer;
        this.onNewClient = onNewClient;

        this.wss.on('connection', (ws: WebSocket) => {
            const clientID = this.clientIndex++;

            const source = { id: clientID, socket: ws, session: this.sessionInitializer(clientID) };

            this.clients.set(clientID, ws);

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

            if (this.onNewClient)
                this.onNewClient(clientID, ws);
        });
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
};

import { WebSocketServer, WebSocket } from 'ws';
import Side from './side.js';
import { Event, Method } from './types.js';

const DEFAULT_TIMEOUT = 60 * 1000;

class TaggedWebSocket extends WebSocket {
    public tag: number;

    constructor(tag: number, address: null) {
        super(address);
        this.tag = tag;
    }
}

type CBIndexType = string;

export default class Server<S = void> extends Side<{ id: number, socket: WebSocket, session: S }, CBIndexType> {
    public wss: WebSocketServer;

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
            (<TaggedWebSocket> ws).tag = clientID;

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

    genCallbackIndex(socket: WebSocket, q: number): CBIndexType {
        let w = <TaggedWebSocket> socket;

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

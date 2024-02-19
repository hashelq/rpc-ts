import { IncomingMessage } from 'http';
import Side from './side.js';
import { Event, Method } from './types.js';
import AbstractSocket from './sockets/abstract.js';
import AbstractServer from './servers/abstract.js';

const DEFAULT_TIMEOUT = 60 * 1000;

type CBIndexType = string;

export default class Server<Socket extends AbstractSocket = any, RequestMessage = any, ServerImplementation extends AbstractServer<Socket, RequestMessage> = any, S = void> extends Side<Socket, { id: number, socket: Socket, session: S }, CBIndexType> {
    public server: ServerImplementation;

    private clientIndex = 0;
    public clients: Map<number, Socket> = new Map();

    constructor({
        server,
        methodTimeout = DEFAULT_TIMEOUT,
        sessionInit
    }: {
        server: ServerImplementation,
        methodTimeout?: number,
        sessionInit?: (clientID: number, clientSocket: Socket, request: RequestMessage) => S
    }) {
        super({ safeMode: true, methodTimeout});
        this.server = server;
        this.server.on('connection', (socket: Socket, request: RequestMessage) => {
            const clientID = this.clientIndex++;
            (<any> socket).tag = clientID;

            this.clients.set(clientID, socket);

            const source = {
              id: clientID,
              socket: socket,
              session: sessionInit(clientID, socket, request)
            };

            socket.on('message', (message: string) => {
              this.onMessage(message, source);
            });

            socket.on('error', (error: any) => {
              console.error('error', error);
            });

            socket.on('close', () => {
              this.clients.delete(clientID)
            });
        });
    } 

    genCallbackIndex(socket: Socket, q: number): CBIndexType {
        let w = <any> socket;

        if (w.tag === undefined)
          throw new Error(`Got a ws on server without a tag!`);

        return `${w.tag}-${q}`;
    }

    public sendEvent<E extends Event<any>>(socket: Socket, event: E) {
        return this._sendEvent(socket, event);
    }

    public call<Req, Resp, M extends Method<Req, Resp>>(socket: Socket, method: M) {
        return this._call(socket, method);
    };

    broadcastEvent<E extends Event<any>>(event: E) {
        Array.from(this.clients).map(
            ([_, x]) => event.withs(this, x)
        );
    }

    public close() {
        return this.server.close();
    }
};

import Client from './client';
import Server from './server';

interface Callback<Error> {
    resolve: (result: any) => void;
    reject: (error: Error) => void;
    startedAt: Date;
};

class Method<Request, Response> {
    request: Request;
    response?: Response;
    name: string;

    // If nothing, then the instance is gonna be a signature instead!
    constructor(request?: Request) {
        this.request = request;
    }

    async with(client: Client): Promise<Response> {
        return await client.call(this) as Response;
    }

    async withs(server: Server, client: WebSocket): Promise<Response> {
        return await server.call(client, this) as Response;
    }
}

class Event<Data> {
    data: Data;
    name: string;

    constructor(data?: Data) {
        this.data = data;
    }

    async with(client: Client) {
        return await client.sendEvent(this);
    }

    async withs(server: Server, ws: WebSocket) {
        return await server.sendEvent(ws, this);
    }
}

class RequestData {
    index: number;
    name: string;
    payload: object;

    json() {
        return JSON.stringify(this);
    }

    static from_object(data: { index: number, name: string, payload: object }) {
        const self = new RequestData;
        self.index = data.index;
        self.name = data.name;
        self.payload = data.payload;
        return self;
    }

    static from_method<O extends Method<any, any>>(object: O, index: number): RequestData {
        let d = new RequestData;
        d.index = index;
        d.name = object.name;
        d.payload = object.request;
        return d;
    };
}

interface ResponseData {
    index: number;
    payload?: object;
    errorRPC?: string;
}

class RPCError extends Error {
    public error: string;

    constructor(code: string) {
        super(code);
        this.error = code;
    }
}

enum ClientMessageType {
    Method,
    Response,
    Event
}

enum ServerMessageType {
    Method,
    Response,
    Event
}

interface ClientMessage {
    type: ClientMessageType;
    content: object
}

interface ServerMessage {
    type: ServerMessageType;
    content: object
}

export { Callback, Event, Method, ClientMessage, ClientMessageType, ServerMessage, ServerMessageType, RPCError, RequestData, ResponseData };

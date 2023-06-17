import * as t from 'io-ts';
import Client from './client';
import Server from './server';

interface Callback<Error> {
    rtResponse: t.Type<unknown, unknown>;

    resolve: (result: any) => void;
    reject: (error: Error) => void;
    startedAt: Date;
};

interface RTMethodHandler<T> {
    rtRequest: t.Type<unknown, unknown>;
    fn: T;
}

interface RTEventHandler<T> {
    rtData: t.Type<unknown, unknown>;
    fn: T;
}

class Method<Request, Response> {
    request: Request;
    rtRequest: t.Type<unknown, unknown>;

    response?: Response;
    rtResponse: t.Type<unknown, unknown>;
    name: string;

    // If nothing, then the instance is gonna be a signature instead!
    constructor(request?: Request) {
        this.request = request;
    }

    static new<A, B, C, D>(name: string, Req: t.Type<A, B>, Res: t.Type<C, D>) {
        return class extends Method<t.TypeOf<typeof Req>, t.TypeOf<typeof Res>> {
            name = name;
            rtRequest = Req;
            rtResponse = Res;
        };
    }

    async with(client: Client): Promise<Response> {
        return await client.call(this) as Response;
    }

    async withs(server: Server<any>, client: WebSocket): Promise<Response> {
        return await server.call(client, this) as Response;
    }
}

const EventData__RT = t.type({
    data: t.any,
    name: t.string
});

type EventData = t.TypeOf<typeof EventData__RT>;

class Event<Data> {
    data: Data;
    rtData: t.Type<unknown, unknown>;

    name: string;

    constructor(data?: Data) {
        this.data = data;
    }

    async with(client: Client) {
        return await client.sendEvent(this);
    }

    withs(server: Server<any>, ws: WebSocket) {
        return server.sendEvent(ws, this);
    }
}

const RequestData__RT = t.type({
    index: t.number,
    name: t.string,
    payload: t.any
});

type RequestData = t.TypeOf<typeof RequestData__RT>;

const ResponseData__RT = t.type({
    index: t.number,
    payload: t.any,
    errorRPC: t.union([t.string, t.undefined])
});

type ResponseData = t.TypeOf<typeof ResponseData__RT>;

class RPCError extends Error {
    public error: string;

    constructor(code: string) {
        super(code);
        this.error = code;
    }
}

enum MessageType {
    Method,
    Response,
    Event
}

const Message__RT = t.type({
    type: t.number,
    content: t.any
});

type Message = t.TypeOf<typeof Message__RT>;

export { RTEventHandler, RTMethodHandler, Callback, EventData__RT, EventData, Event, Method, Message__RT, Message, MessageType, RPCError, RequestData__RT, RequestData, ResponseData__RT, ResponseData };

import * as t from "io-ts";
import Client from './client.js';
import Server from './server.js';
import WebSocket = require('ws');
import AbstractSocket from "./sockets/abstract.js";

interface Callback<Error> {
    rtResponse: t.Type<any, any>;

    resolve: (result: any) => void;
    reject: (error: Error) => void;
    startedAt: Date;
};

interface RTMethodHandler<T> {
    rtRequest: t.Type<any, any>;
    fn: T;
}

interface RTEventHandler<T> {
    rtData: t.Type<any, any>;
    fn: T;
}

class Method<Request, Response> {
    request: Request;
    rtRequest: t.Type<any, any>;

    response?: Response;
    rtResponse: t.Type<any, any>;
    name: string;

    // If nothing, then the instance is gonna be a signature instead!
    constructor(request?: Request) {
        this.request = request;
    }

    static new<A, B>(name: string, Req: t.Type<A>, Res: t.Type<B>) {
        return class extends Method<t.TypeOf<typeof Req>, t.TypeOf<typeof Res>> {
            name = name;
            rtRequest = Req;
            rtResponse = Res;
        };
    }

    async with(client: Client<any>): Promise<Response> {
        return await client.call(this) as Response;
    }

    async withs<Socket extends AbstractSocket>(server: Server<Socket, any, any, any>, client: Socket): Promise<Response> {
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
    rtData: t.Type<any, any>;

    name: string;

    constructor(data?: Data) {
        this.data = data;
    }

    static new<A>(name: string, Data: t.Type<A>) {
        return class extends Event<t.TypeOf<typeof Data>> {
            name = name;
            rtData = Data;
        };
    }

    with(client: Client<any>): Promise<void> {
        return client.sendEvent(this);
    }

    withs<Socket extends AbstractSocket>(server: Server<Socket, any, any, any>, socket: Socket): Promise<void> {
        return server.sendEvent(socket, this);
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

import { expect } from "chai";
import { Client, Event, Method, Server } from "./index.js";
import * as t from "io-ts";
import WebSocketServerImpl from "./servers/wss.js";
import { WebSocketServer } from "ws";
import WebSocketImpl from "./sockets/ws.js";
import WebSocket from "isomorphic-ws";

const PORT_FOR_TESTING = 60123;

function createWSServerImpl() {
  return new WebSocketServerImpl(
    new WebSocketServer({ port: PORT_FOR_TESTING }),
  );
}

function createWSServer(): Server {
  return new Server({ server: createWSServerImpl(), sessionInit: () => {} });
}

async function createWSClient(): Promise<Client> {
  const socket = new WebSocketImpl(new WebSocket("ws://127.0.0.1:" + PORT_FOR_TESTING));
  const client = new Client({ socket });
  await client.connect();
  return client;
}

async function createWSEnvironment(): Promise<{
  client: Client;
  server: Server;
}> {
  const server = createWSServer();
  const client = await createWSClient();

  server.debugLoggerSend = (s) => console.log(`Server > ${s}`);
  server.debugLoggerReceive = (s) => console.log(`Server < ${s}`);

  client.debugLoggerSend = (s) => console.log(`Client > ${s}`);
  client.debugLoggerReceive = (s) => console.log(`Client < ${s}`);

  return { server, client };
}

describe("server and client", () => {
  it("Basic ClientToServer and ServerToClient RPC", async () => {
    const { server, client } = await createWSEnvironment();
    try {
      const Hello = Method.new("Hello", t.string, t.string);

      server.onMethod(Hello, async (name) => `Hello, ${name} from the server!`);
      client.onMethod(Hello, async (name) => `Hello, ${name} from a client!`);

      const NAME = "UNIVERSE";
      const method = new Hello(NAME);

      expect(await method.with(client)).to.equal(
        `Hello, ${NAME} from the server!`,
      );
      expect(await method.withs(server, server.clients.get(0))).to.equal(
        `Hello, ${NAME} from a client!`,
      );
    } finally {
      [server, client].forEach((x) => x.close());
    }
  });

  it("basic event dispath", async () => {
    const { server, client } = await createWSEnvironment();
    try {
      const Hello = Event.new("test", t.string);
      const value = "xyz";
      let counter = 0;
      
      let trigger = () => {};
      let promise = new Promise<void>(res => {
        trigger = () => {
          if (counter === 2)
            res();
        };
      });

      client.onEvent(Hello, async (s) => {
        s === value ? counter++ : null;

        trigger();
      });
      server.onEvent(Hello, async (s) => {
        s === value ? counter++ : null;

        trigger();
      });

      const event = new Hello(value);
      await event.with(client);
      await event.withs(server, server.clients.get(0)); 

      await promise;
      expect(counter).to.equal(2);
    } finally {
      [server, client].forEach((x) => x.close());
    }
  });

  it("server socket-sessions", async () => {
    const server = new Server({
      server: createWSServerImpl(),
      sessionInit: () => 0,
    });
    const client = await createWSClient();

    try {
      const SetValue = Method.new("set-value", t.number, t.void);
      const GetValue = Method.new("get-value", t.void, t.number);

      server.onMethod(SetValue, async (x, y) => {
        y.session = x;
      });

      server.onMethod(GetValue, async (_, y) => y.session);

      await new SetValue(42).with(client);
      expect(await new GetValue().with(client)).to.equal(42);
    } finally {
      [server, client].forEach((x) => x.close());
    }
  });

  it("array+composite types", async () => {
    const { server, client } = await createWSEnvironment();
    try {
      const ServerUsers = [
        {
          firstname: "Madoka",
          lastname: "Kaname",
          age: 14,
          friends: [1],
        },
        {
          firstname: "Homura",
          lastname: "Akemi",
          age: 14,
          friends: [0],
        },
        {
          firstname: "Kyuubey",
          lastname: "[DATA DELETED]",
          age: -1,
          friends: [],
        },
      ];

      // https://github.com/gcanti/io-ts/blob/master/index.md#recursive-types
      interface User {
        firstname: string;
        lastname: string;
        age: number;
        friends: User[];
      }

      const User: t.Type<User> = t.recursion("User", () =>
        t.type({
          firstname: t.string,
          lastname: t.string,
          age: t.number,
          friends: t.array(User),
        }),
      );

      const FindUser = Method.new("FindUser", t.string, User);

      server.onMethod(FindUser, async (username) => {
        const user = ServerUsers.filter(
          (x) => `${x.firstname} ${x.lastname}` === username,
        )[0];

        return {
          ...user,

          friends: user.friends.map((x) => {
            return {
              ...ServerUsers[x],
              friends: [],
            };
          }),
        };
      });

      const response = await new FindUser("Homura Akemi").with(client);

      expect(response.friends[0].firstname).to.equal("Madoka");
    } finally {
      [server, client].forEach((x) => x.close());
    }
  });
});

import { expect } from 'chai';
import { Client, Method, Server } from './index.js';
import * as t from "io-ts";

const PORT_FOR_TESTING = 60123;

function createServer(): Server {
    return new Server({ port: PORT_FOR_TESTING, sessionInitializer: () => { } });
}

async function createClient(): Promise<Client> {
    const client = new Client({
        endpoint: 'ws://127.0.0.1:' + PORT_FOR_TESTING
    });
    await client.connect();
    return client;
}

async function getBoth(): Promise<{ client: Client, server: Server }> {
    const server = createServer();
    const client = await createClient();
    return { server, client };
}

describe('server and client', () => {
    it('Basic ClientToServer and ServerToClient RPC', async () => {
        const { server, client } = await getBoth();
        try {
            class Hello extends Method<string, string> { name = 'Hello'; rtRequest = t.string; rtResponse = t.string; };

            server.onMethod(new Hello, async (name) => `Hello, ${name} from the server!`);
            client.onMethod(new Hello, async (name) => `Hello, ${name} from a client!`);

            const NAME = 'UNIVERSE';
            const method = new Hello(NAME);

            expect(await method.with(client)).to.equal(`Hello, ${NAME} from the server!`);
            expect(await method.withs(server, server.clients.get(0))).to.equal(`Hello, ${NAME} from a client!`);
        } finally {
            [server, client].forEach(x => x.close());
        }
    });

    it('server socket-sessions', async () => {
        const server = new Server({ port: PORT_FOR_TESTING, sessionInitializer: () => 0 });
        const client = await createClient();
        
        try {
            const SetValue = Method.new('set-value', t.number, t.void);
            const GetValue = Method.new('get-value', t.void, t.number);

            server.onMethod(new SetValue, async (x, y) => {
              y.session = x;
            });

            server.onMethod(new GetValue, async (_, y) => y.session);

            await (new SetValue(42)).with(client);
            expect(await (new GetValue).with(client)).to.equal(42);
        } finally {
            [server, client].forEach(x => x.close());
        }
    });

    it('array+composite types', async () => {
        const { server, client } = await getBoth();
        try {
            const ServerUsers = [{
                firstname: "Madoka",
                lastname: "Kaname",
                age: 14,
                friends: [1],
            }, {
                firstname: "Homura",
                lastname: "Akemi",
                age: 14,
                friends: [0],
            }, {
              firstname: "Kyuubey",
              lastname: "[DATA DELETED]",
              age: -1,
              friends: []
            }];

            // https://github.com/gcanti/io-ts/blob/master/index.md#recursive-types
            interface User {
              firstname: string,
              lastname: string,
              age: number,
              friends: User[]
            };

            const User: t.Type<User> = t.recursion("User", () => t.type({
                firstname: t.string,
                lastname: t.string,
                age: t.number,
                friends: t.array(User)
            }));

            const FindUser = Method.new("FindUser", t.string, User);

            server.onMethod(new FindUser, async username => {
              const user = ServerUsers.filter(x => `${x.firstname} ${x.lastname}` === username)[0];
              
              return {
                ...user,

                friends: user.friends.map(x => {
                  return {
                    ... ServerUsers[x],
                    friends: []
                  };
                })
              };
            });

            const response = await (new FindUser("Homura Akemi").with(client));

            expect(response.friends[0].firstname).to.equal("Madoka");
        } finally {
            [server, client].forEach(x => x.close());
        }
    });
});

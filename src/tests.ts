import { expect } from 'chai';
import { Client, Method, Server } from './index';
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
    it('should create server/client and check method "Hello"', async () => {
        const { server, client } = await getBoth();
        class Hello extends Method<string, string> { name = 'Hello'; rtRequest = t.string; rtResponse = t.string; };

        server.onMethod(new Hello, (name) => `Hello, ${name} from the server!`);
        client.onMethod(new Hello, (name) => `Hello, ${name} from a client!`);

        const NAME = 'UNIVERSE';
        const event = new Hello(NAME);

        expect(await event.with(client)).to.equal(`Hello, ${NAME} from the server!`);
        expect(await event.withs(server, server.clients.get(0))).to.equal(`Hello, ${NAME} from a client!`);

        [server, client].map(x => x.close());
    });

    it('should work well with array+composite types', async () => {
        const { server, client } = await getBoth();
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

        server.onMethod(new FindUser, username => {
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
        
        [server, client].map(x => x.close());
    });
});

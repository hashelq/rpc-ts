import { expect } from 'chai';
import { Client, Method, Server } from './index';

const PORT_FOR_TESTING = 60123;

function createServer(): Server {
    return new Server({ port: PORT_FOR_TESTING });
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

        class Hello extends Method<string, string> { name = 'Hello' };

        server.onMethod(new Hello, (_x, _y, name) => `Hello, ${name} from the server!`);
        client.onMethod(new Hello, (name) => `Hello, ${name} from a client!`);

        const NAME = 'UNIVERSE';
        const event = new Hello(NAME);

        expect(await event.with(client)).to.equal(`Hello, ${NAME} from the server!`);
        expect(await event.withs(server, server.clients.get(0))).to.equal(`Hello, ${NAME} from a client!`);
    });
});

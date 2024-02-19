# rpc-with-types
An experimental library that implements a bidirectional Method+Event protocol for your homogenous Typescript code.

Here is a short example how it works:
```typescript
// { server, client }

// Define a Method and an Event
const FindUser = Method.new("GetUser", t.string, t.type({ name: t.string, age: t.number }));
const NewUser = Event.new("NewUser", t.string);

// Implement a Method on the Server
server.onMethod(FindUser, name => { name: "Alice", age: 80000 });
server.onEvent(NewUser, name => console.log(`New user: ${name}`));

// Call it from the Client
const { name, age } = await (new FindUser("Alice").with(client));
new NewUser("Hashelq").with(client)
```

What is interesting, that everything you have just seen can also be used backwards!
```typescript
client.onMethod(FindUser, name => { name: "???", age: -1 });
client.onEvent(NewUser, name => console.log(`New user: ${name}`));

const { name, age } = await (new FindUser("Alice").withs(server, server.clients[0]));
new NewUser("HashElq").withs(client, server.clients[0]);
```

### How it works
The RPC works on top of the `WebSockets` protocol.

A human readable JSON text is sent between the server and client sides.

### Compatibility
`rpc-with-types` is tested against:
* nodejs 20.11.0
* bun 1.0.26

### Sessions
```typescript
interface Session {
  lastMessage: string
};

const server = new Server<Session>({ sessionInit: () => { lastMessage: "" } /* other params */});

server.onEvent(..., (message: string, { _socket, session } => {
  session.lastMessage = message;
}))
```

### Links to understand how to deal with it
* [Runtime type system for IO decoding/encoding ](https://gcanti.github.io/io-ts/)
* [io-ts github page](https://github.com/gcanti/io-ts/)
* [test.ts](https://github.com/hashelq/rpc-ts/blob/master/src/tests.ts)

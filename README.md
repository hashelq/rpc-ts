# rpc-ts
An experimental library that implements a bidirectional Method+Event protocol for your homogenous Typescript code.

Here is a short example how it works:
```typescript
// { server, client }

// Define a Method and an Event
const FindUser = Method.new("GetUser", t.string, t.type({ name: t.string, age: t.number }));
const NewUser = NewUser.new("NewUser", t.string);

// Implement a Method on a Server
server.onMethod(new FindUser, name => { name: "Alice", age: 80000 });
server.onEvent(new NewUser, name => console.log(`New user: ${name}`));

// Call it from a Client
const { name, age } = await (new FindUser("Alice").with(client));
new NewUser("Hashelq").with(client)
```

What is interesting, that everything you have just seen can also be send backwards!
```typescript
client.onMethod(new FindUser, name => { name: "???", age: -1 });
client.onEvent(new NewUser, name => console.log(`New user: ${name}`));

const { name, age } = await (new FindUser("Alice").withs(server, server.clients[0]));
new NewUser("HashElq").withs(client, server.clients[0]);
```

### How it works
The RPC protocol works on top of the `Websockets`.
A human readable js-like JSON data is transmittied between the server and client sides.

### Compatibility
To run a server, you need to have an appropriate nodejs-like runtime.
The client side can work in a modern browser (thanks isomorphic-ws) and a nodejs-like runtime.

### Sessions
Someday we find out that indexing big tables every single method request is not a good idea...

```typescript
interface Session {
  lastMessage: string
};

const server = new Server<Session>({ sessionInitializer: () => { lastMessage: "" } /* other params */});

server.onEvent(..., (message: string, { _socket, session } => {
  session.lastMessage = message;
}))
```

### Links to understand how to deal with it
* [Runtime type system for IO decoding/encoding ](https://gcanti.github.io/io-ts/)
* [io-ts github page](https://github.com/gcanti/io-ts/)
* [test.ts](https://github.com/hashelq/rpc-ts/blob/master/src/tests.ts)

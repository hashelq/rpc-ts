# Project Roadmap

### stream subscribtion

For now the lib only implements static events, while this behavior is ok for large scale applications,
it still lacks simpilicity.

The streams should work as simple as

```ts
client.subscribe(toWhat, withWhat, (forWhat): void);
```

### (external) proxy / service composition

_Not sure if it should be in this lib, but maybe._

Implement proxies capabilites, so lets say `central rpc` could directly forward a set of
methods/streams/events directly into a `ordering rpc`

Perhaps it worth of doing some sort of scheme proxifing, so the `central scheme` could extend `ordering rpc` scheme
while proxifing all the handlers it needs directly into some otheng rpc.

some code example
```ts
const ordering = { /* ordering rpc connection */ };
centralServer.forward({
    prefix: 'ordering',
    client: ordering,
    scheme: OrderingScheme
});
```

### Internal io-ts bindings
For now, the user has to install io-ts manually, as well to implement a lot of boilerplate stuff like
optional types, errors, etc.

```ts
import { Method, types } from 'rpc-with-types';

const ServerError = types.oneOf("VALIDATION_ERROR", "SERVER_ERROR");

export default {
    greet: Method.new('greet', types.string, types.result(types.string, ServerError));
};
```

### Better flexibility
Make the lib more hackable and tweakable.

### Other protocols outside of ws
Support raw unix/tcp sockets.

### Support for http embedding into express/etc.

### (external) cli utils
For now only two utils: cli client and a mitm cli proxy

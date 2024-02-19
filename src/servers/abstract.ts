import AbstractSocket from "../sockets/abstract.js";

export default abstract class AbstractServer<Socket extends AbstractSocket, RequestMessage> {
  abstract on(name: 'connection', callback: (socket: Socket, request: RequestMessage) => void): void;
  abstract close(): void;
}

import { WebSocketServer as WSSReal } from "ws";
import { IncomingMessage } from "http";
import AbstractServer from "./abstract.js";
import { WebSocketImpl } from "../index.js";

export default class WebSocketServerImpl extends AbstractServer<
  WebSocketImpl,
  IncomingMessage
> {
  wss: WSSReal;

  constructor(wss: WSSReal) {
    super();
    this.wss = wss;
  }

  on(_name: "connection", callback: (socket: WebSocketImpl, request: IncomingMessage) => void) {
    this.wss.on("connection", (socket, request) => {
      callback(new WebSocketImpl(socket), request);
    });
  }

  close() {
    this.wss.close();
  }
}

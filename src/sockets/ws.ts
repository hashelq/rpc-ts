import AbstractSocket from "./abstract.js";
import InnerWS from "isomorphic-ws";

export default class WebSocketImpl extends AbstractSocket {
  public socket: InnerWS;
  public endpoint: string;

  constructor(ws: InnerWS) {
    super();
    this.socket = ws;
  }

  on(name: string, callback: (x: any) => void): void {
    switch (name) {
      case "open": {
        this.socket.addEventListener("open", callback);
        break;
      }
      case "message": {
        const cb2 = callback as (data: string) => void;
        this.socket.addEventListener("message", (r) => cb2(r.data.toString()));
        break;
      }
      case "close": {
        this.socket.addEventListener("close", callback);
        break;
      }
      case "error": {
        this.socket.addEventListener("error", (err) => callback(err));
        break;
      }
    }
  }

  send(data: string): void {
    this.socket.send(data);
  }

  close(): void {}
}

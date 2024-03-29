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
        this.socket.on("open", callback);
        break;
      }
      case "message": {
        const cb2 = callback as (data: string) => void;
        this.socket.on("message", (r) => cb2(r.toString()));
        break;
      }
      case "close": {
        this.socket.on("close", callback);
        break;
      }
      case "error": {
        this.socket.on("error", (err) => callback(err));
        break;
      }
    }
  }

  send(data: string): Promise<void> {
    return new Promise((res, rej) => {
      this.socket.send(data, (x) => (x ? rej(x) : res()));
    });
  }

  close(): void {}
}

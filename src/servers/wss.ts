import { WebSocketServer as WSSReal } from 'ws';
import { IncomingMessage } from 'http';
import AbstractServer from './abstract.js';
import WebSocket from '../sockets/ws.js';

export default class WebSocketServerImpl extends AbstractServer<WebSocket, IncomingMessage> {
  wss: WSSReal;

  constructor(wss: WSSReal) {
    super();
    this.wss = wss;
  }

  on(_name: 'connection', callback: any) {
    this.wss.on('connection', callback);
  }

  close() {
    this.wss.close();
  }
}

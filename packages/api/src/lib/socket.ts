import { Server as SocketIOServer } from 'socket.io';
import { Server as HttpServer } from 'http';

let ioInstance: SocketIOServer | undefined;

export function initSocket(httpServer: HttpServer, options: any) {
  ioInstance = new SocketIOServer(httpServer, options);
  return ioInstance;
}

export function getIO(): SocketIOServer {
  if (!ioInstance) {
    throw new Error('Socket.IO not initialized');
  }
  return ioInstance;
}

import { WebSocketServer, WebSocket as WsWebSocket } from 'ws';
import type { AddressInfo } from 'net';

export type MockSonioxWsServer = {
  url: string;
  reset: () => void;
  getLastConfig: () => Record<string, unknown> | null;
  getConnections: () => WsWebSocket[];
  getReceivedMessages: (connectionIndex?: number) => Array<{ kind: 'json' | 'binary'; value: string | Buffer }>;
  sendJson: (message: Record<string, unknown>, connectionIndex?: number) => void;
  closeConnection: (code: number, reason: string, connectionIndex?: number) => void;
  close: () => Promise<void>;
};

export async function createMockSonioxWsServer(): Promise<MockSonioxWsServer> {
  let lastConfig: Record<string, unknown> | null = null;
  const connections: WsWebSocket[] = [];
  const receivedByConnection = new Map<WsWebSocket, Array<{ kind: 'json' | 'binary'; value: string | Buffer }>>();

  const server = new WebSocketServer({ port: 0 });
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const port = (server.address() as AddressInfo).port;

  server.on('connection', (socket) => {
    connections.push(socket);
    receivedByConnection.set(socket, []);

    socket.on('message', (data) => {
      const received = receivedByConnection.get(socket)!;
      if (Buffer.isBuffer(data) && data.length > 0 && data[0] !== 0x7b) {
        received.push({ kind: 'binary', value: data });
        return;
      }

      const text = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
      if (text.startsWith('{')) {
        lastConfig = JSON.parse(text) as Record<string, unknown>;
        received.push({ kind: 'json', value: text });
        socket.send(JSON.stringify({ status: 'configured' }));
      }
    });

    socket.on('close', () => {
      const index = connections.indexOf(socket);
      if (index >= 0) {
        connections.splice(index, 1);
      }
      receivedByConnection.delete(socket);
    });
  });

  return {
    url: `ws://127.0.0.1:${port}`,
    reset: () => {
      lastConfig = null;
      for (const socket of [...connections]) {
        socket.close();
      }
      connections.length = 0;
      receivedByConnection.clear();
    },
    getLastConfig: () => lastConfig,
    getConnections: () => connections,
    getReceivedMessages: (connectionIndex = -1) => {
      const index = connectionIndex >= 0 ? connectionIndex : connections.length - 1;
      const socket = connections[index];
      return socket ? [...(receivedByConnection.get(socket) ?? [])] : [];
    },
    sendJson: (message, connectionIndex = -1) => {
      const index = connectionIndex >= 0 ? connectionIndex : connections.length - 1;
      const socket = connections[index];
      if (!socket || socket.readyState !== WsWebSocket.OPEN) {
        throw new Error(`Soniox mock connection ${index} is not open`);
      }
      socket.send(JSON.stringify(message));
    },
    closeConnection: (code, reason, connectionIndex = -1) => {
      const index = connectionIndex >= 0 ? connectionIndex : connections.length - 1;
      const socket = connections[index];
      if (!socket) {
        throw new Error(`Soniox mock connection ${index} is not open`);
      }
      if (code === 1000) {
        socket.close(code, reason);
        return;
      }
      socket.terminate();
    },
    close: () =>
      new Promise((resolve, reject) => {
        for (const socket of connections) {
          socket.close();
        }
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

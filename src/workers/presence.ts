import { DurableObject } from 'cloudflare:workers';
import {
  MAX_SOCKETS,
  parseBroadcast,
  parseClient,
  type ServerMessage,
} from '../lib/server/presence-core';

/**
 * One live room for the whole site (task 3.2.2). Visitors hold a WebSocket here; with the
 * hibernation API the object sleeps between messages and is billed only while it works. It
 * counts the sockets ("Active now") and relays poll results from the vote endpoint.
 */
export class Presence extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.endsWith('/broadcast') && request.method === 'POST') {
      const message = parseBroadcast(await request.json().catch(() => null));
      if (!message) return new Response('bad broadcast', { status: 400 });
      this.broadcast(message);
      return new Response(null, { status: 204 });
    }
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected a WebSocket', { status: 426 });
    }
    if (this.ctx.getWebSockets().length >= MAX_SOCKETS) {
      return new Response('full', { status: 503 });
    }
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    this.broadcastCount();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (parseClient(message)) this.send(ws, { type: 'count', count: this.count() });
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    try {
      ws.close(code === 1005 ? 1000 : code, 'bye');
    } catch {
      // Already closed.
    }
    this.broadcastCount(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.broadcastCount(ws);
  }

  private count(leaving?: WebSocket): number {
    return this.ctx.getWebSockets().filter((ws) => ws !== leaving).length;
  }

  private broadcastCount(leaving?: WebSocket): void {
    this.broadcast({ type: 'count', count: this.count(leaving) }, leaving);
  }

  private broadcast(message: ServerMessage, skip?: WebSocket): void {
    for (const ws of this.ctx.getWebSockets()) if (ws !== skip) this.send(ws, message);
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    try {
      ws.send(JSON.stringify(message));
    } catch {
      // A socket that died between messages; its close event tidies up.
    }
  }
}

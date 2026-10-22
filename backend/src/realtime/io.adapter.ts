import { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { Server, ServerOptions } from 'socket.io';

/** Socket.IO on the API port, accepting the browser session cookie. */
export class RealtimeIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly config: ConfigService,
  ) {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    const origin =
      this.config.get<string>('FRONTEND_ORIGIN') ?? 'http://localhost:5173';
    const server: Server = super.createIOServer(port, {
      ...options,
      cors: { origin, credentials: true },
    }) as Server;
    return server;
  }
}

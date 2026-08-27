import type { INestApplicationContext } from "@nestjs/common";
import { Logger } from "@nestjs/common";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { Redis } from "ioredis";
import type { ServerOptions } from "socket.io";

/**
 * Redis-backed Socket.IO adapter (docs/ARCHITECTURE.md §7): without it, an
 * MQTT message ingested on API instance A never reaches a browser socket
 * connected to instance B. Shares the same REDIS_URL that BullMQ ingestion
 * already uses.
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  private adapterConstructor?: ReturnType<typeof createAdapter>;

  constructor(
    app: INestApplicationContext,
    private readonly redisUrl: string,
    private readonly corsOrigin: string,
  ) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    // Socket.IO's Redis adapter needs two dedicated connections: once a client
    // enters subscriber mode it can't issue normal commands.
    const pubClient = new Redis(this.redisUrl);
    const subClient = pubClient.duplicate();

    this.adapterConstructor = createAdapter(pubClient, subClient);
    this.logger.log("Socket.IO Redis adapter connected");
  }

  override createIOServer(port: number, options?: ServerOptions): unknown {
    const server = super.createIOServer(port, {
      ...options,
      cors: { origin: this.corsOrigin, credentials: true },
    }) as { adapter: (constructor: unknown) => void };

    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }

    return server;
  }
}

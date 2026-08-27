import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { Socket } from "socket.io";
import type { SubscribeAck } from "@iot-ai-platform/shared-types";
import { deviceRoom, orgRoom } from "@iot-ai-platform/shared-types";
import type { JwtPayload } from "../common/types/auth.types";
import { DevicesService } from "../devices/devices.service";
import { RealtimeService, type RealtimeServer } from "./realtime.service";
import { extractHandshakeToken, verifyHandshakeToken } from "./ws-auth.util";

/** `client.data.user` is populated once at connect time, not re-checked per message. */
type AuthedSocket = Socket & { data: { user?: JwtPayload } };

@WebSocketGateway({
  cors: { origin: process.env.CORS_ORIGIN, credentials: true },
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  private server!: RealtimeServer;

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly devicesService: DevicesService,
    private readonly realtimeService: RealtimeService,
  ) {}

  afterInit(server: RealtimeServer): void {
    this.realtimeService.setServer(server);
  }

  /**
   * Authenticate once, here — an unauthenticated socket is disconnected
   * rather than allowed to linger and be checked per message.
   */
  handleConnection(client: AuthedSocket): void {
    const token = extractHandshakeToken(client.handshake);

    if (!token) {
      client.disconnect(true);
      return;
    }

    const payload = verifyHandshakeToken(
      this.jwtService,
      this.config.getOrThrow<string>("JWT_ACCESS_SECRET"),
      token,
    );

    if (!payload) {
      this.logger.warn("Rejected socket connection with an invalid/expired access token");
      client.disconnect(true);
      return;
    }

    client.data.user = payload;
    // organizationId comes straight from the verified token, so the org room
    // needs no DB lookup to authorize.
    void client.join(orgRoom(payload.organizationId));
  }

  @SubscribeMessage("subscribe:device")
  async subscribeDevice(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() deviceId: string,
  ): Promise<SubscribeAck> {
    const user = client.data.user;
    if (!user) {
      return { ok: false, error: "Not authenticated" };
    }

    // Unlike the org room, a device room needs a real ownership check.
    // findOneForOrg throws NotFound for a cross-org device (no existence leak).
    try {
      await this.devicesService.findOneForOrg(user.organizationId, deviceId);
    } catch {
      return { ok: false, error: "Device not found" };
    }

    await client.join(deviceRoom(deviceId));
    return { ok: true };
  }

  @SubscribeMessage("unsubscribe:device")
  async unsubscribeDevice(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() deviceId: string,
  ): Promise<SubscribeAck> {
    // No ownership check needed to LEAVE a room.
    await client.leave(deviceRoom(deviceId));
    return { ok: true };
  }
}

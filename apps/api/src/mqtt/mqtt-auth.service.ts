import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { hashToken } from "../auth/token-hash.util";

export interface MqttAuthRequest {
  username: string;
  password: string;
  clientid: string;
}

/**
 * Backs the EMQX HTTP authentication hook (`POST /mqtt/auth`). Devices
 * connect with `username = clientid = deviceId` and `password` = the raw
 * token issued by `DevicesService.rotateCredential` — this reuses that exact
 * credential scheme (SHA-256 via `hashToken`, active-credential lookup) with
 * no new hashing/storage added. Authorization (topic scoping) is handled
 * separately by EMQX's own `${username}`-templated ACL file, not here.
 */
@Injectable()
export class MqttAuthService {
  constructor(private readonly prisma: PrismaService) {}

  async authenticate(request: MqttAuthRequest): Promise<boolean> {
    if (!request.username || !request.password || request.username !== request.clientid) {
      return false;
    }

    const device = await this.prisma.device.findFirst({
      where: { id: request.username, deactivatedAt: null },
    });

    if (!device) {
      return false;
    }

    const credential = await this.prisma.deviceCredential.findFirst({
      where: {
        deviceId: device.id,
        revokedAt: null,
        credentialHash: hashToken(request.password),
      },
    });

    return credential !== null;
  }
}

import type { JwtService } from "@nestjs/jwt";
import type { JwtPayload } from "../common/types/auth.types";

/**
 * Socket.IO handshake auth. `JwtStrategy`/`JwtAuthGuard` can't be reused here:
 * the strategy extracts strictly via `ExtractJwt.fromAuthHeaderAsBearerToken()`
 * and `AuthGuard("jwt")` reads `context.switchToHttp().getRequest()` — neither
 * exists for a WebSocket handshake. Same secret, same JwtPayload, different
 * transport.
 */
export function extractHandshakeToken(handshake: {
  auth?: Record<string, unknown>;
  headers?: Record<string, unknown>;
}): string | null {
  const authToken = handshake.auth?.token;
  if (typeof authToken === "string" && authToken.length > 0) {
    return authToken;
  }

  // Fallback for clients that can only set headers (e.g. some native clients).
  const header = handshake.headers?.authorization;
  if (typeof header === "string" && header.startsWith("Bearer ")) {
    return header.slice("Bearer ".length);
  }

  return null;
}

export function verifyHandshakeToken(
  jwtService: JwtService,
  secret: string,
  token: string,
): JwtPayload | null {
  try {
    return jwtService.verify<JwtPayload>(token, { secret });
  } catch {
    return null;
  }
}

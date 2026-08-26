/** Claims embedded in the access token; also attached to `req.user` after JwtAuthGuard runs. */
export interface JwtPayload {
  sub: string;
  email: string;
  organizationId: string;
  roles: string[];
  permissions: string[];
}

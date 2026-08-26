# syntax=docker/dockerfile:1

FROM node:20-slim AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/config/package.json packages/config/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --frozen-lockfile --filter @iot-ai-platform/api...

FROM deps AS build
COPY . .
RUN pnpm --filter @iot-ai-platform/shared-types build 2>/dev/null || true
RUN pnpm --filter @iot-ai-platform/api prisma:generate
RUN pnpm --filter @iot-ai-platform/api build

FROM node:20-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/apps/api/node_modules ./node_modules
COPY --from=build /repo/apps/api/prisma ./prisma
COPY --from=build /repo/node_modules/@iot-ai-platform ./node_modules/@iot-ai-platform

EXPOSE 4000
CMD ["node", "dist/main.js"]

# syntax=docker/dockerfile:1.7

FROM oven/bun:1 as base
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

FROM base as build
COPY tsconfig.json ./
COPY src ./src
COPY drizzle.config.ts ./
RUN bun run build

FROM oven/bun:1 as runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./package.json

EXPOSE 3000
CMD ["bun", "run", "start"]


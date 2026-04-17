FROM oven/bun:alpine

ARG NODE_ENV=production
ENV NODE_ENV=$NODE_ENV

WORKDIR /app

ARG CACHE_BUST

COPY ./ssl /app
COPY ./types.d.ts /app/types.d.ts

RUN bun install

ENTRYPOINT ["bun", "/app/index.ts"]
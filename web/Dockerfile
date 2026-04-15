FROM oven/bun:1 AS builder

WORKDIR /app

COPY ./web/package.json ./web/bun.lock ./
RUN bun install --frozen-lockfile

COPY ./web ./
COPY ./assets ./static
COPY ./constants.ts ./src/lib/constants.ts
COPY ./types.d.ts ./src/lib//types.d.ts
RUN bun run build

FROM oven/bun:1

WORKDIR /app

COPY --from=builder /app/build ./build
COPY --from=builder /app/package.json ./package.json

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

CMD ["bun", "./build/index.js"]

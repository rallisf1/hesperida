FROM oven/bun:1 AS builder

ARG NODE_ENV=production
ENV NODE_ENV=$NODE_ENV
ENV HOST=0.0.0.0
ENV PORT=3000

WORKDIR /app

COPY ./web/package.json ./web/bun.lock ./
RUN bun install --frozen-lockfile --include=dev

COPY ./web ./
COPY ./assets ./static
COPY ./constants.ts ./src/lib/constants.ts
COPY ./types.d.ts ./src/lib//types.d.ts
COPY ./notifications /notifications
COPY ./data/wappalyzer/db.sqlite /app/wappalyzer.db
RUN bun run build

FROM oven/bun:1

WORKDIR /app

COPY --from=builder /app/build ./build
COPY --from=builder /app/package.json ./package.json

CMD ["bun", "./build/index.js"]

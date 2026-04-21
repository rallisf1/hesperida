FROM oven/bun:alpine

ARG NODE_ENV=production
ENV NODE_ENV=$NODE_ENV

WORKDIR /app

ARG CACHE_BUST

COPY ./orchestrator /app
COPY ./constants.ts /app/constants.ts
COPY ./types.d.ts /app/types.d.ts
COPY ./notifications /notifications

RUN mkdir /tools
RUN ln -s /app/constants.ts /tools/constants.ts
RUN ln -s /app/types.d.ts /tools/types.d.ts

RUN bun install

ENTRYPOINT ["bun", "/app/index.ts"]

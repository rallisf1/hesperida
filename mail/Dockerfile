FROM denoland/deno:alpine

ARG NODE_ENV=production
ENV NODE_ENV=$NODE_ENV

WORKDIR /app

COPY ./mail/package.json ./mail/deno.json ./mail/deno.lock /app/

RUN deno install --frozen

ARG CACHE_BUST

COPY ./mail /app
COPY ./types.d.ts /app/types.d.ts

ENTRYPOINT ["deno", "--allow-net", "--allow-env", "/app/index.ts"]

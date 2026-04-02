FROM projectdiscovery/subfinder:latest AS subfinder

FROM oven/bun:alpine

RUN apk add --no-cache whois

WORKDIR /app

COPY ./domain /app

COPY ./constants.ts /app/constants.ts
COPY ./types.d.ts /app/types.d.ts

COPY --from=subfinder /usr/local/bin/subfinder /usr/local/bin/

RUN bun install

ENTRYPOINT ["bun", "/app/index.ts"]
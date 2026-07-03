FROM golang:1.24-bookworm AS nuclei-builder

ARG TARGETOS
ARG TARGETARCH

ENV CGO_ENABLED=0

RUN GOOS=${TARGETOS:-linux} GOARCH=${TARGETARCH:-amd64} go install github.com/projectdiscovery/nuclei/v3/cmd/nuclei@v3.4.10
RUN GOOS=${TARGETOS:-linux} GOARCH=${TARGETARCH:-amd64} go install github.com/projectdiscovery/katana/cmd/katana@v1.2.2

FROM alpine/git AS nikto-builder

RUN git clone --depth 1 https://github.com/sullo/nikto.git /nikto

FROM oven/bun:debian

ARG NODE_ENV=production
ENV NODE_ENV=$NODE_ENV
ENV PIP_ROOT_USER_ACTION=ignore

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates python3 python3-pip \
    perl openssl libnet-ssleay-perl libfindbin-libs-perl libjson-perl libtimedate-perl \
    libtime-hr-perl libxml-writer-perl sslscan \
    && pip3 install --no-cache-dir --break-system-packages wapiti3 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=nuclei-builder /go/bin/nuclei /usr/local/bin/nuclei
COPY --from=nuclei-builder /go/bin/katana /usr/local/bin/katana
COPY --from=nikto-builder /nikto/program /opt/nikto

RUN chmod +x /opt/nikto/nikto.pl \
    && ln -s /opt/nikto/nikto.pl /usr/local/bin/nikto

WORKDIR /app

COPY ./security/package.json ./security/bun.lock /app/

RUN bun install --frozen-lockfile --production --omit=peer

ARG CACHE_BUST

COPY ./security /app

ENTRYPOINT ["bun", "/app/index.ts"]

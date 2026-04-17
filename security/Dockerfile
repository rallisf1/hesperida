FROM golang:1.24-bookworm AS nuclei-builder

ARG TARGETOS
ARG TARGETARCH

ENV CGO_ENABLED=0

RUN GOOS=${TARGETOS:-linux} GOARCH=${TARGETARCH:-amd64} go install github.com/projectdiscovery/nuclei/v3/cmd/nuclei@v3.4.10

FROM alpine/git AS nikto-builder

RUN mkdir /nikto
RUN git clone https://github.com/sullo/nikto.git /nikto

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
COPY --from=nikto-builder /nikto/program /opt/nikto

RUN chmod +x /opt/nikto/nikto.pl
RUN ln -s /opt/nikto/nikto.pl /usr/local/bin/nikto

WORKDIR /app

ARG CACHE_BUST

COPY ./security /app

RUN bun install

ENTRYPOINT ["bun", "/app/index.ts"]

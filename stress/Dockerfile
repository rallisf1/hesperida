FROM golang:1.24-alpine AS vegeta-builder

ARG TARGETOS
ARG TARGETARCH

ENV CGO_ENABLED=0

RUN GOOS=${TARGETOS:-linux} GOARCH=${TARGETARCH:-amd64} go install github.com/tsenart/vegeta/v12@v12.12.0

FROM alpine:latest

RUN apk add --no-cache ca-certificates curl jq

COPY --from=vegeta-builder /go/bin/vegeta /usr/local/bin/vegeta

ARG CACHE_BUST

COPY ./stress/entrypoint.sh /entrypoint.sh
RUN chmod 755 /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]

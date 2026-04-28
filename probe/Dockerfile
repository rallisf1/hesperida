FROM projectdiscovery/httpx:latest

RUN apk add --no-cache jq curl

ARG CACHE_BUST

COPY ./probe/entrypoint.sh /entrypoint.sh
RUN chmod 755 /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]

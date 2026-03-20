#!/bin/ash

set -e

: "${SURREAL_USER:=root}"
: "${SURREAL_NAMESPACE:=main}"
: "${SURREAL_DATABASE:=main}"
: "${SURREAL_PROTOCOL:=http}"
: "${SURREAL_ADDRESS:=127.0.0.1:8000}"
: "${DEBUG:=false}"

URL="$1"
JOB_ID="$2"

httpx_output=$(httpx -rt -server -td -ip -cname -cdn -j -fr -u "$URL")
failed=$(echo "$httpx_output" | jq -r '.failed')

if [ "$failed" = "true" ]; then
    query="UPDATE $JOB_ID SET status = 'failed';"
else
    title=$(echo "$httpx_output" | jq -r '.title')
    ipv4=$(echo "$httpx_output" | jq -r '.a')
    ipv6=$(echo "$httpx_output" | jq -r '.aaaa')
    response_time=$(echo "$httpx_output" | jq -r '.time')
    server=$(echo "$httpx_output" | jq -r '.webserver')
    secure=true
    scheme=$(echo "$httpx_output" | jq -r '.scheme')
    if [ "$scheme" = "http" ]; then
        secure=false
    fi
    tech=$(echo "$httpx_output" | jq -r '.tech')
    wp_plugins=$(echo "$httpx_output" | jq -r '.wordpress.plugins')
    wp_themes=$(echo "$httpx_output" | jq -r '.wordpress.themes')
    cdn=null
    has_cdn=$(echo "$httpx_output" | jq -r '.cdn')
    if [ "$has_cdn" = "true" ]; then
        cdn=$(echo "$httpx_output" | jq -r '{name: .cdn_name, type: .cdn_type}')
    fi
    domain=$(echo "$URL" | awk -F/ '{print $3}')
    favicon=$(curl -s "https://www.google.com/s2/favicons?domain=$domain&sz=64" | base64 -w 0)

    query="INSERT INTO probe_results {
        job: $JOB_ID,
        favicon: '$favicon',
        response_time: '$response_time',
        secure: $secure,
        server: '$server',
        title: '$title',"
    if [ "$cdn" != "null" ]; then
        query="$query
        cdn: $cdn,"
    fi
    if [ "$tech" != "null" ]; then
        query="$query
        tech: $tech,"
    fi
    if [ "$wp_plugins" != "null" ]; then
        query="$query
        wp_plugins: $wp_plugins,"
    fi
    if [ "$wp_themes" != "null" ]; then
        query="$query
        wp_themes: $wp_themes,"
    fi
    if [ "$ipv4" != "null" ]; then
        query="$query
        ipv4: $ipv4,"
    fi
    if [ "$ipv6" != "null" ]; then
        query="$query
        ipv6: $ipv6,"
    fi
    query=${query%?} # remove trailing comma
    query="$query
    };"
fi

if [ "$DEBUG" = "false" ]; then
    exec >/dev/null 2>&1
fi

response=$(curl -X POST -u "$SURREAL_USER:$SURREAL_PASS" -H "surreal-ns: $SURREAL_NAMESPACE" -H "surreal-db: $SURREAL_DATABASE" -H "Accept: application/json" -d "$query" $SURREAL_PROTOCOL://$SURREAL_ADDRESS/sql)

echo "Probe results for $JOB_ID on $URL:"
echo "$response"

if echo "$response" | grep -q '"status":"ERR"'; then
  exit 1
fi
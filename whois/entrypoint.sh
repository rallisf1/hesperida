#!/bin/ash

set -e

: "${SURREAL_USER:=root}"
: "${SURREAL_NAMESPACE:=main}"
: "${SURREAL_DATABASE:=main}"
: "${SURREAL_PROTOCOL:=http}"
: "${SURREAL_ADDRESS:=127.0.0.1:8000}"
: "${DEBUG:=false}"

IP="$1"
JOB_ID="$2"

whois_output=$(whois -h bgp.tools "$IP" | tail -n +2)
IFS='|' read -r as ip prefix cc registry allocated name <<EOF
$whois_output
EOF
as=$(echo "$as" | xargs)
ip=$(echo "$ip" | xargs)
prefix=$(echo "$prefix" | xargs)
cc=$(echo "$cc" | xargs)
registry=$(echo "$registry" | xargs)
allocated=$(echo "$allocated" | xargs)
allocated="${allocated}T00:00:00Z"
name=$(echo "$name" | xargs)

query="INSERT INTO whois_results {
    job: $JOB_ID,
    as: $as,
    country: '$cc',
    date: <datetime>'$allocated',
    ip: '$ip',
    name: '$name',
    network: '$prefix',
    registry: '$registry'
};"

if [ "$DEBUG" = "false" ]; then
    exec >/dev/null 2>&1
fi

response=$(curl -X POST -u "$SURREAL_USER:$SURREAL_PASS" -H "surreal-ns: $SURREAL_NAMESPACE" -H "surreal-db: $SURREAL_DATABASE" -H "Accept: application/json" -d "$query" $SURREAL_PROTOCOL://$SURREAL_ADDRESS/sql)

echo "WHOIS results for $JOB_ID on $IP:"
echo "$response"

if echo "$response" | grep -q '"status":"ERR"'; then
  exit 1
fi
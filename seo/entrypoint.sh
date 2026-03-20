#!/bin/bash

set -e

: "${SURREAL_USER:=root}"
: "${SURREAL_NAMESPACE:=main}"
: "${SURREAL_DATABASE:=main}"
: "${SURREAL_PROTOCOL:=http}"
: "${SURREAL_ADDRESS:=127.0.0.1:8000}"
: "${DEBUG:=false}"

URL="$1"
JOB_ID="$2"

seo_output=$(seomator audit "$URL" --format json)

score=$(echo "$seo_output" | jq -r '.overallScore')
pass_sum=$(echo "$seo_output" | jq '[.categoryResults[].passCount] | add')
warn_sum=$(echo "$seo_output" | jq '[.categoryResults[].warnCount] | add')
error_sum=$(echo "$seo_output" | jq '[.categoryResults[].failCount] | add')
raw=$(echo "$seo_output" | jq -c .)

query="INSERT INTO seo_results {
    job: $JOB_ID,
    score: $score,
    passes: $pass_sum,
    warnings: $warn_sum,
    errors: $error_sum,
    raw: $raw
};"

if [ "$DEBUG" = "false" ]; then
    exec >/dev/null 2>&1
fi

response=$(curl -X POST -u "$SURREAL_USER:$SURREAL_PASS" -H "surreal-ns: $SURREAL_NAMESPACE" -H "surreal-db: $SURREAL_DATABASE" -H "Accept: application/json" -d "$query" $SURREAL_PROTOCOL://$SURREAL_ADDRESS/sql)

echo "SEO results for $JOB_ID on $URL:"
echo "$response"

if echo "$response" | grep -q '"status":"ERR"'; then
  exit 1
fi
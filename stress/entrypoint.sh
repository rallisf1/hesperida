#!/bin/ash

set -e

: "${SURREAL_USER:=root}"
: "${SURREAL_NAMESPACE:=main}"
: "${SURREAL_DATABASE:=main}"
: "${SURREAL_PROTOCOL:=http}"
: "${SURREAL_ADDRESS:=127.0.0.1:8000}"
: "${DEBUG:=false}"

: "${STRESS_RATE:=10}"
: "${STRESS_DURATION:=30s}"
: "${STRESS_METHOD:=GET}"
: "${STRESS_TIMEOUT:=10s}"
: "${STRESS_WORKERS:=10}"
: "${STRESS_MAX_WORKERS:=100}"
: "${STRESS_HEADERS:=}"
[ -z "$STRESS_HEADERS" ] && STRESS_HEADERS='{}'
: "${STRESS_BODY:=}"
: "${STRESS_LATENCY_WARN_MS:=500}"

URL="$1"
JOB_ID="$2"

if [ -z "$URL" ]; then
  echo "URL parameter missing!"
  exit 1
fi

if [ -z "$JOB_ID" ]; then
  echo "Job ID parameter missing!"
  exit 1
fi

printf 'STRESS_HEADERS=<%s>\n' "$STRESS_HEADERS"
echo "$STRESS_HEADERS" | jq -e 'type=="object"'

if ! echo "$STRESS_HEADERS" | jq -e 'type == "object"' >/dev/null 2>&1; then
  echo "Invalid STRESS_HEADERS value. Expected a JSON object."
  exit 1
fi

HEADERS_JSON=$(echo "$STRESS_HEADERS" | jq -c '.')

TMP_DIR="/tmp/stress-$RANDOM-$RANDOM"
mkdir -p "$TMP_DIR"
TARGETS_FILE="$TMP_DIR/targets.txt"
RESULTS_BIN="$TMP_DIR/results.bin"
REPORT_JSON="$TMP_DIR/report.json"
RESULTS_JSONL="$TMP_DIR/results.jsonl"
METRICS_JSON="$TMP_DIR/metrics.json"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

# Build vegeta target format
{
  echo "${STRESS_METHOD} ${URL}"
  echo "$HEADERS_JSON" | jq -r 'to_entries[]? | "\(.key): \(.value)"'
  if [ -n "$STRESS_BODY" ]; then
    echo
    printf '%s\n' "$STRESS_BODY"
  fi
} > "$TARGETS_FILE"

vegeta attack \
  -targets="$TARGETS_FILE" \
  -format=http \
  -rate="$STRESS_RATE" \
  -duration="$STRESS_DURATION" \
  -timeout="$STRESS_TIMEOUT" \
  -workers="$STRESS_WORKERS" \
  -max-workers="$STRESS_MAX_WORKERS" \
  > "$RESULTS_BIN"

vegeta report -type=json "$RESULTS_BIN" > "$REPORT_JSON"
vegeta encode -to=json "$RESULTS_BIN" > "$RESULTS_JSONL"

LAT_WARN_NS=$((STRESS_LATENCY_WARN_MS * 1000000))

jq -Rs --argjson threshold "$LAT_WARN_NS" '
  def rows:
    split("\n")
    | map(select(length > 0) | fromjson?)
    | map(select(. != null));
  {
    passes: (
      [ rows[] | select((.error == null or .error == "") and (.code >= 200 and .code < 300) and (.latency <= $threshold)) ] | length
    ),
    warnings: (
      [ rows[] | select((.error == null or .error == "") and (.code >= 200 and .code < 300) and (.latency > $threshold)) ] | length
    ),
    errors: (
      [ rows[] | select((.error != null and .error != "") or (.code < 200 or .code >= 300)) ] | length
    )
  }
' "$RESULTS_JSONL" > "$METRICS_JSON"

passes=$(jq -r '.passes' "$METRICS_JSON")
warnings=$(jq -r '.warnings' "$METRICS_JSON")
errors=$(jq -r '.errors' "$METRICS_JSON")

total=$((passes + warnings + errors))

if [ "$total" -eq 0 ]; then
  score=100
else
  score=$(awk -v p="$passes" -v t="$total" 'BEGIN { printf "%.2f", (p * 100.0) / t }')
fi

report_json=$(jq -Rs 'fromjson? // {}' "$REPORT_JSON")

raw=$(jq -nc \
  --arg target "$URL" \
  --arg rate "$STRESS_RATE" \
  --arg duration "$STRESS_DURATION" \
  --arg method "$STRESS_METHOD" \
  --arg timeout "$STRESS_TIMEOUT" \
  --arg workers "$STRESS_WORKERS" \
  --arg max_workers "$STRESS_MAX_WORKERS" \
  --argjson headers "$HEADERS_JSON" \
  --arg body "$STRESS_BODY" \
  --argjson latency_warn_ms "$STRESS_LATENCY_WARN_MS" \
  --argjson report "$report_json" \
  '{
    config: {
      target: $target,
      rate: $rate,
      duration: $duration,
      method: $method,
      timeout: $timeout,
      workers: $workers,
      max_workers: $max_workers,
      headers: $headers,
      body: $body,
      latency_warn_ms: $latency_warn_ms
    },
    report: $report
  }')

query="INSERT INTO stress_results {
  job: $JOB_ID,
  score: $score,
  passes: $passes,
  warnings: $warnings,
  errors: $errors,
  raw: $raw
};"

if [ "$DEBUG" = "false" ]; then
  exec >/dev/null 2>&1
fi

response=$(curl -X POST \
  -u "$SURREAL_USER:$SURREAL_PASS" \
  -H "surreal-ns: $SURREAL_NAMESPACE" \
  -H "surreal-db: $SURREAL_DATABASE" \
  -H "Accept: application/json" \
  -d "$query" \
  "$SURREAL_PROTOCOL://$SURREAL_ADDRESS/sql")

echo "Stress results for $JOB_ID on $URL:"
echo "$response"

if echo "$response" | grep -q '"status":"ERR"'; then
  exit 1
fi

#!/usr/bin/env bash
# Classify GET /v1/health for the free GitHub Actions uptime workflow.
# No secrets. Safe to run locally.
#
# Usage:
#   scripts/check-api-uptime.sh [--url URL] [--state FILE] [--waking-limit N]
#   scripts/check-api-uptime.sh --self-test
#
# Writes key=value lines to $GITHUB_OUTPUT when that file is set:
#   result, http_code, curl_exit, waking_streak, alert, recovered, summary, body_snippet
set -euo pipefail

URL="https://api.rembg.site/v1/health"
STATE_FILE=".uptime-state"
WAKING_LIMIT=3
CURL_MAX_TIME=25
CURL_CONNECT_TIME=10

usage() {
  sed -n '2,12p' "$0"
}

classify() {
  local http_code="$1"
  local curl_exit="$2"
  local body="$3"
  # Body on stdin so a heredoc cannot steal it from the classifier.
  printf '%s' "$body" | python3 -c '
import json
import sys

http_code = sys.argv[1]
curl_exit = int(sys.argv[2])
body = sys.stdin.read()

if curl_exit != 0:
    print("hard_fail")
    raise SystemExit(0)

if http_code == "200":
    try:
        data = json.loads(body)
    except json.JSONDecodeError:
        print("hard_fail")
        raise SystemExit(0)
    if isinstance(data, dict) and data.get("status") == "ok":
        print("ok")
        raise SystemExit(0)
    print("hard_fail")
    raise SystemExit(0)

if http_code == "503":
    try:
        data = json.loads(body)
    except json.JSONDecodeError:
        print("hard_fail")
        raise SystemExit(0)
    if isinstance(data, dict) and data.get("code") == "waking":
        print("waking")
        raise SystemExit(0)
    print("hard_fail")
    raise SystemExit(0)

print("hard_fail")
' "$http_code" "$curl_exit"
}

# Prints: needs_alert recovered new_streak new_alerted
# alerted stays set once a hard fail or persistent waking has already paged,
# so a later waking check still updates the open issue instead of waiting again.
apply_result() {
  local result="$1"
  local prev_alerted="$2"
  local prev_streak="$3"
  local limit="$4"

  local streak="$prev_streak"
  local alerted="$prev_alerted"
  local needs_alert=0
  local recovered=0

  case "$result" in
    ok)
      if [[ "$prev_alerted" == "1" ]]; then
        recovered=1
      fi
      streak=0
      alerted=0
      ;;
    waking)
      streak=$((prev_streak + 1))
      if (( streak >= limit )) || [[ "$prev_alerted" == "1" ]]; then
        needs_alert=1
        alerted=1
      fi
      ;;
    hard_fail)
      needs_alert=1
      alerted=1
      streak=0
      ;;
    *)
      echo "unknown result: $result" >&2
      return 1
      ;;
  esac

  printf '%s %s %s %s\n' "$needs_alert" "$recovered" "$streak" "$alerted"
}

read_state() {
  waking_streak=0
  alerted=0
  last_result=ok
  if [[ ! -f "$STATE_FILE" ]]; then
    return 0
  fi
  local k v
  while IFS='=' read -r k v; do
    case "$k" in
      waking_streak)
        if [[ "$v" =~ ^[0-9]+$ ]]; then
          waking_streak="$v"
        fi
        ;;
      alerted)
        if [[ "$v" == "0" || "$v" == "1" ]]; then
          alerted="$v"
        fi
        ;;
      last_result)
        case "$v" in
          ok|waking|hard_fail) last_result="$v" ;;
        esac
        ;;
    esac
  done < "$STATE_FILE"
}

write_state() {
  local result="$1"
  local streak="$2"
  local is_alerted="$3"
  local checked_utc="$4"
  mkdir -p "$(dirname -- "$STATE_FILE")"
  # dirname of ".uptime-state" is "."
  cat > "$STATE_FILE" <<EOF
last_result=${result}
waking_streak=${streak}
alerted=${is_alerted}
last_checked_utc=${checked_utc}
EOF
}

write_github_output() {
  local key="$1"
  local value="$2"
  if [[ -z "${GITHUB_OUTPUT:-}" ]]; then
    return 0
  fi
  if [[ "$value" == *$'\n'* ]]; then
    {
      echo "${key}<<UPTIME_EOF"
      printf '%s\n' "$value"
      echo "UPTIME_EOF"
    } >> "$GITHUB_OUTPUT"
  else
    printf '%s=%s\n' "$key" "$value" >> "$GITHUB_OUTPUT"
  fi
}

snippet() {
  local text="$1"
  printf '%s' "$text" | python3 -c '
import sys
text = sys.stdin.read()
text = "".join(ch if (ch == "\n" or 32 <= ord(ch) <= 126) else " " for ch in text)
text = " ".join(text.split())
print(text[:400])
'
}

self_test() {
  local failed=0
  expect_classify() {
    local want="$1" code="$2" exit_code="$3" body="$4"
    local got
    got="$(classify "$code" "$exit_code" "$body")"
    if [[ "$got" != "$want" ]]; then
      echo "FAIL classify http=$code exit=$exit_code → $got (want $want) body=$body" >&2
      failed=1
    fi
  }

  expect_apply() {
    local want="$1" result="$2" prev_alerted="$3" prev_streak="$4" limit="$5"
    local got
    got="$(apply_result "$result" "$prev_alerted" "$prev_streak" "$limit")"
    if [[ "$got" != "$want" ]]; then
      echo "FAIL apply $result alerted=$prev_alerted streak=$prev_streak → $got (want $want)" >&2
      failed=1
    fi
  }

  expect_classify ok 200 0 '{"status":"ok","model":"isnet-general-use","device":"cpu"}'
  expect_classify waking 503 0 '{"error":"Worker is loading the model","code":"waking","hint":"retry"}'
  expect_classify hard_fail 503 0 '{"error":"Model failed to load","code":"model_error","hint":"see logs"}'
  expect_classify hard_fail 503 0 '{"error":"nope"}'
  expect_classify hard_fail 500 0 '{"error":"boom"}'
  expect_classify hard_fail 200 0 'not json'
  expect_classify hard_fail 200 0 '{"status":"degraded"}'
  expect_classify hard_fail 000 28 ''
  expect_classify hard_fail 404 0 '{"status":"ok"}'

  # needs_alert recovered streak alerted
  expect_apply "0 0 0 0" ok 0 0 3
  expect_apply "0 0 1 0" waking 0 0 3
  expect_apply "0 0 2 0" waking 0 1 3
  expect_apply "1 0 3 1" waking 0 2 3
  expect_apply "1 0 0 1" hard_fail 0 0 3
  expect_apply "0 1 0 0" ok 1 3 3
  expect_apply "1 0 1 1" waking 1 0 3
  expect_apply "0 0 0 0" ok 0 1 3

  if (( failed )); then
    echo "self-test failed" >&2
    return 1
  fi
  echo "self-test passed"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --url)
      URL="$2"
      shift 2
      ;;
    --state)
      STATE_FILE="$2"
      shift 2
      ;;
    --waking-limit)
      WAKING_LIMIT="$2"
      shift 2
      ;;
    --self-test)
      self_test
      exit 0
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "unknown arg: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

checked_utc="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
body_file="$(mktemp)"
err_file="$(mktemp)"
trap 'rm -f "$body_file" "$err_file"' EXIT

set +e
http_code="$(
  curl -sS -o "$body_file" -w '%{http_code}' \
    --max-time "$CURL_MAX_TIME" \
    --connect-timeout "$CURL_CONNECT_TIME" \
    --max-filesize 65536 \
    -H 'Accept: application/json' \
    -H 'User-Agent: rembg-uptime-check/1.0 (+https://github.com/Sa-ar/remove-bg)' \
    "$URL" 2>"$err_file"
)"
curl_exit=$?
set -e

if [[ -z "$http_code" ]]; then
  http_code="000"
fi

body="$(cat "$body_file" 2>/dev/null || true)"
if [[ -z "$body" && -s "$err_file" ]]; then
  body="$(cat "$err_file")"
fi

result="$(classify "$http_code" "$curl_exit" "$body")"

read_state
read -r needs_alert recovered new_streak new_alerted < <(apply_result "$result" "$alerted" "$waking_streak" "$WAKING_LIMIT")
write_state "$result" "$new_streak" "$new_alerted" "$checked_utc"

body_snippet="$(snippet "$body")"
if [[ -z "$body_snippet" && -s "$err_file" ]]; then
  body_snippet="$(snippet "$(cat "$err_file")")"
fi

summary="${checked_utc} ${URL} → HTTP ${http_code} curl_exit=${curl_exit} result=${result} waking_streak=${new_streak}/${WAKING_LIMIT} alert=${needs_alert} recovered=${recovered}"
echo "$summary"
if [[ -n "$body_snippet" ]]; then
  echo "body: $body_snippet"
fi

write_github_output result "$result"
write_github_output http_code "$http_code"
write_github_output curl_exit "$curl_exit"
write_github_output waking_streak "$new_streak"
write_github_output waking_limit "$WAKING_LIMIT"
write_github_output alert "$needs_alert"
write_github_output recovered "$recovered"
write_github_output checked_utc "$checked_utc"
write_github_output summary "$summary"
write_github_output body_snippet "$body_snippet"
write_github_output url "$URL"

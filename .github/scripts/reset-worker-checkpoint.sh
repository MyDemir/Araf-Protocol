#!/usr/bin/env bash
# [TR] Yeni kontrat deploy'undan sonra worker checkpoint'ini güvenli sıfırlar:
#      tüm Fly makinelerini durdur -> durduklarını doğrula -> yalnız worker:last_block /
#      worker:last_safe_block sil -> makineleri başlat (hata olsa da başlatmayı dener).
#      Env: FLY_APP_NAME FLY_API_TOKEN REDIS_URL DEPLOY_BLOCK (+ test için WAIT_TIMEOUT_S, WAIT_INTERVAL_S).
#      Gizli değerler basılmaz.
# [EN] Safely resets the worker Redis checkpoint after a contract deploy (stop, delete 2 keys, start).
set -euo pipefail

die() { echo "::error::$*" >&2; exit 1; }
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
: "${FLY_APP_NAME:?FLY_APP_NAME is required}"
[[ "${DEPLOY_BLOCK:-}" =~ ^[1-9][0-9]*$ ]] || die "DEPLOY_BLOCK must be a positive integer; refusing to delete the checkpoint."
[[ "${REDIS_URL:-}" == rediss://* || "${ALLOW_PLAIN_REDIS_FOR_TEST:-}" == "1" ]] || die "REDIS_URL must be rediss://."
WAIT_TIMEOUT_S="${WAIT_TIMEOUT_S:-180}"
WAIT_INTERVAL_S="${WAIT_INTERVAL_S:-5}"

# Çıktı: "<id> <state>" satırları.
list_machines() {
  flyctl machine list --json -a "$FLY_APP_NAME" | python3 -c '
import json,sys
for m in json.load(sys.stdin):
    print(m.get("id",""), m.get("state",""))'
}

IDS=()
while read -r id _; do [ -n "$id" ] && IDS+=("$id"); done < <(list_machines)
[ "${#IDS[@]}" -gt 0 ] || die "No Fly machines found for $FLY_APP_NAME."

STOP_ATTEMPTED=0
start_all() {
  local rc=0 id
  for id in "${IDS[@]}"; do
    flyctl machine start "$id" -a "$FLY_APP_NAME" >/dev/null || { echo "::error::Failed to start machine $id"; rc=1; }
  done
  return $rc
}
on_exit() {
  local rc=$?
  trap - EXIT
  if [ "$STOP_ATTEMPTED" = "1" ]; then
    start_all || rc=1
  fi
  exit "$rc"
}
trap on_exit EXIT

STOP_ATTEMPTED=1
for id in "${IDS[@]}"; do
  flyctl machine stop "$id" -a "$FLY_APP_NAME" >/dev/null || die "Failed to stop machine $id"
done

elapsed=0
while :; do
  pending="$(list_machines | awk '$2 != "stopped" {c++} END {print c+0}')"
  [ "$pending" = "0" ] && break
  [ "$elapsed" -lt "$WAIT_TIMEOUT_S" ] || die "Timed out waiting for machines to stop ($pending still running)."
  sleep "$WAIT_INTERVAL_S"
  elapsed=$((elapsed + WAIT_INTERVAL_S))
done
echo "All ${#IDS[@]} machine(s) stopped."

node "$HERE/delete-worker-checkpoint.js"
echo "Restarting machines; worker will resume from ARAF_DEPLOYMENT_BLOCK=$DEPLOY_BLOCK."

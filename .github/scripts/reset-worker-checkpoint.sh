#!/usr/bin/env bash
# [TR] Yeni kontrat deploy'undan sonra worker checkpoint'ini güvenli sıfırlar:
#      Fly makinelerini durdur -> durduklarını doğrula -> yalnız worker:last_block /
#      worker:last_safe_block sil -> tekrar doğrula -> makineleri başlat (hata olsa da).
#      fly.toml auto_start_machines=true olduğundan proxy bir makineyi durdurmadan sonra yeniden
#      başlatabilir; bu yüzden DEL'den hemen önce ve hemen sonra doğrulanır, en fazla 3 deneme yapılır.
#      Sonda yalnız başlangıçta started olan makineler başlatılır.
#      Env: FLY_APP_NAME FLY_API_TOKEN REDIS_URL DEPLOY_BLOCK (+ test için WAIT_TIMEOUT_S, WAIT_INTERVAL_S).
#      Gizli değerler basılmaz.
# [EN] Safely resets the worker Redis checkpoint after a contract deploy (stop, verify, delete 2 keys, verify, start).
set -euo pipefail

die() { echo "::error::$*" >&2; exit 1; }
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
: "${FLY_APP_NAME:?FLY_APP_NAME is required}"
[[ "${DEPLOY_BLOCK:-}" =~ ^[1-9][0-9]*$ ]] || die "DEPLOY_BLOCK must be a positive integer; refusing to delete the checkpoint."
[[ "${REDIS_URL:-}" == rediss://* || "${ALLOW_PLAIN_REDIS_FOR_TEST:-}" == "1" ]] || die "REDIS_URL must be rediss://."
WAIT_TIMEOUT_S="${WAIT_TIMEOUT_S:-180}"
WAIT_INTERVAL_S="${WAIT_INTERVAL_S:-5}"
MAX_ATTEMPTS=3

# Çıktı: "<id> <state>" satırları.
list_machines() {
  flyctl machine list --json -a "$FLY_APP_NAME" | python3 -c '
import json,sys
for m in json.load(sys.stdin):
    print(m.get("id",""), m.get("state",""))'
}

ALL_COUNT=0
IDS=()   # yalnız başlangıçta started olanlar; sonda yalnız bunlar başlatılır
while read -r id state; do
  [ -n "$id" ] || continue
  ALL_COUNT=$((ALL_COUNT + 1))
  if [ "$state" = "started" ]; then IDS+=("$id"); fi
done < <(list_machines)
[ "$ALL_COUNT" -gt 0 ] || die "No Fly machines found for $FLY_APP_NAME."

STOP_ATTEMPTED=0
start_all() {
  local rc=0 id
  for id in ${IDS[@]+"${IDS[@]}"}; do
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

# Stopped olmayan her makineyi durdurur (auto_start proxy'si yeniden başlatmış olabilir).
stop_running() {
  local rc=0 id state
  while read -r id state; do
    if [ -n "$id" ] && [ "$state" != "stopped" ]; then
      flyctl machine stop "$id" -a "$FLY_APP_NAME" >/dev/null || { echo "::warning::Failed to stop machine $id"; rc=1; }
    fi
  done < <(list_machines)
  return $rc
}
count_running() { list_machines | awk '$1 != "" && $2 != "stopped" {c++} END {print c+0}'; }
wait_stopped() {
  local start=$SECONDS
  while [ "$(count_running)" != "0" ]; do
    [ $((SECONDS - start)) -lt "$WAIT_TIMEOUT_S" ] || return 1
    sleep "$WAIT_INTERVAL_S"
  done
}

STOP_ATTEMPTED=1
ok=0
attempt=1
while [ "$attempt" -le "$MAX_ATTEMPTS" ]; do
  ok=1
  stop_running || ok=0
  if [ "$ok" = 1 ]; then wait_stopped || ok=0; fi
  # DEL'den hemen önce doğrula.
  if [ "$ok" = 1 ] && [ "$(count_running)" != "0" ]; then ok=0; fi
  if [ "$ok" = 1 ]; then
    node "$HERE/delete-worker-checkpoint.js" || die "Checkpoint delete failed."
    # DEL'den hemen sonra doğrula: DEL'den önce başlamış süreç checkpoint'i yeniden yazmış olabilir.
    if [ "$(count_running)" != "0" ]; then ok=0; fi
  fi
  if [ "$ok" = 1 ]; then break; fi
  echo "::warning::Attempt $attempt/$MAX_ATTEMPTS: machines were not stopped around the delete; retrying."
  attempt=$((attempt + 1))
done
[ "$ok" = 1 ] || die "Could not keep all machines stopped around the checkpoint delete after $MAX_ATTEMPTS attempts."
echo "Checkpoint reset done with all machines stopped; restarting. Worker will resume from ARAF_DEPLOYMENT_BLOCK=$DEPLOY_BLOCK."

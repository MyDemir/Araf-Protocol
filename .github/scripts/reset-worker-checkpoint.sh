#!/usr/bin/env bash
# [TR] Yeni kontrat deploy'undan sonra worker checkpoint'ini güvenli sıfırlar:
#      Fly makinelerini durdur -> durduklarını doğrula -> yalnız worker:last_block /
#      worker:last_safe_block sil -> tekrar doğrula -> makineleri başlat (hata olsa da).
#      fly.toml auto_start_machines=true olduğundan proxy bir makineyi durdurmadan sonra yeniden
#      başlatabilir; bu yüzden DEL'den hemen önce ve hemen sonra doğrulanır, en fazla 3 deneme yapılır.
#      Makine listesi FAIL-CLOSED okunur: flyctl hatası, boş/geçersiz çıktı ya da 0 makine = hata.
#      Sonda yalnız başlangıçta started olan makineler başlatılır.
#      Makine yardımcıları fly-machines-lib.sh'te ortaktır (rotate-escrow-state.sh de kullanır).
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

# shellcheck source=fly-machines-lib.sh
source "$HERE/fly-machines-lib.sh"

IDS=()   # yalnız başlangıçta started olanlar; sonda yalnız bunlar başlatılır
capture_started || die "Could not list Fly machines (or none exist) for $FLY_APP_NAME."

STOP_ATTEMPTED=0
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
ok=0
attempt=1
while [ "$attempt" -le "$MAX_ATTEMPTS" ]; do
  ok=1
  stop_running || ok=0
  if [ "$ok" = 1 ]; then wait_stopped || ok=0; fi
  # DEL'den hemen önce doğrula.
  if [ "$ok" = 1 ]; then all_stopped || ok=0; fi
  if [ "$ok" = 1 ]; then
    node "$HERE/delete-worker-checkpoint.js" || die "Checkpoint delete failed."
    # DEL'den hemen sonra doğrula: DEL'den önce başlamış süreç checkpoint'i yeniden yazmış olabilir.
    all_stopped || ok=0
  fi
  if [ "$ok" = 1 ]; then break; fi
  echo "::warning::Attempt $attempt/$MAX_ATTEMPTS: machines were not verified stopped around the delete; retrying."
  attempt=$((attempt + 1))
done
[ "$ok" = 1 ] || die "Could not keep all machines stopped around the checkpoint delete after $MAX_ATTEMPTS attempts."
echo "Checkpoint reset done with all machines stopped; restarting. Worker will resume from ARAF_DEPLOYMENT_BLOCK=$DEPLOY_BLOCK."

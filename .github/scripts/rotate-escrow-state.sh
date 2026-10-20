#!/usr/bin/env bash
# [TR] Escrow rotasyonu / geri yükleme sarmalayıcısı (Arşiv Faz 2b). Çekirdek: rotate-escrow.js.
#        rotate-escrow-state.sh rotate  [--apply]
#        rotate-escrow-state.sh restore <archive_id> [--apply]
#      VARSAYILAN dry-run: makinelere dokunmaz, çekirdeği --apply'sız çağırır.
#      --apply: Fly makinelerini durdur -> durduklarını doğrula -> çekirdeği --apply ile çağır -> yine durduklarını
#      doğrula -> (restore) Fly'daki ARAF_ESCROW_ADDRESS / ARAF_DEPLOYMENT_BLOCK'u çekirdeğin bastığı RESTORE_TARGET_* değerlerine çek ve tekrar
#      durduklarını doğrula -> makineleri başlat. Çekirdek kaldığı yerden devam eder; hata olsa da `trap` ile
#      yalnız başlangıçta started olan makineler başlatılır (registry ROTATING iken bekçi worker'ı açmaz).
#      Makine yardımcıları fly-machines-lib.sh'te ortaktır (reset-worker-checkpoint.sh ile aynı fail-closed desen).
#      Env: FLY_APP_NAME FLY_API_TOKEN MONGODB_URI REDIS_URL ARAF_ESCROW_ADDRESS (+ rotate: OLD_ESCROW_ADDRESS ARAF_DEPLOYMENT_BLOCK)
#      EXPECTED_CHAIN_ID (+ RPC_URL, CONFIRM_ARCHIVE_ACTIVE_TRADES, GITHUB_* çekirdeğe geçer; test: WAIT_*, ROTATE_ESCROW_JS).
#      MASTER_ENCRYPTION_KEY / JWT_SECRET env'de OLMAMALI (varsa fail-closed). Gizli değer basılmaz, argv'ye konmaz.
# [EN] Wrapper for escrow rotation/restore: stop machines, verify, run rotate-escrow.js, verify, restart (trap).
set -euo pipefail

die() { echo "::error::$*" >&2; exit 1; }
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROTATE_JS="${ROTATE_ESCROW_JS:-$HERE/rotate-escrow.js}"

MODE="${1:-}"; shift || true
ARCHIVE_ID=""
if [ "$MODE" = "restore" ]; then
  ARCHIVE_ID="${1:-}"; shift || true
  [[ "$ARCHIVE_ID" =~ ^[0-9]{1,10}:0x[0-9a-fA-F]{40}$ ]] || die "restore requires a valid <archive_id> (<chainId>:<0x old escrow>)."
fi
APPLY=0
for a in "$@"; do
  case "$a" in
    --apply) APPLY=1 ;;
    *) die "unknown argument: $a" ;;
  esac
done
case "$MODE" in rotate|restore) ;; *) die "usage: rotate-escrow-state.sh rotate|restore <archive_id> [--apply]" ;; esac

ADDRESS_RE='^0x[0-9a-fA-F]{40}$'
: "${MONGODB_URI:?MONGODB_URI is required}"
[[ "${REDIS_URL:-}" == rediss://* || "${ALLOW_PLAIN_REDIS_FOR_TEST:-}" == "1" ]] || die "REDIS_URL must be rediss://."
# [TR] rotate: OLD_ESCROW_ADDRESS (arşivlenen), ARAF_ESCROW_ADDRESS (yeni) ve ARAF_DEPLOYMENT_BLOCK (yeni) gerekir.
#      restore: ARAF_ESCROW_ADDRESS = ŞU ANKİ aktif escrow (manifest new_escrow); hedef archive_id'den, hedef deploy
#      bloğu manifestteki old_deploy_block'tan gelir ve çekirdeğin bastığı RESTORE_TARGET_* satırlarıyla alınır.
[[ "${ARAF_ESCROW_ADDRESS:-}" =~ $ADDRESS_RE ]] || die "ARAF_ESCROW_ADDRESS must be a 0x + 40 hex address."
if [ "$MODE" = "rotate" ]; then
  [[ "${OLD_ESCROW_ADDRESS:-}" =~ $ADDRESS_RE ]] || die "OLD_ESCROW_ADDRESS must be a 0x + 40 hex address."
  [[ "${ARAF_DEPLOYMENT_BLOCK:-}" =~ ^[1-9][0-9]*$ ]] || die "ARAF_DEPLOYMENT_BLOCK must be a positive integer."
fi
[[ "${EXPECTED_CHAIN_ID:-}" =~ ^[1-9][0-9]*$ ]] || die "EXPECTED_CHAIN_ID must be a positive integer."
# Uygulama sırları bu adımın env'inde olmamalı (rotasyon PII'yi çözmez).
[ -z "${MASTER_ENCRYPTION_KEY:-}" ] && [ -z "${JWT_SECRET:-}" ] || die "MASTER_ENCRYPTION_KEY / JWT_SECRET must not be present in this step's environment."

if [ "$MODE" = "rotate" ]; then CORE_ARGS=(--rotate); else CORE_ARGS=(--restore "$ARCHIVE_ID"); fi

if [ "$APPLY" != "1" ]; then
  echo "DRY-RUN: machines are not touched; core runs without --apply."
  node "$ROTATE_JS" "${CORE_ARGS[@]}"
  exit $?
fi

: "${FLY_APP_NAME:?FLY_APP_NAME is required}"
WAIT_TIMEOUT_S="${WAIT_TIMEOUT_S:-180}"
WAIT_INTERVAL_S="${WAIT_INTERVAL_S:-5}"
MAX_ATTEMPTS=3

# shellcheck source=fly-machines-lib.sh
source "$HERE/fly-machines-lib.sh"

CORE_OUT="$(mktemp)"
IDS=()   # yalnız başlangıçta started olanlar; sonda yalnız bunlar başlatılır
capture_started || die "Could not list Fly machines (or none exist) for $FLY_APP_NAME."

STOP_ATTEMPTED=0
on_exit() {
  local rc=$?
  trap - EXIT
  rm -f "$CORE_OUT"
  if [ "$STOP_ATTEMPTED" = "1" ]; then
    start_all || rc=1
  fi
  exit "$rc"
}
trap on_exit EXIT

# Tüm makineleri durdurur ve doğrular (en fazla MAX_ATTEMPTS). Başarısızsa 1.
ensure_stopped() {
  local attempt=1
  while [ "$attempt" -le "$MAX_ATTEMPTS" ]; do
    if stop_running && wait_stopped && all_stopped; then return 0; fi
    echo "::warning::Attempt $attempt/$MAX_ATTEMPTS: machines were not verified stopped; retrying."
    attempt=$((attempt + 1))
  done
  return 1
}

STOP_ATTEMPTED=1
ok=0
attempt=1
while [ "$attempt" -le "$MAX_ATTEMPTS" ]; do
  ok=1
  stop_running || ok=0
  if [ "$ok" = 1 ]; then wait_stopped || ok=0; fi
  # Çekirdekten hemen önce doğrula.
  if [ "$ok" = 1 ]; then all_stopped || ok=0; fi
  if [ "$ok" = 1 ]; then
    # Çekirdek kaldığı yerden devam eder; hata = durur (yeniden denemek için workflow'u tekrar çalıştırın).
    node "$ROTATE_JS" "${CORE_ARGS[@]}" --apply | tee "$CORE_OUT" || die "rotate-escrow.js failed; state is resumable. Machines will be restarted; the registry guard keeps the worker closed while ROTATING. Re-run rotate-escrow.yml (mode=rotate) to complete."
    # Çekirdekten hemen sonra doğrula: bu sırada başlamış makine olabilir.
    all_stopped || ok=0
  fi
  if [ "$ok" = 1 ]; then break; fi
  echo "::warning::Attempt $attempt/$MAX_ATTEMPTS: machines were not verified stopped around the core run; retrying (core is idempotent)."
  attempt=$((attempt + 1))
done
[ "$ok" = 1 ] || die "Could not keep all machines stopped around the rotation after $MAX_ATTEMPTS attempts."

if [ "$MODE" = "restore" ]; then
  # Fly'a YALNIZ çekirdeğin bastığı iki hedef değer yazılır (tasarım §4/6). Fly yayın makineleri yeniden başlatabilir:
  # sonra tekrar durdurma doğrulaması yapılır.
  TARGET_ESCROW="$(sed -n 's/^RESTORE_TARGET_ESCROW=\(0x[0-9a-fA-F]\{40\}\)$/\1/p' "$CORE_OUT" | tail -n 1)"
  TARGET_BLOCK="$(sed -n 's/^RESTORE_TARGET_DEPLOY_BLOCK=\([1-9][0-9]*\)$/\1/p' "$CORE_OUT" | tail -n 1)"
  [ -n "$TARGET_ESCROW" ] && [ -n "$TARGET_BLOCK" ] || die "Core did not report RESTORE_TARGET_ESCROW / RESTORE_TARGET_DEPLOY_BLOCK; Fly was not changed."
  if [ -n "${GITHUB_ENV:-}" ]; then
    { echo "RESTORED_ESCROW_ADDRESS=$TARGET_ESCROW"; echo "RESTORED_DEPLOYMENT_BLOCK=$TARGET_BLOCK"; } >> "$GITHUB_ENV"
  fi
  printf 'ARAF_ESCROW_ADDRESS=%s\nARAF_DEPLOYMENT_BLOCK=%s\n' "$TARGET_ESCROW" "$TARGET_BLOCK" \
    | flyctl secrets import -a "$FLY_APP_NAME" >/dev/null \
    || die "Could not set ARAF_ESCROW_ADDRESS / ARAF_DEPLOYMENT_BLOCK on Fly; registry is restored but Fly still has the old values (guard reports escrow_mismatch)."
  ensure_stopped || die "Machines were not verified stopped after the Fly secret update."
fi
echo "Escrow $MODE done with all machines stopped; restarting."

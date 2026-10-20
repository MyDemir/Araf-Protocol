#!/usr/bin/env bash
# [TR] Ortak Fly makine yardımcıları (source edilir; tek başına çalıştırılmaz). reset-worker-checkpoint.sh ve
#      rotate-escrow-state.sh kullanır. FAIL-CLOSED: flyctl hatası, geçersiz/boş çıktı ya da 0 makine = hata.
#      Çağıran önce set etmeli: FLY_APP_NAME, WAIT_TIMEOUT_S, WAIT_INTERVAL_S. Gizli değer basılmaz.
# [EN] Shared Fly machine helpers (sourced). Fail-closed listing, stop/verify, start-initially-started.

# Çıktı: "<id> <state>" satırları. FAIL-CLOSED: flyctl hatası, geçersiz JSON ya da 0 makine => dönüş kodu 1.
list_machines() {
  flyctl machine list --json -a "$FLY_APP_NAME" | python3 -c '
import json,sys
d=json.load(sys.stdin)
if not isinstance(d,list) or len(d)==0: sys.exit(1)
for m in d:
    print(m.get("id",""), m.get("state",""))'
}

# Başlangıçta started olan makineleri IDS'e yazar (sonda yalnız bunlar başlatılır). Liste hatası => 1.
capture_started() {
  local initial id state
  initial="$(list_machines)" || return 1
  IDS=()
  while read -r id state; do
    if [ -n "$id" ] && [ "$state" = "started" ]; then IDS+=("$id"); fi
  done <<<"$initial"
}

start_all() {
  local rc=0 id
  for id in ${IDS[@]+"${IDS[@]}"}; do
    flyctl machine start "$id" -a "$FLY_APP_NAME" >/dev/null || { echo "::error::Failed to start machine $id"; rc=1; }
  done
  return $rc
}

# Stopped olmayan her makineyi durdurur (auto_start proxy'si yeniden başlatmış olabilir). Liste hatası => 1.
stop_running() {
  local rc=0 id state out
  out="$(list_machines)" || return 1
  while read -r id state; do
    if [ -n "$id" ] && [ "$state" != "stopped" ]; then
      flyctl machine stop "$id" -a "$FLY_APP_NAME" >/dev/null || { echo "::warning::Failed to stop machine $id"; rc=1; }
    fi
  done <<<"$out"
  return $rc
}
# Çalışan sayısını basar; liste hatası => 1 (fail-closed).
count_running() {
  local out
  out="$(list_machines)" || return 1
  awk '$1 != "" && $2 != "stopped" {c++} END {print c+0}' <<<"$out"
}
all_stopped() { local n; n="$(count_running)" || return 1; [ "$n" = "0" ]; }
wait_stopped() {
  local start=$SECONDS
  while ! all_stopped; do
    [ $((SECONDS - start)) -lt "$WAIT_TIMEOUT_S" ] || return 1
    sleep "$WAIT_INTERVAL_S"
  done
}

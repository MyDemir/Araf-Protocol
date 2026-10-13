#!/usr/bin/env bash
# [TR] deploy-base-sepolia.yml ve deploy-runtime-base-sepolia.yml için ORTAK runtime env betiği.
#      Fly secret listesi, Vercel build-env listesi ve health/ready kontrolü tek yerde tanımlıdır.
#      Gizli değerler asla stdout/stderr'e basılmaz (fly-secrets doğrudan flyctl stdin'ine akar).
# [EN] Shared runtime env script for both Base Sepolia deploy workflows. Secrets are never printed.
#
# Kullanım / usage:
#   stage-runtime-env.sh validate        # adresler + opsiyonel backend değişkenleri
#   stage-runtime-env.sh validate-optional  # yalnız opsiyonel backend değişkenleri (adres gerekmez)
#   stage-runtime-env.sh fly-secrets     # NAME=VALUE satırlarını flyctl secrets import --stage'e verir
#   stage-runtime-env.sh vercel-deploy   # vercel deploy --prod (build-env listesiyle)
#   stage-runtime-env.sh health          # /health zorunlu (200), /ready degraded ise ::warning::
#   stage-runtime-env.sh fly-secret-lines | vercel-build-env   # yalnız test içindir; workflow'da kullanılmaz
#
# Girdi env (GitHub tarafı adlar):
#   ESCROW USDT USDC DEPLOY_BLOCK FRONTEND_DOMAIN FLY_APP_NAME
#   MONGODB_URI REDIS_URL JWT_SECRET MASTER_ENCRYPTION_KEY BASE_SEPOLIA_RPC_URL BASE_SEPOLIA_WS_RPC_URL  (secret)
#   RELAYER_PRIVATE_KEY BASE_SEPOLIA_RPC_URL_FALLBACKS                                                   (secret, opsiyonel)
#   ADMIN_WALLETS LIVE_POLL_INTERVAL_MS WORKER_BLOCK_BATCH_SIZE WORKER_REPLAY_BATCH_DELAY_MS EXPECTED_CHAIN_ID (variable, opsiyonel)
#   REVENUE_VAULT REWARDS  (resolve-rewards-addresses.js çıktısı)
#   VERCEL_TOKEN VITE_RPC_URL VITE_BASE_APP_ID FARCASTER_ACCOUNT_ASSOCIATION_{HEADER,PAYLOAD,SIGNATURE}
set -euo pipefail

TARGET_CHAIN_ID=84532
ADDRESS_RE='^0x[a-fA-F0-9]{40}$'
ZERO_ADDRESS='0x0000000000000000000000000000000000000000'

die() { echo "::error::$*" >&2; exit 1; }
val() { printf '%s' "${!1-}"; }

int_in_range() { # name min max
  local v; v="$(val "$1")"
  [ -z "$v" ] && return 0
  [[ "$v" =~ ^[0-9]+$ ]] || die "$1 must be an integer in [$2-$3]."
  (( 10#$v >= $2 && 10#$v <= $3 )) || die "$1 must be in [$2-$3] (got $v)."
}

address_ok() { [[ "$1" =~ $ADDRESS_RE && "${1,,}" != "$ZERO_ADDRESS" ]]; }

cmd_validate() {
  local n v
  for n in ESCROW USDT USDC; do address_ok "$(val "$n")" || die "$n is missing or invalid."; done
  [[ "$(val DEPLOY_BLOCK)" =~ ^[1-9][0-9]*$ ]] || die "DEPLOY_BLOCK (ARAF_DEPLOYMENT_BLOCK) is missing or invalid."
  for n in REVENUE_VAULT REWARDS; do
    v="$(val "$n")"
    if [ -n "$v" ]; then address_ok "$v" || die "$n must be a non-zero 0x + 40 hex address."; fi
  done
  if [ -n "$(val REVENUE_VAULT)" ] && [ -z "$(val REWARDS)" ]; then die "REVENUE_VAULT and REWARDS must be set together."; fi
  if [ -z "$(val REVENUE_VAULT)" ] && [ -n "$(val REWARDS)" ]; then die "REVENUE_VAULT and REWARDS must be set together."; fi
  cmd_validate_optional
  echo "Runtime env validated."
}

# Adres gerektirmeyen opsiyonel backend değişkenleri (deploy öncesi "Validate required config" adımında da çalışır).
cmd_validate_optional() {
  local v
  # Sınırlar backend env okumasıyla uyumlu (eventListener.js alt sınır 2000; admin paneli ayrıca 5000-300000).
  int_in_range LIVE_POLL_INTERVAL_MS 2000 300000
  int_in_range WORKER_BLOCK_BATCH_SIZE 1 2000
  int_in_range WORKER_REPLAY_BATCH_DELAY_MS 0 10000
  v="$(val EXPECTED_CHAIN_ID)"
  if [ -n "$v" ] && [ "$v" != "$TARGET_CHAIN_ID" ]; then die "EXPECTED_CHAIN_ID variable must be empty or $TARGET_CHAIN_ID for Base Sepolia (got $v)."; fi
  v="$(val ADMIN_WALLETS)"
  if [ -n "$v" ]; then
    local w; IFS=',' read -ra _ws <<< "$v"
    for w in "${_ws[@]}"; do w="${w//[[:space:]]/}"; address_ok "$w" || die "ADMIN_WALLETS must be comma-separated 0x addresses."; done
  fi
  v="$(val BASE_SEPOLIA_RPC_URL_FALLBACKS)"
  if [ -n "$v" ]; then
    local u; IFS=',' read -ra _us <<< "$v"
    for u in "${_us[@]}"; do u="${u//[[:space:]]/}"; [[ "$u" == https://* ]] || die "BASE_SEPOLIA_RPC_URL_FALLBACKS entries must be https:// URLs (value not shown)."; done
  fi
}

# Zorunlu + opsiyonel backend env listesi. Opsiyonel olanlar boşsa YAZILMAZ (Fly'daki mevcut değer korunur).
# ETHERSCAN_API_KEY bilerek yoktur (yalnız verify).
cmd_fly_secret_lines() {
  local n
  for n in MONGODB_URI REDIS_URL JWT_SECRET MASTER_ENCRYPTION_KEY BASE_SEPOLIA_RPC_URL BASE_SEPOLIA_WS_RPC_URL ESCROW USDT USDC DEPLOY_BLOCK FRONTEND_DOMAIN; do
    [ -n "$(val "$n")" ] || die "$n is required for Fly secrets."
  done
  printf '%s=%s\n' NODE_ENV production
  printf '%s=%s\n' MONGODB_URI "$MONGODB_URI"
  printf '%s=%s\n' REDIS_URL "$REDIS_URL"
  printf '%s=%s\n' JWT_SECRET "$JWT_SECRET"
  printf '%s=%s\n' JWT_EXPIRES_IN 15m
  printf '%s=%s\n' PII_TOKEN_EXPIRES_IN 15m
  printf '%s=%s\n' KMS_PROVIDER env
  printf '%s=%s\n' ALLOW_ENV_KMS_ON_TESTNET yes
  printf '%s=%s\n' MASTER_ENCRYPTION_KEY "$MASTER_ENCRYPTION_KEY"
  printf '%s=%s\n' EXPECTED_CHAIN_ID "$TARGET_CHAIN_ID"
  printf '%s=%s\n' BASE_RPC_URL "$BASE_SEPOLIA_RPC_URL"
  printf '%s=%s\n' BASE_WS_RPC_URL "$BASE_SEPOLIA_WS_RPC_URL"
  printf '%s=%s\n' ARAF_ESCROW_ADDRESS "$ESCROW"
  printf '%s=%s\n' BASE_SEPOLIA_USDT_ADDRESS "$USDT"
  printf '%s=%s\n' BASE_SEPOLIA_USDC_ADDRESS "$USDC"
  printf '%s=%s\n' ARAF_DEPLOYMENT_BLOCK "$DEPLOY_BLOCK"
  printf '%s=%s\n' SIWE_DOMAIN "$FRONTEND_DOMAIN"
  printf '%s=%s\n' SIWE_URI "https://$FRONTEND_DOMAIN"
  printf '%s=%s\n' ALLOWED_ORIGINS "https://$FRONTEND_DOMAIN"
  if [ -n "$(val RELAYER_PRIVATE_KEY)" ]; then printf '%s=%s\n' RELAYER_PRIVATE_KEY "$RELAYER_PRIVATE_KEY"; fi
  if [ -n "$(val BASE_SEPOLIA_RPC_URL_FALLBACKS)" ]; then printf '%s=%s\n' BASE_RPC_URL_FALLBACKS "${BASE_SEPOLIA_RPC_URL_FALLBACKS//[[:space:]]/}"; fi
  if [ -n "$(val ADMIN_WALLETS)" ]; then printf '%s=%s\n' ADMIN_WALLETS "${ADMIN_WALLETS//[[:space:]]/}"; fi
  if [ -n "$(val LIVE_POLL_INTERVAL_MS)" ]; then printf '%s=%s\n' LIVE_POLL_INTERVAL_MS "$LIVE_POLL_INTERVAL_MS"; fi
  if [ -n "$(val WORKER_BLOCK_BATCH_SIZE)" ]; then printf '%s=%s\n' WORKER_BLOCK_BATCH_SIZE "$WORKER_BLOCK_BATCH_SIZE"; fi
  if [ -n "$(val WORKER_REPLAY_BATCH_DELAY_MS)" ]; then printf '%s=%s\n' WORKER_REPLAY_BATCH_DELAY_MS "$WORKER_REPLAY_BATCH_DELAY_MS"; fi
  if [ -n "$(val REVENUE_VAULT)" ]; then printf '%s=%s\n' ARAF_REVENUE_VAULT_ADDRESS "$REVENUE_VAULT"; fi
  if [ -n "$(val REWARDS)" ]; then printf '%s=%s\n' ARAF_REWARDS_ADDRESS "$REWARDS"; fi
}

cmd_fly_secrets() {
  [ -n "$(val FLY_APP_NAME)" ] || die "FLY_APP_NAME is required."
  local lines
  lines="$(cmd_fly_secret_lines)"
  printf '%s\n' "$lines" | flyctl secrets import --stage -a "$FLY_APP_NAME" >/dev/null
  echo "Staged Fly secrets: $(printf '%s\n' "$lines" | cut -d= -f1 | paste -sd' ' -)"
}

# Bir satır = bir --build-env değeri (NAME=VALUE). VERCEL_TOKEN burada yoktur.
cmd_vercel_build_env() {
  local n
  for n in ESCROW USDT USDC FRONTEND_DOMAIN; do [ -n "$(val "$n")" ] || die "$n is required for Vercel."; done
  echo "VITE_TARGET_CHAIN=base-sepolia"
  echo "VITE_ESCROW_ADDRESS=$ESCROW"
  echo "VITE_USDT_ADDRESS=$USDT"
  echo "VITE_USDC_ADDRESS=$USDC"
  echo "VITE_PUBLIC_URL=https://$FRONTEND_DOMAIN"
  if [ -n "$(val VITE_RPC_URL)" ]; then echo "VITE_RPC_URL=$VITE_RPC_URL"; fi
  # Farcaster / Base mini app (opsiyonel; imza FRONTEND_DOMAIN'e bağlıdır, docs/*/DEPLOY_BASE_SEPOLIA.md)
  if [ -n "$(val VITE_BASE_APP_ID)" ]; then echo "VITE_BASE_APP_ID=$VITE_BASE_APP_ID"; fi
  if [ -n "$(val FARCASTER_ACCOUNT_ASSOCIATION_HEADER)" ] && [ -n "$(val FARCASTER_ACCOUNT_ASSOCIATION_PAYLOAD)" ] && [ -n "$(val FARCASTER_ACCOUNT_ASSOCIATION_SIGNATURE)" ]; then
    echo "FARCASTER_ACCOUNT_ASSOCIATION_HEADER=$FARCASTER_ACCOUNT_ASSOCIATION_HEADER"
    echo "FARCASTER_ACCOUNT_ASSOCIATION_PAYLOAD=$FARCASTER_ACCOUNT_ASSOCIATION_PAYLOAD"
    echo "FARCASTER_ACCOUNT_ASSOCIATION_SIGNATURE=$FARCASTER_ACCOUNT_ASSOCIATION_SIGNATURE"
  fi
  # Frontend adları: frontend/src/app/envConfig.js (VITE_REVENUE_VAULT_ADDRESS), hooks/useRewardsContract.js (VITE_REWARDS_ADDRESS).
  if [ -n "$(val REVENUE_VAULT)" ]; then echo "VITE_REVENUE_VAULT_ADDRESS=$REVENUE_VAULT"; fi
  if [ -n "$(val REWARDS)" ]; then echo "VITE_REWARDS_ADDRESS=$REWARDS"; fi
}

cmd_vercel_deploy() {
  [ -n "$(val VERCEL_TOKEN)" ] || die "VERCEL_TOKEN is required."
  local entries args=() e
  entries="$(cmd_vercel_build_env)"
  while IFS= read -r e; do [ -n "$e" ] && args+=(--build-env "$e"); done <<< "$entries"
  vercel pull --yes --environment=production --token="$VERCEL_TOKEN"
  vercel deploy --prod --yes --token="$VERCEL_TOKEN" "${args[@]}"
}

# /health 200 olmalı (yoksa deploy başarısız). /ready 503 + "degraded":true ise uyarı; deploy başarılı sayılır.
cmd_health() {
  local base="${HEALTH_BASE_URL:-https://$(val FLY_APP_NAME).fly.dev}"
  local retries="${HEALTH_RETRIES:-12}" delay="${HEALTH_RETRY_DELAY:-10}"
  [ "${HEALTH_INITIAL_SLEEP:-15}" = "0" ] || sleep "${HEALTH_INITIAL_SLEEP:-15}"
  curl --fail --show-error --silent --retry "$retries" --retry-delay "$delay" --retry-all-errors "$base/health" >/dev/null \
    || die "Backend /health did not return 200 at $base/health."
  echo "Backend /health OK."
  local tmp code
  tmp="$(mktemp)"
  code="$(curl --silent --show-error --output "$tmp" --write-out '%{http_code}' "$base/ready" || true)"
  if [ "$code" = "200" ]; then
    echo "Backend /ready OK."
  elif [ "$code" = "503" ] && grep -Eq '"degraded"[[:space:]]*:[[:space:]]*true' "$tmp"; then
    echo "::warning::Backend is up in DEGRADED mode (/ready 503 degraded:true; e.g. RPC unreachable). Check RPC secrets and Fly logs."
  else
    echo "::warning::Backend /ready returned HTTP ${code:-n/a} (not ready yet or not degraded-aware). /health is OK, deploy counted as successful."
  fi
  rm -f "$tmp"
}

case "${1:-}" in
  validate) cmd_validate ;;
  validate-optional) cmd_validate_optional; echo "Optional runtime env validated." ;;
  fly-secrets) cmd_fly_secrets ;;
  fly-secret-lines) cmd_fly_secret_lines ;;
  vercel-build-env) cmd_vercel_build_env ;;
  vercel-deploy) cmd_vercel_deploy ;;
  health) cmd_health ;;
  *) die "usage: $0 validate|fly-secrets|vercel-deploy|health" ;;
esac

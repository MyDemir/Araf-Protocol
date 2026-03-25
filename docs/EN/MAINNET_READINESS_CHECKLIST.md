# Mainnet Readiness Checklist (Stabilization)

## Required Environment Variables
- `MONGODB_URI`
- `REDIS_URL`
- `ARAF_ESCROW_ADDRESS`
- `SIWE_DOMAIN`
- `SIWE_URI`
- `JWT_SECRET`
- `TREASURY_ADDRESS`
- `BASE_RPC_URL`
- `BASE_WS_RPC_URL` (recommended)
- `WORKER_START_BLOCK` or `ARAF_DEPLOYMENT_BLOCK` (required in production when no checkpoint exists)
- `MAINNET_USDT_ADDRESS` and `MAINNET_USDC_ADDRESS` (required for production deploy script)
- `RELAYER_PRIVATE_KEY` (only if automation jobs are enabled)

## Mandatory Post-Deploy Admin Steps
1. Verify `supportedTokens(MAINNET_USDT_ADDRESS)` and `supportedTokens(MAINNET_USDC_ADDRESS)` are `true`.
2. Confirm ownership transfer to treasury (`owner()` check).
3. Seed/check Redis checkpoint key `worker:last_block`.
4. Validate `/health` (liveness) and `/ready` (readiness) endpoints.
5. Run a smoke trade and verify event sync in DB.

## Smoke Test Commands
- `cd backend && npm test -- --runInBand`
- `cd contracts && npm test -- --grep \"deploy script\"`
- `curl -s http://localhost:4000/health`
- `curl -s -o /dev/null -w \"%{http_code}\\n\" http://localhost:4000/ready`

## Rollback Notes
1. Stop backend workers first.
2. Restore previous backend release and restart.
3. Reset checkpoint only to the last known safe processed block (never forward).
4. Re-run readiness and smoke checks before reopening traffic.

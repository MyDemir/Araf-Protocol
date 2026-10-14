/**
 * [TR] Yük dengeli RPC'lerde (Alchemy free vb.) read-after-write gecikmesi: waitForDeployment() sonrası
 *      eth_call kodu henüz görmeyen bir node'a gidip "0x" (ethers BAD_DATA) dönebilir.
 *      Bu yardımcılar yalnızca okumadan ÖNCE bekler/yeniden dener; revert asla yeniden denenmez.
 * [EN] Read-after-write lag on load-balanced RPCs. Waits/retries only before reads; reverts are never retried.
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isEmptyCode(code) {
  return !code || code === "0x";
}

function isRevert(err) {
  if (!err) return false;
  if (err.code === "CALL_EXCEPTION") {
    // BAD_DATA "0x" ethers v6'da bazen CALL_EXCEPTION değil BAD_DATA'dır; gerçek revert data/reason/revert taşır.
    return Boolean((err.data && err.data !== "0x") || err.revert || err.reason);
  }
  return false;
}

function isTransientError(err) {
  if (!err || isRevert(err)) return false;
  if (["BAD_DATA", "NETWORK_ERROR", "TIMEOUT", "SERVER_ERROR"].includes(err.code)) return true;
  if (["ECONNRESET", "ETIMEDOUT", "EAI_AGAIN"].includes(err.code)) return true;
  const msg = String((err && err.message) || "");
  if (/revert/i.test(msg)) return false;
  return /BAD_DATA|could not decode result data|value="0x"|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|\b(429|502|503|504)\b|timeout/i.test(msg);
}

async function waitForCode(provider, address, opts = {}) {
  const {
    initialDelayMs = 500,
    maxDelayMs = 5000,
    maxTotalMs = 60000,
    sleepFn = sleep,
    nowFn = Date.now,
    label = address,
  } = opts;
  const start = nowFn();
  let delay = initialDelayMs;
  let attempts = 0;
  for (;;) {
    attempts += 1;
    let code = "0x";
    let lastErr = null;
    try {
      code = await provider.getCode(address);
    } catch (err) {
      if (!isTransientError(err)) throw err;
      lastErr = err;
    }
    if (!isEmptyCode(code)) return code;
    const elapsed = nowFn() - start;
    if (elapsed + delay > maxTotalMs) {
      throw new Error(
        `waitForCode: ${label} (${address}) üzerinde ${attempts} denemede (${elapsed}ms) kod görünmedi` +
          (lastErr ? ` (son hata: ${lastErr.message})` : "") +
          ". RPC gecikmesi ya da deploy başarısız olabilir."
      );
    }
    await sleepFn(delay);
    delay = Math.min(delay * 2, maxDelayMs);
  }
}

async function retryRead(fn, opts = {}) {
  const {
    initialDelayMs = 500,
    maxDelayMs = 5000,
    maxTotalMs = 60000,
    sleepFn = sleep,
    nowFn = Date.now,
    label = "read",
  } = opts;
  const start = nowFn();
  let delay = initialDelayMs;
  let attempts = 0;
  for (;;) {
    attempts += 1;
    try {
      return await fn();
    } catch (err) {
      if (!isTransientError(err)) throw err;
      const elapsed = nowFn() - start;
      if (elapsed + delay > maxTotalMs) {
        throw new Error(`retryRead: ${label} ${attempts} denemede (${elapsed}ms) başarısız: ${err.message}`);
      }
      await sleepFn(delay);
      delay = Math.min(delay * 2, maxDelayMs);
    }
  }
}

function confirmationsFor(networkName) {
  if (networkName === "hardhat" || networkName === "localhost") return 1;
  const n = Number(process.env.DEPLOY_CONFIRMATIONS ?? 2);
  return Number.isInteger(n) && n >= 1 ? n : 2;
}

// Deploy edilen kontrat için: waitForDeployment + N onay + kodun görünür olması. Adresi döndürür.
async function settleDeployment(contract, provider, networkName, opts = {}) {
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  const tx = contract.deploymentTransaction && contract.deploymentTransaction();
  const n = confirmationsFor(networkName);
  if (tx && n > 1) await tx.wait(n);
  await waitForCode(provider, address, opts);
  return address;
}

module.exports = { waitForCode, retryRead, isTransientError, isRevert, confirmationsFor, settleDeployment };

const { expect } = require("chai");
const path = require("path");

const { waitForCode, retryRead, blockOverrides, isTransientError, confirmationsFor, settleDeployment } = require(
  path.join(__dirname, "..", "..", "contracts", "scripts", "lib", "waitForCode.js")
);

const ADDR = "0x" + "1".repeat(40);

function fakeClock() {
  let t = 0;
  const sleeps = [];
  return { sleeps, nowFn: () => t, sleepFn: async (ms) => { sleeps.push(ms); t += ms; } };
}

function badData() {
  const e = new Error('could not decode result data (value="0x", info={ "method": "getTokenConfig" }, code=BAD_DATA)');
  e.code = "BAD_DATA";
  return e;
}
function revertErr() {
  const e = new Error("execution reverted: nope");
  e.code = "CALL_EXCEPTION";
  e.reason = "nope";
  e.data = "0x08c379a0";
  return e;
}

describe("waitForCode / retryRead helpers", function () {
  describe("waitForCode", function () {
    it("retries on '0x' and returns once code appears (exponential backoff)", async function () {
      const clk = fakeClock();
      const replies = ["0x", "0x", "0x6080"];
      let calls = 0;
      const provider = { getCode: async () => replies[calls++] };
      const code = await waitForCode(provider, ADDR, { ...clk, initialDelayMs: 100, maxDelayMs: 1000 });
      expect(code).to.equal("0x6080");
      expect(calls).to.equal(3);
      expect(clk.sleeps).to.deep.equal([100, 200]);
    });

    it("throws a meaningful error when the time budget is exceeded", async function () {
      const clk = fakeClock();
      let calls = 0;
      const provider = { getCode: async () => { calls++; return "0x"; } };
      let err;
      try {
        await waitForCode(provider, ADDR, { ...clk, initialDelayMs: 100, maxTotalMs: 1000, label: "ArafEscrow" });
      } catch (e) { err = e; }
      expect(err, "should throw").to.be.instanceOf(Error);
      expect(err.message).to.include("ArafEscrow");
      expect(err.message).to.include(ADDR);
      expect(calls).to.be.greaterThan(1);
      expect(clk.sleeps.reduce((a, b) => a + b, 0)).to.be.at.most(1000);
    });

    it("does not retry a revert from getCode", async function () {
      const clk = fakeClock();
      let calls = 0;
      const provider = { getCode: async () => { calls++; throw revertErr(); } };
      let err;
      try { await waitForCode(provider, ADDR, clk); } catch (e) { err = e; }
      expect(err.code).to.equal("CALL_EXCEPTION");
      expect(calls).to.equal(1);
      expect(clk.sleeps).to.have.length(0);
    });
  });

  describe("retryRead", function () {
    it("retries BAD_DATA then returns the value", async function () {
      const clk = fakeClock();
      let calls = 0;
      const v = await retryRead(async () => { if (++calls < 3) throw badData(); return 42; }, clk);
      expect(v).to.equal(42);
      expect(calls).to.equal(3);
    });

    it("retries transient network errors", async function () {
      const clk = fakeClock();
      let calls = 0;
      const v = await retryRead(async () => {
        if (++calls < 2) { const e = new Error("socket hang up"); e.code = "ECONNRESET"; throw e; }
        return "ok";
      }, clk);
      expect(v).to.equal("ok");
      expect(calls).to.equal(2);
    });

    it("NEVER retries a revert", async function () {
      const clk = fakeClock();
      let calls = 0;
      let err;
      try { await retryRead(async () => { calls++; throw revertErr(); }, clk); } catch (e) { err = e; }
      expect(err.code).to.equal("CALL_EXCEPTION");
      expect(calls).to.equal(1);
      expect(clk.sleeps).to.have.length(0);
    });

    it("never retries a generic non-network error", async function () {
      const clk = fakeClock();
      let calls = 0;
      try { await retryRead(async () => { calls++; throw new Error("boom"); }, clk); } catch (_) {}
      expect(calls).to.equal(1);
    });

    it("gives up after the time budget with a meaningful error", async function () {
      const clk = fakeClock();
      let err;
      try {
        await retryRead(async () => { throw badData(); }, { ...clk, initialDelayMs: 100, maxTotalMs: 500, label: "getTokenConfig" });
      } catch (e) { err = e; }
      expect(err.message).to.include("getTokenConfig");
      expect(err.message).to.include("BAD_DATA");
    });
  });

  describe("classification + confirmations", function () {
    it("classifies errors", function () {
      expect(isTransientError(badData())).to.equal(true);
      expect(isTransientError(revertErr())).to.equal(false);
      expect(isTransientError(new Error("boom"))).to.equal(false);
    });

    it("confirmationsFor: 1 on local, env-configurable elsewhere", function () {
      const prev = process.env.DEPLOY_CONFIRMATIONS;
      try {
        process.env.DEPLOY_CONFIRMATIONS = "5";
        expect(confirmationsFor("hardhat")).to.equal(1);
        expect(confirmationsFor("localhost")).to.equal(1);
        expect(confirmationsFor("base-sepolia")).to.equal(5);
        delete process.env.DEPLOY_CONFIRMATIONS;
        expect(confirmationsFor("base-sepolia")).to.equal(2);
      } finally {
        if (prev === undefined) delete process.env.DEPLOY_CONFIRMATIONS; else process.env.DEPLOY_CONFIRMATIONS = prev;
      }
    });

    it("settleDeployment waits for confirmations then for code", async function () {
      const clk = fakeClock();
      let waited = null;
      const contract = {
        waitForDeployment: async () => {},
        getAddress: async () => ADDR,
        deploymentTransaction: () => ({ wait: async (n) => { waited = n; } }),
      };
      const replies = ["0x", "0x60"];
      let i = 0;
      const addr = await settleDeployment(contract, { getCode: async () => replies[i++] }, "base-sepolia", clk);
      expect(addr).to.equal(ADDR);
      expect(waited).to.equal(2);
      expect(i).to.equal(2);
    });
  });
  describe("block-lag (pinned read) errors", function () {
    const lag = (msg) => { const e = new Error(msg); e.code = "UNKNOWN_ERROR"; return e; };

    for (const msg of ["header not found", "unknown block", "block not found", "missing trie node abc"]) {
      it(`treats "${msg}" as transient and retries`, async function () {
        const clk = fakeClock();
        let calls = 0;
        const v = await retryRead(async () => { if (++calls < 3) throw lag(msg); return "ok"; }, clk);
        expect(v).to.equal("ok");
        expect(calls).to.equal(3);
        expect(isTransientError(lag(msg))).to.equal(true);
      });
    }

    it("detects block-lag text nested in ethers error.error / info.error", function () {
      const e1 = new Error("could not coalesce error"); e1.error = { code: -32000, message: "header not found" };
      const e2 = new Error("unknown"); e2.info = { error: { message: "Unknown block" } };
      expect(isTransientError(e1)).to.equal(true);
      expect(isTransientError(e2)).to.equal(true);
    });

    it("still never retries a revert, even if the message mentions a block", async function () {
      const clk = fakeClock();
      let calls = 0;
      const e = revertErr();
      e.message = "execution reverted: unknown block";
      try { await retryRead(async () => { calls++; throw e; }, clk); } catch (_) {}
      expect(calls).to.equal(1);
      expect(isTransientError(lag("execution reverted: header not found"))).to.equal(false);
    });

    it("blockOverrides pins to blockTag, empty when no block", function () {
      expect(blockOverrides(42)).to.deep.equal([{ blockTag: 42 }]);
      expect(blockOverrides(0)).to.deep.equal([{ blockTag: 0 }]);
      expect(blockOverrides(undefined)).to.deep.equal([]);
      expect(blockOverrides(null)).to.deep.equal([]);
    });
  });
});

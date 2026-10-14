"use strict";

const { Writable } = require("stream");
const { transports } = require("winston");
const { MESSAGE } = require("triple-beam");
const logger = require("../../backend/scripts/utils/logger");
const { redactInfo } = logger;

const KEY = "ab46399df96744598c80e0455b36e48f";
const RPC = `https://base-sepolia.infura.io/v3/${KEY}`;
const RPC2 = `https://mainnet.infura.io/v2/${KEY}`;
const WALLET = "0x1111111111111111111111111111111111111111";
const PK = "0x" + "22".repeat(32);
const JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ3YWxsZXQiOiIweDExMSJ9.signaturepart";

// Uses the REAL logger: a Stream transport is attached with the exact format of the real Console transport.
function capture() {
  const lines = [];
  const stream = new Writable({
    write(chunk, _enc, cb) { lines.push(chunk.toString()); cb(); },
  });
  const consoleT = logger.transports.find((t) => t instanceof transports.Console);
  const t = new transports.Stream({ stream, format: consoleT.format });
  logger.add(t);
  consoleT.silent = true;
  const fileT = logger.transports.find((x) => x instanceof transports.File);
  if (fileT) fileT.silent = true;
  return { log: logger, lines, done: () => { logger.remove(t); consoleT.silent = false; if (fileT) fileT.silent = false; } };
}

describe("console transport redaction", () => {
  test("message strings are masked", () => {
    const { log, lines, done } = capture();
    log.warn(`x ${RPC} ${RPC2} ${WALLET} ${PK} ${JWT}`);
    done();
    const out = lines.join("");
    for (const secret of [KEY, WALLET, PK, JWT]) expect(out).not.toContain(secret);
    expect(out).toContain("[REDACTED]");
    expect(out).toContain("[WALLET]");
  });

  test("meta objects are masked", () => {
    const { log, lines, done } = capture();
    log.warn("m", { err: RPC, nested: { w: WALLET } });
    done();
    const out = lines.join("");
    expect(out).not.toContain(KEY);
    expect(out).not.toContain(WALLET);
  });

  test("Error stack and message are masked", () => {
    const { log, lines, done } = capture();
    log.error("boom", new Error(`fail ${RPC} ${WALLET}`));
    log.error(new Error(`fail2 ${RPC}`));
    done();
    const out = lines.join("");
    expect(out).not.toContain(KEY);
    expect(out).not.toContain(WALLET);
  });

  test("redactInfo leaves level and symbol keys intact", () => {
    const info = { level: "info", message: `a ${WALLET}`, [MESSAGE]: "keep" };
    const res = redactInfo().transform(info);
    expect(res.level).toBe("info");
    expect(res[MESSAGE]).toBe("keep");
    expect(res.message).toContain("[WALLET]");
  });
});

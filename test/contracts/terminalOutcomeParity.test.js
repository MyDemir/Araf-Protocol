const { expect } = require("chai");
const fs = require("fs");
const path = require("path");

// [TR] ArafRewards arayüzündeki TerminalOutcome, ArafEscrow'daki ile aynı sırada olmalı. Sıra kayarsa
//      ödül çarpanları yanlış sonuca uygulanır; bu test sessiz drift'i CI'da yakalar.
// [EN] The TerminalOutcome enum in the ArafRewards interface must match ArafEscrow's order. A drift would
//      apply reward multipliers to the wrong outcome; this test catches it in CI.
function enumMembers(file, name) {
  const src = fs.readFileSync(path.join(__dirname, "..", "..", "contracts", "src", file), "utf8");
  const match = src.match(new RegExp(`enum\\s+${name}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`enum ${name} not found in ${file}`);
  return match[1]
    .replace(/\/\/.*$/gm, "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
}

describe("TerminalOutcome parity", function () {
  it("rewards interface enum matches escrow enum member-for-member", function () {
    const escrow = enumMembers("ArafEscrow.sol", "TerminalOutcome");
    const rewards = enumMembers("ArafRewards.sol", "TerminalOutcome");
    expect(escrow.length).to.be.greaterThan(0);
    expect(rewards).to.deep.equal(escrow);
  });
});

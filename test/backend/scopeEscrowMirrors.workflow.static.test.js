"use strict";

// scope-escrow-mirrors.yml statik denetimi: yeni secret yok, dry-run'da --apply yok, girdiler run'da ${{ inputs.* }} değil.

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const WF_DIR = path.join(ROOT, ".github/workflows");
const raw = fs.readFileSync(path.join(WF_DIR, "scope-escrow-mirrors.yml"), "utf8");
const rotateRaw = fs.readFileSync(path.join(WF_DIR, "rotate-escrow.yml"), "utf8");

// [TR] YAML kütüphanesi bağımlılığı yok: adımlar "      - name:" sınırlarında bölünür.
const stepsRaw = raw.split(/^ {6}- name: /m).slice(1).map((blk) => {
  const [name] = blk.split("\n");
  const runIdx = blk.indexOf("        run: ");
  return { name, text: blk, run: runIdx >= 0 ? blk.slice(runIdx) : "", ifLine: (/^ {8}if: (.*)$/m.exec(blk) || [])[1] };
});
const step = (prefix) => stepsRaw.find((s) => s.name.startsWith(prefix));
const pin = (text, action) => new RegExp(`uses: (${action}@[0-9a-f]{40})`).exec(text)[1];

describe("scope-escrow-mirrors.yml", () => {
  it("is workflow_dispatch only with mode default dry-run", () => {
    const onBlock = raw.slice(raw.indexOf("\non:"), raw.indexOf("\npermissions:"));
    expect(onBlock).toMatch(/workflow_dispatch:/);
    expect(onBlock).not.toMatch(/\n  (push|pull_request|schedule|workflow_run):/);
    expect(onBlock).toMatch(/mode:[\s\S]*?default: dry-run[\s\S]*?options:\s*\n\s*- dry-run\s*\n\s*- apply\s*\n\s*- rollback/);
    const inputNames = [...onBlock.matchAll(/^ {6}([a-z_]+):\s*$/gm)].map((m) => m[1]).sort();
    expect(inputNames).toEqual(["batch", "expected_active", "expected_legacy", "mode", "old_escrow_address"]);
  });

  it("introduces no new secret names", () => {
    const used = new Set([...raw.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1]));
    expect([...used].sort()).toEqual(["BASE_SEPOLIA_RPC_URL", "MONGODB_URI"]);
    const existing = fs.readdirSync(WF_DIR)
      .filter((f) => f !== "scope-escrow-mirrors.yml")
      .map((f) => fs.readFileSync(path.join(WF_DIR, f), "utf8"))
      .join("\n");
    for (const name of used) expect(existing).toContain(`secrets.${name}`);
    const vars = new Set([...raw.matchAll(/vars\.([A-Z0-9_]+)/g)].map((m) => m[1]));
    expect([...vars].sort()).toEqual(["ARAF_DEPLOYMENT_BLOCK", "ARAF_ESCROW_ADDRESS"]);
  });

  it("dry-run step never carries --apply and runs in every mode", () => {
    const dry = step("Dry-run");
    expect(dry.ifLine).toBeUndefined();
    expect(dry.text).not.toContain("--apply");
    expect(dry.run).toContain("GITHUB_STEP_SUMMARY");
    expect(dry.run).toContain("[scopeEscrowMirrors]");
  });

  it("apply and rollback steps run only in their own mode", () => {
    expect(step("Apply").ifLine).toContain("inputs.mode == 'apply'");
    expect(step("Apply").run).toContain("--apply");
    expect(step("Rollback").ifLine).toContain("inputs.mode == 'rollback'");
    expect(step("Rollback").run).toContain("--rollback=");
  });

  it("inputs are never interpolated inside run: blocks (env only)", () => {
    for (const s of stepsRaw) {
      expect(s.run).not.toMatch(/\$\{\{/);
    }
    const validate = step("Validate inputs");
    expect(validate.text).toContain("IN_BATCH: ${{ inputs.batch }}");
    expect(validate.run).toContain("^0x[a-fA-F0-9]{40}$");
    expect(validate.run).toContain("^[0-9]+$");
    expect(validate.run).toContain("BATCH_RE");
    expect(validate.run).toMatch(/must differ from the active/);
  });

  it("mirrors the hardening of rotate-escrow.yml (environment, concurrency, permissions, pinned actions)", () => {
    expect(raw).toMatch(/environment: base-sepolia/);
    expect(raw).toMatch(/concurrency:\s*\n\s*group: deploy-base-sepolia\s*\n\s*cancel-in-progress: false/);
    expect(raw).toMatch(/permissions:\s*\n\s*contents: read/);
    expect(pin(raw, "actions/checkout")).toBe(pin(rotateRaw, "actions/checkout"));
    expect(pin(raw, "actions/setup-node")).toBe(pin(rotateRaw, "actions/setup-node"));
    for (const m of raw.matchAll(/^\s+uses: (\S+)/gm)) expect(m[1]).toMatch(/@[0-9a-f]{40}$/);
  });

  it("EXPECTED_CHAIN_ID is pinned to 84532 and no step echoes secrets", () => {
    expect(raw).toContain('EXPECTED_CHAIN_ID: "84532"');
    for (const s of stepsRaw) {
      expect(s.run).not.toMatch(/echo[^\n]*(MONGODB_URI|RPC_URL)/);
      expect(s.run).not.toMatch(/\bset -x\b/);
    }
  });
});

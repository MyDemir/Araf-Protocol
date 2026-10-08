"use strict";
const fs = require("fs");
const path = require("path");

// AWS KMS Decrypt symmetric CiphertextBlob'dan anahtarı çözer; KeyId gerekmez. AWS_KMS_KEY_ARN ne kodda
// okunmalı ne de .env.example'da etkin değişken olarak durmalı.
describe("AWS_KMS_KEY_ARN is not a required/read variable", () => {
  const root = path.join(__dirname, "../../backend");
  it("encryption.js never reads it from process.env", () => {
    const src = fs.readFileSync(path.join(root, "scripts/services/encryption.js"), "utf8");
    expect(src).not.toMatch(/process\.env\.(AWS_)?KMS_KEY_ARN|process\.env\.AWS_KMS_KEY_ARN/);
    expect(src).not.toMatch(/^\s*\/\/\s+AWS_KMS_KEY_ARN=/m);
  });
  it(".env.example has no active assignment for it", () => {
    const env = fs.readFileSync(path.join(root, ".env.example"), "utf8");
    expect(env).not.toMatch(/^\s*#?\s*AWS_KMS_KEY_ARN\s*=/m);
  });
});

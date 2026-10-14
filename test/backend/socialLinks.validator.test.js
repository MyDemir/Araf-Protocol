"use strict";

const {
  validateSocialUrl, validateSocialLinks, validateSocialLabel, getAllowedHosts, DEFAULT_ALLOWED_HOSTS,
} = require("../../backend/scripts/utils/socialLinks");

const link = (url, extra = {}) => ({ label: "L", url, enabled: true, ...extra });

describe("social link validator", () => {
  afterEach(() => { delete process.env.SOCIAL_LINK_ALLOWED_HOSTS; });

  it.each([
    "http://github.com/a",
    "javascript:alert(1)",
    "data:text/html,<script>1</script>",
    "https://user:pw@github.com/a",
    "https://user@github.com/a",
    "https://example.com/a",
    "https://evilx.com/a",
    "https://x.com.evil.com/a",
    "https://evil.com/?u=https://x.com",
    "https://xn--gthub-bua.com/",
    "https://x.com:8443/a",
    "https://.x.com/a",
    "https://x..com/a",
    "https://gıthub.com/a",
    " https://github.com/a",
    "https://github.com/a b",
    "//github.com/a",
    `https://github.com/${"a".repeat(300)}`,
    "",
  ])("rejects %s", (u) => {
    expect(validateSocialUrl(u).ok).toBe(false);
  });

  it("rejects non-strings", () => {
    expect(validateSocialUrl(null).ok).toBe(false);
    expect(validateSocialUrl({ toString: () => "https://x.com" }).ok).toBe(false);
  });

  it.each([
    "https://github.com/MyDemir/Araf-Protocol",
    "https://x.com/araf",
    "https://www.github.com/a",
    "https://warpcast.com/araf",
    "https://t.me/araf",
    "https://BASESCAN.org/address/0x1",
  ])("accepts %s", (u) => {
    const r = validateSocialUrl(u);
    expect(r.ok).toBe(true);
    expect(r.url.startsWith("https://")).toBe(true);
  });

  it("default allowlist matches the brief", () => {
    expect([...DEFAULT_ALLOWED_HOSTS].sort()).toEqual([
      "base.org", "basescan.org", "discord.com", "discord.gg", "farcaster.xyz", "github.com", "instagram.com",
      "linkedin.com", "medium.com", "mirror.xyz", "paragraph.xyz", "reddit.com", "t.me", "telegram.me",
      "twitter.com", "warpcast.com", "x.com", "youtube.com",
    ]);
  });

  it("env narrows/replaces the allowlist; garbage env fails closed", () => {
    process.env.SOCIAL_LINK_ALLOWED_HOSTS = "github.com, example.org";
    expect(getAllowedHosts()).toEqual(["github.com", "example.org"]);
    expect(validateSocialUrl("https://x.com/a").ok).toBe(false);
    expect(validateSocialUrl("https://example.org/a").ok).toBe(true);
    process.env.SOCIAL_LINK_ALLOWED_HOSTS = "!!!,xn--bad.com";
    expect(getAllowedHosts()).toEqual([]);
    expect(validateSocialUrl("https://github.com/a").ok).toBe(false);
  });

  it("label rules", () => {
    expect(validateSocialLabel("  X  ")).toEqual({ ok: true, label: "X" });
    expect(validateSocialLabel("").ok).toBe(false);
    expect(validateSocialLabel("   ").ok).toBe(false);
    expect(validateSocialLabel("a".repeat(25)).ok).toBe(false);
    expect(validateSocialLabel("a\nb").ok).toBe(false);
    expect(validateSocialLabel("a‮b").ok).toBe(false);
    expect(validateSocialLabel("<b>x</b>").ok).toBe(false);
    expect(validateSocialLabel(5).ok).toBe(false);
  });

  it("list rules: max 8, duplicates, unknown fields, enabled type, order normalized", () => {
    const nine = Array.from({ length: 9 }, (_, i) => link(`https://github.com/u${i}`));
    expect(validateSocialLinks(nine).ok).toBe(false);
    expect(validateSocialLinks(nine.slice(0, 8)).ok).toBe(true);
    expect(validateSocialLinks([link("https://x.com/a"), link("https://x.com/a")]).ok).toBe(false);
    expect(validateSocialLinks([link("https://x.com/a", { evil: 1 })]).ok).toBe(false);
    expect(validateSocialLinks([link("https://x.com/a", { enabled: "yes" })]).ok).toBe(false);
    expect(validateSocialLinks([link("https://x.com/a", { id: "Bad Id" })]).ok).toBe(false);
    expect(validateSocialLinks([link("https://x.com/a", { id: "a" }), link("https://x.com/b", { id: "a" })]).ok).toBe(false);
    expect(validateSocialLinks("nope").ok).toBe(false);
    const ok = validateSocialLinks([link("https://x.com/a", { order: 9 }), link("https://github.com/b", { enabled: false })]);
    expect(ok.ok).toBe(true);
    expect(ok.links.map((l) => l.order)).toEqual([0, 1]);
    expect(ok.links.every((l) => /^[a-z0-9-]+$/.test(l.id))).toBe(true);
    expect(validateSocialLinks([]).ok).toBe(true);
  });
});

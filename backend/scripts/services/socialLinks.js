"use strict";

/**
 * Social Links Service — footer sosyal linkleri (admin yönetimli). Tek belge + optimistic lock (version) +
 * append-only audit. Doğrulama utils/socialLinks.js'tedir (allowlist kod/env'de, admin değiştiremez).
 * Public okuma, saklı veriyi OKURKEN de yeniden doğrular (env allowlist daraltılırsa eski kayıt anında düşer).
 */

const crypto = require("crypto");
const mongoose = require("mongoose");
const SocialLinkSetting = require("../models/SocialLinkSetting");
const SocialLinkAudit = require("../models/SocialLinkAudit");
const logger = require("../utils/logger");
const { validateSocialLinks, getAllowedHosts, validateSocialUrl } = require("../utils/socialLinks");

const SETTING_KEY = "social_links";

function _err(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

const _shape = (l) => ({ id: l.id, label: l.label, url: l.url, order: l.order, enabled: l.enabled });
const _sorted = (links) => [...(links || [])].map(_shape).sort((a, b) => a.order - b.order);
const _makeId = () => `l-${crypto.randomBytes(6).toString("hex")}`;

async function getAdminState() {
  if (mongoose.connection.readyState !== 1) throw _err("DB_UNAVAILABLE", "Veritabanı şu an kullanılamıyor.");
  const doc = await SocialLinkSetting.findOne({ key: SETTING_KEY }).lean();
  return { links: _sorted(doc?.links), version: doc ? Number(doc.version || 0) : 0 };
}

/** Public: yalnız enabled + (yeniden doğrulanmış) linkler, yalnız {label,url}. DB yoksa/hata varsa boş liste. */
async function getPublicLinks() {
  if (mongoose.connection.readyState !== 1) return [];
  try {
    const doc = await SocialLinkSetting.findOne({ key: SETTING_KEY }).lean();
    const allowed = getAllowedHosts();
    return _sorted(doc?.links)
      .filter((l) => l.enabled === true)
      .map((l) => ({ label: l.label, check: validateSocialUrl(l.url, allowed) }))
      .filter((l) => l.check.ok)
      .map((l) => ({ label: l.label, url: l.check.url }));
  } catch (err) {
    logger.warn(`[SocialLinks] public okuma başarısız: ${err.message}`);
    return [];
  }
}

async function replaceLinks(rawLinks, { wallet, reason = "", ipHash = null, expectedVersion } = {}) {
  const v = validateSocialLinks(rawLinks, { makeId: _makeId });
  if (!v.ok) throw _err("SOCIAL_LINKS_INVALID", v.error);
  if (mongoose.connection.readyState !== 1) throw _err("DB_UNAVAILABLE", "Veritabanı şu an kullanılamıyor.");

  const doc = await SocialLinkSetting.findOne({ key: SETTING_KEY }).lean();
  const currentVersion = doc ? Number(doc.version || 0) : 0;
  if (expectedVersion !== currentVersion) {
    throw _err("SOCIAL_LINKS_CONFLICT", "Sosyal linkler başka bir yönetici tarafından değiştirildi; yenileyin.");
  }
  const previous = _sorted(doc?.links);
  const now = new Date();
  const lowerWallet = String(wallet || "").toLowerCase();
  const update = { $set: { links: v.links, updated_at: now, updated_by: lowerWallet }, $inc: { version: 1 } };
  try {
    const res = await SocialLinkSetting.updateOne({ key: SETTING_KEY, version: currentVersion }, update, { upsert: !doc });
    if (doc && res && res.matchedCount === 0) throw _err("SOCIAL_LINKS_CONFLICT", "Eşzamanlı değişiklik; yenileyin.");
  } catch (err) {
    if (err.code === "SOCIAL_LINKS_CONFLICT") throw err;
    if (err.code === 11000) throw _err("SOCIAL_LINKS_CONFLICT", "Eşzamanlı değişiklik; yenileyin.");
    throw err;
  }

  try {
    await SocialLinkAudit.create({
      previous_links: previous,
      new_links: v.links,
      version: currentVersion + 1,
      admin_wallet: lowerWallet,
      reason: String(reason || "").slice(0, 300),
      ip_hash: ipHash,
      created_at: now,
    });
  } catch (auditErr) {
    logger.error(`[SocialLinks] audit yazılamadı, değişiklik geri alınıyor: ${auditErr.message}`);
    let rollbackRes = null;
    try {
      rollbackRes = await SocialLinkSetting.updateOne(
        { key: SETTING_KEY, version: currentVersion + 1 },
        { $set: { links: previous, updated_at: now }, $inc: { version: 1 } }
      );
    } catch (rollbackErr) {
      logger.error(`[SocialLinks] geri alma başarısız: ${rollbackErr.message}`);
    }
    if (rollbackRes && rollbackRes.matchedCount === 0) {
      throw _err("SOCIAL_LINKS_CONFLICT", "Eşzamanlı değişiklik; denetim kaydı yazılamadı, yenileyin.");
    }
    throw _err("SOCIAL_LINKS_AUDIT_FAILED", "Denetim kaydı yazılamadı; değişiklik uygulanmadı.");
  }
  return { links: v.links, version: currentVersion + 1, changedAt: now };
}

async function listAudit({ page = 1, limit = 20 } = {}) {
  const [items, total] = await Promise.all([
    SocialLinkAudit.find({}).sort({ created_at: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    SocialLinkAudit.countDocuments({}),
  ]);
  return {
    items: items.map((a) => ({
      id: String(a._id),
      previousLinks: _sorted(a.previous_links),
      newLinks: _sorted(a.new_links),
      version: a.version,
      adminWallet: a.admin_wallet,
      reason: a.reason || "",
      ipHash: a.ip_hash || null,
      createdAt: a.created_at,
    })),
    total,
    page,
    limit,
  };
}

module.exports = { getAdminState, getPublicLinks, replaceLinks, listAudit };

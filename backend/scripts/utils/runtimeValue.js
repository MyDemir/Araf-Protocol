"use strict";

/**
 * Tüketiciler için güvenli runtime ayar okuyucu. Ayar servisi (Mongoose'a bağlı) yüklenemezse ya da hata verirse
 * env (sınıra kırpılmış) / varsayılan değere düşer. Asla fırlatmaz; istek başına DB sorgusu yapmaz.
 */

const defs = require("../config/runtimeSettingDefs");

let _svc;
function _service() {
  if (_svc === undefined) {
    try { _svc = require("../services/runtimeSettings"); } catch { _svc = null; }
  }
  return _svc;
}

function _fallback(key) {
  return defs.resolveValues({}).values[key];
}

/** Senkron: önbellekteki son etkin değer. */
function runtimeValueSync(key) {
  try {
    const svc = _service();
    if (svc) {
      const v = svc.getCachedValue(key);
      if (Number.isInteger(v) && defs.isInBounds(key, v)) return v;
    }
  } catch { /* fallback */ }
  return _fallback(key);
}

/** Asenkron: 15 sn önbellekli etkin değer. */
async function runtimeValue(key) {
  try {
    const svc = _service();
    if (svc) {
      const v = await svc.getEffectiveValue(key);
      if (Number.isInteger(v) && defs.isInBounds(key, v)) return v;
    }
  } catch { /* fallback */ }
  return _fallback(key);
}

module.exports = { runtimeValueSync, runtimeValue };

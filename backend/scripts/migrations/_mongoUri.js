"use strict";

// [TR] Migration script'leri için tek Mongo URI çözümü. MONGODB_URI birincildir (uygulama da yalnız onu okur);
//      MONGO_URI yalnız geriye uyum için okunur ve kullanımdan kalktığına dair uyarı basar.
// [EN] Single Mongo URI resolution for migration scripts. MONGODB_URI is primary (the app reads only it);
//      MONGO_URI is a deprecated fallback and logs a warning when used.
function resolveMongoUri(env = process.env, warn = (msg) => console.warn(msg)) {
  if (env.MONGODB_URI) return env.MONGODB_URI;
  if (env.MONGO_URI) {
    warn("[migration] MONGO_URI kullanımdan kalktı, MONGODB_URI kullanın. (MONGO_URI is deprecated; use MONGODB_URI.)");
    return env.MONGO_URI;
  }
  throw new Error("MONGODB_URI tanımlı değil.");
}

module.exports = { resolveMongoUri };

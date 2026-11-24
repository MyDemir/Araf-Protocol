"use strict";

// [TR] Testler için minimal bellek-içi Mongoose model taklidi: eşitlik, $in/$nin/$ne/$gte/$lte/$exists/$or ve
//      upsert. Gerçek veritabanı yok; yalnız "hangi filtreyle hangi belge görünür" davranışını sınar.

function getPath(doc, path) {
  return path.split(".").reduce((acc, k) => (acc === null || acc === undefined ? undefined : acc[k]), doc);
}

function matchValue(actual, cond) {
  if (cond !== null && typeof cond === "object" && !(cond instanceof Date) && !Array.isArray(cond)) {
    return Object.entries(cond).every(([op, v]) => {
      if (op === "$in") return v.includes(actual);
      if (op === "$nin") return !v.includes(actual);
      if (op === "$ne") return actual !== v;
      if (op === "$gte") return actual >= v;
      if (op === "$lte") return actual <= v;
      if (op === "$exists") return (actual !== undefined) === v;
      throw new Error(`memoryModel: desteklenmeyen operatör ${op}`);
    });
  }
  if (cond === null) return actual === null || actual === undefined;
  return actual === cond;
}

function matches(doc, filter = {}) {
  return Object.entries(filter).every(([key, cond]) => {
    if (key === "$or") return cond.some((f) => matches(doc, f));
    return matchValue(getPath(doc, key), cond);
  });
}

function setPath(doc, path, value) {
  const parts = path.split(".");
  let cur = doc;
  parts.slice(0, -1).forEach((k) => {
    if (typeof cur[k] !== "object" || cur[k] === null) cur[k] = {};
    cur = cur[k];
  });
  cur[parts[parts.length - 1]] = value;
}

function chain(getResult) {
  const c = {
    select: () => c,
    sort: () => c,
    skip: () => c,
    limit: () => c,
    lean: () => c,
    then: (res, rej) => Promise.resolve().then(getResult).then(res, rej),
  };
  return c;
}

function createMemoryModel(seed = []) {
  const docs = seed.map((d, i) => ({ _id: d._id || `id${i + 1}`, ...d }));
  const model = {
    docs,
    find: jest.fn((filter) => chain(() => docs.filter((d) => matches(d, filter)))),
    findOne: jest.fn((filter) => chain(() => docs.find((d) => matches(d, filter)) || null)),
    findById: jest.fn((id) => chain(() => docs.find((d) => String(d._id) === String(id)) || null)),
    countDocuments: jest.fn(async (filter) => docs.filter((d) => matches(d, filter)).length),
    exists: jest.fn(async (filter) => (docs.some((d) => matches(d, filter)) ? { _id: "x" } : null)),
    updateMany: jest.fn(async (filter, update) => {
      const hit = docs.filter((d) => matches(d, filter));
      hit.forEach((d) => Object.entries(update.$set || {}).forEach(([k, v]) => setPath(d, k, v)));
      return { matchedCount: hit.length, modifiedCount: hit.length };
    }),
    findOneAndUpdate: jest.fn(async (filter, update, opts = {}) => {
      let doc = docs.find((d) => matches(d, filter));
      if (!doc && opts.upsert) {
        doc = { _id: `id${docs.length + 1}` };
        Object.entries(filter).forEach(([k, v]) => {
          if (v === null || typeof v !== "object") setPath(doc, k, v);
        });
        Object.entries(update.$setOnInsert || {}).forEach(([k, v]) => setPath(doc, k, v));
        docs.push(doc);
      }
      if (doc) Object.entries(update.$set || {}).forEach(([k, v]) => setPath(doc, k, v));
      return doc || null;
    }),
  };
  return model;
}

module.exports = { createMemoryModel, matches };

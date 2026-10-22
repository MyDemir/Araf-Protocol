"use strict";

/**
 * Express 4 async handler sarmalayıcısı (B2-17).
 *
 * [TR] Express 4, async handler'ın reddini (rejected promise) otomatik error handler'a iletmez; try/catch'siz
 *      bir handler unhandledRejection üretir ve app.js bunu FATAL sayıp süreci düşürür. Bu sarmalayıcı hatayı
 *      next(err)'e yönlendirir; mevcut errorHandler yanıtı üretir. Senkron fonksiyonlarda da güvenlidir.
 *      4 argümanlı (err, req, res, next) hata middleware'lerinin arity'si korunur.
 * [EN] Express 4 does not forward rejected promises from async handlers. This wrapper routes them to next(err).
 */
function asyncHandler(fn) {
  if (typeof fn !== "function") {
    throw new TypeError("asyncHandler: fonksiyon bekleniyor.");
  }

  if (fn.length === 4) {
    return function wrappedErrorHandler(err, req, res, next) {
      try {
        return Promise.resolve(fn(err, req, res, next)).catch(next);
      } catch (syncErr) {
        return next(syncErr);
      }
    };
  }

  return function wrappedHandler(req, res, next) {
    try {
      return Promise.resolve(fn(req, res, next)).catch(next);
    } catch (syncErr) {
      return next(syncErr);
    }
  };
}

module.exports = { asyncHandler };

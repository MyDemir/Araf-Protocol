// [TR] P4 yedek mod: backend yokken dekont cihazda özetlenir; dosya hiçbir yere gönderilmez ve loglanmaz.
//      Normal akış kontrata çıplak 64 hane hex (backend'in şifreli dekont SHA-256'sı) yazar
//      [receipts.js: res.json({ hash: sha256Hash })]. Yerel özet "local-sha256:" önekiyle yazılır: çıplak hex ile
//      çakışmaz, boş değildir (kontrat EmptyIpfsHash ister) ve zincirde yerel olduğu açıkça okunur.
// [EN] P4 backup mode: the receipt is hashed on-device; the file is never uploaded or logged. The normal flow
//      writes a bare 64-hex string; the local digest carries a "local-sha256:" prefix so it cannot be confused.

export const LOCAL_RECEIPT_PREFIX = 'local-sha256:';
export const LOCAL_RECEIPT_MAX_BYTES = 25 * 1024 * 1024;

export const isLocalReceiptHash = (value) => /^local-sha256:[0-9a-f]{64}$/.test(String(value || ''));

const readBytes = (file) => {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer();
  // [TR] arrayBuffer() olmayan eski ortamlar için yerel okuma; yine ağ yok.
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('read_failed'));
    reader.readAsArrayBuffer(file);
  });
};

export async function hashLocalReceipt(file) {
  if (!file || typeof file.size !== 'number') throw new Error('invalid_file');
  if (file.size > LOCAL_RECEIPT_MAX_BYTES) throw new Error('file_too_large');
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('crypto_unavailable');
  const digest = await subtle.digest('SHA-256', await readBytes(file));
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  return `${LOCAL_RECEIPT_PREFIX}${hex}`;
}

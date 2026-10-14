#!/usr/bin/env node
// [TR] Redis'ten YALNIZ worker checkpoint anahtarlarını siler. Bağımlılık yok: TLS üzerinden ham RESP.
//      REDIS_URL yalnız env'den okunur; parola komut satırına/log'a girmez. Çıktı: silinen anahtar sayısı.
// [EN] Deletes ONLY the worker checkpoint keys from Redis. No dependencies (raw RESP over TLS).
'use strict';
const net = require('net');
const tls = require('tls');

const KEYS = ['worker:last_block', 'worker:last_safe_block'];

function resp(args) {
  return `*${args.length}\r\n` + args.map((a) => `$${Buffer.byteLength(a)}\r\n${a}\r\n`).join('');
}

function run(env = process.env) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(env.REDIS_URL || ''); } catch { return reject(new Error('REDIS_URL is not a valid URL')); }
    const plainOk = env.ALLOW_PLAIN_REDIS_FOR_TEST === '1' && u.protocol === 'redis:';
    if (u.protocol !== 'rediss:' && !plainOk) return reject(new Error('REDIS_URL must be rediss://'));
    const port = Number(u.port) || 6379;
    const cmds = [];
    const pass = decodeURIComponent(u.password || '');
    const user = decodeURIComponent(u.username || '');
    if (pass) cmds.push(user ? ['AUTH', user, pass] : ['AUTH', pass]);
    cmds.push(['DEL', ...KEYS]);
    const expected = cmds.length;
    const opts = { host: u.hostname, port, servername: u.hostname };
    const sock = plainOk ? net.connect(opts) : tls.connect(opts);
    let buf = ''; let done = false;
    const finish = (err, val) => { if (done) return; done = true; sock.destroy(); err ? reject(err) : resolve(val); };
    sock.setTimeout(15000, () => finish(new Error('Redis timeout')));
    sock.on('error', () => finish(new Error('Redis connection error')));
    sock.on(plainOk ? 'connect' : 'secureConnect', () => sock.write(cmds.map(resp).join('')));
    sock.on('data', (d) => {
      buf += d.toString('utf8');
      const lines = buf.split('\r\n');
      const replies = lines.filter((l) => /^[+\-:]/.test(l));
      if (replies.some((l) => l[0] === '-')) return finish(new Error('Redis rejected a command'));
      if (replies.length >= expected) {
        const n = Number(replies[expected - 1].slice(1));
        if (!Number.isInteger(n)) return finish(new Error('Unexpected Redis reply'));
        finish(null, n);
      }
    });
  });
}

module.exports = { run, KEYS };

if (require.main === module) {
  run().then((n) => console.log(`worker checkpoint keys deleted: ${n}`))
    .catch((e) => { console.error(`::error::${e.message}`); process.exit(1); });
}

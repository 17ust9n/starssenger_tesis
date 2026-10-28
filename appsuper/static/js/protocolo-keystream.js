/* ================= PROTOCOLO BASE (eyb + mf + fibo1 + keystream) ================= */

function utf8bytes(s) {
  return Array.from(new TextEncoder().encode(s));
}

function bytesToStr(b) {
  return new TextDecoder().decode(new Uint8Array(b));
}

function d2b(x) {
  const y = new Array(8);
  for (let n = 1; n <= 8; n++) {
    y[8 - n] = x % 2;
    x = Math.floor(x / 2);
  }
  return y;
}

function b2d(x) {
  let y = 0;
  for (let n = 1; n <= 8; n++) {
    y += x[8 - n] * Math.pow(2, n - 1);
  }
  return y;
}

function eybStr(s) {
  const key = [];
  for (const ch of s) {
    key.push(...d2b(ch.charCodeAt(0) & 255));
  }
  return key;
}

function mf(k, M) {
  let h = 2166136261 >>> 0;
  for (const b of k) {
    h ^= b;
    h = Math.imul(h, 16777619) >>> 0;
  }
  const o = [];
  for (let i = 0; i < M; i++) {
    h += 0x6D2B79F5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    o.push(((t ^ (t >>> 14)) >>> 0) % 2);
  }
  return o;
}

function b2dMSB(b) {
  let v = 0, L = b.length;
  for (let n = 1; n <= L; n++) {
    v += b[L - n] * Math.pow(2, n - 1);
  }
  return v;
}

function fibo1(seed, N) {
  let x = 3.444 + seed / 1e4;
  const K = [];
  for (let n = 0; n < N; n++) {
    x = x - Math.floor(x);
    let acuy = 0;
    const r = [];
    for (let d = 1; d <= 8; d++) {
      let yy = Math.floor(x * Math.pow(10, d)) - acuy * 10;
      acuy += yy;
      r.push(((yy % 2) + 2) % 2 === 0 ? 0 : 1);
    }
    K.push(r);
    x = x * (Math.PI - 127 / 300);
  }
  return K;
}

function groupKey(mem) {
  return eybStr(mem.slice().sort().join(''));
}

const seedCache = {};

function senderSeed(mem, who) {
  const ck = mem.slice().sort().join('_') + '|' + who;
  if (!(ck in seedCache)) {
    seedCache[ck] = deriveSeed(mem, who);
  }
  return seedCache[ck];
}

function deriveSeed(mem, who) {
  let h = 2166136261 >>> 0;
  for (const ch of (mem.slice().sort().join('') + who)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h % 256;
}

/**
 * Genera la secuencia de bytes pseudo-aleatorios (Keystream)
 * basada en el mapa caótico.
 */
function keystream(seed, off, N) {
  let y = (seed >>> 0) % 256;
  const total = off + N;
  const out = new Uint8Array(N);

  // Guarda contra offset corrupto o demasiado grande
  if (total > 10000000) return out;

  for (let i = 0; i < total; i++) {
    let x = 0.444666 + y / 1e7;
    const r = 3.611 + y / 1e4;
    x = r * x * (1 - x);
    x = x - Math.floor(x);

    let acuy = 0, byte = 0;
    for (let d = 1; d <= 8; d++) {
      const yd = Math.floor(x * Math.pow(10, d)) - acuy * 10;
      acuy = acuy + yd;
      const bit = (yd % 2 === 0) ? 0 : 1;
      byte += bit * Math.pow(2, d - 1);
    }

    byte = byte & 255;
    y = byte;

    if (i >= off) {
      out[i - off] = byte;
    }
  }
  return out;
}
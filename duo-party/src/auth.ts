// Firebase ID token（RS256 JWT）驗證 — workerd WebCrypto，無 firebase-admin / Node。
//
// 流程：抓 Google securetoken JWKS 公鑰（依 Cache-Control 快取）→ 驗 RS256 簽名
// → 驗 aud/iss/exp/iat → 回傳權威 uid（payload.sub）。任何一步不過回 null。

const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

interface Jwk extends JsonWebKey {
  kid: string;
}

let _jwksCache: { keys: Map<string, CryptoKey>; expMs: number } | null = null;

function b64urlToBytes(s: string): Uint8Array {
  const norm = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = norm.length % 4 ? 4 - (norm.length % 4) : 0;
  const bin = atob(norm + '='.repeat(pad));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlToJson(s: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));
}

async function getKeys(now: number): Promise<Map<string, CryptoKey>> {
  if (_jwksCache && _jwksCache.expMs > now) return _jwksCache.keys;
  const res = await fetch(JWKS_URL);
  if (!res.ok) throw new Error('jwks fetch failed: ' + res.status);
  const body = (await res.json()) as { keys: Jwk[] };
  const keys = new Map<string, CryptoKey>();
  for (const jwk of body.keys) {
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, [
      'verify',
    ]);
    keys.set(jwk.kid, key);
  }
  const cc = res.headers.get('cache-control') || '';
  const m = cc.match(/max-age=(\d+)/);
  const maxAgeMs = m ? Number(m[1]) * 1000 : 3_600_000;
  _jwksCache = { keys, expMs: now + maxAgeMs };
  return keys;
}

export async function verifyFirebaseIdToken(
  token: string,
  projectId: string,
  now: number = Date.now(),
): Promise<{ uid: string } | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [h, p, sig] = parts;
    const header = b64urlToJson(h);
    if (header.alg !== 'RS256' || typeof header.kid !== 'string') return null;

    const keys = await getKeys(now);
    const key = keys.get(header.kid);
    if (!key) return null;

    const data = new TextEncoder().encode(`${h}.${p}`);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(sig), data);
    if (!ok) return null;

    const payload = b64urlToJson(p);
    const nowSec = Math.floor(now / 1000);
    if (payload.aud !== projectId) return null;
    if (payload.iss !== `https://securetoken.google.com/${projectId}`) return null;
    if (typeof payload.exp !== 'number' || payload.exp < nowSec) return null;
    if (typeof payload.iat !== 'number' || payload.iat > nowSec + 300) return null; // 容許 5min 時鐘偏移
    if (typeof payload.sub !== 'string' || !payload.sub) return null;
    return { uid: payload.sub };
  } catch {
    return null;
  }
}

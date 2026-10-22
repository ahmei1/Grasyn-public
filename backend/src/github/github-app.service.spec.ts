import { createHmac, createVerify, generateKeyPairSync } from 'node:crypto';
import { createAppJwt, verifyWebhookSignature } from './github-app.service';

describe('GitHub App helpers', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });

  it('signs an RS256 app token GitHub accepts for under ten minutes', () => {
    const now = Date.UTC(2026, 9, 20, 12, 0, 0);
    const token = createAppJwt('123456', privateKey, now);
    const [header, payload, signature] = token.split('.');

    const decode = (part: string) =>
      JSON.parse(Buffer.from(part, 'base64url').toString()) as Record<
        string,
        unknown
      >;
    expect(decode(header)).toEqual({ alg: 'RS256', typ: 'JWT' });
    const claims = decode(payload);
    expect(claims.iss).toBe('123456');
    expect(claims.iat).toBe(now / 1000 - 60);
    expect(Number(claims.exp) - now / 1000).toBeLessThanOrEqual(600);
    expect(
      createVerify('RSA-SHA256')
        .update(`${header}.${payload}`)
        .verify(publicKey, Buffer.from(signature, 'base64url')),
    ).toBe(true);
  });

  describe('webhook signatures', () => {
    const secret = 'webhook-secret-for-tests';
    const body = Buffer.from('{"zen":"Keep it logically awesome."}');
    const sign = (bytes: Buffer, key = secret) =>
      `sha256=${createHmac('sha256', key).update(bytes).digest('hex')}`;

    it('accepts the signature GitHub computes over the raw body', () => {
      expect(verifyWebhookSignature(secret, body, sign(body))).toBe(true);
    });

    it('rejects a changed body, another secret, or a malformed header', () => {
      const changed = Buffer.from('{"zen":"Keep it logically awesome!"}');
      expect(verifyWebhookSignature(secret, changed, sign(body))).toBe(false);
      expect(verifyWebhookSignature(secret, body, sign(body, 'other'))).toBe(
        false,
      );
      expect(verifyWebhookSignature(secret, body, undefined)).toBe(false);
      expect(verifyWebhookSignature(secret, body, 'sha1=abc')).toBe(false);
      expect(verifyWebhookSignature(secret, body, 'sha256=abc')).toBe(false);
    });
  });
});

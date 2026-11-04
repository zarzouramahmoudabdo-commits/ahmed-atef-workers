import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { verifySignature, bytesToB64 } from '../src/lib/ota.js';

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const pem = publicKey.export({ type: 'spki', format: 'pem' });
const data = new TextEncoder().encode(JSON.stringify({ version: '1.0.2', files: [{ name: 'app.js', sha256: 'abc' }] }));
const sig = new Uint8Array(sign('sha256', data, { key: privateKey, dsaEncoding: 'ieee-p1363' }));

test('توقيع صحيح يُقبل', async () => assert.equal(await verifySignature(pem, data, sig), true));
test('تعديل بايت واحد في المانيفست يُرفض', async () => {
  const bad = data.slice(); bad[10] ^= 1; assert.equal(await verifySignature(pem, bad, sig), false);
});
test('توقيع بمفتاح آخر يُرفض', async () => {
  const other = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const s2 = new Uint8Array(sign('sha256', data, { key: other.privateKey, dsaEncoding: 'ieee-p1363' }));
  assert.equal(await verifySignature(pem, data, s2), false);
});
test('تحويل base64 لملفات كبيرة', () => { const u = new Uint8Array(100000).map((_, i) => i % 251); assert.equal(Buffer.from(bytesToB64(u), 'base64').equals(Buffer.from(u)), true); });

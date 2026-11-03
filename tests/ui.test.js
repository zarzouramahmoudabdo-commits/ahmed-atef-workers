import test from 'node:test';
import assert from 'node:assert/strict';
import { esc, errMsg, errCode, encryptText, decryptText, cmpVersion, sha256Hex } from '../src/lib/ui.js';

test('esc يمنع حقن HTML', () => assert.equal(esc('<img onerror="x">'), '&lt;img onerror=&quot;x&quot;&gt;'));
test('رسائل الأخطاء بالعربية', () => {
  assert.match(errMsg(new Error('OVERTIME_REQUIRES_PRESENT: تسجيل السهرة يتطلب حضور اليومية')), /^تسجيل السهرة يتطلب حضور اليومية$/);
  assert.match(errMsg(new TypeError('Failed to fetch')), /تعذر الاتصال/);
  assert.equal(errCode(new Error('OVERTIME_EXISTS: x')), 'OVERTIME_EXISTS');
});
test('تشفير وفك تشفير النسخة الاحتياطية', async () => {
  const enc = await encryptText('{"a":"بيانات"}', 'كلمة-سر');
  assert.ok(!enc.includes('بيانات'));
  assert.equal(await decryptText(enc, 'كلمة-سر'), '{"a":"بيانات"}');
  await assert.rejects(() => decryptText(enc, 'خطأ'));
});
test('مقارنة الإصدارات وبصمة SHA-256', async () => {
  assert.equal(cmpVersion('1.2.0', '1.10.0'), -1); assert.equal(cmpVersion('v2.0.0', '1.9.9'), 1); assert.equal(cmpVersion('1.0.0', '1.0.0'), 0);
  assert.equal(await sha256Hex(new TextEncoder().encode('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

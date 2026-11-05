import test from 'node:test';
import assert from 'node:assert/strict';
import { esc, errMsg, errCode, encryptText, decryptText, cmpVersion, sha256Hex, passwordCandidates, cleanEmail } from '../src/lib/ui.js';

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

test('صيغ كلمة المرور: أرقام عربية ومسافات', () => {
  assert.deepEqual(passwordCandidates('abc123'), ['abc123']);
  assert.deepEqual(passwordCandidates('abc١٢٣ '), ['abc١٢٣ ', 'abc١٢٣', 'abc123']);
  assert.deepEqual(passwordCandidates('x۱۲'), ['x۱۲', 'x12']);
  assert.deepEqual(passwordCandidates(''), []);
});

test('اللصق من واتساب: رموز اتجاه ومسافات مخفية', () => {
  assert.equal(cleanEmail('\u200Eboss@Example.com\u200F \n'), 'boss@example.com');
  assert.equal(cleanEmail('\u202Aboss@example.com\u202C\u00A0'), 'boss@example.com');
  const c = passwordCandidates('\u200Fabc123\u200E ');
  assert.ok(c.includes('abc123'), 'لم تُنتج الصيغة النظيفة'); assert.equal(c[0], '\u200Fabc123\u200E ');
  assert.ok(passwordCandidates('abc١٢٣\u200F').includes('abc123'));
});

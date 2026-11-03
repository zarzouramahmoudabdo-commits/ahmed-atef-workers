import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize, toCents, canSetOvertime, canMarkAbsent, unrecordedDays } from '../src/lib/finance.js';
import { daysInMonth, monthRange, shiftMonth, cairoToday, firstWeekday } from '../src/lib/months.js';
import { normalizePhone, buildStatementMessage, waLink } from '../src/lib/whatsapp.js';

const P = (rate = 300, ot = false, otr = 150) => ({ status: 'present', daily_rate_used: rate, overtime: ot, overtime_rate_used: ot ? otr : 0 });
const A = () => ({ status: 'absent', daily_rate_used: 0, overtime: false, overtime_rate_used: 0 });

test('1 حاضر بدون سهرة: اليومية فقط', () => {
  const s = summarize({ attendance: [P()] });
  assert.equal(s.dailyTotal, 30000); assert.equal(s.overtimeTotal, 0); assert.equal(s.earned, 30000);
});
test('2 حاضر مع سهرة: اليومية والسهرة', () => {
  const s = summarize({ attendance: [P(300, true)] });
  assert.equal(s.earned, 45000); assert.equal(s.overtimeCount, 1);
});
test('3 غائب: لا يومية ولا سهرة', () => {
  const s = summarize({ attendance: [A()] });
  assert.equal(s.earned, 0); assert.equal(s.absent, 1);
});
test('4/5/6 قواعد السهرة', () => {
  assert.equal(canSetOvertime({ status: 'absent' }), false);
  assert.equal(canSetOvertime(undefined), false);
  assert.equal(canSetOvertime({ status: 'present' }), true);
  assert.equal(canMarkAbsent({ status: 'present', overtime: true }), false);
  assert.equal(canMarkAbsent({ status: 'present', overtime: false }), true);
});
test('سجل غائب بسهرة لا يُحتسب أبدًا حتى لو وصل بالخطأ', () => {
  const s = summarize({ attendance: [{ status: 'absent', daily_rate_used: 300, overtime: true, overtime_rate_used: 150 }] });
  assert.equal(s.earned, 0);
});
test('7/8 أكثر من سلفة وخصم', () => {
  const s = summarize({ attendance: [P(), P(), P()], advances: [{ amount: 200 }, { amount: 50.5 }], deductions: [{ amount: 10 }, { amount: 20.25 }] });
  assert.equal(s.advances, 25050); assert.equal(s.deductions, 3025); assert.equal(s.net, 90000 - 25050 - 3025);
});
test('9 دفعة جزئية', () => {
  const s = summarize({ attendance: [P(), P()], payments: [{ amount: 250 }] });
  assert.equal(s.net, 60000); assert.equal(s.paid, 25000); assert.equal(s.remaining, 35000);
});
test('10 صافي سالب', () => {
  const s = summarize({ attendance: [P()], advances: [{ amount: 500 }] });
  assert.equal(s.net, -20000); assert.equal(s.remaining, -20000);
});
test('السجلات الملغاة لا تُحتسب', () => {
  const s = summarize({ advances: [{ amount: 100, voided_at: '2026-01-01' }, { amount: 50 }] });
  assert.equal(s.advances, 5000);
});
test('11 تغيير السعر لا يغير القديم (الحساب من السعر المحفوظ)', () => {
  const old = summarize({ attendance: [P(300), P(300)] });
  const mixed = summarize({ attendance: [P(300), P(300), P(350)] });
  assert.equal(old.dailyTotal, 60000); assert.equal(mixed.dailyTotal, 95000);
});
test('دقة عشرية: 0.1 + 0.2', () => {
  assert.equal(summarize({ advances: [{ amount: 0.1 }, { amount: 0.2 }] }).advances, 30);
  assert.equal(toCents('19.99'), 1999);
});
test('12/13 الشهور والسنة الكبيسة', () => {
  assert.equal(daysInMonth(2028, 2), 29); assert.equal(daysInMonth(2027, 2), 28);
  assert.equal(daysInMonth(2026, 4), 30); assert.equal(daysInMonth(2026, 12), 31);
  assert.deepEqual(monthRange(2026, 12), { start: '2026-12-01', end: '2027-01-01' });
  assert.deepEqual(shiftMonth(2026, 1, -1), { y: 2025, m: 12 });
  assert.deepEqual(shiftMonth(2026, 12, 1), { y: 2027, m: 1 });
  assert.equal(firstWeekday(2026, 11), 0); // 1 نوفمبر 2026 = الأحد
  assert.equal(unrecordedDays(29, 20, 5), 4);
});
test('تاريخ مصر', () => {
  assert.equal(cairoToday(new Date('2026-11-03T22:30:00Z')), '2026-11-04'); // منتصف الليل بتوقيت القاهرة
});
test('أرقام الهاتف المصرية', () => {
  assert.equal(normalizePhone('01012345678'), '201012345678');
  assert.equal(normalizePhone('+20 101 234 5678'), '201012345678');
  assert.equal(normalizePhone('0020 1012345678'), '201012345678');
  assert.equal(normalizePhone('١٠١٢٣٤٥٦٧٨'), '201012345678');
  assert.equal(normalizePhone('01312345678'), null);
  assert.equal(normalizePhone('12345'), null);
  assert.equal(normalizePhone(''), null);
  assert.equal(normalizePhone('+966512345678'), '966512345678');
});
test('رسالة WhatsApp تحتوي كل البنود', () => {
  const s = summarize({ attendance: [P(300, true), A()], advances: [{ amount: 200 }], deductions: [{ amount: 50 }], payments: [{ amount: 100 }] });
  const msg = buildStatementMessage({ name: 'محمد', year: 2026, month: 11, s,
    advances: [{ date: '2026-11-05', cents: 20000, note: 'ظروف' }], deductions: [{ date: '2026-11-07', cents: 5000, note: 'تلف أدوات' }], previousBalance: 0 });
  for (const t of ['محمد', 'نوفمبر 2026', 'أيام الحضور: 1', 'أيام الغياب: 1', 'عدد السهرات: 1', '2026-11-05', 'تلف أدوات', 'صافي المستحق', 'المدفوع', 'الرصيد المتبقي للدفع'])
    assert.ok(msg.includes(t), t);
  assert.ok(waLink('201012345678', msg).startsWith('https://wa.me/201012345678?text='));
});

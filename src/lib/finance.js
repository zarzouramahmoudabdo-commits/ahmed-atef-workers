// حسابات مالية بالقروش (أعداد صحيحة) لتجنب أخطاء الفاصلة العشرية.
export const toCents = (v) => Math.round(Number(v) * 100);
export const fromCents = (c) => c / 100;
export const fmt = (c) => (c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ج.م';

/**
 * يلخص شهرًا لعامل واحد.
 * attendance: {status, daily_rate_used, overtime, overtime_rate_used}
 * advances/deductions/payments: {amount, voided_at?}
 * الأجر = اليوميات + السهرات (بالأسعار المحفوظة في كل سجل، لا الأسعار الحالية).
 */
export function summarize({ attendance = [], advances = [], deductions = [], payments = [] }) {
  let present = 0, absent = 0, overtimeCount = 0, dailyTotal = 0, overtimeTotal = 0;
  for (const a of attendance) {
    if (a.status === 'present') { present++; dailyTotal += toCents(a.daily_rate_used); }
    else if (a.status === 'absent') absent++;
    if (a.status === 'present' && a.overtime) { overtimeCount++; overtimeTotal += toCents(a.overtime_rate_used); }
  }
  const sum = (rows) => rows.filter((r) => !r.voided_at).reduce((s, r) => s + toCents(r.amount), 0);
  const adv = sum(advances), ded = sum(deductions), paid = sum(payments);
  const earned = dailyTotal + overtimeTotal;
  const net = earned - adv - ded;
  return { present, absent, overtimeCount, dailyTotal, overtimeTotal, earned, advances: adv, deductions: ded, net, paid, remaining: net - paid };
}
export const unrecordedDays = (spanDays, present, absent) => Math.max(0, spanDays - present - absent);

/** قواعد السهرة (نفس قواعد السيرفر، للرسائل الفورية في الواجهة). */
export function canSetOvertime(attendanceRow) { return !!attendanceRow && attendanceRow.status === 'present'; }
export function canMarkAbsent(attendanceRow) { return !(attendanceRow && attendanceRow.overtime); }

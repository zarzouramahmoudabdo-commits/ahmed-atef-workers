import { fmt } from './finance.js';
import { MONTHS_AR } from './months.js';

/** يحوّل الرقم إلى صيغة دولية بدون + (مثال: 201012345678). يرجع null لو غير صالح. */
export function normalizePhone(raw) {
  if (!raw) return null;
  let s = String(raw).trim().replace(/[\s\-().]/g, '');
  s = s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  const intl = s.startsWith('+') || s.startsWith('00');
  s = s.replace(/^\+/, '').replace(/^00/, '');
  if (!/^\d+$/.test(s)) return null;
  if (!intl) {
    if (/^01[0125]\d{8}$/.test(s)) return '2' + s;       // 01012345678
    if (/^1[0125]\d{8}$/.test(s)) return '20' + s;       // 1012345678
  }
  if (/^201[0125]\d{8}$/.test(s)) return s;               // 201012345678
  if (intl && /^[1-9]\d{7,14}$/.test(s) && !s.startsWith('20')) return s; // دولي آخر
  return null;
}

export function buildStatementMessage(d) {
  const L = [];
  L.push(`السلام عليكم ${d.name}`);
  L.push(`كشف حساب شهر ${MONTHS_AR[d.month - 1]} ${d.year}`);
  L.push('');
  L.push(`أيام الحضور: ${d.s.present}`);
  L.push(`أيام الغياب: ${d.s.absent}`);
  L.push(`عدد السهرات: ${d.s.overtimeCount}`);
  L.push(`إجمالي اليوميات: ${fmt(d.s.dailyTotal)}`);
  L.push(`إجمالي السهرات: ${fmt(d.s.overtimeTotal)}`);
  L.push(`إجمالي الأجر: ${fmt(d.s.earned)}`);
  L.push('');
  L.push('السلف:');
  if (d.advances.length) d.advances.forEach((a) => L.push(`- ${a.date}: ${fmt(a.cents)}${a.note ? ' (' + a.note + ')' : ''}`)); else L.push('- لا يوجد');
  L.push('الخصومات:');
  if (d.deductions.length) d.deductions.forEach((a) => L.push(`- ${a.date}: ${fmt(a.cents)} — السبب: ${a.note}`)); else L.push('- لا يوجد');
  L.push('');
  L.push(`صافي المستحق: ${fmt(d.s.net)}`);
  L.push(`المدفوع: ${fmt(d.s.paid)}`);
  L.push(`الرصيد المتبقي للدفع: ${fmt(d.s.remaining)}`);
  if (d.s.remaining < 0) L.push('(الرصيد سالب = مبلغ مستحق على العامل وفق الحسابات المسجلة)');
  if (d.previousBalance) { L.push(''); L.push(`أرصدة سابقة غير مسددة: ${fmt(d.previousBalance)}`); }
  return L.join('\n');
}
export const waLink = (phone, text) => `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;

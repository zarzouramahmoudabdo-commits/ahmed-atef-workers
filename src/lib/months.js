export const MONTHS_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const p2 = (n) => String(n).padStart(2, '0');

/** عدد أيام الشهر (m من 1 إلى 12) — يدعم السنة الكبيسة. */
export const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export const isoDate = (y, m, d) => `${y}-${p2(m)}-${p2(d)}`;
/** بداية الشهر ونهايته (حصرية: أول الشهر التالي). */
export function monthRange(y, m) {
  const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1;
  return { start: isoDate(y, m, 1), end: isoDate(ny, nm, 1) };
}
export function shiftMonth(y, m, delta) {
  const t = y * 12 + (m - 1) + delta;
  return { y: Math.floor(t / 12), m: (t % 12) + 1 };
}
/** يوم الأسبوع لأول الشهر (0 = الأحد). */
export const firstWeekday = (y, m) => new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
/** تاريخ اليوم بتوقيت مصر بصيغة YYYY-MM-DD. */
export function cairoToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export const ymOf = (iso) => ({ y: +iso.slice(0, 4), m: +iso.slice(5, 7) });

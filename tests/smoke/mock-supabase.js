// عميل Supabase وهمي لاختبار الدخان فقط (يرجع بيانات ثابتة).
const W = { id: 'w1', worker_no: 1, full_name: 'محمد', phone: '01012345678', whatsapp: '01012345678', start_date: '2026-01-01', daily_rate: 300, overtime_rate: 150, notes: null, status: 'active' };
const ATT = [{ worker_id: 'w1', work_date: '2026-11-03', status: 'present', daily_rate_used: 300, overtime: true, overtime_rate_used: 150, notes: 'ملاحظة' }];
const REP = [{ worker_id: 'w1', worker_no: 1, full_name: 'محمد', status: 'active', present_days: 1, absent_days: 0, unrecorded_days: 29, overtime_count: 1, daily_total: 300, overtime_total: 150, earned: 450, advances_total: 100, deductions_total: 0, net_due: 350, paid_total: 0, remaining: 350, previous_balance: 0 }];
const T = { workers: [W], attendance: ATT, advances: [{ id: 'a1', worker_id: 'w1', amount: 100, adv_date: '2026-11-05', reason: 'ظروف' }], deductions: [], payments: [], profiles: { role: 'admin' } };
function q(table) {
  const b = { then: (res, rej) => Promise.resolve({ data: table === 'profiles' ? T.profiles : T[table], error: null }).then(res, rej) };
  for (const m of ['select', 'eq', 'gte', 'lt', 'is', 'order', 'range', 'insert', 'update']) b[m] = () => b;
  b.single = () => Promise.resolve({ data: T[table][0], error: null });
  b.maybeSingle = () => Promise.resolve({ data: T[table], error: null });
  return b;
}
export const createClient = () => ({
  from: q,
  rpc: (n) => Promise.resolve({ data: n === 'month_report' ? REP : null, error: null }),
  auth: { getSession: async () => ({ data: { session: { user: { id: 'u', email: 'a@b.c' } } } }), signOut: async () => ({}), signInWithPassword: async () => ({ data: {}, error: null }), resetPasswordForEmail: async () => ({ data: {}, error: null }) },
});

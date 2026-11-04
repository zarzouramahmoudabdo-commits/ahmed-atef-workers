import { createClient } from '@supabase/supabase-js';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { MONTHS_AR, daysInMonth, monthRange, shiftMonth, firstWeekday, cairoToday, ymOf, isoDate } from './lib/months.js';
import { summarize, toCents, fmt } from './lib/finance.js';
import { normalizePhone, buildStatementMessage, waLink } from './lib/whatsapp.js';
import { esc, toast, errMsg, errCode, encryptText, decryptText, sha256Hex, cmpVersion } from './lib/ui.js';
import { App } from '@capacitor/app';
import { FileOpener } from '@capacitor-community/file-opener';
import { checkOta, applyOta, otaBoot, resetOta, fetchBytes } from './lib/ota.js';

const VERSION = __APP_VERSION__, REPO = __REPO__, PUBKEY = __OTA_PUBKEY__;
const $app = document.getElementById('app');
const configured = !!(__SUPABASE_URL__ && __SUPABASE_ANON_KEY__);
const sb = configured ? createClient(__SUPABASE_URL__, __SUPABASE_ANON_KEY__, { auth: { persistSession: true, autoRefreshToken: true } }) : null;
const today = cairoToday();
const S = { view: 'home', param: null, ym: ymOf(today), date: today, role: null, formId: crypto.randomUUID(), workers: [], q: '', showArchived: false, busy: false, unlocked: null, aq: '', upd: null, bal: new Map() };
const DAYS = ['س', 'ح', 'ن', 'ث', 'ر', 'خ', 'ج']; // السبت أولًا

const ok = async (p) => { const { data, error } = await p; if (error) throw error; return data; };
const isAdmin = () => S.role === 'admin';
const num = (v) => toCents(v);
const sum = (rows, k) => rows.reduce((s, r) => s + num(r[k]), 0);
const money = (v) => { const c = num(v); return `<span class="${c < 0 ? 'neg' : ''}">${fmt(c)}</span>`; };

/** ينفذ عملية مع منع الضغط المتكرر وإظهار الأخطاء. */
async function run(fn, okMsg) {
  if (S.busy) return; S.busy = true; document.body.style.opacity = '.7';
  try { const r = await fn(); if (okMsg) toast(okMsg); return r; }
  catch (e) { toast(errMsg(e), true); throw e; }
  finally { S.busy = false; document.body.style.opacity = ''; }
}
const safe = (fn, okMsg) => run(fn, okMsg).catch(() => {});

function go(view, param = null) {
  if (view === 'attendance') { S.date = today; S.ym = ymOf(today); S.unlocked = null; S.aq = ''; }
  if (view === 'workers') S.q = '';   // البحث يبدأ فارغًا كل مرة
  S.view = view; S.param = param; S.formId = crypto.randomUUID(); render(); window.scrollTo(0, 0); }
const shell = (title, body, back = true, extra = '') => `<header>${back ? '<button class="sec" data-act="home">←</button>' : ''}<h1>${esc(title)}</h1>${extra}</header><main>${body}</main>`;
const dayName = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('ar-EG', { weekday: 'long', timeZone: 'UTC' });
const norm = (t) => String(t || '').replace(/[\u064B-\u0652\u0640]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').toLowerCase().trim();
const monthNav = (note = false) => `<div class="row noprint"><button class="sec" data-act="mprev">‹ الشهر السابق</button><b style="text-align:center">${MONTHS_AR[S.ym.m - 1]} ${S.ym.y}</b><button class="sec" data-act="mnext">الشهر التالي ›</button></div>${note ? '<p class="muted" style="margin:4px 0 10px">تغيير الشهر لعرض الحسابات فقط، ولا يغيّر تاريخ تسجيل الحضور.</p>' : ''}`;
async function loadWorkers() { S.workers = await ok(sb.from('workers').select('*').order('full_name')); return S.workers; }
const activeWorkers = () => S.workers.filter((w) => w.status === 'active');
const workerOpts = (sel) => activeWorkers().map((w) => `<option value="${w.id}" ${w.id === sel ? 'selected' : ''}>${esc(w.full_name)}</option>`).join('');
async function fetchAll(table) {
  const out = []; for (let i = 0; ; i += 1000) { const d = await ok(sb.from(table).select('*').order('id').range(i, i + 999)); out.push(...d); if (d.length < 1000) break; } return out;
}
async function saveFile(name, text, base64 = false) {
  if (Capacitor.isNativePlatform()) {
    await Filesystem.writeFile(base64 ? { path: name, data: text, directory: Directory.Documents } : { path: name, data: text, directory: Directory.Documents, encoding: Encoding.UTF8 });
    toast('تم الحفظ في مجلد المستندات: ' + name);
  } else {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text])); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
}

/* ---------- الشاشات ---------- */
const V = {};
V.login = () => `<header><h1>أحمد عاطف لإدارة العمال</h1></header><main><div class="card">
<label>البريد الإلكتروني</label><input id="em" type="email" autocomplete="username" dir="ltr">
<label>كلمة المرور</label><input id="pw" type="password" autocomplete="current-password" dir="ltr">
<button data-act="login" style="width:100%">تسجيل الدخول</button>
<p class="muted" style="text-align:center"><a href="#" data-act="reset">نسيت كلمة المرور؟</a></p></div>
${configured ? '' : '<div class="warn">لم يتم ضبط إعدادات Supabase في هذا الإصدار.</div>'}</main>`;

V.home = async () => {
  const { y, m } = S.ym;
  const [rows, ws, att, tdAtt] = await Promise.all([
    ok(sb.rpc('month_report', { p_year: y, p_month: m, p_include_archived: false })), loadWorkers(),
    ok(sb.from('attendance').select('worker_id,status,overtime').eq('work_date', today)), Promise.resolve()]);
  const act = new Set(activeWorkers().map((w) => w.id)), a = att.filter((x) => act.has(x.worker_id));
  const pres = a.filter((x) => x.status === 'present').length, abs = a.filter((x) => x.status === 'absent').length;
  const t = (k) => sum(rows, k);
  const st = (l, v) => `<div class="card stat"><span>${l}</span><b>${v}</b></div>`;
  return shell('لوحة التحكم', `${S.upd ? `<div class="warn" data-act="refresh" style="cursor:pointer">🔄 يوجد تحديث جديد (${esc(S.upd.manifest.version)}) — اضغط للتثبيت من داخل التطبيق</div>` : ''}
<div class="card ok">اليوم: ${dayName(today)} ${today}</div>
${act.size - pres - abs > 0 && isAdmin() ? `<div class="warn" data-go="attendance" style="cursor:pointer">⚠ ${act.size - pres - abs} عامل غير مسجل اليوم — اضغط لتسجيل الحضور</div>` : ''}
<h3 style="margin:8px 0">حسابات شهر</h3>${monthNav(true)}
<div class="grid">${st('العمال النشطون', act.size)}${st('الحاضرون اليوم', pres)}${st('الغائبون المسجلون اليوم', abs)}${st('غير مسجلين اليوم', act.size - pres - abs)}
${st('عدد السهرات (الشهر)', rows.reduce((s, r) => s + r.overtime_count, 0))}${st('إجمالي اليوميات', fmt(t('daily_total')))}
${st('إجمالي السهرات', fmt(t('overtime_total')))}${st('إجمالي الأجور', fmt(t('earned')))}${st('إجمالي السلف', fmt(t('advances_total')))}
${st('إجمالي الخصومات', fmt(t('deductions_total')))}${st('صافي المستحقات قبل الدفع', fmt(t('net_due')))}${st('إجمالي المدفوعات', fmt(t('paid_total')))}</div>
<div class="card stat"><span>إجمالي الأرصدة المتبقية للدفع</span><b>${money(rows.reduce((s, r) => s + num(r.remaining), 0) / 100)}</b></div>
<div class="menu"><button data-go="workers">العمال</button><button data-go="attendance">الحضور اليومي</button><button data-go="advances">السلف</button><button data-go="deductions">الخصومات</button>
<button data-go="payments">المدفوعات</button><button data-go="report">التقارير الشهرية</button><button data-go="backup">النسخ الاحتياطي</button><button data-go="settings">الإعدادات والتحديثات</button></div>`, false, `<button class="sec" data-act="refresh" title="تحديث">🔄${S.upd ? '<span class="dot"></span>' : ''}</button>`);
};

const workersList = () => {
  const q = norm(S.q), list = S.workers.filter((w) => (S.showArchived ? true : w.status === 'active') && norm(w.full_name).includes(q));
  return list.map((w) => `<div class="card" data-go="workerDetail" data-p="${w.id}"><b>${esc(w.full_name)}</b> ${w.status === 'archived' ? '<span class="tag t-u">مؤرشف</span>' : ''}
<div class="muted">رقم ${w.worker_no} • يومية ${fmt(num(w.daily_rate))} • سهرة ${fmt(num(w.overtime_rate))}</div>
${S.bal.get(w.id) ? `<div>المتبقي لـ${MONTHS_AR[S.ym.m - 1]}: <b>${money(S.bal.get(w.id).remaining)}</b>${num(S.bal.get(w.id).previous_balance) ? ` <span class="muted">(+ رصيد سابق ${fmt(num(S.bal.get(w.id).previous_balance))})</span>` : ''}</div>` : ''}</div>`).join('') || '<p class="muted">لا يوجد عمال.</p>';
};
V.workers = async () => {
  const [, rep] = await Promise.all([loadWorkers(), ok(sb.rpc('month_report', { p_year: S.ym.y, p_month: S.ym.m, p_include_archived: true }))]);
  S.bal = new Map(rep.map((r) => [r.worker_id, r]));
  return shell('العمال', `${isAdmin() ? '<button data-go="workerForm" style="width:100%;margin-bottom:10px">+ إضافة عامل</button>' : ''}
<input id="wq" placeholder="بحث بالاسم" value="${esc(S.q)}" autocomplete="off">
<label><input type="checkbox" id="warch" ${S.showArchived ? 'checked' : ''} style="width:auto"> إظهار المؤرشفين</label>
<div id="wlist">${workersList()}</div>`);
};

V.workerForm = async () => {
  const w = S.workers.find((x) => x.id === S.param) || {};
  return shell(w.id ? 'تعديل عامل' : 'إضافة عامل', `<div class="card">
<label>الاسم الكامل *</label><input id="f_name" value="${esc(w.full_name)}">
<label>رقم الهاتف</label><input id="f_phone" value="${esc(w.phone)}" dir="ltr" inputmode="tel">
<label>رقم WhatsApp</label><input id="f_wa" value="${esc(w.whatsapp)}" dir="ltr" inputmode="tel">
<label>تاريخ بدء العمل</label><input id="f_start" type="date" value="${esc(w.start_date)}">
<label>سعر اليومية (ج.م) *</label><input id="f_daily" type="number" inputmode="decimal" min="0" step="0.01" value="${esc(w.daily_rate)}">
<label>سعر السهرة (ج.م) *</label><input id="f_ot" type="number" inputmode="decimal" min="0" step="0.01" value="${esc(w.overtime_rate)}">
<p class="muted">تغيير الأسعار يسري على السجلات الجديدة فقط.</p>
<label>ملاحظات</label><textarea id="f_notes">${esc(w.notes)}</textarea>
<button data-act="saveWorker" style="width:100%">حفظ</button></div>
${w.id ? `<button class="${w.status === 'active' ? 'red' : ''}" data-act="toggleArchive" style="width:100%">${w.status === 'active' ? 'أرشفة العامل' : 'استعادة العامل'}</button>
<p class="muted">الأرشفة تُخفي العامل وتحتفظ بكل حساباته. الحذف النهائي يمسحه مع كل سجلاته.</p>
<button class="sec" data-act="deleteWorker" style="width:100%;color:var(--red);border:1px solid var(--red)">🗑 حذف العامل نهائيًا</button>` : ''}`);
};

V.attendance = async () => {
  const { y, m } = S.ym, { start, end } = monthRange(y, m);
  const [att] = await Promise.all([ok(sb.from('attendance').select('*').gte('work_date', start).lt('work_date', end)), loadWorkers()]);
  const has = new Set(att.map((a) => a.work_date)), n = daysInMonth(y, m), off = (firstWeekday(y, m) + 1) % 7;
  let cal = DAYS.map((d) => `<div class="h">${d}</div>`).join('') + '<div></div>'.repeat(off);
  for (let d = 1; d <= n; d++) { const iso = isoDate(y, m, d); cal += `<button data-act="pick" data-d="${iso}" class="${iso === S.date ? 'sel' : ''} ${has.has(iso) ? 'has' : ''} ${iso === today ? 'tdy' : ''} ${iso > today ? 'fut' : ''}">${d}</button>`; }
  const isToday = S.date === today, future = S.date > today;
  const editable = isAdmin() && !future && (isToday || S.unlocked === S.date);
  const banner = isToday ? `<div class="ok">✓ اليوم — ${dayName(S.date)} ${S.date}</div>`
    : future ? `<div class="warn">⛔ تاريخ قادم (${dayName(S.date)} ${S.date}): لا يمكن تسجيل حضور قبل حدوثه.</div><button data-act="today" style="width:100%;margin-bottom:10px">العودة لليوم</button>`
    : `<div class="warn">⚠ أنت تعرض تاريخًا سابقًا: <b>${dayName(S.date)} ${S.date}</b></div>${editable ? '<p class="muted">التعديل مفتوح لهذا التاريخ فقط. راجع التاريخ جيدًا قبل أي تسجيل.</p><button class="sec" data-act="today" style="width:100%;margin-bottom:10px">العودة لليوم</button>' : isAdmin() ? '<div class="row" style="margin-bottom:10px"><button data-act="unlock">فتح التعديل على هذا التاريخ</button><button class="sec" data-act="today">العودة لليوم</button></div>' : ''}`;
  const day = att.filter((a) => a.work_date === S.date);
  const rows = activeWorkers().map((w) => {
    const a = day.find((x) => x.worker_id === w.id), p = a?.status === 'present';
    const tag = !a ? '<span class="tag t-u">غير مسجل</span>' : p ? '<span class="tag t-p">حاضر</span>' : '<span class="tag t-a">غائب</span>';
    const nm = norm(w.full_name), hide = nm.includes(norm(S.aq)) ? '' : ' style="display:none"';
    return `<div class="card" data-name="${esc(nm)}"${hide}><div class="row"><b>${esc(w.full_name)}</b>${tag}</div>${a?.notes ? `<div class="muted">${esc(a.notes)}</div>` : ''}
${editable ? `<div class="row" style="margin-top:8px"><button class="${p ? 'on' : 'sec'}" data-act="att" data-w="${w.id}" data-s="present">حاضر</button>
<button class="${a && !p ? 'red' : 'sec'}" data-act="att" data-w="${w.id}" data-s="absent">غائب</button>
<button class="sec" data-act="att" data-w="${w.id}" data-s="unset">مسح</button></div>
<div class="row" style="margin-top:6px"><button class="${a?.overtime ? 'on' : 'sec'}" data-act="ot" data-w="${w.id}" data-on="${a?.overtime ? 0 : 1}" ${p ? '' : 'disabled'}>${a?.overtime ? '✓ سهرة (إلغاء)' : 'سهرة'}</button>
<button class="sec" data-act="note" data-w="${w.id}" ${a ? '' : 'disabled'}>ملاحظة</button></div>${p ? '' : '<div class="muted">السهرة تتطلب تسجيل الحضور أولًا.</div>'}` : ''}</div>`;
  }).join('');
  return shell('الحضور اليومي', `${monthNav()}<div class="card cal">${cal}</div>${banner}${editable ? `<div class="row noprint" style="margin-bottom:10px"><button data-act="allpresent">الكل حاضر</button><button class="sec" data-act="copyprev">نسخ حضور اليوم السابق</button></div><p class="muted">«الكل حاضر» يسجّل غير المسجلين فقط، ولا يغيّر من سُجّل غائبًا. النسخ لا ينقل السهرات.</p>` : ''}<input id="aq" placeholder="بحث بالاسم" value="${esc(S.aq)}" autocomplete="off"><div id="alist">${rows || '<p class="muted">لا يوجد عمال نشطون.</p>'}</div><p id="anone" class="muted" style="display:none">لا توجد نتائج.</p>`);
};

const MONEY = {
  advances: { title: 'السلف', dc: 'adv_date', t1: 'reason', l1: 'السبب / ملاحظات', req1: false, t2: null },
  deductions: { title: 'الخصومات', dc: 'ded_date', t1: 'reason', l1: 'سبب الخصم (إلزامي)', req1: true, t2: 'notes', l2: 'ملاحظات' },
  payments: { title: 'المدفوعات', dc: 'pay_date', t1: 'method', l1: 'طريقة الدفع', req1: false, t2: 'note', l2: 'ملاحظات / رقم إيصال' },
};
V.money = async () => {
  const c = MONEY[S.param], { start, end } = monthRange(S.ym.y, S.ym.m);
  const [rows] = await Promise.all([ok(sb.from(S.param).select('*').gte(c.dc, start).lt(c.dc, end).is('voided_at', null).order(c.dc)), loadWorkers()]);
  const name = (id) => esc(S.workers.find((w) => w.id === id)?.full_name || '');
  return shell(c.title, `${monthNav()}${isAdmin() ? `<div class="card"><label>العامل</label><select id="m_w">${workerOpts()}</select>
<label>المبلغ (ج.م)</label><input id="m_amt" type="number" inputmode="decimal" min="0.01" step="0.01">
<label>التاريخ</label><input id="m_date" type="date" value="${today}" max="${today}">
<label>${c.l1}</label><input id="m_t1">${c.t2 ? `<label>${c.l2}</label><input id="m_t2">` : ''}
<button data-act="saveMoney" style="width:100%">حفظ</button></div>` : ''}
<div class="card"><b>إجمالي الشهر: ${fmt(sum(rows, 'amount'))}</b></div>
${rows.map((r) => `<div class="card"><div class="row"><b>${name(r.worker_id)}</b><span>${fmt(num(r.amount))}</span></div>
<div class="muted">${r[c.dc]} ${esc(r[c.t1] || '')} ${esc(c.t2 ? r[c.t2] || '' : '')}</div>
${isAdmin() ? `<button class="sec" data-act="void" data-id="${r.id}">إلغاء السجل</button>` : ''}</div>`).join('')}`);
};

async function statementData(id) {
  const { y, m } = S.ym, { start, end } = monthRange(y, m);
  const q = (t, c) => ok(sb.from(t).select('*').eq('worker_id', id).gte(c, start).lt(c, end).is('voided_at', null).order(c));
  const [w, att, adv, ded, pay, rep] = await Promise.all([
    ok(sb.from('workers').select('*').eq('id', id).single()),
    ok(sb.from('attendance').select('*').eq('worker_id', id).gte('work_date', start).lt('work_date', end).order('work_date')),
    q('advances', 'adv_date'), q('deductions', 'ded_date'), q('payments', 'pay_date'),
    ok(sb.rpc('month_report', { p_year: y, p_month: m, p_include_archived: true }))]);
  const row = rep.find((r) => r.worker_id === id);
  return { w, att, adv, ded, pay, row, s: summarize({ attendance: att, advances: adv, deductions: ded, payments: pay }) };
}
V.workerDetail = async () => {
  const d = await statementData(S.param), { w, att, adv, ded, pay, row, s } = d;
  const mismatch = row && (num(row.earned) !== s.earned || num(row.remaining) !== s.remaining);
  const n = daysInMonth(S.ym.y, S.ym.m);
  const ledger = Array.from({ length: n }, (_, i) => { const iso = isoDate(S.ym.y, S.ym.m, i + 1), a = att.find((x) => x.work_date === iso);
    return `<tr><td>${iso.slice(8)}</td><td>${!a ? '<span class="tag t-u">غير مسجل</span>' : a.status === 'present' ? '<span class="tag t-p">حاضر</span>' : '<span class="tag t-a">غائب</span>'}</td><td>${a?.overtime ? 'سهرة' : ''}</td><td>${esc(a?.notes || '')}</td></tr>`; }).join('');
  const list = (rows, dc, k) => rows.map((r) => `<tr><td>${r[dc]}</td><td>${fmt(num(r.amount))}</td><td>${esc(r[k] || '')}</td></tr>`).join('') || '<tr><td colspan=3 class="muted">لا يوجد</td></tr>';
  return shell(w.full_name, `${monthNav()}${mismatch ? '<div class="warn">تحذير: اختلاف بين حساب التطبيق وحساب السيرفر. راجع السجلات.</div>' : ''}
<div class="card"><div class="muted">هاتف: ${esc(w.phone || '-')} • WhatsApp: ${esc(w.whatsapp || '-')}<br>اليومية الحالية ${fmt(num(w.daily_rate))} • السهرة الحالية ${fmt(num(w.overtime_rate))}</div></div>
<div class="grid"><div class="card stat"><span>حضور</span><b>${s.present}</b></div><div class="card stat"><span>غياب مسجل</span><b>${s.absent}</b></div>
<div class="card stat"><span>غير مسجل</span><b>${row ? row.unrecorded_days : '-'}</b></div><div class="card stat"><span>سهرات</span><b>${s.overtimeCount}</b></div></div>
<div class="card"><table><tr><td>إجمالي اليوميات</td><td>${fmt(s.dailyTotal)}</td></tr><tr><td>إجمالي السهرات</td><td>${fmt(s.overtimeTotal)}</td></tr>
<tr><td><b>إجمالي الأجر المكتسب</b></td><td><b>${fmt(s.earned)}</b></td></tr><tr><td>السلف</td><td>${fmt(s.advances)}</td></tr><tr><td>الخصومات</td><td>${fmt(s.deductions)}</td></tr>
<tr><td><b>صافي المستحق قبل الدفع</b></td><td><b>${money(s.net / 100)}</b></td></tr><tr><td>المدفوع</td><td>${fmt(s.paid)}</td></tr>
<tr><td><b>الرصيد المتبقي للدفع</b></td><td><b>${money(s.remaining / 100)}</b></td></tr></table>${s.remaining < 0 ? '<p class="muted">الرصيد السالب = مبلغ مستحق على العامل وفق الحسابات المسجلة.</p>' : ''}</div>
${row && num(row.previous_balance) ? `<div class="card"><b>أرصدة سابقة غير مسددة</b> (منفصلة، غير مضافة لأجر هذا الشهر): ${money(row.previous_balance)}</div>` : ''}
<h3>السلف</h3><div class="card scroll"><table>${list(adv, 'adv_date', 'reason')}</table></div>
<h3>الخصومات</h3><div class="card scroll"><table>${list(ded, 'ded_date', 'reason')}</table></div>
<h3>المدفوعات</h3><div class="card scroll"><table>${list(pay, 'pay_date', 'method')}</table></div>
<h3>الكشف اليومي</h3><div class="card scroll"><table>${ledger}</table></div>
<div class="row noprint"><button data-act="wa" data-id="${w.id}">إرسال عبر WhatsApp</button><button class="sec" onclick="window.print()">طباعة / PDF</button></div>
${isAdmin() ? `<button class="sec noprint" data-go="workerForm" data-p="${w.id}" style="width:100%;margin-top:8px">تعديل بيانات العامل</button>` : ''}`);
};

V.wa = async () => {
  const { w, adv, ded, row, s } = await statementData(S.param), phone = normalizePhone(w.whatsapp);
  const msg = buildStatementMessage({ name: w.full_name, year: S.ym.y, month: S.ym.m, s, previousBalance: row ? num(row.previous_balance) : 0,
    advances: adv.map((a) => ({ date: a.adv_date, cents: num(a.amount), note: a.reason })), deductions: ded.map((a) => ({ date: a.ded_date, cents: num(a.amount), note: a.reason })) });
  S.waMsg = msg; S.waPhone = phone;
  return shell('معاينة رسالة WhatsApp', `<div class="card"><b>إلى: ${esc(w.full_name)}</b><div dir="ltr" style="text-align:right">${phone ? '+' + phone : ''}</div>
${phone ? '' : '<div class="warn">رقم WhatsApp غير موجود أو غير صالح. عدّل بيانات العامل أولًا.</div>'}</div>
<pre class="msg">${esc(msg)}</pre>
<p class="muted">سيتم فتح WhatsApp والرسالة جاهزة في خانة الكتابة، والإرسال النهائي بيدك بعد المراجعة.</p>
<button data-act="openwa" style="width:100%" ${phone ? '' : 'disabled'}>فتح WhatsApp</button>`);
};

V.report = async () => {
  const rows = await ok(sb.rpc('month_report', { p_year: S.ym.y, p_month: S.ym.m, p_include_archived: S.showArchived }));
  S.rep = rows;
  const T = (k) => rows.reduce((s, r) => s + num(r[k]), 0), I = (k) => rows.reduce((s, r) => s + r[k], 0);
  return shell('التقرير الشهري', `${monthNav()}<label><input type="checkbox" id="rarch" ${S.showArchived ? 'checked' : ''} style="width:auto"> إظهار المؤرشفين</label>
<div class="card scroll"><table><tr><th>العامل</th><th>حضور</th><th>غياب</th><th>غير مسجل</th><th>سهرات</th><th>يوميات</th><th>سهرات</th><th>الأجر</th><th>سلف</th><th>خصومات</th><th>الصافي</th><th>المدفوع</th><th>المتبقي</th></tr>
${rows.map((r) => `<tr><td>${esc(r.full_name)}</td><td>${r.present_days}</td><td>${r.absent_days}</td><td>${r.unrecorded_days}</td><td>${r.overtime_count}</td><td>${r.daily_total}</td><td>${r.overtime_total}</td><td>${r.earned}</td><td>${r.advances_total}</td><td>${r.deductions_total}</td><td>${r.net_due}</td><td>${r.paid_total}</td><td>${r.remaining}</td></tr>`).join('')}
<tr><th>الإجمالي</th><th>${I('present_days')}</th><th>${I('absent_days')}</th><th>${I('unrecorded_days')}</th><th>${I('overtime_count')}</th><th>${T('daily_total') / 100}</th><th>${T('overtime_total') / 100}</th><th>${T('earned') / 100}</th><th>${T('advances_total') / 100}</th><th>${T('deductions_total') / 100}</th><th>${T('net_due') / 100}</th><th>${T('paid_total') / 100}</th><th>${T('remaining') / 100}</th></tr></table></div>
<div class="row noprint"><button data-act="csv">تصدير CSV</button><button class="sec" onclick="window.print()">طباعة / PDF</button></div>`);
};

V.backup = () => shell('النسخ الاحتياطي', `<div class="card"><h3>تصدير</h3><p class="muted">النسخة تحتوي بيانات العمال والحسابات فقط (بدون كلمات مرور أو مفاتيح). يُنصح بتشفيرها بكلمة مرور تحتفظ بها، ولا يمكن استرجاعها إن ضاعت.</p>
<label>كلمة مرور التشفير (اختياري لكن موصى به)</label><input id="bk_pass" type="password" dir="ltr"><button data-act="export" style="width:100%">تصدير نسخة احتياطية</button></div>
<div class="card"><h3>استعادة</h3><p class="muted">الاستعادة آمنة للتكرار: السجلات الموجودة تُتجاهل ولا تتكرر.</p>
<input type="file" id="bk_file" accept=".json"><label>كلمة المرور (إن كانت النسخة مشفرة)</label><input id="bk_pass2" type="password" dir="ltr"><button class="red" data-act="import" style="width:100%">استعادة</button></div>`);

V.settings = () => shell('الإعدادات والتحديثات', `<div class="card"><p>الإصدار الحالي: <b>${esc(VERSION)}</b></p>
<p class="muted">يتم تحديث التطبيق من داخله: الضغط على الزر ينزّل التحديث ويتحقق من توقيعه وبصمته ثم يثبّته، وبياناتك تبقى كما هي.</p>
<button data-act="refresh" style="width:100%">🔄 التحقق من التحديثات وتثبيتها</button></div>
<div class="card"><p class="muted">الحساب: ${esc(S.email || '')} (${S.role === 'admin' ? 'مدير' : 'محاسب'})</p><button class="sec" data-act="reset2" style="width:100%;margin-bottom:8px">إرسال رابط تغيير كلمة المرور</button><button class="red" data-act="logout" style="width:100%">تسجيل الخروج</button></div>
<div class="card"><p class="muted">خيار متقدم: لو ظهرت مشكلة بعد تحديث، يمكن حذف التحديثات والعودة للنسخة المدمجة في التطبيق.</p><button class="sec" data-act="resetOta" style="width:100%">العودة للنسخة المدمجة</button></div>`);

/* ---------- الأفعال ---------- */
const val = (id) => document.getElementById(id)?.value.trim() ?? '';
const A = {
  home: () => go('home'),
  mprev: () => { S.ym = shiftMonth(S.ym.y, S.ym.m, -1); render(); },
  mnext: () => { S.ym = shiftMonth(S.ym.y, S.ym.m, 1); render(); },
  unlock: () => { if (confirm(`فتح التعديل على تاريخ سابق: ${dayName(S.date)} ${S.date}؟\nتأكد أن هذا هو التاريخ المقصود.`)) { S.unlocked = S.date; render(); } },
  today: () => { S.date = today; S.ym = ymOf(today); S.unlocked = null; render(); },
  allpresent: () => { if (!confirm(`تسجيل كل العمال النشطين غير المسجلين «حاضر» ليوم ${S.date}؟`)) return;
    safe(async () => { const n = await ok(sb.rpc('mark_all_present', { p_date: S.date })); toast(n ? `تم تسجيل ${n} عامل حاضر` : 'لا يوجد عمال غير مسجلين'); render(); }); },
  copyprev: () => { const d = new Date(S.date + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 1); const prev = d.toISOString().slice(0, 10);
    if (!confirm(`نسخ حضور وغياب ${prev} إلى ${S.date} للعمال غير المسجلين؟ (بدون السهرات)`)) return;
    safe(async () => { const n = await ok(sb.rpc('copy_attendance_from', { p_from: prev, p_to: S.date })); toast(n ? `تم نسخ ${n} سجل` : 'لا يوجد ما يُنسخ'); render(); }); },
  pick: (el) => { S.date = el.dataset.d; render(); },
  login: () => safe(async () => { await ok(sb.auth.signInWithPassword({ email: val('em'), password: document.getElementById('pw').value })); await boot(); }),
  reset: async () => { const e = prompt('اكتب بريدك الإلكتروني'); if (e) safe(async () => { await ok(sb.auth.resetPasswordForEmail(e)); }, 'إذا كان البريد مسجلًا ستصلك رسالة'); },
  reset2: () => safe(async () => { await ok(sb.auth.resetPasswordForEmail(S.email)); }, 'تم إرسال الرابط إلى بريدك'),
  logout: async () => { await sb.auth.signOut(); S.role = null; render(); },
  saveWorker: () => safe(async () => {
    const rec = { full_name: val('f_name'), phone: val('f_phone') || null, whatsapp: val('f_wa') || null, start_date: val('f_start') || null, daily_rate: val('f_daily'), overtime_rate: val('f_ot'), notes: val('f_notes') || null };
    if (!rec.full_name) throw new Error('اكتب اسم العامل'); if (rec.daily_rate === '' || rec.overtime_rate === '' || +rec.daily_rate < 0 || +rec.overtime_rate < 0) throw new Error('اكتب سعر اليومية والسهرة');
    if (rec.whatsapp && !normalizePhone(rec.whatsapp)) throw new Error('رقم WhatsApp غير صالح');
    if (S.param) await ok(sb.from('workers').update(rec).eq('id', S.param)); else await ok(sb.from('workers').insert({ id: S.formId, ...rec }).select());
    go('workers');
  }, 'تم الحفظ'),
  toggleArchive: () => { const w = S.workers.find((x) => x.id === S.param); if (!confirm(w.status === 'active' ? 'أرشفة العامل؟ تبقى كل حساباته محفوظة.' : 'استعادة العامل؟')) return;
    safe(async () => { await ok(sb.from('workers').update({ status: w.status === 'active' ? 'archived' : 'active' }).eq('id', w.id)); go('workers'); }, 'تم'); },
  deleteWorker: async () => {
    const w = S.workers.find((x) => x.id === S.param); if (!w) return;
    let pv; try { pv = await run(() => ok(sb.rpc('worker_delete_preview', { p_worker: w.id }))); } catch { return; }
    const total = pv.attendance + pv.advances + pv.deductions + pv.payments; let typed = '';
    if (total === 0) { if (!confirm(`حذف العامل «${w.full_name}» نهائيًا؟ لا توجد له أي سجلات.`)) return; }
    else {
      if (!confirm(`⚠ حذف نهائي للعامل «${w.full_name}» وكل حساباته:\n• ${pv.attendance} يوم حضور/غياب\n• ${pv.advances} سلفة\n• ${pv.deductions} خصم\n• ${pv.payments} دفعة (المدفوع ${fmt(num(pv.paid_total))})\n\nالأفضل «أرشفة العامل» للاحتفاظ بالحسابات. هل تريد الحذف النهائي؟`)) return;
      typed = prompt(`للتأكيد اكتب اسم العامل كما هو:\n${w.full_name}`); if (typed === null) return;
    }
    safe(async () => { await ok(sb.rpc('delete_worker', { p_worker: w.id, p_name: typed })); go('workers'); }, 'تم حذف العامل');
  },
  att: (el) => safe(async () => {
    const args = { p_worker: el.dataset.w, p_date: S.date, p_status: el.dataset.s, p_notes: null, p_cancel_overtime: false };
    try { await ok(sb.rpc('set_attendance', args)); }
    catch (e) { if (errCode(e) !== 'OVERTIME_EXISTS' || !confirm('يوجد سهرة مسجلة لهذا اليوم. إلغاء السهرة مع تغيير الحالة؟')) throw e; await ok(sb.rpc('set_attendance', { ...args, p_cancel_overtime: true })); }
    render();
  }, 'تم الحفظ'),
  ot: (el) => safe(async () => { await ok(sb.rpc('set_overtime', { p_worker: el.dataset.w, p_date: S.date, p_on: el.dataset.on === '1' })); render(); }, 'تم الحفظ'),
  note: (el) => { const n = prompt('ملاحظة اليوم'); if (n !== null) safe(async () => { await ok(sb.rpc('set_attendance_note', { p_worker: el.dataset.w, p_date: S.date, p_notes: n })); render(); }, 'تم الحفظ'); },
  saveMoney: () => safe(async () => {
    const c = MONEY[S.param], amt = val('m_amt');
    if (!(+amt > 0)) throw new Error('اكتب مبلغًا صحيحًا'); if (!val('m_w')) throw new Error('اختر العامل'); if (!val('m_date')) throw new Error('اكتب التاريخ'); if (val('m_date') > today) throw new Error('لا يمكن تسجيل تاريخ قادم');
    if (c.req1 && !val('m_t1')) throw new Error('سبب الخصم مطلوب');
    const rec = { id: S.formId, worker_id: val('m_w'), amount: amt, [c.dc]: val('m_date'), [c.t1]: val('m_t1') || null }; if (c.t2) rec[c.t2] = val('m_t2') || null;
    try { await ok(sb.from(S.param).insert(rec)); } catch (e) { if (e.code !== '23505') throw e; } // 23505: حُفظ سابقًا (إعادة إرسال)
    S.formId = crypto.randomUUID(); render();
  }, 'تم الحفظ'),
  void: (el) => { const r = prompt('سبب إلغاء السجل (إلزامي)'); if (r === null) return; safe(async () => { await ok(sb.rpc('void_record', { p_table: S.param, p_id: el.dataset.id, p_reason: r })); render(); }, 'تم إلغاء السجل'); },
  wa: (el) => go('wa', el.dataset.id),
  openwa: () => { if (S.waPhone) window.open(waLink(S.waPhone, S.waMsg), '_blank'); },
  csv: () => safe(async () => {
    const H = ['العامل', 'حضور', 'غياب', 'غير مسجل', 'سهرات', 'اليوميات', 'مبلغ السهرات', 'الأجر', 'السلف', 'الخصومات', 'الصافي', 'المدفوع', 'المتبقي', 'رصيد سابق'];
    const L = [H, ...S.rep.map((r) => [r.full_name, r.present_days, r.absent_days, r.unrecorded_days, r.overtime_count, r.daily_total, r.overtime_total, r.earned, r.advances_total, r.deductions_total, r.net_due, r.paid_total, r.remaining, r.previous_balance])];
    await saveFile(`report-${S.ym.y}-${String(S.ym.m).padStart(2, '0')}.csv`, '\ufeff' + L.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n'));
  }),
  export: () => safe(async () => {
    const pass = val('bk_pass'); if (!pass && !confirm('النسخة ستكون غير مشفرة وتحتوي بيانات مالية. متابعة؟')) return;
    const data = { format: 'ahmed-atef-workers-backup-v1', exported_at: new Date().toISOString() };
    for (const t of ['workers', 'attendance', 'advances', 'deductions', 'payments']) data[t] = await fetchAll(t);
    const txt = JSON.stringify(data), stamp = today.replace(/-/g, '');
    await saveFile(pass ? `backup-${stamp}.enc.json` : `backup-${stamp}.json`, pass ? await encryptText(txt, pass) : txt);
  }, 'تم تصدير النسخة'),
  import: () => safe(async () => {
    const f = document.getElementById('bk_file').files[0]; if (!f) throw new Error('اختر ملف النسخة أولًا');
    let txt = await f.text(); if (JSON.parse(txt).format === 'ahmed-atef-workers-encrypted-v1') { try { txt = await decryptText(txt, val('bk_pass2')); } catch { throw new Error('كلمة المرور غير صحيحة أو الملف تالف'); } }
    if (!confirm('استعادة هذه النسخة؟ السجلات الموجودة لن تتكرر.')) return;
    const r = await ok(sb.rpc('restore_backup', { p_data: JSON.parse(txt) }));
    toast(`تمت الاستعادة: عمال ${r.workers}، حضور ${r.attendance}، سلف ${r.advances}، خصومات ${r.deductions}، مدفوعات ${r.payments}`);
  }),
  refresh: () => safe(async () => {
    toast('جارٍ التحقق من التحديثات...');
    const r = await otaCheck();
    if (!r.newer) { toast('أنت على أحدث إصدار ✓'); render(); return; }
    if (r.bad) { toast('هذا الإصدار فشل سابقًا على جهازك وتم تجاهله', true); return; }
    await installUpdate(r);
  }),
  resetOta: () => { if (confirm('حذف التحديثات والعودة للنسخة المدمجة؟ بعدها أغلق التطبيق وافتحه من جديد.')) safe(async () => { await resetOta(); S.upd = null; }, 'تم. أغلق التطبيق تمامًا ثم افتحه'); },
};

/* ---------- التحديث من داخل التطبيق ---------- */
async function otaCheck() {
  const r = await checkOta({ repo: REPO, pubKey: PUBKEY, version: VERSION });
  S.upd = r.newer && !r.bad ? r : null; return r;
}
const apkVersion = async () => (Capacitor.isNativePlatform() ? (await App.getInfo()).version : VERSION);
async function installUpdate(r) {
  const m = r.manifest;
  if (m.minApk && cmpVersion(m.minApk, await apkVersion()) > 0) {
    if (!m.apk) throw new Error('هذا التحديث يحتاج ملف APK جديدًا وغير متوفر.');
    if (confirm(`الإصدار ${m.version} يحتاج تحديث ملف التطبيق نفسه.\nسيتم تنزيله والتحقق منه ثم فتح شاشة التثبيت (اضغط «تثبيت»).`)) await installApk(r);
    return;
  }
  if (!confirm(`تثبيت التحديث ${m.version}؟\n${m.notes || ''}\nتبقى بياناتك كما هي وستُعاد تهيئة الشاشة.`)) return;
  toast('جارٍ التنزيل والتحقق...'); await applyOta(r);
}
async function installApk(r) {
  if (!Capacitor.isNativePlatform()) throw new Error('تثبيت APK يعمل على Android فقط.');
  const a = r.manifest.apk; toast('جارٍ تنزيل الملف...');
  const { bytes, b64 } = await fetchBytes(`${r.base}${a.name}`);
  if ((await sha256Hex(bytes)) !== a.sha256) throw new Error('فشل التحقق: بصمة الملف لا تطابق. لم يُفتح للتثبيت.');
  await Filesystem.writeFile({ path: `update/${a.name}`, directory: Directory.Cache, data: b64, recursive: true });
  const { uri } = await Filesystem.getUri({ path: `update/${a.name}`, directory: Directory.Cache });
  await FileOpener.open({ filePath: uri, contentType: 'application/vnd.android.package-archive', openWithDefault: true });
  toast('تم التحقق من الملف. اضغط «تثبيت» في الشاشة التي ظهرت.');
}

/* ---------- التشغيل ---------- */
let rendering = 0;
async function render() {
  const id = ++rendering;
  if (!configured || !S.role) { $app.innerHTML = V.login(); return; }
  $app.innerHTML = shell('...', '<p class="muted">جارٍ التحميل...</p>', S.view !== 'home');
  try {
    const html = S.view === 'home' ? await V.home() : ['advances', 'deductions', 'payments'].includes(S.view) ? await ((S.param = S.view), V.money()) : await V[S.view]();
    if (id === rendering) $app.innerHTML = html;
  } catch (e) { if (id === rendering) $app.innerHTML = shell('خطأ', `<div class="warn">${esc(errMsg(e))}</div><button data-act="home">رجوع</button>`, false); }
}
$app.addEventListener('click', (e) => {
  const a = e.target.closest('[data-act]'), g = e.target.closest('[data-go]');
  if (a) { e.preventDefault(); A[a.dataset.act]?.(a); } else if (g) go(g.dataset.go, g.dataset.p ?? null);
});
$app.addEventListener('input', (e) => {
  if (e.target.id === 'aq') {
    S.aq = e.target.value; const q = norm(S.aq); let shown = 0;
    document.querySelectorAll('#alist [data-name]').forEach((c) => { const ok = c.dataset.name.includes(q); c.style.display = ok ? '' : 'none'; if (ok) shown++; });
    const none = document.getElementById('anone'); if (none) none.style.display = shown ? 'none' : '';
  }
  if (e.target.id === 'wq') { S.q = e.target.value; const l = document.getElementById('wlist'); if (l) l.innerHTML = workersList(); }
}); // تحديث القائمة فقط: الحقل لا يُعاد بناؤه فلا تُغلق لوحة المفاتيح
$app.addEventListener('change', (e) => {
  if (e.target.id === 'warch' || e.target.id === 'rarch') { S.showArchived = e.target.checked; render(); }
});

async function boot() {
  if (!configured) return render();
  const { data } = await sb.auth.getSession();
  if (!data.session) { S.role = null; return render(); }
  const { data: p } = await sb.from('profiles').select('role').eq('id', data.session.user.id).maybeSingle();
  if (!p) { await sb.auth.signOut(); S.role = null; render(); toast('هذا الحساب غير مصرح له بالدخول للتطبيق.', true); return; }
  S.role = p.role; S.email = data.session.user.email; go('home');
}
boot().finally(() => {
  otaBoot(VERSION).catch(() => {});   // وصلنا هنا = الحزمة الحالية تعمل: ثبّتها أو سجّل فشل السابقة
  if (Capacitor.isNativePlatform() && PUBKEY) setTimeout(() => otaCheck().then(() => { if (S.upd && S.role && S.view === 'home') render(); }).catch(() => {}), 3000);
});

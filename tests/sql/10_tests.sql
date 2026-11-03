\set ON_ERROR_STOP on
create or replace function pg_temp.expect_fail(sql text, must_contain text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then
    if position(must_contain in sqlerrm) = 0 then raise exception 'خطأ مختلف عن المتوقع (%): %', must_contain, sqlerrm; end if;
    return;
  end;
  raise exception 'كان يجب أن تفشل العملية: %', sql;
end $$;
create or replace function pg_temp.eq(a numeric, b numeric, msg text) returns void language plpgsql as $$
begin if a is distinct from b then raise exception 'FAIL % : got % expected %', msg, a, b; end if; raise notice 'PASS %', msg; end $$;

-- مستخدمان: مدير وآخر بلا صلاحية
insert into auth.users(id, email) values ('00000000-0000-0000-0000-0000000000a1','admin@t'), ('00000000-0000-0000-0000-0000000000b2','x@t');
insert into public.profiles(id, full_name, role) values ('00000000-0000-0000-0000-0000000000a1','المدير','admin');

set test.uid = '00000000-0000-0000-0000-0000000000a1';
set role authenticated;

insert into public.workers(id, full_name, whatsapp, start_date, daily_rate, overtime_rate)
values ('11111111-1111-1111-1111-111111111111','محمد','01012345678','2026-01-01',300,150),
       ('22222222-2222-2222-2222-222222222222','علي','01112345678','2026-01-01',200,100);
\set w1 '11111111-1111-1111-1111-111111111111'
\set w2 '22222222-2222-2222-2222-222222222222'

-- 1: حاضر بدون سهرة
select public.set_attendance(:'w1','2026-11-01','present');
select pg_temp.eq((select daily_rate_used from attendance where work_date='2026-11-01' and worker_id=:'w1'), 300, '1 حاضر بدون سهرة: اليومية فقط');
select pg_temp.eq((select overtime_rate_used from attendance where work_date='2026-11-01' and worker_id=:'w1'), 0, '1 بدون سهرة = صفر');
-- 2: حاضر مع سهرة
select public.set_attendance(:'w1','2026-11-02','present');
select public.set_overtime(:'w1','2026-11-02', true);
select pg_temp.eq((select daily_rate_used + overtime_rate_used from attendance where work_date='2026-11-02' and worker_id=:'w1'), 450, '2 حاضر مع سهرة: 450');
-- 3: غائب
select public.set_attendance(:'w1','2026-11-03','absent');
select pg_temp.eq((select daily_rate_used + overtime_rate_used from attendance where work_date='2026-11-03' and worker_id=:'w1'), 0, '3 غائب = صفر');
-- 4: سهرة مع غياب
select pg_temp.expect_fail($$select public.set_overtime('11111111-1111-1111-1111-111111111111','2026-11-03', true)$$, 'OVERTIME_REQUIRES_PRESENT');
-- 5: سهرة بدون تسجيل اليومية
select pg_temp.expect_fail($$select public.set_overtime('11111111-1111-1111-1111-111111111111','2026-11-20', true)$$, 'OVERTIME_REQUIRES_PRESENT');
-- 6: تحويل حاضر -> غائب مع وجود سهرة
select pg_temp.expect_fail($$select public.set_attendance('11111111-1111-1111-1111-111111111111','2026-11-02','absent')$$, 'OVERTIME_EXISTS');
select pg_temp.eq((select count(*) from attendance where worker_id=:'w1' and work_date='2026-11-02' and status='present' and overtime), 1, '6 السجل لم يتغير بعد الرفض');
select public.set_attendance(:'w1','2026-11-02','absent', null, true);   -- إلغاء ذري
select pg_temp.eq((select count(*) from attendance where worker_id=:'w1' and work_date='2026-11-02' and status='absent' and not overtime and daily_rate_used=0 and overtime_rate_used=0), 1, '6 إلغاء ذري بلا تناقض');
-- 14: منع التكرار
select public.set_attendance(:'w1','2026-11-01','present');
select public.set_attendance(:'w1','2026-11-01','present');
select pg_temp.eq((select count(*) from attendance where worker_id=:'w1' and work_date='2026-11-01'), 1, '14 لا تكرار للحضور');
select public.set_overtime(:'w1','2026-11-01', true); select public.set_overtime(:'w1','2026-11-01', true);
select pg_temp.eq((select overtime_rate_used from attendance where worker_id=:'w1' and work_date='2026-11-01'), 150, '14 لا تكرار للسهرة');
-- القيود تمنع التناقض حتى لو جاء الطلب مباشرة (كمالك الجداول)
reset role;
select pg_temp.expect_fail($$insert into attendance(worker_id,work_date,status,overtime,overtime_rate_used) values ('11111111-1111-1111-1111-111111111111','2026-11-09','absent',true,150)$$, 'violates check constraint');
select pg_temp.expect_fail($$insert into attendance(worker_id,work_date,status,daily_rate_used) values ('11111111-1111-1111-1111-111111111111','2026-11-09','absent',300)$$, 'violates check constraint');
set test.uid = '00000000-0000-0000-0000-0000000000a1'; set role authenticated;

-- 11: تغيير السعر لا يغير القديم
update public.workers set daily_rate = 400 where id = :'w1';
select public.set_attendance(:'w1','2026-11-04','present');
select pg_temp.eq((select daily_rate_used from attendance where worker_id=:'w1' and work_date='2026-11-01'), 300, '11 السعر القديم محفوظ');
select pg_temp.eq((select daily_rate_used from attendance where worker_id=:'w1' and work_date='2026-11-04'), 400, '11 السعر الجديد للجديد فقط');
select public.set_attendance(:'w1','2026-11-04','present');   -- إعادة الضغط لا تغير السعر المحفوظ
update public.workers set daily_rate = 500 where id = :'w1';
select public.set_attendance(:'w1','2026-11-04','present');
select pg_temp.eq((select daily_rate_used from attendance where worker_id=:'w1' and work_date='2026-11-04'), 400, '11 إعادة الحفظ لا تعيد التسعير');
update public.workers set daily_rate = 300 where id = :'w1';

-- 7/8/9: سلف وخصومات ومدفوعات
insert into public.advances(worker_id, amount, adv_date, reason) values (:'w1', 200, '2026-11-05', 'ظروف'), (:'w1', 100, '2026-11-06', null);

select pg_temp.expect_fail($$insert into public.deductions(worker_id, amount, ded_date, reason) values ('11111111-1111-1111-1111-111111111111', 50, '2026-11-07', '  ')$$, 'deductions_reason_check');
insert into public.deductions(worker_id, amount, ded_date, reason) values (:'w1', 50, '2026-11-07', 'تلف أدوات'), (:'w1', 25, '2026-11-08', 'خصم إداري');
insert into public.payments(worker_id, amount, pay_date, method) values (:'w1', 250, '2026-11-20', 'نقدًا');

-- 19: التقرير الشهري = الحساب اليدوي
create temp table r as select * from public.month_report(2026, 11, false) where worker_id = :'w1';
select pg_temp.eq((select present_days from r), 2, '19 أيام الحضور');
select pg_temp.eq((select absent_days from r), 2, '19 أيام الغياب');
select pg_temp.eq((select unrecorded_days from r), 26, '19 الأيام غير المسجلة');
select pg_temp.eq((select overtime_count from r), 1, '19 عدد السهرات');
select pg_temp.eq((select daily_total from r), 700, '19 إجمالي اليوميات');
select pg_temp.eq((select overtime_total from r), 150, '19 إجمالي السهرات');
select pg_temp.eq((select earned from r), 850, '19 إجمالي الأجر');
select pg_temp.eq((select advances_total from r), 300, '7 مجموع السلف (أكثر من سلفة)');
select pg_temp.eq((select deductions_total from r), 75, '8 مجموع الخصومات');
select pg_temp.eq((select net_due from r), 475, '19 صافي المستحق');
select pg_temp.eq((select paid_total from r), 250, '9 المدفوع (جزئي)');
select pg_temp.eq((select remaining from r), 225, '9 المتبقي');

-- 12: الشهور مستقلة + الرصيد السابق منفصل
select pg_temp.eq((select earned from public.month_report(2026,12,false) where worker_id=:'w1'), 0, '12 ديسمبر لا يحمل أجر نوفمبر');
select pg_temp.eq((select previous_balance from public.month_report(2026,12,false) where worker_id=:'w1'), 225, '12 رصيد سابق غير مسدد = 225');
select pg_temp.eq((select earned from public.month_report(2026,10,false) where worker_id=:'w1'), 0, '12 أكتوبر فارغ');
-- 13: فبراير الكبيسة
select pg_temp.eq((select unrecorded_days from public.month_report(2028,2,false) where worker_id=:'w2'), 29, '13 فبراير 2028 = 29 يومًا');
select pg_temp.eq((select unrecorded_days from public.month_report(2027,2,false) where worker_id=:'w2'), 28, '13 فبراير 2027 = 28 يومًا');
-- 10: صافي سالب
insert into public.advances(worker_id, amount, adv_date) values (:'w2', 500, '2026-11-02');
select pg_temp.eq((select remaining from public.month_report(2026,11,false) where worker_id=:'w2'), -500, '10 رصيد سالب');

-- 17: إلغاء سجل مالي قديم بسبب + تدقيق
select pg_temp.expect_fail($$select public.void_record('advances', (select id from advances where amount=100 limit 1), '')$$, 'REASON_REQUIRED');
select public.void_record('advances', (select id from advances where amount=100 limit 1), 'تسجيل بالخطأ');
select pg_temp.eq((select advances_total from public.month_report(2026,11,false) where worker_id=:'w1'), 200, '17 السلفة الملغاة لا تُحتسب');
select pg_temp.eq((select count(*) from advances where amount=100 and void_reason='تسجيل بالخطأ'), 1, '17 السجل يبقى مع سبب الإلغاء');
select pg_temp.expect_fail($$select public.void_record('advances', (select id from advances where amount=100 limit 1), 'مرة ثانية')$$, 'NO_RECORD');
select pg_temp.expect_fail($$update public.advances set amount = 1$$, 'permission denied');
select pg_temp.expect_fail($$delete from public.attendance$$, 'permission denied');
select pg_temp.expect_fail($$update public.attendance set status = 'absent'$$, 'permission denied');
select pg_temp.eq((select count(*) from audit_logs where table_name='advances' and action='UPDATE'), 1, '17 سجل التدقيق يحتوي الإلغاء');

-- 18: الأرشفة
select count(*) as att_before from attendance where worker_id = :'w1' \gset
update public.workers set status = 'archived' where id = :'w1';
select pg_temp.eq((select count(*) from public.month_report(2026,11,false) where worker_id=:'w1'), 0, '18 المؤرشف مخفي افتراضيًا');
select pg_temp.eq((select earned from public.month_report(2026,11,true) where worker_id=:'w1'), 850, '18 حساباته محفوظة عند الطلب');
select pg_temp.eq((select count(*) from attendance where worker_id=:'w1'), :att_before, '18 لم يُحذف أي سجل');
select pg_temp.expect_fail($$select public.set_attendance('11111111-1111-1111-1111-111111111111','2026-11-10','present')$$, 'ARCHIVED');
select pg_temp.expect_fail($$delete from public.workers$$, 'permission denied');
update public.workers set status = 'active' where id = :'w1';

-- 16: وصول غير مصرح
set test.uid = '00000000-0000-0000-0000-0000000000b2';
select pg_temp.eq((select count(*) from public.workers), 0, '16 مستخدم بلا صلاحية لا يرى العمال');
select pg_temp.eq((select count(*) from public.advances), 0, '16 ولا السلف');
select pg_temp.eq((select count(*) from public.audit_logs), 0, '16 ولا سجل التدقيق');
select pg_temp.expect_fail($$insert into public.advances(worker_id, amount, adv_date) values ('11111111-1111-1111-1111-111111111111', 1, '2026-11-01')$$, 'row-level security');
select pg_temp.expect_fail($$insert into public.workers(full_name, daily_rate, overtime_rate) values ('مخترق', 1, 1)$$, 'row-level security');
select pg_temp.expect_fail($$select public.set_attendance('11111111-1111-1111-1111-111111111111','2026-11-10','present')$$, 'NOT_ADMIN');
select pg_temp.expect_fail($$select * from public.month_report(2026,11,false)$$, 'NOT_STAFF');
select pg_temp.expect_fail($$select public.restore_backup('{}'::jsonb)$$, 'NOT_ADMIN');
set role anon;
select pg_temp.expect_fail($$select * from public.workers$$, 'permission denied');
select pg_temp.expect_fail($$select * from public.attendance$$, 'permission denied');
select pg_temp.expect_fail($$select public.set_attendance('11111111-1111-1111-1111-111111111111','2026-11-10','present')$$, 'permission denied');
reset role;

-- 20: النسخ الاحتياطي والاستعادة
set test.uid = '00000000-0000-0000-0000-0000000000a1';
create temp table bk as select jsonb_build_object('format','ahmed-atef-workers-backup-v1',
  'workers', (select coalesce(jsonb_agg(to_jsonb(t)),'[]') from workers t),
  'attendance', (select coalesce(jsonb_agg(to_jsonb(t)),'[]') from attendance t),
  'advances', (select coalesce(jsonb_agg(to_jsonb(t)),'[]') from advances t),
  'deductions', (select coalesce(jsonb_agg(to_jsonb(t)),'[]') from deductions t),
  'payments', (select coalesce(jsonb_agg(to_jsonb(t)),'[]') from payments t)) as j;
grant select on bk to authenticated;
create temp table before_tot as select sum(earned) e, sum(net_due) n, sum(remaining) r from public.month_report(2026,11,true);
grant select on before_tot to authenticated;
select count(*) as n_att from attendance \gset
set test.uid = '00000000-0000-0000-0000-0000000000a1'; set role authenticated;
select pg_temp.expect_fail($$select public.restore_backup('{"format":"x"}')$$, 'BAD_BACKUP');
select pg_temp.eq((public.restore_backup((select j from bk))->>'attendance')::numeric, 0, '20 استيراد النسخة فوق نفس البيانات لا يكرر شيئًا');
reset role;
truncate workers, attendance, advances, deductions, payments, audit_logs restart identity cascade;
set test.uid = '00000000-0000-0000-0000-0000000000a1'; set role authenticated;
select pg_temp.eq((select count(*) from workers), 0, '20 القاعدة فارغة قبل الاستعادة');
select public.restore_backup((select j from bk));
select pg_temp.eq((select count(*) from attendance), :n_att, '20 استُعيد الحضور كاملًا');
select pg_temp.eq((select sum(earned) from public.month_report(2026,11,true)), (select e from before_tot), '20 الأجور بعد الاستعادة تطابق');
select pg_temp.eq((select sum(remaining) from public.month_report(2026,11,true)), (select r from before_tot), '20 المتبقي بعد الاستعادة يطابق');
select pg_temp.eq((public.restore_backup((select j from bk))->>'attendance')::numeric, 0, '20 الاستيراد مرتين لا يكرر');
select pg_temp.eq((select count(*) from attendance), :n_att, '20 العدد ثابت بعد الاستيراد الثاني');
\echo ALL_SQL_TESTS_PASSED

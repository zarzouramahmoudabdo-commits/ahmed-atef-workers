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

set test.uid = '00000000-0000-0000-0000-0000000000a1';
set role authenticated;
insert into public.workers(id, full_name, daily_rate, overtime_rate) values ('33333333-3333-3333-3333-333333333333','حسن',250,125);
insert into public.workers(id, full_name, daily_rate, overtime_rate, status) values ('44444444-4444-4444-4444-444444444444','قديم',100,50,'archived');
select count(*) as active_n from public.workers where status = 'active' \gset

select public.set_attendance('22222222-2222-2222-2222-222222222222','2026-12-05','absent');
select pg_temp.eq(public.mark_all_present('2026-12-05'), :active_n - 1, 'B1 تسجيل الكل حاضر لغير المسجلين فقط');
select pg_temp.eq((select status = 'absent' from public.attendance where worker_id='22222222-2222-2222-2222-222222222222' and work_date='2026-12-05')::int, 1, 'B2 الغائب المسجل لم يتغير');
select pg_temp.eq((select count(*) from public.attendance where worker_id='44444444-4444-4444-4444-444444444444'), 0, 'B3 المؤرشف لا يُسجل');
select pg_temp.eq((select daily_rate_used from public.attendance where worker_id='33333333-3333-3333-3333-333333333333' and work_date='2026-12-05'), 250, 'B4 سعر العامل الحالي يُحفظ');
select pg_temp.eq(public.mark_all_present('2026-12-05'), 0, 'B5 الاستدعاء المتكرر لا يكرر شيئًا');

select public.set_overtime('33333333-3333-3333-3333-333333333333','2026-12-05', true);
select pg_temp.eq(public.copy_attendance_from('2026-12-05','2026-12-06'), :active_n, 'B6 نسخ حضور اليوم السابق');
select pg_temp.eq((select count(*) from public.attendance where work_date='2026-12-06' and overtime), 0, 'B7 السهرات لا تُنسخ');
select pg_temp.eq((select count(*) from public.attendance where work_date='2026-12-06' and status='absent'), 1, 'B8 الغياب يُنسخ كغياب');
select pg_temp.eq(public.copy_attendance_from('2026-12-05','2026-12-06'), 0, 'B9 النسخ المتكرر لا يكرر');
select pg_temp.expect_fail($$select public.copy_attendance_from('2026-12-05','2026-12-05')$$, 'BAD_DATE');

set test.uid = '00000000-0000-0000-0000-0000000000b2';
select pg_temp.expect_fail($$select public.mark_all_present('2026-12-09')$$, 'NOT_ADMIN');
select pg_temp.expect_fail($$select public.copy_attendance_from('2026-12-05','2026-12-09')$$, 'NOT_ADMIN');
\echo BULK_TESTS_PASSED

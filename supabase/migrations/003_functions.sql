-- دوال السيرفر. كلها SECURITY DEFINER وتتحقق من الصلاحية بنفسها.

create or replace function public.set_attendance(
  p_worker uuid, p_date date, p_status text, p_notes text default null, p_cancel_overtime boolean default false
) returns void language plpgsql security definer set search_path = public as $$
declare w public.workers; a public.attendance;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN: غير مصرح'; end if;
  if p_status not in ('present','absent','unset') then raise exception 'BAD_STATUS: حالة غير صحيحة'; end if;
  select * into w from public.workers where id = p_worker for update;   -- يسلسل الطلبات المتزامنة لنفس العامل
  if not found then raise exception 'NO_WORKER: العامل غير موجود'; end if;
  if w.status = 'archived' then raise exception 'ARCHIVED: العامل مؤرشف'; end if;
  select * into a from public.attendance where worker_id = p_worker and work_date = p_date;

  if p_status in ('absent','unset') and found and a.overtime then
    if not p_cancel_overtime then
      raise exception 'OVERTIME_EXISTS: يوجد سهرة مسجلة، ألغِ السهرة أولًا';
    end if;
  end if;

  if p_status = 'unset' then
    delete from public.attendance where worker_id = p_worker and work_date = p_date;
  elsif p_status = 'present' then
    insert into public.attendance(worker_id, work_date, status, daily_rate_used, notes)
    values (p_worker, p_date, 'present', w.daily_rate, p_notes)
    on conflict (worker_id, work_date) do update
      set status = 'present',
          daily_rate_used = case when public.attendance.status = 'present' then public.attendance.daily_rate_used else excluded.daily_rate_used end,
          notes = coalesce(p_notes, public.attendance.notes);
  else
    insert into public.attendance(worker_id, work_date, status, notes)
    values (p_worker, p_date, 'absent', p_notes)
    on conflict (worker_id, work_date) do update
      set status = 'absent', daily_rate_used = 0, overtime = false, overtime_rate_used = 0,
          notes = coalesce(p_notes, public.attendance.notes);
  end if;
end $$;

create or replace function public.set_overtime(p_worker uuid, p_date date, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
declare w public.workers; a public.attendance;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN: غير مصرح'; end if;
  select * into w from public.workers where id = p_worker for update;
  if not found then raise exception 'NO_WORKER: العامل غير موجود'; end if;
  select * into a from public.attendance where worker_id = p_worker and work_date = p_date;
  if not found or a.status <> 'present' then
    raise exception 'OVERTIME_REQUIRES_PRESENT: تسجيل السهرة يتطلب حضور اليومية';
  end if;
  update public.attendance
     set overtime = p_on,
         overtime_rate_used = case when not p_on then 0 when overtime_rate_used > 0 then overtime_rate_used else w.overtime_rate end
   where id = a.id;
end $$;

create or replace function public.set_attendance_note(p_worker uuid, p_date date, p_notes text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN: غير مصرح'; end if;
  update public.attendance set notes = p_notes where worker_id = p_worker and work_date = p_date;
  if not found then raise exception 'NO_RECORD: سجّل الحالة أولًا'; end if;
end $$;

-- إلغاء (لا حذف) سجل مالي بسبب إلزامي. السجل يبقى للتاريخ ويُحتسب خارج الحسابات.
create or replace function public.void_record(p_table text, p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN: غير مصرح'; end if;
  if p_table not in ('advances','deductions','payments') then raise exception 'BAD_TABLE: جدول غير صحيح'; end if;
  if p_reason is null or length(btrim(p_reason)) = 0 then raise exception 'REASON_REQUIRED: سبب الإلغاء مطلوب'; end if;
  execute format('update public.%I set voided_at = now(), voided_by = auth.uid(), void_reason = $1 where id = $2 and voided_at is null', p_table)
    using p_reason, p_id;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'NO_RECORD: السجل غير موجود أو ملغي'; end if;
end $$;

-- رصيد العامل قبل تاريخ معين (أجور - سلف - خصومات - مدفوعات).
create or replace function public.worker_balance_before(p_worker uuid, p_date date)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce((select sum(daily_rate_used + overtime_rate_used) from attendance where worker_id = p_worker and work_date < p_date), 0)
       - coalesce((select sum(amount) from advances   where worker_id = p_worker and adv_date < p_date and voided_at is null), 0)
       - coalesce((select sum(amount) from deductions where worker_id = p_worker and ded_date < p_date and voided_at is null), 0)
       - coalesce((select sum(amount) from payments   where worker_id = p_worker and pay_date < p_date and voided_at is null), 0)
$$;

create or replace function public.month_report(p_year int, p_month int, p_include_archived boolean default false)
returns table (
  worker_id uuid, worker_no bigint, full_name text, status text,
  present_days int, absent_days int, unrecorded_days int, overtime_count int,
  daily_total numeric, overtime_total numeric, earned numeric,
  advances_total numeric, deductions_total numeric, net_due numeric,
  paid_total numeric, remaining numeric, previous_balance numeric
) language plpgsql stable security definer set search_path = public as $$
declare s date := make_date(p_year, p_month, 1); e date := (make_date(p_year, p_month, 1) + interval '1 month')::date;
begin
  if not public.is_staff() then raise exception 'NOT_STAFF: غير مصرح'; end if;
  return query
  with base as (
    select w.id, w.worker_no, w.full_name, w.status,
      (select count(*) from attendance a where a.worker_id = w.id and a.work_date >= s and a.work_date < e and a.status = 'present')::int as pd,
      (select count(*) from attendance a where a.worker_id = w.id and a.work_date >= s and a.work_date < e and a.status = 'absent')::int as ad,
      (select count(*) from attendance a where a.worker_id = w.id and a.work_date >= s and a.work_date < e and a.overtime)::int as oc,
      coalesce((select sum(a.daily_rate_used) from attendance a where a.worker_id = w.id and a.work_date >= s and a.work_date < e), 0) as dt,
      coalesce((select sum(a.overtime_rate_used) from attendance a where a.worker_id = w.id and a.work_date >= s and a.work_date < e), 0) as ot,
      coalesce((select sum(x.amount) from advances x   where x.worker_id = w.id and x.adv_date >= s and x.adv_date < e and x.voided_at is null), 0) as adv,
      coalesce((select sum(x.amount) from deductions x where x.worker_id = w.id and x.ded_date >= s and x.ded_date < e and x.voided_at is null), 0) as ded,
      coalesce((select sum(x.amount) from payments x   where x.worker_id = w.id and x.pay_date >= s and x.pay_date < e and x.voided_at is null), 0) as pay,
      greatest(0, e - greatest(coalesce(w.start_date, s), s)) as span
    from workers w
    where w.status = 'active' or p_include_archived
  )
  select b.id, b.worker_no, b.full_name, b.status, b.pd, b.ad,
         greatest(0, b.span - b.pd - b.ad)::int, b.oc,
         b.dt, b.ot, b.dt + b.ot, b.adv, b.ded,
         b.dt + b.ot - b.adv - b.ded, b.pay,
         b.dt + b.ot - b.adv - b.ded - b.pay,
         public.worker_balance_before(b.id, s)
  from base b order by b.full_name;
end $$;

-- استعادة نسخة احتياطية: آمنة للتكرار (on conflict do nothing) ولا تحتوي أسرارًا.
create or replace function public.restore_backup(p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb := '{}'; n int;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN: غير مصرح'; end if;
  if (p_data->>'format') is distinct from 'ahmed-atef-workers-backup-v1' then
    raise exception 'BAD_BACKUP: ملف النسخة الاحتياطية غير صالح';
  end if;
  insert into public.workers select * from jsonb_populate_recordset(null::public.workers, p_data->'workers') on conflict do nothing;
  get diagnostics n = row_count; r := r || jsonb_build_object('workers', n);
  insert into public.attendance select * from jsonb_populate_recordset(null::public.attendance, p_data->'attendance') on conflict do nothing;
  get diagnostics n = row_count; r := r || jsonb_build_object('attendance', n);
  insert into public.advances select * from jsonb_populate_recordset(null::public.advances, p_data->'advances') on conflict do nothing;
  get diagnostics n = row_count; r := r || jsonb_build_object('advances', n);
  insert into public.deductions select * from jsonb_populate_recordset(null::public.deductions, p_data->'deductions') on conflict do nothing;
  get diagnostics n = row_count; r := r || jsonb_build_object('deductions', n);
  insert into public.payments select * from jsonb_populate_recordset(null::public.payments, p_data->'payments') on conflict do nothing;
  get diagnostics n = row_count; r := r || jsonb_build_object('payments', n);
  perform setval(pg_get_serial_sequence('public.workers','worker_no'), greatest((select coalesce(max(worker_no),1) from public.workers), 1));
  return r;
end $$;

revoke all on function public.set_attendance, public.set_overtime, public.set_attendance_note, public.void_record,
  public.worker_balance_before, public.month_report, public.restore_backup from public, anon;
grant execute on function public.set_attendance, public.set_overtime, public.set_attendance_note, public.void_record,
  public.month_report, public.restore_backup, public.is_admin, public.is_staff to authenticated;

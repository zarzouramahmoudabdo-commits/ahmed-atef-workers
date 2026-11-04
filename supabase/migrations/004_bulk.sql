-- أدوات توفير الوقت لصاحب العمل: تسجيل الكل حاضر، ونسخ حضور يوم سابق.
-- لا تلمس إلا العمال النشطين غير المسجلين في اليوم، ولا تنسخ السهرات أبدًا.

create or replace function public.mark_all_present(p_date date)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN: غير مصرح'; end if;
  perform 1 from public.workers where status = 'active' for update;
  insert into public.attendance(worker_id, work_date, status, daily_rate_used)
  select w.id, p_date, 'present', w.daily_rate
  from public.workers w
  where w.status = 'active'
    and not exists (select 1 from public.attendance a where a.worker_id = w.id and a.work_date = p_date)
  on conflict (worker_id, work_date) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.copy_attendance_from(p_from date, p_to date)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN: غير مصرح'; end if;
  if p_from = p_to then raise exception 'BAD_DATE: اختر يومين مختلفين'; end if;
  perform 1 from public.workers where status = 'active' for update;
  insert into public.attendance(worker_id, work_date, status, daily_rate_used)
  select w.id, p_to, a.status, case when a.status = 'present' then w.daily_rate else 0 end
  from public.attendance a join public.workers w on w.id = a.worker_id
  where a.work_date = p_from and w.status = 'active'
    and not exists (select 1 from public.attendance b where b.worker_id = w.id and b.work_date = p_to)
  on conflict (worker_id, work_date) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.mark_all_present, public.copy_attendance_from from public, anon;
grant execute on function public.mark_all_present, public.copy_attendance_from to authenticated;

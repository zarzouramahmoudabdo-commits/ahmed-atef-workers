-- حذف العامل نهائياً مع جميع سجلاته المرتبطة
create or replace function public.delete_worker(p_worker uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN: غير مصرح';
  end if;

  if not exists (select 1 from public.workers where id = p_worker) then
    raise exception 'NO_WORKER: العامل غير موجود';
  end if;

  delete from public.payments where worker_id = p_worker;
  delete from public.deductions where worker_id = p_worker;
  delete from public.advances where worker_id = p_worker;
  delete from public.attendance where worker_id = p_worker;
  delete from public.workers where id = p_worker;
end;
$$;

revoke all on function public.delete_worker(uuid) from public, anon;
grant execute on function public.delete_worker(uuid) to authenticated;

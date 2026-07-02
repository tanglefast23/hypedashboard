create or replace function public.hype_dashboard_crowding_bars(p_asset text default 'HYPE')
returns table(bucket text, bucket_start timestamptz, avg_score numeric, avg_oi numeric)
language sql
security definer
set search_path = public
as $$
  select 'hour', date_trunc('hour', snapshot_time), avg(score), avg(total_oi_usd)
  from public.hype_dashboard_crowding_snapshots
  where asset = p_asset and snapshot_time >= now() - interval '24 hours'
  group by 2
  union all
  select 'day', date_trunc('day', snapshot_time), avg(score), avg(total_oi_usd)
  from public.hype_dashboard_crowding_snapshots
  where asset = p_asset and snapshot_time >= now() - interval '31 days'
  group by 2
  order by 1, 2;
$$;

alter table public.hype_dashboard_trades
  add column if not exists asset text;

update public.hype_dashboard_trades
set asset = case when coin = '@107' then 'HYPE' else coin end
where asset is null;

alter table public.hype_dashboard_trades
  alter column asset set not null;

create index if not exists hype_dashboard_trades_asset_venue_time_idx
  on public.hype_dashboard_trades (asset, venue, trade_time desc);

create or replace function public.hype_dashboard_trade_side_total(
  p_venue text,
  p_side text,
  p_since timestamptz,
  p_asset text default 'HYPE'
)
returns numeric
language sql
security definer
set search_path = public
as $$
  select coalesce(sum(value_usd), 0)
  from public.hype_dashboard_trades
  where asset = p_asset
    and venue = p_venue
    and side = p_side
    and trade_time >= p_since;
$$;

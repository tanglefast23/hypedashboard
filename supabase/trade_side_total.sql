create or replace function public.hype_dashboard_trade_side_total(
  p_venue text,
  p_side text,
  p_since timestamptz
)
returns numeric
language sql
security definer
set search_path = public
as $$
  select coalesce(sum(value_usd), 0)
  from public.hype_dashboard_trades
  where venue = p_venue
    and side = p_side
    and trade_time >= p_since;
$$;

create table if not exists public.hype_dashboard_crowding_snapshots (
  id bigserial primary key,
  asset text not null default 'HYPE',
  snapshot_time timestamptz not null default now(),
  score integer not null,
  label text not null,
  total_oi_usd numeric not null default 0,
  source_count integer not null default 0,
  funding_oi_score integer not null default 0,
  liquidation_score integer not null default 0,
  oi_price_score integer not null default 0,
  flow_score integer not null default 0,
  twap_score integer not null default 0,
  weighted_funding numeric,
  liquidation_imbalance_usd numeric,
  oi_change_24h_percent numeric,
  price_change_24h_percent numeric,
  flow_net_usd numeric,
  twap_pressure_1h_usd numeric,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists hype_dashboard_crowding_snapshots_time_idx
  on public.hype_dashboard_crowding_snapshots (snapshot_time desc);

create index if not exists hype_dashboard_crowding_snapshots_asset_time_idx
  on public.hype_dashboard_crowding_snapshots (asset, snapshot_time desc);

alter table public.hype_dashboard_crowding_snapshots enable row level security;

create or replace function public.hype_dashboard_delete_old_crowding_snapshots()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.hype_dashboard_crowding_snapshots
  where snapshot_time < now() - interval '31 days';
$$;

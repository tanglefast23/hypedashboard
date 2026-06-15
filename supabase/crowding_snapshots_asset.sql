alter table public.hype_dashboard_crowding_snapshots
  add column if not exists asset text not null default 'HYPE';

update public.hype_dashboard_crowding_snapshots
set asset = 'HYPE'
where asset is null or asset = '';

create index if not exists hype_dashboard_crowding_snapshots_asset_time_idx
  on public.hype_dashboard_crowding_snapshots (asset, snapshot_time desc);

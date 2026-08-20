create index if not exists idx_checkins_completed_by on public.checkins (completed_by);
create index if not exists idx_checkins_employee_id on public.checkins (employee_id);
create index if not exists idx_checkins_locked_by on public.checkins (locked_by);
create index if not exists idx_checkins_started_by on public.checkins (started_by);
create index if not exists idx_checkins_station_id on public.checkins (station_id);
create index if not exists idx_damage_media_damage_id on public.damage_media (damage_id);
create index if not exists idx_damage_type_ref_parent_code on public.damage_type_ref (parent_code);

-- RPT-06: minimal caller-token read contract for LAYER1_PERIOD_DURATION_HOURS v1.
-- Source ownership remains with LAYER1. This migration opens no write path.

alter table public.vehicle_journey_periods enable row level security;

-- Fail closed on Data API roles before re-granting the exact analytics read surface.
revoke all privileges on table public.vehicle_journey_periods from anon;
revoke select (
  period_id, regnr, period_type, started_at, ended_at, reason_code, reason_text,
  source_system, source_entity, source_record_id, source_event_id, metadata,
  created_by, created_at, updated_at
) on table public.vehicle_journey_periods from anon;

revoke all privileges on table public.vehicle_journey_periods from authenticated;
revoke select (
  period_id, regnr, period_type, started_at, ended_at, reason_code, reason_text,
  source_system, source_entity, source_record_id, source_event_id, metadata,
  created_by, created_at, updated_at
) on table public.vehicle_journey_periods from authenticated;

grant select (
  period_id,
  period_type,
  started_at,
  ended_at,
  reason_code,
  source_system,
  source_entity,
  source_record_id,
  source_event_id
) on table public.vehicle_journey_periods to authenticated;

drop policy if exists vehicle_journey_periods_app_user_select on public.vehicle_journey_periods;
create policy vehicle_journey_periods_app_user_select
on public.vehicle_journey_periods
for select
to authenticated
using ((select private.is_app_user()));

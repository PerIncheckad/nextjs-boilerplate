begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create index if not exists vehicle_journey_events_correction_idx
  on public.vehicle_journey_events (correction_of_event_id)
  where correction_of_event_id is not null;

create index if not exists vehicle_journey_periods_source_event_idx
  on public.vehicle_journey_periods (source_event_id)
  where source_event_id is not null;

create index if not exists vehicle_documents_salu_checkpoint_idx
  on public.vehicle_documents (salu_checkpoint_id)
  where salu_checkpoint_id is not null;

create index if not exists vehicle_documents_salu_child_process_idx
  on public.vehicle_documents (salu_child_process_id)
  where salu_child_process_id is not null;

commit;

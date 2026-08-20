begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- First real source-backed checkpoints. These are deliberately narrow boundary
-- facts: a source record exists and has reached the stated source status.
-- They do not replace detailed SALU checkpoints or infer business quality.
insert into public.checkpoint_definitions (
  checkpoint_code,
  definition_version,
  domain,
  title,
  description,
  owner_function,
  verification_mode,
  blocking,
  trigger_type,
  trigger_config,
  active
)
values
  (
    'NYBIL_BASELINE_CAPTURED',
    1,
    'NYBIL',
    'Nybil-baseline registrerad',
    'Systemverifierad kontrollpunkt som visar att bilen har ett registrerat Nybil-startläge. Den bedömer inte om alla enskilda baselinefält är fullständiga.',
    'BILKONTROLL',
    'SYSTEM',
    false,
    'SOURCE_RECORD',
    '{"sourceEntity":"nybil_inventering"}'::jsonb,
    true
  ),
  (
    'CHECKIN_COMPLETED',
    1,
    'CHECKIN',
    'Check-in slutförd',
    'Systemverifierad kontrollpunkt per slutförd Check-in. Varje Check-in behåller en egen cykel och källa.',
    'BILKONTROLL',
    'SYSTEM',
    false,
    'SOURCE_RECORD',
    '{"sourceEntity":"checkins","requiredStatus":"COMPLETED"}'::jsonb,
    true
  ),
  (
    'SALU_CYCLE_CREATED',
    1,
    'SALU',
    'SALU-cykel skapad',
    'Systemverifierad gränskontrollpunkt för en skapad SALU-cykel. Den ersätter eller duplicerar inte SALU-checkpoints S00-S28.',
    'BILKONTROLL',
    'SYSTEM',
    false,
    'SOURCE_RECORD',
    '{"sourceEntity":"salu_flags"}'::jsonb,
    true
  )
on conflict (checkpoint_code, definition_version) do nothing;

commit;

begin;

-- Reuse the existing hourly timer architecture: database-owned, idempotent runner.
-- No synthetic history/backfill; only future bookings in the new table are evaluated.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'garage-avveckla-transport-timers-hourly';

    perform cron.schedule(
      'garage-avveckla-transport-timers-hourly',
      '0 * * * *',
      $cron$select public.run_garage_avveckla_transport_timers(now(), true);$cron$
    );
  end if;
end
$$;

commit;

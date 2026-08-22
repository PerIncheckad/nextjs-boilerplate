create extension if not exists pg_cron with schema cron;

do $$
begin
  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'checkpoint-action-timers-hourly';

  perform cron.schedule(
    'checkpoint-action-timers-hourly',
    '0 * * * *',
    $cron$select public.run_checkpoint_action_timers(now(), true);$cron$
  );
end
$$;

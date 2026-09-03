begin;

-- Step D requires own-delivery completion to make an explicit billing decision.
-- Keep the locked B internal implementation for trusted wrapper-to-wrapper calls,
-- but do not expose it or the legacy own-delivery wrapper directly to service_role.
revoke execute on function public.complete_garage_avveckla_ut_internal(uuid,text,timestamptz,text,uuid,text) from service_role;
revoke execute on function public.verify_garage_avveckla_egen_leverans(uuid,timestamptz,text,uuid,text) from service_role;

-- The current server contract uses these explicit public entrypoints.
grant execute on function public.verify_garage_avveckla_egen_leverans_with_billing(uuid,timestamptz,text,boolean,text,text,text,numeric,numeric,text,text,text,uuid,text) to service_role;
grant execute on function public.verify_garage_avveckla_extern_transport(uuid,timestamptz,text,uuid,text) to service_role;
grant execute on function public.verify_garage_avveckla_avstallning(uuid,timestamptz,text,uuid,text) to service_role;

comment on function public.complete_garage_avveckla_ut_internal(uuid,text,timestamptz,text,uuid,text) is
  'Internal atomic terminal implementation. Not executable directly by service_role; callers must use the explicit route wrapper so method-specific contracts cannot be bypassed.';

commit;

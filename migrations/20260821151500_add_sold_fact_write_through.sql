begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create table public.journey_event_write_through_failures (
  failure_id uuid primary key default gen_random_uuid(),
  regnr text not null check (length(trim(regnr)) > 0),
  source_entity text not null check (length(trim(source_entity)) > 0),
  source_record_id text not null check (length(trim(source_record_id)) > 0),
  event_type text not null check (length(trim(event_type)) > 0),
  error_code text,
  error_message text not null,
  attempts integer not null default 1 check (attempts > 0),
  first_failed_at timestamptz not null default now(),
  last_failed_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (source_entity, source_record_id, event_type)
);
create index journey_event_write_through_failures_unresolved_idx on public.journey_event_write_through_failures (last_failed_at, regnr) where resolved_at is null;
alter table public.journey_event_write_through_failures enable row level security;
revoke all on public.journey_event_write_through_failures from public, anon, authenticated;
grant select, insert, update, delete on public.journey_event_write_through_failures to service_role;

create or replace function public.try_write_through_sold_fact(
  p_edit_id bigint,
  p_regnr text,
  p_new_value text,
  p_old_value text,
  p_edited_at timestamptz,
  p_edited_by text,
  p_batch_id text,
  p_sold_date text,
  p_comment text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_regnr text;
  v_new_value text;
  v_source_record_id text;
  v_event_type text;
  v_event_key text;
  v_comment text;
  v_sold_date text;
  v_correction_of uuid;
  v_error_code text;
  v_error_message text;
begin
  v_regnr := upper(regexp_replace(coalesce(p_regnr, ''), '\s+', '', 'g'));
  v_new_value := lower(trim(coalesce(p_new_value, '')));
  v_source_record_id := p_edit_id::text;
  v_comment := nullif(trim(coalesce(p_comment, '')), '');
  v_sold_date := nullif(trim(coalesce(p_sold_date, '')), '');

  if v_regnr = '' or p_edit_id is null then return false; end if;
  if v_new_value not in ('true', 'false') then return true; end if;
  if lower(trim(coalesce(p_old_value, ''))) = v_new_value then return true; end if;
  if v_comment is null then return false; end if;

  v_event_type := case when v_new_value = 'true' then 'VEHICLE_SOLD_RECORDED' else 'VEHICLE_SOLD_CORRECTED' end;
  v_event_key := 'vehicle-edit:' || v_source_record_id || ':' || v_event_type;

  begin
    if exists (select 1 from public.vehicle_journey_events where event_key = v_event_key) then
      update public.journey_event_write_through_failures
      set resolved_at = coalesce(resolved_at, pg_catalog.now())
      where source_entity = 'vehicle_edits' and source_record_id = v_source_record_id and event_type = v_event_type and resolved_at is null;
      return true;
    end if;

    if v_new_value = 'false' then
      select event_id into v_correction_of
      from public.vehicle_journey_events
      where regnr = v_regnr and event_type = 'VEHICLE_SOLD_RECORDED'
      order by occurred_at desc, created_at desc
      limit 1;
    end if;

    insert into public.vehicle_journey_events (
      regnr,event_type,event_key,occurred_at,source_system,source_entity,source_record_id,
      actor_source,actor_email,payload,correction_of_event_id
    ) values (
      v_regnr,v_event_type,v_event_key,coalesce(p_edited_at, pg_catalog.now()),'STATUS','vehicle_edits',v_source_record_id,
      'MANUELL',nullif(trim(coalesce(p_edited_by, '')), ''),
      pg_catalog.jsonb_build_object(
        'sourceKind','SALE_STATUS','sourceField','is_sold','oldValue',p_old_value,'newValue',p_new_value,
        'soldDate',v_sold_date,'comment',v_comment,'batchId',p_batch_id,
        'recordedAt',coalesce(p_edited_at, pg_catalog.now()),'soldDateHasNoTime',v_sold_date is not null
      ),
      v_correction_of
    );

    update public.journey_event_write_through_failures
    set resolved_at = coalesce(resolved_at, pg_catalog.now())
    where source_entity = 'vehicle_edits' and source_record_id = v_source_record_id and event_type = v_event_type and resolved_at is null;
    return true;
  exception when others then
    v_error_code := SQLSTATE;
    v_error_message := SQLERRM;
    begin
      insert into public.journey_event_write_through_failures as failure (
        regnr,source_entity,source_record_id,event_type,error_code,error_message
      ) values (
        coalesce(nullif(v_regnr, ''), 'UNKNOWN'),'vehicle_edits',coalesce(nullif(v_source_record_id, ''), 'UNKNOWN'),
        v_event_type,v_error_code,pg_catalog.left(v_error_message, 2000)
      )
      on conflict (source_entity,source_record_id,event_type)
      do update set error_code=excluded.error_code,error_message=excluded.error_message,
        attempts=failure.attempts+1,last_failed_at=pg_catalog.now(),resolved_at=null;
    exception when others then null; end;
    return false;
  end;
end;
$$;

create or replace function public.write_through_sold_facts()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_edit record;
  v_sold_date text;
  v_comment text;
begin
  for v_edit in
    select id,regnr,new_value,old_value,edited_by,edited_at,batch_id
    from inserted_vehicle_edits
    where field_name = 'is_sold' and lower(trim(coalesce(new_value, ''))) in ('true','false')
    order by id
  loop
    select nullif(trim(detail.new_value), '') into v_comment
    from inserted_vehicle_edits detail
    where detail.regnr = v_edit.regnr and detail.field_name = 'sold_kommentar'
      and detail.batch_id is not distinct from v_edit.batch_id
    order by detail.id desc limit 1;

    select nullif(trim(detail.new_value), '') into v_sold_date
    from inserted_vehicle_edits detail
    where detail.regnr = v_edit.regnr and detail.field_name = 'sold_datum'
      and detail.batch_id is not distinct from v_edit.batch_id
    order by detail.id desc limit 1;

    perform public.try_write_through_sold_fact(
      v_edit.id,v_edit.regnr,v_edit.new_value,v_edit.old_value,v_edit.edited_at,v_edit.edited_by,
      v_edit.batch_id,v_sold_date,v_comment
    );
  end loop;
  return null;
exception when others then
  return null;
end;
$$;

drop trigger if exists sold_fact_write_through on public.vehicle_edits;
create trigger sold_fact_write_through
after insert on public.vehicle_edits
referencing new table as inserted_vehicle_edits
for each statement execute function public.write_through_sold_facts();

revoke all on function public.try_write_through_sold_fact(bigint,text,text,text,timestamptz,text,text,text,text) from public,anon,authenticated;
revoke all on function public.write_through_sold_facts() from public,anon,authenticated;
grant execute on function public.try_write_through_sold_fact(bigint,text,text,text,timestamptz,text,text,text,text) to service_role;
grant execute on function public.write_through_sold_facts() to service_role;
commit;

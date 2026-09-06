-- Narrow the STATUS -> SALU ownership guard to the one field that is
-- actually process-owned by SALU: current Saludatum.
--
-- The remaining sales/contract facts are established in Nybil and may later
-- be explicitly corrected in Status. Their source history is preserved in
-- Nybil + vehicle_edits; no source row is rewritten here.

create or replace function public.guard_vehicle_edits_salu_source_ownership()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.field_name = 'saludatum' then
    raise exception 'SALU-owned field % must be changed in SALU, not STATUS', new.field_name
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- Existing trigger remains in place and now delegates to the narrowed guard.
-- No historical vehicle_edits rows are updated or deleted.

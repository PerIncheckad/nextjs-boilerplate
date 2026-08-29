-- Planering v3 stage 1: stable model identity and editable model masterdata.
-- Additive and backward compatible with the pre-v3 API during rollout.

alter table public.planning_vehicle_models
  add column if not exists brand text not null default 'ÖVRIGT',
  add column if not exists is_electric boolean not null default false,
  add column if not exists is_automatic boolean not null default false,
  add column if not exists daily_rate integer,
  add column if not exists aliases text[] not null default '{}'::text[];

alter table public.planning_vehicle_models
  drop constraint if exists planning_vehicle_models_daily_rate_check;
alter table public.planning_vehicle_models
  add constraint planning_vehicle_models_daily_rate_check
  check (daily_rate is null or daily_rate >= 0);

update public.planning_vehicle_models
set brand = 'MB'
where brand = 'ÖVRIGT';

alter table public.fleet_planning_cells
  add column if not exists model_code text;

update public.fleet_planning_cells f
set model_code = m.model_code
from public.planning_vehicle_models m
where f.model_code is null
  and (
    upper(trim(f.model)) = upper(trim(m.display_name))
    or upper(trim(f.model)) = upper(trim(m.model_code))
  );

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.fleet_planning_cells'::regclass
      and conname = 'fleet_planning_cells_model_code_fkey'
  ) then
    alter table public.fleet_planning_cells
      add constraint fleet_planning_cells_model_code_fkey
      foreign key (model_code) references public.planning_vehicle_models(model_code);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.fleet_planning_cells'::regclass
      and conname = 'fleet_planning_cells_period_model_code_station_key'
  ) then
    alter table public.fleet_planning_cells
      add constraint fleet_planning_cells_period_model_code_station_key
      unique (period_code, model_code, station);
  end if;
end $$;

create index if not exists fleet_planning_cells_model_code_idx
  on public.fleet_planning_cells(model_code);

insert into public.planning_vehicle_models (model_code, display_name, brand, sort_order, is_active)
values
('MB:CITAN_KORT','CITAN Kort','MB',10,true),
('MB:CITAN_LANG','CITAN Lång','MB',20,true),
('MB:VITO_KORT','VITO kort','MB',30,true),
('MB:VITO_LANG','VITO Lång','MB',40,true),
('MB:SPRINTER_KORT','SPRINTER Kort','MB',50,true),
('MB:SPRINTER_LANG','SPRINTER Lång','MB',60,true),
('MB:SPRINTER_BAKGAVEL','SPRINTER Bakgavel','MB',70,true),
('MB:A_KLASS','A - KLASS','MB',80,true),
('MB:CLA','CLA','MB',90,true),
('MB:CLA_SB','CLA SB','MB',100,true),
('MB:C_KLASS_KOMBI','C- KLASS Kombi','MB',110,true),
('MB:C_KLASS_SEDAN','C- KLASS Sedan','MB',120,true),
('MB:E_KLASS_KOMBI','E- KLASS Kombi','MB',130,true),
('MB:E_KLASS_SEDAN','E- KLASS Sedan','MB',140,true),
('MB:GLB','GLB','MB',150,true),
('MB:GLE_SUV','GLE SUV','MB',160,true),
('MB:GLE_CUPE','GLE Cupé','MB',170,true),
('MB:GLS','GLS','MB',180,true),
('MB:EQA','EQA','MB',190,true),
('MB:EQB','EQB','MB',200,true),
('MB:EQE_SEDAN','EQE SEDAN','MB',210,true),
('MB:EQE_SUV','EQE SUV','MB',220,true),
('MB:EQS_SEDAN','EQS SEDAN','MB',230,true),
('MB:EQS_SUV','EQS SUV','MB',240,true),
('MB:V_KLASS','V - KLASS','MB',250,true),
('MB:VLE','VLE','MB',260,true),
('VW:POLO','POLO','VW',10,true),
('VW:GOLF','GOLF','VW',20,true),
('VW:T_CROSS','T-Cross','VW',30,true),
('VW:T_ROC','T-Roc','VW',40,true),
('NISSAN:QQ','QQ','NISSAN',10,true),
('BMW:1_SERIE','1 - Serie','BMW',10,true),
('BMW:3_SERIE','3 - Serie','BMW',20,true),
('BMW:5_SERIE','5 - Serie','BMW',30,true),
('BMW:X1','X1','BMW',40,true),
('BMW:X3','X3','BMW',50,true),
('BMW:X5','X5','BMW',60,true)
on conflict (model_code) do update set
  display_name=excluded.display_name,
  brand=excluded.brand,
  sort_order=excluded.sort_order,
  is_active=true,
  updated_at=now();

update public.planning_vehicle_models set aliases = array['A250e','A 250e'] where model_code='MB:A_KLASS';
update public.planning_vehicle_models set aliases = array['Cla','Cla 250+','CLA 250+','Mercedes-Benz CLA EQ'] where model_code='MB:CLA';
update public.planning_vehicle_models set aliases = array['Mercedes-Benz CLA SB EQ'] where model_code='MB:CLA_SB';
update public.planning_vehicle_models set aliases = array['C300e','C 300e'] where model_code='MB:C_KLASS_SEDAN';
update public.planning_vehicle_models set aliases = array['E 300e','E300 e','E300de','E300 de','E200de'] where model_code='MB:E_KLASS_SEDAN';
update public.planning_vehicle_models set aliases = array['GLB','Glb 200'] where model_code='MB:GLB';
update public.planning_vehicle_models set aliases = array['Gle53 Amg','Gle350De'] where model_code='MB:GLE_SUV';
update public.planning_vehicle_models set aliases = array['GLS450D'] where model_code='MB:GLS';
update public.planning_vehicle_models set aliases = array['EQE 350+'] where model_code='MB:EQE_SEDAN';
update public.planning_vehicle_models set aliases = array['120'] where model_code='BMW:1_SERIE';

-- Remove only legacy CLA EQ rows that carry no planning decision, then repoint
-- historical planning rows to the new stable identity. The legacy model text is
-- intentionally retained in fleet_planning_cells.model as a historical snapshot.
delete from public.fleet_planning_cells
where model_code='MERCEDES-BENZ CLA EQ'
  and behov_count=0 and utok_count=0 and minskning_count=0
  and ordered_count=0 and salu_count=0 and note is null;

update public.fleet_planning_cells set model_code='MB:A_KLASS' where model_code='A250E';
update public.fleet_planning_cells set model_code='MB:C_KLASS_SEDAN' where model_code='C300E';
update public.fleet_planning_cells set model_code='MB:CLA' where model_code='CLA 250+';
update public.fleet_planning_cells set model_code='MB:E_KLASS_SEDAN' where model_code='E 300E';
update public.fleet_planning_cells set model_code='MB:EQE_SEDAN' where model_code='EQE 350+';
update public.fleet_planning_cells set model_code='MB:GLB' where model_code='GLB';
update public.fleet_planning_cells set model_code='MB:GLE_SUV' where model_code='GLE53 AMG';
update public.fleet_planning_cells set model_code='MB:GLS' where model_code='GLS450D';
update public.fleet_planning_cells set model_code='MB:CLA_SB' where model_code='MERCEDES-BENZ CLA SB EQ';

update public.planning_vehicle_models
set is_active=false
where model_code in (
  'A250E','C300E','CLA 250+','E 300E','EQE 350+','GLB','GLE53 AMG','GLS450D',
  'MERCEDES-BENZ CLA EQ','MERCEDES-BENZ CLA SB EQ'
);

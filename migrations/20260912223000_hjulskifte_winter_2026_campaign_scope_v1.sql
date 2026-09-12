-- INCHECKAD Hjulskifte: explicit WINTER_2026 campaign scope.
-- This migration changes only Hjulskifte candidate membership. It does not delete or
-- rewrite vehicles and it is not canonical fleet/ownership truth.

create table if not exists public.wheel_change_scope_campaigns (
  season_key text primary key,
  valid_from date not null,
  valid_to date not null,
  status text not null check (status in ('ACTIVE', 'CLOSED')),
  source_reference text not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_from <= valid_to)
);

create table if not exists public.wheel_change_season_scope (
  season_key text not null references public.wheel_change_scope_campaigns(season_key),
  regnr text not null,
  scope_status text not null check (scope_status in ('IN_SCOPE', 'EXCLUDED')),
  source_reference text not null,
  note text,
  recorded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (season_key, regnr),
  check (regnr = upper(regexp_replace(regnr, '\s+', '', 'g')) and length(regnr) > 0)
);

comment on table public.wheel_change_scope_campaigns is
  'Operational Hjulskifte campaign control. Not canonical fleet membership and not vehicle ownership truth.';
comment on table public.wheel_change_season_scope is
  'Per-season Hjulskifte scope. Rows are retained for traceability; exclusions use scope_status, never vehicle deletion.';

alter table public.wheel_change_scope_campaigns enable row level security;
alter table public.wheel_change_season_scope enable row level security;
revoke all on table public.wheel_change_scope_campaigns from public, anon, authenticated;
revoke all on table public.wheel_change_season_scope from public, anon, authenticated;
grant select on table public.wheel_change_scope_campaigns to service_role;
grant select on table public.wheel_change_season_scope to service_role;

insert into public.wheel_change_scope_campaigns (
  season_key, valid_from, valid_to, status, source_reference, note
) values (
  'WINTER_2026', date '2026-09-05', date '2027-04-15', 'ACTIVE',
  'MASTER 2026-09-12: Augusti population + Nybil Aug/Sep not in Augusti - explicit sold list',
  '366 controlled campaign members at revision 2026-09-12. Hjulskifte scope only.'
)
on conflict (season_key) do update
set valid_from = excluded.valid_from,
    valid_to = excluded.valid_to,
    status = excluded.status,
    source_reference = excluded.source_reference,
    note = excluded.note,
    updated_at = now();

with seed(regnr) as (
  values
    ('ACP11L'),
    ('AHB28L'),
    ('AMJ52B'),
    ('AMJ52C'),
    ('AMJ52S'),
    ('APJ07L'),
    ('ASF72D'),
    ('ASF82D'),
    ('BAY75S'),
    ('BAY92F'),
    ('BDD92P'),
    ('BEP14E'),
    ('BFE28S'),
    ('BFY12J'),
    ('BGK13X'),
    ('BHP08W'),
    ('BJB52D'),
    ('BKR92L'),
    ('BLJ07K'),
    ('BMC82B'),
    ('BRB04A'),
    ('BRL76L'),
    ('BSJ76K'),
    ('BSZ12Z'),
    ('BUF12P'),
    ('BUU11L'),
    ('BWA82X'),
    ('BWB36N'),
    ('BWB48X'),
    ('BZA28N'),
    ('BZJ12E'),
    ('BZP03R'),
    ('CBJ12Y'),
    ('CBR24J'),
    ('CCS49N'),
    ('CDJ11A'),
    ('CFH50Y'),
    ('CHJ08T'),
    ('CJB00H'),
    ('CJB50W'),
    ('COK87K'),
    ('CPC23Y'),
    ('CRJ50E'),
    ('CZC03L'),
    ('DAB52D'),
    ('DAP09C'),
    ('DEB35E'),
    ('DFP08U'),
    ('DGR03Y'),
    ('DHB52K'),
    ('DHL03K'),
    ('DHL51R'),
    ('DJB26Y'),
    ('DJC14F'),
    ('DOJ51T'),
    ('DSK51G'),
    ('DXC34L'),
    ('DXH87H'),
    ('DZC14G'),
    ('DZJ04T'),
    ('EAJ08Y'),
    ('ECP62L'),
    ('EDJ10K'),
    ('EDJ12P'),
    ('EDP25E'),
    ('EDX45H'),
    ('EEP62E'),
    ('EFD62S'),
    ('EFU07M'),
    ('EJD45J'),
    ('EMC61L'),
    ('EMH62E'),
    ('EMP61Z'),
    ('EPC08H'),
    ('ERA82K'),
    ('EUX07X'),
    ('EWC62E'),
    ('EWF07W'),
    ('EWJ06F'),
    ('EYH14X'),
    ('EYM08D'),
    ('EYS61Y'),
    ('EZY98E'),
    ('FBW03U'),
    ('FCY25T'),
    ('FJA505'),
    ('FJD46Y'),
    ('FOJ04Y'),
    ('FTD62B'),
    ('FWA59R'),
    ('FWB27E'),
    ('FXF46C'),
    ('GBC37B'),
    ('GBN29P'),
    ('GCR47N'),
    ('GDE67X'),
    ('GED30M'),
    ('GEU29F'),
    ('GFX46X'),
    ('GGC20F'),
    ('GHG69G'),
    ('GHP29L'),
    ('GJN27G'),
    ('GLJ84P'),
    ('GMP73R'),
    ('GMT36H'),
    ('GNJ84U'),
    ('GRH67Z'),
    ('GWB38T'),
    ('GYA66W'),
    ('HCA57D'),
    ('HDB59L'),
    ('HDC84W'),
    ('HHK81J'),
    ('HJB02E'),
    ('HKC47R'),
    ('HKJ24N'),
    ('HRB27L'),
    ('HWG94U'),
    ('JAD87R'),
    ('JAD87T'),
    ('JAR83F'),
    ('JAZ54U'),
    ('JBA64K'),
    ('JBB92Z'),
    ('JBE66R'),
    ('JBE86H'),
    ('JBG43E'),
    ('JBJ80Y'),
    ('JBK19Y'),
    ('JBK29K'),
    ('JBK94J'),
    ('JBL96L'),
    ('JBM14H'),
    ('JBP20G'),
    ('JBR47P'),
    ('JBS12Z'),
    ('JBS73N'),
    ('JBX01K'),
    ('JBX86U'),
    ('JCA90F'),
    ('JCB34Z'),
    ('JDN42A'),
    ('JFG00R'),
    ('JGJ08K'),
    ('JJB55Z'),
    ('JJD01N'),
    ('JPL16G'),
    ('JSF16H'),
    ('JTC16H'),
    ('JYD42U'),
    ('KAL63C'),
    ('KCJ53A'),
    ('KDB82N'),
    ('KDP06W'),
    ('KDU100'),
    ('KFY16T'),
    ('KOM80G'),
    ('KRA73C'),
    ('KRB02F'),
    ('KRB25F'),
    ('KRB37J'),
    ('KTL82E'),
    ('KUL14L'),
    ('LBG81A'),
    ('LGB37E'),
    ('LGF94K'),
    ('LHF380'),
    ('LJA67T'),
    ('LJA85U'),
    ('LJK12Y'),
    ('LJL37Y'),
    ('LLK13G'),
    ('LLT64B'),
    ('LMJ38F'),
    ('LOC01A'),
    ('LPJ06T'),
    ('LSK11Y'),
    ('LUG92P'),
    ('LXL11K'),
    ('MCJ49X'),
    ('MDB92C'),
    ('MFB85Y'),
    ('MGF22R'),
    ('MHJ09G'),
    ('MJB56N'),
    ('MMP07W'),
    ('MMX48U'),
    ('MNF22F'),
    ('MPR22C'),
    ('MWA28D'),
    ('MWY21R'),
    ('MXT21U'),
    ('MYY75N'),
    ('MZB38T'),
    ('NCG22U'),
    ('NCN02Y'),
    ('NDS59X'),
    ('NEP07L'),
    ('NFC86A'),
    ('NGW96M'),
    ('NNL02E'),
    ('NOC32R'),
    ('NRB14B'),
    ('NRH13S'),
    ('NUW96S'),
    ('NXL60Z'),
    ('NYH22S'),
    ('OGC45H'),
    ('OHF06E'),
    ('OJB01L'),
    ('ONR61H'),
    ('OOR23U'),
    ('OOY13N'),
    ('ORA76U'),
    ('OZJ07T'),
    ('PBE73E'),
    ('PEB55F'),
    ('PGN43H'),
    ('PHE71K'),
    ('PJB37X'),
    ('PJC61X'),
    ('PKT36C'),
    ('PLB34U'),
    ('PNK35X'),
    ('POR35Z'),
    ('POS54S'),
    ('PTH34Z'),
    ('PUJ72L'),
    ('PUK18C'),
    ('PWB02H'),
    ('PXC72G'),
    ('PXK18L'),
    ('PZJ07R'),
    ('RAU80W'),
    ('RBA27E'),
    ('RBG45F'),
    ('RBM24U'),
    ('RBR14B'),
    ('RBR79K'),
    ('RBX89P'),
    ('RCC35H'),
    ('RCC87U'),
    ('RCJ28Y'),
    ('RCJ49C'),
    ('RCJ59P'),
    ('RCL09B'),
    ('RCM19W'),
    ('RCN14J'),
    ('RCY84B'),
    ('RCY84C'),
    ('RDJ03K'),
    ('REF29D'),
    ('RFR40G'),
    ('RGJ08U'),
    ('RJB43W'),
    ('RJK78P'),
    ('RLA56H'),
    ('RMA73U'),
    ('RSC77G'),
    ('RTJ40W'),
    ('RUK77N'),
    ('RUN46S'),
    ('RWC572'),
    ('RXJ02Y'),
    ('SAM31A'),
    ('SBJ17B'),
    ('SED42F'),
    ('SEH25H'),
    ('SHD78B'),
    ('SJJ88F'),
    ('SOG41U'),
    ('SSF88M'),
    ('STC41P'),
    ('SZT04N'),
    ('TAA04Y'),
    ('TAB81N'),
    ('TAR54B'),
    ('TBX88P'),
    ('TCK78S'),
    ('TCS00M'),
    ('TDB33C'),
    ('TDL79S'),
    ('TDT88N'),
    ('TEP69A'),
    ('TGH16S'),
    ('TGK00W'),
    ('THG00Y'),
    ('TJC23Y'),
    ('TKS52C'),
    ('TLC41A'),
    ('TMF14N'),
    ('TPK79S'),
    ('TPR52C'),
    ('TSM53N'),
    ('TSP156'),
    ('TWB11N'),
    ('TWP88C'),
    ('TXF41W'),
    ('TZD04N'),
    ('UBK26A'),
    ('UBN902'),
    ('UCX91A'),
    ('UEJ18X'),
    ('UHP06J'),
    ('ULP04B'),
    ('UPK09S'),
    ('URB61C'),
    ('URK10F'),
    ('USF16A'),
    ('UWA86C'),
    ('UWB51S'),
    ('WAE96R'),
    ('WBP37E'),
    ('WCA61M'),
    ('WCF95J'),
    ('WCG33U'),
    ('WCL24T'),
    ('WCL36T'),
    ('WCM92P'),
    ('WCM92R'),
    ('WCY13D'),
    ('WDB02S'),
    ('WDC19J'),
    ('WDU85E'),
    ('WFB22T'),
    ('WFJ09T'),
    ('WJA91Z'),
    ('WJZ47R'),
    ('WLB37E'),
    ('WLL21U'),
    ('WRB46Z'),
    ('WRB54J'),
    ('WRJ86P'),
    ('WSG22D'),
    ('WSP05R'),
    ('WXK21E'),
    ('WYF64D'),
    ('XBX48L'),
    ('XEK61K'),
    ('XGP07K'),
    ('XGU96S'),
    ('XJB83X'),
    ('XMG58R'),
    ('XNS96K'),
    ('XPJ06S'),
    ('YAJ15S'),
    ('YAR70X'),
    ('YHJ05L'),
    ('YHY32T'),
    ('YJB77L'),
    ('YKR05K'),
    ('YNK43N'),
    ('YOF69W'),
    ('YOJ08X'),
    ('YSF06N'),
    ('YUK69N'),
    ('YXW02Y'),
    ('ZAW71P'),
    ('ZDE17H'),
    ('ZFL541'),
    ('ZHW02P'),
    ('ZLJ05M'),
    ('ZOH11A'),
    ('ZRB14C'),
    ('ZZK17P')
)
insert into public.wheel_change_season_scope (
  season_key, regnr, scope_status, source_reference, note
)
select
  'WINTER_2026',
  seed.regnr,
  'IN_SCOPE',
  'MASTER 2026-09-12: Augusti population + Nybil Aug/Sep not in Augusti - explicit sold list',
  'Initial controlled WINTER_2026 Hjulskifte scope'
from seed
on conflict (season_key, regnr) do update
set scope_status = excluded.scope_status,
    source_reference = excluded.source_reference,
    note = excluded.note,
    updated_at = now();

-- Fail closed to the explicit scope while a scoped campaign is active.
-- If no active scoped campaign exists, preserve the previous candidate-source behavior.
create or replace function public.get_wheel_change_candidate_source()
returns table (
  regnr text,
  current_wheel_type text,
  latest_checkin_at timestamptz,
  current_city text,
  current_station text,
  current_saludatum date
)
language sql
set search_path to 'pg_catalog'
as $function$
  with active_campaign as (
    select c.season_key
    from public.wheel_change_scope_campaigns c
    where c.status = 'ACTIVE'
      and (pg_catalog.now() at time zone 'Europe/Stockholm')::date between c.valid_from and c.valid_to
    order by c.valid_from desc, c.season_key desc
    limit 1
  ),
  scoped_regnrs as (
    select upper(regexp_replace(s.regnr, '\s+', '', 'g')) as regnr
    from public.wheel_change_season_scope s
    join active_campaign c on c.season_key = s.season_key
    where s.scope_status = 'IN_SCOPE'
  ),
  latest_checkin as (
    select distinct on (upper(regexp_replace(c.regnr, '\s+', '', 'g')))
      upper(regexp_replace(c.regnr, '\s+', '', 'g')) as regnr,
      c.completed_at as verified_at,
      coalesce(nullif(trim(c.current_city), ''), nullif(trim(c.city), '')) as current_city,
      coalesce(nullif(trim(c.current_station), ''), nullif(trim(c.station), '')) as current_station
    from public.checkins c
    where c.regnr is not null
      and length(trim(c.regnr)) > 0
      and c.completed_at is not null
      and c.status = 'COMPLETED'
    order by upper(regexp_replace(c.regnr, '\s+', '', 'g')), c.completed_at desc
  ),
  latest_nybil as (
    select distinct on (upper(regexp_replace(n.regnr, '\s+', '', 'g')))
      upper(regexp_replace(n.regnr, '\s+', '', 'g')) as regnr,
      nullif(trim(n.plats_aktuell_ort), '') as current_city,
      nullif(trim(n.plats_aktuell_station), '') as current_station
    from public.nybil_inventering n
    where n.regnr is not null
      and length(trim(n.regnr)) > 0
    order by upper(regexp_replace(n.regnr, '\s+', '', 'g')), n.created_at desc
  ),
  fallback_regnrs as (
    select regnr from latest_checkin
    union
    select regnr from latest_nybil
  ),
  candidate_regnrs as (
    select regnr from scoped_regnrs
    union
    select f.regnr
    from fallback_regnrs f
    where not exists (select 1 from active_campaign)
  )
  select
    u.regnr,
    f.wheel_type as current_wheel_type,
    c.verified_at as latest_checkin_at,
    coalesce(c.current_city, n.current_city) as current_city,
    coalesce(c.current_station, n.current_station) as current_station,
    s.current_saludatum
  from candidate_regnrs u
  left join lateral public.get_current_wheel_fact(u.regnr) f on true
  left join latest_checkin c on c.regnr = u.regnr
  left join latest_nybil n on n.regnr = u.regnr
  left join public.salu_vehicle_state s
    on upper(regexp_replace(s.regnr, '\s+', '', 'g')) = u.regnr;
$function$;

revoke all on function public.get_wheel_change_candidate_source() from public, anon, authenticated;
grant execute on function public.get_wheel_change_candidate_source() to service_role;

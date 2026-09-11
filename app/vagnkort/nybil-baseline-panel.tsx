'use client';

import type { ReactNode } from 'react';

type NybilBaseline = Record<string, unknown>;

type FieldSpec = {
  key: string;
  label: string;
  format?: 'date' | 'money' | 'count';
};

type GroupSpec = {
  title: string;
  fields: FieldSpec[];
};

const groups: GroupSpec[] = [
  {
    title: 'Fordonsidentitet',
    fields: [
      { key: 'regnr', label: 'Registreringsnummer' },
      { key: 'bilmarke', label: 'Bilmärke' },
      { key: 'bilmarke_annat', label: 'Specificerat bilmärke' },
      { key: 'modell', label: 'Modell' },
      { key: 'vin', label: 'VIN' },
    ],
  },
  {
    title: 'Mottagning och registrering',
    fields: [
      { key: 'registreringsdatum', label: 'Registreringsdatum', format: 'date' },
      { key: 'plats_mottagning_ort', label: 'Mottagningsort' },
      { key: 'plats_mottagning_station', label: 'Mottagningsstation' },
      { key: 'planerad_station', label: 'Planerad station' },
      { key: 'registrerad_av', label: 'Registrerad av' },
      { key: 'fullstandigt_namn', label: 'Fullständigt namn' },
    ],
  },
  {
    title: 'Mätarställning och plats vid Nybil',
    fields: [
      { key: 'matarstallning_inkop', label: 'Mätarställning vid leverans' },
      { key: 'plats_aktuell_ort', label: 'Registrerad aktuell ort' },
      { key: 'plats_aktuell_station', label: 'Registrerad aktuell station' },
      { key: 'matarstallning_aktuell', label: 'Registrerad aktuell mätarställning' },
    ],
  },
  {
    title: 'Hjul',
    fields: [
      { key: 'hjultyp', label: 'Monterade hjul' },
      { key: 'hjul_ej_monterade', label: 'Medföljande / lösa hjul' },
      { key: 'hjul_forvaring_ort', label: 'Hjulförvaring · ort' },
      { key: 'hjul_forvaring', label: 'Hjulförvaring · specifik plats' },
    ],
  },
  {
    title: 'Drivmedel, laddning och växellåda',
    fields: [
      { key: 'bransletyp', label: 'Drivmedel' },
      { key: 'vaxel', label: 'Växellåda' },
      { key: 'tankstatus', label: 'Tankstatus' },
      { key: 'upptankning_liter', label: 'Upptankning · liter' },
      { key: 'upptankning_literpris', label: 'Upptankning · literpris' },
      { key: 'laddniva_procent', label: 'Laddnivå (%)' },
    ],
  },
  {
    title: 'Avtalsvillkor',
    fields: [
      { key: 'serviceintervall', label: 'Serviceintervall km' },
      { key: 'max_km_manad', label: 'Max km / månad' },
      { key: 'avgift_over_km', label: 'Avgift över-km' },
      { key: 'daily_rate', label: 'Dygnspris från Garage-underlag' },
      { key: 'holding_period_months', label: 'Innehavsperiod månader' },
    ],
  },
  {
    title: 'Nycklar och laddkablar',
    fields: [
      { key: 'antal_nycklar', label: 'Antal nycklar' },
      { key: 'extranyckel_forvaring_ort', label: 'Extranyckel · förvaringsort' },
      { key: 'extranyckel_forvaring_spec', label: 'Extranyckel · specifik förvaring' },
      { key: 'antal_laddkablar', label: 'Antal laddkablar' },
      { key: 'laddkablar_forvaring_ort', label: 'Laddkablar · förvaringsort' },
      { key: 'laddkablar_forvaring_spec', label: 'Laddkablar · specifik förvaring' },
    ],
  },
  {
    title: 'Utrustning och dokument',
    fields: [
      { key: 'antal_insynsskydd', label: 'Antal insynsskydd' },
      { key: 'instruktionsbok', label: 'Instruktionsbok' },
      { key: 'instruktionsbok_forvaring_ort', label: 'Instruktionsbok · förvaringsort' },
      { key: 'instruktionsbok_forvaring_spec', label: 'Instruktionsbok · specifik förvaring' },
      { key: 'coc', label: 'COC' },
      { key: 'coc_forvaring_ort', label: 'COC · förvaringsort' },
      { key: 'coc_forvaring_spec', label: 'COC · specifik förvaring' },
      { key: 'lasbultar_med', label: 'Låsbultar' },
      { key: 'dragkrok', label: 'Dragkrok' },
      { key: 'gummimattor', label: 'Gummimattor' },
      { key: 'dackkompressor', label: 'Däckkompressor' },
    ],
  },
  {
    title: 'Stöld-GPS och uppkoppling',
    fields: [
      { key: 'stold_gps', label: 'Stöld-GPS monterad' },
      { key: 'stold_gps_spec', label: 'Stöld-GPS · specifikation' },
      { key: 'mbme_aktiverad', label: 'MB.me aktiverad' },
      { key: 'vw_connect_aktiverad', label: 'VW Connect aktiverad' },
    ],
  },
  {
    title: 'SALU- och returuppgifter registrerade i Nybil',
    fields: [
      { key: 'saludatum', label: 'Saludatum', format: 'date' },
      { key: 'salu_station', label: 'Salu-station' },
      { key: 'kopare_foretag', label: 'Köpare företag' },
      { key: 'returort', label: 'Returort' },
      { key: 'returadress', label: 'Returadress' },
      { key: 'attention', label: 'Attention' },
      { key: 'notering_forsaljning', label: 'Notering fordonsförsäljning' },
    ],
  },
  {
    title: 'Uthyrningsklar och kommentarer',
    fields: [
      { key: 'klar_for_uthyrning', label: 'Klar för uthyrning' },
      { key: 'klar_for_uthyrning_notering', label: 'Anledning / notering' },
      { key: 'har_skador_vid_leverans', label: 'Skador vid leverans' },
      { key: 'anteckningar', label: 'Kommentarer / anteckningar' },
    ],
  },
  {
    title: 'Planeringsunderlag som följde med från Garaget',
    fields: [
      { key: 'planning_period', label: 'Planeringsperiod' },
      { key: 'planning_reason', label: 'Planeringsorsak' },
      { key: 'supplier', label: 'Leverantör' },
      { key: 'order_reference', label: 'Orderreferens' },
      { key: 'source_regnr', label: 'Källans registreringsnummer' },
      { key: 'saluort', label: 'Saluort' },
      { key: 'ordered_at', label: 'Beställd', format: 'date' },
      { key: 'calloff_at', label: 'Avropad', format: 'date' },
      { key: 'confirmation_status', label: 'Bekräftelsestatus' },
      { key: 'transport_status', label: 'Transportstatus' },
      { key: 'planned_delivery_date', label: 'Planerat leveransdatum', format: 'date' },
      { key: 'planning_note', label: 'Planeringsnotering' },
    ],
  },
  {
    title: 'Referensevidens',
    fields: [
      { key: 'photo_urls', label: 'Nybil-referensbilder', format: 'count' },
      { key: 'video_urls', label: 'Nybil-referensfilmer', format: 'count' },
    ],
  },
];

function formatDate(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return 'Saknas / ej registrerat';
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('sv-SE');
}

function present(value: unknown, format?: FieldSpec['format']): ReactNode {
  if (value === null || value === undefined || value === '') return 'Saknas / ej registrerat';
  if (format === 'date') return formatDate(value);
  if (format === 'count') return Array.isArray(value) ? `${value.length} st` : 'Saknas / ej registrerat';
  if (typeof value === 'boolean') return value ? 'Ja' : 'Nej';
  return String(value);
}

export default function NybilBaselinePanel({ baseline }: { baseline: NybilBaseline | null }) {
  if (!baseline) {
    return (
      <section style={{ background: 'rgba(255,255,255,0.96)', borderRadius: 14, padding: '1rem 1.1rem', boxShadow: '0 8px 30px rgba(0,0,0,0.08)' }}>
        <h2 style={{ marginTop: 0 }}>NYBIL – REGISTRERAT VID MOTTAGNING</h2>
        <p>Nybil-original saknas för bilen.</p>
      </section>
    );
  }

  return (
    <section style={{ background: 'rgba(255,255,255,0.96)', borderRadius: 14, padding: '1rem 1.1rem', boxShadow: '0 8px 30px rgba(0,0,0,0.08)' }}>
      <h2 style={{ marginTop: 0 }}>NYBIL – REGISTRERAT VID MOTTAGNING</h2>
      <p style={{ color: '#555', marginTop: '-.35rem' }}>
        Source-owned original från Nybil. Senare verifierade förändringar visas separat och skriver inte om denna registrering.
      </p>
      <div style={{ display: 'grid', gap: '1rem' }}>
        {groups.map((group) => (
          <div key={group.title}>
            <h3 style={{ margin: '0 0 .35rem', fontSize: 15 }}>{group.title}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '.35rem .8rem' }}>
              {group.fields.map((field) => (
                <div key={field.key} style={{ borderTop: '1px solid #eee', padding: '.45rem 0' }}>
                  <div style={{ fontSize: 12, color: '#666' }}>{field.label}</div>
                  <strong>{present(baseline[field.key], field.format)}</strong>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

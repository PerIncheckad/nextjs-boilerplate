'use client';

import React, { useMemo, useState, ChangeEvent, FormEvent } from 'react';

/* =========================================================
   Typer
   ========================================================= */
type RegNr = string;

type DamageEntry = {
  id: string;
  plats: string;
  typ: string;
  beskrivning?: string;
};

type CarRecord = {
  regnr: RegNr;
  model: string;          // normaliserat fältnamn
  wheelStorage: string;   // normaliserat fältnamn
  skador: DamageEntry[];
};

/* =========================================================
   Normalisering av reg.nr (robust mot mellanslag, bindestreck, zero-width)
   ========================================================= */
function normalizeReg(input: string): string {
  return (input ?? '')
    .toUpperCase()
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // zero-width
    .replace(/[\s\-_.]/g, '')              // mellanslag, -, _, .
    .trim();
}

/* =========================================================
   Hjälpfunktion: mappa inkommande källdata → CarRecord
   (stödjer flera fältnamn så att modell/hjulförvaring alltid hittas)
   ========================================================= */
function asCarRecord(raw: any): CarRecord | null {
  if (!raw) return null;

  // Reg.nr kan heta många saker…
  const reg =
    raw.regnr ?? raw.reg ?? raw.registration ?? raw.registrationNumber ??
    raw.license ?? raw.licensePlate ?? raw.plate ?? raw.regNo ?? raw.reg_no;

  if (!reg || typeof reg !== 'string') return null;

  // Modell: stöd för vanligt förekommande varianter
  const model =
    raw.model ?? raw.modell ?? raw.bilmodell ?? raw.vehicleModel ?? raw.vehicle_model ?? '';

  // Hjulförvaring: stöd för svenska/engelska stavningar + utan/med diakritik
  const wheelStorage =
    raw.wheelStorage ?? raw.tyreStorage ?? raw.tireStorage ??
    raw['hjulförvaring'] ?? raw.hjulforvaring ?? raw.hjulforvaring_plats ??
    raw['däckhotell'] ?? raw.dackhotell ?? raw.wheels_location ?? '';

  // Skador (array) med defensiv mappning
  const damagesArr: any[] =
    raw.skador ?? raw.damages ?? raw.damageList ?? raw.existingDamages ?? [];

  const skador: DamageEntry[] = Array.isArray(damagesArr)
    ? damagesArr.map((d: any, i: number) => ({
        id: String(d?.id ?? `d${i + 1}`),
        plats: String(d?.plats ?? d?.place ?? d?.position ?? 'Okänd plats'),
        typ: String(d?.typ ?? d?.type ?? 'Skada'),
        beskrivning: d?.beskrivning ?? d?.desc ?? d?.description ?? undefined,
      }))
    : [];

  return {
    regnr: String(reg),
    model: String(model ?? ''),
    wheelStorage: String(wheelStorage ?? ''),
    skador,
  };
}

/* =========================================================
   Exempeldata (ersätt med din riktiga lista)
   ========================================================= */
const RAW_CARS: any[] = [
  {
    regnr: 'DGF14H',
    modell: 'Volvo V60 B4',
    hjulförvaring: 'På anläggning – Malmö',
    skador: [
      { id: 'k1', plats: 'Höger framfångare', typ: 'Repa', beskrivning: 'Ytlig repa ca 3 cm' },
      { id: 'k2', plats: 'Motorhuv', typ: 'Lackskada', beskrivning: 'Litet stenskott' },
    ],
  },
  {
    regnr: 'ABC123',
    model: 'Mercedes Sprinter 316 CDI',
    tyreStorage: 'Däckhotell – Hedins Ford Halmstad',
    damages: [
      { id: 'd1', place: 'Höger framfångare', type: 'Repa', description: 'Klarlackrepa ca 5 cm' },
      { id: 'd2', place: 'Baklucka', type: 'Buckla', description: 'Liten buckla ovanför skylten' },
    ],
  },
  {
    regnr: 'MAB111',
    model: 'Mercedes AMG C43',
    wheelStorage: 'Kund (återlämnas Q4)',
    skador: [{ id: 'd3', plats: 'Vänster bakdörr', typ: 'Repa' }],
  },
];

/* =========================================================
   Indexera bilar (normaliserad nyckel)
   ========================================================= */
function buildCarIndex(rawList: any[]): Record<string, CarRecord> {
  const map: Record<string, CarRecord> = {};
  for (const item of rawList ?? []) {
    const rec = asCarRecord(item);
    if (!rec) continue;
    map[normalizeReg(rec.regnr)] = rec;
  }
  return map;
}

/* =========================================================
   Komponent
   ========================================================= */
export default function CarCheckinForm({
  cars,
  showDebug = true,
}: {
  cars?: any[];         // om du vill skicka in din lista som prop
  showDebug?: boolean;  // sätt false om du inte vill se Diagnostik
}) {
  // Använd inkommande lista om angiven, annars exemplet
  const CAR_MAP = useMemo(
    () => buildCarIndex(cars ?? RAW_CARS),
    [cars]
  );

  const knownNormKeys = useMemo(() => Object.keys(CAR_MAP).sort(), [CAR_MAP]);

  const [regInput, setRegInput] = useState('');
  const [car, setCar] = useState<CarRecord | null>(null);
  const [tried, setTried] = useState(false); // vi visar fel först efter försök

  function lookup(value: string): CarRecord | null {
    return CAR_MAP[normalizeReg(value)] ?? null;
  }

  function onChangeReg(e: ChangeEvent<HTMLInputElement>) {
    setRegInput(e.target.value);
    setTried(false);
    setCar(null);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const found = lookup(regInput);
    setCar(found ?? null);
    setTried(true);
  }

  function onSelectKnown(e: ChangeEvent<HTMLSelectElement>) {
    const raw = e.target.value;
    setRegInput(raw);
    const found = lookup(raw);
    setCar(found ?? null);
    setTried(true);
  }

  const showError = tried && !car && regInput.trim().length > 0;

  return (
    <div style={{ maxWidth: 880, margin: '0 auto' }}>
      <h1>Ny incheckning</h1>
      <p>Inloggad: <strong>Bob</stro

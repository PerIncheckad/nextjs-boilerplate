'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchDamageCard, normalizeReg } from '@/lib/damages';
import { notifyCheckin } from '@/lib/notify';


const ORT_TILL_REGION: Record<string, 'NORR' | 'MITT' | 'SYD'> = {
  Varberg: 'NORR',
  Falkenberg: 'NORR',
  Halmstad: 'NORR',
  Helsingborg: 'MITT',
  Ängelholm: 'MITT',
  Lund: 'SYD',
  Sturup: 'SYD',
  Malmö: 'SYD',
  Trelleborg: 'SYD',
};
// --- Region-hubbar + testmottagare ---
const REGION_HUB: Record<'NORR'|'MITT'|'SYD', string> = {
  NORR: 'Halmstad',
  MITT: 'Helsingborg',
  SYD: 'Malmö',
};

// OBS: vi kör test tills vidare → allt går hit
const TEST_MAIL = process.env.NEXT_PUBLIC_TEST_MAIL || 'per.andersson@mabi.se';

// Valfritt: separat testadress för bilkontroll (annars samma som TEST_MAIL)
const BILKONTROLL_MAIL =
  process.env.NEXT_PUBLIC_BILKONTROLL_MAIL || TEST_MAIL;

// Returnerar alltid testmottagare i nuläget
function recipientsFor(region: 'NORR'|'MITT'|'SYD', target: 'station'|'quality') {
  return [ target === 'quality' ? BILKONTROLL_MAIL : TEST_MAIL ];
}



type CarData = {
  regnr: string;
  brand_model: string | null;
  damage_text: string | null;
  damage_location: string | null;
  damage_notes: string | null;
  wheelstorage: string | null;
  saludatum: string | null;
};

type ExistingDamage = {
  id: string;
  skadetyp: string;
  plats: string;
  notering: string;
  fullText: string;
  shortText: string;
  status: 'not_selected' | 'documented' | 'fixed';
  userType?: string;
  userCarPart?: string;
  userPosition?: string;
  userDescription?: string;
  media?: MediaFile[];
};

type MediaFile = {
  file: File;
  type: 'image' | 'video';
  preview?: string;
  thumbnail?: string;
};
// --- Media helpers (photo required, video optional for existing; both for new) ---
const hasPhoto = (files?: MediaFile[]) =>
  Array.isArray(files) && files.some(f => f && f.type === 'image');

const hasVideo = (files?: MediaFile[]) =>
  Array.isArray(files) && files.some(f => f && f.type === 'video');

// KORRIGERADE stationer från "Stationer o Depåer Albarone" (exakta namn)
const ORTER = ['Malmö Jägersro', 'Helsingborg', 'Ängelholm', 'Halmstad', 'Falkenberg', 'Trelleborg', 'Varberg', 'Lund'];

const STATIONER: Record<string, string[]> = {
  'Malmö Jägersro': [
    'Ford Malmö',
    'Mechanum',
    'Malmö Automera',
    'Mercedes Malmö',
    'Werksta St Bernstorp',
    'Werksta Malmö Hamn',
    'Hedbergs Malmö',
    'Hedin Automotive Burlöv',
    'Sturup'  // Inte "LÅNGTID"
  ],
  'Helsingborg': [
    'HBSC Helsingborg',
    'Ford Helsingborg',
    'Transport Helsingborg',
    'S. Jönsson',
    'BMW Helsingborg',
    'KIA Helsingborg',
    'Euromaster Helsingborg',
    'B/S Klippan',
    'B/S Munka-Ljungby',
    'B/S Helsingborg',
    'Werksta Helsingborg',
    'Båstad'
  ],
  'Lund': [
    'Ford Lund',
    'Hedin Lund',
    'B/S Lund',
    'P7 Revinge'
  ],
  'Ängelholm': [
    'FORD Ängelholm',
    'Mekonomen Ängelholm',
    'Flyget Ängelholm'
  ],
  'Falkenberg': [
    'Falkenberg'
  ],
  'Halmstad': [
    'Flyget Halmstad',
    'KIA Halmstad',  // Inte "Hedin Automotive KIA"
    'FORD Halmstad'
  ],
  'Trelleborg': [
    'Trelleborg'
  ],
  'Varberg': [
    'Ford Varberg',
    'Hedin Automotive Varberg',
    'Sällstorp lack plåt',
    'Finnveden plåt'
  ]
};

const DAMAGE_TYPES = [
  'Buckla', 'Däckskada', 'Däckskada sommarhjul', 'Däckskada vinterhjul', 'Fälgskada sommarhjul',
  'Fälgskada vinterhjul', 'Feltankning', 'Höjdledsskada', 'Intryck', 'Invändig skada',
  'Jack', 'Krockskada', 'Krossad ruta', 'Oaktsamhet', 'Punktering', 'Repa', 'Repor',
  'Saknas', 'Skrapad', 'Skrapad fälg', 'Spricka', 'Stenskott', 'Trasig', 'Övrigt'
].sort();

const CAR_PARTS: Record<string, string[]> = {
  'Annan del': [],
  'Bagagelucka': ['Insida', 'Utsida'],
  'Däck': ['Höger bak', 'Höger fram', 'Vänster bak', 'Vänster fram'],
  'Dörr insida': ['Höger bak', 'Höger fram', 'Vänster bak', 'Vänster fram'],
  'Dörr utsida': ['Höger bak', 'Höger fram', 'Vänster bak', 'Vänster fram'],
  'Front läpp': ['Höger', 'Mitten', 'Vänster'],
  'Fälg': ['Höger bak', 'Höger fram', 'Vänster bak', 'Vänster fram'],
  'Glas': ['Bak', 'Fram', 'Höger bak', 'Höger fram', 'Vänster bak', 'Vänster fram'],
  'Grill': [],
  'Motorhuv': ['Utsida'],
  'Skärm': ['Höger bak', 'Höger fram', 'Vänster bak', 'Vänster fram'],
  'Stötfångare fram': ['Bak', 'Fram', 'Höger bak', 'Höger fram', 'Vänster bak', 'Vänster fram'],
  'Tak': [],
  'Tröskel': ['Höger', 'Vänster'],
  'Yttre backspegel': ['Höger', 'Vänster']
};

const getRelevantCarParts = (damageType: string): string[] => {
  const lowerType = damageType.toLowerCase();
  if (lowerType.includes('däckskada')) return ['Däck'];
  if (lowerType.includes('fälgskada')) return ['Fälg'];
  if (lowerType.includes('punktering')) return ['Däck'];
  if (lowerType.includes('ruta') || lowerType.includes('stenskott')) {
    return ['Glas', 'Motorhuv', 'Tak'].sort();
  }
  if (lowerType.includes('krock')) {
    return ['Stötfångare fram', 'Skärm', 'Dörr utsida', 'Bagagelucka', 'Motorhuv'].sort();
  }
  if (lowerType.includes('höjdled')) {
    return ['Tak', 'Motorhuv', 'Bagagelucka'].sort();
  }
  return Object.keys(CAR_PARTS).sort();
};

const CAR_PART_OPTIONS = Object.keys(CAR_PARTS).sort();



const isDateWithinDays = (dateStr: string | null, days: number): boolean => {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  const today = new Date();
  const diffTime = date.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays <= days && diffDays >= 0;
};

const getFileType = (file: File): 'image' | 'video' => {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  return 'image';
};

const createVideoThumbnail = (file: File): Promise<string> => {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;

    video.addEventListener('loadedmetadata', () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      video.currentTime = 0.5;
    });

    video.addEventListener('seeked', () => {
      ctx.drawImage(video, 0, 0);
      const thumbnail = canvas.toDataURL('image/jpeg', 0.8);
      resolve(thumbnail);
    });

    video.addEventListener('error', () => {
      resolve('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyMCIgdmlld0JveD0iMCAwIDEyMCAxMjAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjEyMCIgaGVpZ2h0PSIxMjAiIGZpbGw9IiM2YjcyODAiLz48cGF0aCBkPSJNNDUgNDBWODBMNzUgNjBMNDUgNDBaIiBmaWxsPSJ3aGl0ZSIvPjwvc3ZnPg==');
    });

    video.src = URL.createObjectURL(file);
  });
};

const processFiles = async (files: File[]): Promise<MediaFile[]> => {
  const mediaFiles: MediaFile[] = [];
  for (const file of files) {
    const type = getFileType(file);
    const mediaFile: MediaFile = { file, type };
    if (type === 'image') {
      mediaFile.preview = URL.createObjectURL(file);
    } else if (type === 'video') {
      try {
        mediaFile.thumbnail = await createVideoThumbnail(file);
      } catch (error) {
        console.warn('Could not create video thumbnail:', error);
      }
    }
    mediaFiles.push(mediaFile);
  }
  return mediaFiles;
};

// KORRIGERAD kolumnmappning för att läsa H, K, M korrekt
const createCombinedDamageText = (skadetyp: string, plats: string, notering: string): string => {
  const parts = [];
  
  if (skadetyp?.trim()) {
    parts.push(skadetyp.trim());
  }
  
  if (plats?.trim() && plats.trim() !== skadetyp?.trim()) {
    parts.push(plats.trim());
  }
  
  if (notering?.trim()) {
    parts.push(`(${notering.trim()})`);
  }
  
  return parts.length > 0 ? parts.join(' - ') : 'Okänd skada';
};

// FÖRBÄTTRAD kolumnhantering för svenska tecken
const getColumnValue = (row: any, primaryKey: string, alternativeKeys: string[] = []): string | null => {
  // Prova huvudnyckeln först
  if (row[primaryKey] !== undefined && row[primaryKey] !== null && row[primaryKey] !== '') {
    return String(row[primaryKey]).trim();
  }
  
  // Prova alternativa nycklar
  for (const altKey of alternativeKeys) {
    if (row[altKey] !== undefined && row[altKey] !== null && row[altKey] !== '') {
      return String(row[altKey]).trim();
    }
  }
  
  return null;
};
type CheckInFormProps = { showTestButtons?: boolean };
export default function CheckInForm({ showTestButtons = false }: CheckInFormProps) {
    // --- Inloggat förnamn baserat på e-post "fornamn.efternamn@mabi.se" ---
const [firstName, setFirstName] = useState('');

useEffect(() => {
  (async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const email = user?.email || '';
      const raw = (email.split('@')[0] || '').split('.')[0] || '';
      const name = raw ? raw[0].toUpperCase() + raw.slice(1).toLowerCase() : 'du';
      setFirstName(name);
    } catch {
      setFirstName('du');
    }
  })();
}, []);
 // === Damage card state ===
const [viewWheelStorage, setViewWheelStorage] = useState<string>('---');
const [viewSaludatum, setViewSaludatum] = useState<string | null>(null);
const [damages, setDamages] = useState<string[]>([]);
const [loadingDamage, setLoadingDamage] = useState(false);


// Hämta från vyn (tar värdet från input direkt – vi behöver inte känna till din egen regnr-state)
async function lookupDamages(regInput: string) {
  const plate = normalizeReg(regInput || '');

  // slå BARA när plåten är komplett (6 tecken)
  if (plate.length !== 6) return;

  setLoadingDamage(true);
  try {
    const view = await fetchDamageCard(plate); // läser ALLA rader och flätar ihop

    const skador = view?.skador ?? [];
    setDamages(skador);
    setViewSaludatum(view?.saludatum ?? null);

    // tillfällig verifiering — ta bort när klart
    console.log('DMG', {
      plate,
      isArray: Array.isArray(skador),
      count: skador.length,
      skador,
    });
  } catch (err) {
    console.error('lookupDamages error:', err);
    setDamages([]);
    setViewSaludatum(null);
  } finally {
    setLoadingDamage(false);
  }
}



 // State för registreringsnummer och bildata
  const [regInput, setRegInput] = useState('');
  useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const reg = params.get('reg');
  if (reg) setRegInput(reg.toUpperCase());
}, []);

  const [carData, setCarData] = useState<CarData[]>([]);
  const [allRegistrations, setAllRegistrations] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  // State för bekräftelsedialoger
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [damageToFix, setDamageToFix] = useState<string | null>(null);
  const [showFinalConfirmation, setShowFinalConfirmation] = useState(false);
  const [showFieldErrors, setShowFieldErrors] = useState(false);

  // Formulärfält
  const [ort, setOrt] = useState('');
  const [station, setStation] = useState('');
  const [annanPlats, setAnnanPlats] = useState(false);
  const [annanPlatsText, setAnnanPlatsText] = useState('');
  const [sendState, setSendState] = useState<'idle'|'sending-station'|'sending-quality'|'ok'|'fail'>('idle');
const [sendMsg, setSendMsg] = useState<string>('');
const [carModel, setCarModel] = useState<string>('');
// Fallback: sätt bilmodell från carData om saknas
useEffect(() => {
  if (!carModel && carData?.length) {
    setCarModel((carData[0]?.brand_model || '').trim());
  }
}, [carModel, carData]);


  
  const [matarstallning, setMatarstallning] = useState('');
  const [drivmedelstyp, setDrivmedelstyp] = useState<'bensin_diesel' | 'elbil' | null>(null);
  
  // För bensin/diesel
  const [tankniva, setTankniva] = useState<'fulltankad' | 'tankas_senare' | 'pafylld_nu' | null>(null);
  const [liters, setLiters] = useState('');
  const [bransletyp, setBransletyp] = useState<'Bensin' | 'Diesel' | null>(null);
  const [literpris, setLiterpris] = useState('');
  
  // För elbil
  const [laddniva, setLaddniva] = useState('');

  // Övriga fält
  const [spolarvatska, setSpolarvatska] = useState<boolean | null>(null);
  const [insynsskydd, setInsynsskydd] = useState<boolean | null>(null);
  const [antalLaddkablar, setAntalLaddkablar] = useState<'0' | '1' | '2' | null>(null);
  const [hjultyp, setHjultyp] = useState<'Sommarthjul' | 'Vinterhjul' | null>(null);
  const [adblue, setAdblue] = useState<boolean | null>(null);
  const [tvatt, setTvatt] = useState<'behover_tvattas' | 'behover_grovtvattas' | 'behover_inte_tvattas' | null>(null);
  const [inre, setInre] = useState<'behover_rengoras_inuti' | 'ren_inuti' | null>(null);

  // Skador
  const [existingDamages, setExistingDamages] = useState<ExistingDamage[]>([]);
  const [skadekontroll, setSkadekontroll] = useState<'ej_skadekontrollerad' | 'nya_skador' | 'inga_nya_skador' | null>(null);
  const [newDamages, setNewDamages] = useState<{
    id: string;
    type: string;
    carPart: string;
    position: string;
    text: string;
    media: MediaFile[]
  }[]>([]);

  const [uthyrningsstatus, setUthyrningsstatus] = useState<'redo_for_uthyrning' | 'ledig_tankad' | 'ledig_otankad' | 'klar_otankad' | null>(null);
  const [preliminarAvslutNotering, setPreliminarAvslutNotering] = useState('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const normalizedReg = useMemo(() => normalizeReg(regInput), [regInput]);

// Hämtar från BÅDA tabellerna för autocomplete — via VYN + car_data
useEffect(() => {
  async function fetchAllRegistrations() {
    try {
      const [viewResult, carResult] = await Promise.all([
        supabase.from('mabi_damage_view').select('regnr').order('regnr'),
        supabase.from('car_data').select('regnr').order('regnr'),
      ]);

      const allRegs = new Set<string>();

      if (!viewResult.error && viewResult.data) {
        viewResult.data.forEach((item: any) => {
          if (item.regnr) allRegs.add(String(item.regnr).toUpperCase());
        });
      }

      if (!carResult.error && carResult.data) {
        carResult.data.forEach((item: any) => {
          if (item.regnr) allRegs.add(String(item.regnr).toUpperCase());
        });
      }

      setAllRegistrations(Array.from(allRegs).sort());
    } catch (err) {
      console.warn('Could not fetch registrations for autocomplete:', err);
    }
  }

  fetchAllRegistrations();
}, []);

  // Autocomplete från 2 tecken
  const suggestions = useMemo(() => {
    if (!regInput.trim() || regInput.trim().length < 2) return [];
    const input = regInput.toUpperCase();
    return allRegistrations
      .filter(reg => reg.includes(input))
      .slice(0, 5);
  }, [regInput, allRegistrations]);

  // KORRIGERAD skadehantering - läser H, K, M och skapar EN skada per RAD
  useEffect(() => {
    if (!normalizedReg || normalizedReg.length < 3) {
      setCarData([]);
      setExistingDamages([]);
      setNotFound(false);
      return;
    }

    let cancelled = false;

    async function fetchCarData() {
      setLoading(true);
      setNotFound(false);

      try {
const [mabiResult, carResult] = await Promise.all([
  // Läs endast från VYN (kolumner som faktiskt finns)
  supabase
    .from('mabi_damage_view')
.select('*')
  .eq('regnr', normalizedReg),
  supabase
    .from('car_data')
    .select('*')
    .eq('regnr', normalizedReg)
    .order('created_at', { ascending: false }),
]);

        if (cancelled) return;

        let useData: CarData[] = [];
        let damages: ExistingDamage[] = [];

        if (!mabiResult.error && mabiResult.data && mabiResult.data.length > 0) {
// Läs rad ur vyn (kan vara array eller single) och sätt kortet
const viewRow: any = !mabiResult.error
  ? (Array.isArray(mabiResult.data) ? mabiResult.data[0] : mabiResult.data)
  : null;
console.log('DEBUG viewRow keys:', Object.keys(viewRow || {}));

// 1) Försök få modell från vyn
const brandFromView = getColumnValue(viewRow, 'Modell', [
  'brand_model',
  'Bilmodell',
  'Märke/Modell',
  'modell',
  'Model',
]);

// 2) Fallback: hämta modell från car_data (senaste posten)
const brandFromCar =
  (Array.isArray(carResult.data) && carResult.data[0])
    ? (carResult.data[0].brand_model ?? null)
    : null;

// 3) Välj det som finns och trimma
const brandModel = (brandFromView ?? brandFromCar ?? '').toString().trim();

// 4) In i state
setCarModel(brandModel);
// Läs befintliga skador från vyn och bygg lista
const skadorRaw  = getColumnValue(viewRow, 'skador', ['Skador']);
const skadorLista = Array.isArray(skadorRaw)
  ? skadorRaw
  : (skadorRaw ?? '')
      .split(/[,\;\n]+/)
      .map(s => s.trim())
      .filter(Boolean);
console.log('DEBUG skadorRaw:', skadorRaw);

// 5) Fyll den lokala variabeln 'damages' (används senare)
damages = skadorLista.map((name, i) => ({
  id: `mabi-${i}`,
  skadetyp: name,
  plats: '',
  notering: '',
  fullText: name,
}));

// 6) Lägg in i state
setExistingDamages(damages.length ? damages : []);





useData = [{
  regnr: normalizedReg,
brand_model: brandModel,
  damage_text: null,
  damage_location: null,
  damage_notes: null,
  wheelstorage: getColumnValue(viewRow, 'wheelstorage', ['Hjulförvaring']),
saludatum: (() => {
  const raw =
    getColumnValue(viewRow, 'skadedatum', ['Skadedatum', 'Skadedatu']) ??
    getColumnValue(viewRow, 'saludatum', ['Salu datum', 'Saludatum']);

  if (!raw) return null;

  const s = String(raw).trim();

  // YYYY-MM-DD, YYYY/MM/DD eller YYYY.MM.DD
  const ymd = s.match(/^(\d{4})[-/.](\d{2})[-/.](\d{2})$/);
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;

  // DD-MM-YYYY, DD/MM/YYYY eller DD.MM.YYYY
  const dmy = s.match(/^(\d{2})[-/.](\d{2})[-/.](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;

  return s;
})(),
}];

// Normalisera och sätt skador direkt från vyn
let dmgArr: string[] = [];
const rawSk = viewRow?.skador ?? null;
if (Array.isArray(rawSk)) {
  dmgArr = rawSk.map((s: any) => String(s).trim()).filter(Boolean);
} else if (typeof rawSk === 'string' && rawSk.trim() !== '') {
  dmgArr = rawSk
    .replace(/[{}\[\]]/g, '')
    .split(',')
    .map((s: string) => s.trim())
    .filter(Boolean);
}

// Uppdatera UI-state från vyn
setViewSaludatum(useData[0].saludatum ?? null);
setDamages(dmgArr);
          // Skapa placeholder-poster för "Befintliga skador"-listan från vyns skador
if (Array.isArray(dmgArr) && dmgArr.length > 0) {
  const placeholders: ExistingDamage[] = dmgArr.map((text, idx) => ({
    id: `view-${normalizedReg}-${idx}`,
    skadetyp: '',         // fylls i vid dokumentation
    plats: '',            // fylls i vid dokumentation
    notering: '',         // fylls i vid dokumentation
    fullText: text,
    shortText: text,
    status: 'not_selected',
    media: [],            // foto läggs till vid dokumentation
  }));

  setExistingDamages(placeholders);
}

console.log('DMG via fetchCarData', { plate: normalizedReg, count: dmgArr.length, dmgArr });


          // KORRIGERAT: Skapa EN skada per RAD - läser H, K, M korrekt
const parsedDamages = mabiResult.data.map((row, index) => {
            // Kolumn H: Skadetyp
            const skadetyp = getColumnValue(row, 'Skadetyp', ['damage_type', 'damage_text']) || '';
            // Kolumn K: Skadeanmälan 
            const plats = getColumnValue(row, 'Skadeanmälan', ['damage_location', 'plats']) || '';
            // Kolumn M: Intern notering
            const notering = getColumnValue(row, 'Intern notering', ['internal_notes', 'damage_notes', 'notering']) || '';
            
            // Hoppa över rader utan skadeinformation
            if (!skadetyp && !plats && !notering) return null;
            
            const fullText = createCombinedDamageText(skadetyp, plats, notering);
            
            return {
              id: `mabi-${index}`,
              skadetyp,
              plats,
              notering,
              fullText,
              shortText: skadetyp || plats || 'Okänd skada',
              status: 'not_selected' as const,
              userType: '',
              userCarPart: '',
              userPosition: '',
              userDescription: '',
              media: []
            };
          }).filter((damage): damage is ExistingDamage => damage !== null);

        } else if (!carResult.error && carResult.data && carResult.data.length > 0) {
          const validData = carResult.data.filter(row => row.wheelstorage !== null && row.saludatum !== null);
          useData = validData.length > 0 ? validData : carResult.data;

          damages = useData
            .map((item, index) => {
              if (!item.damage_text) return null;

              const shortText = item.damage_text;
              const detailText = item.damage_detail || null;
              const fullText = detailText ? `${shortText} - ${detailText}` : shortText;

              return {
                id: `existing-${index}`,
                skadetyp: shortText,
                plats: detailText || '',
                notering: '',
                fullText,
                shortText,
                status: 'not_selected',
                userType: '',
                userCarPart: '',
                userPosition: '',
                userDescription: '',
                media: []
              };
            })
            .filter((damage): damage is ExistingDamage => damage !== null);
        }

        if (useData.length > 0) {
          setCarData(useData);
setExistingDamages(prev => (damages.length > 0 ? damages : prev));
          setNotFound(false);
        } else {
          setCarData([]);
          setExistingDamages([]);
          setNotFound(true);
        }

      } catch (err) {
        if (!cancelled) {
          console.error('Fetch error:', err);
          setNotFound(true);
          setCarData([]);
          setExistingDamages([]);
        }
      }

      if (!cancelled) setLoading(false);
    }

    const timeout = setTimeout(fetchCarData, 300);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [normalizedReg]);

const carModelRaw = carData[0]?.brand_model || null;
const carWheelStorage = carData[0]?.wheelstorage || null;
const carSaludatum    = carData[0]?.saludatum   || null;
  const availableStations = ort ? STATIONER[ort] || [] : [];
const wheelStorage = viewWheelStorage ?? carWheelStorage ?? '---';
const saludatum    = viewSaludatum    ?? carSaludatum    ?? null;

  // KORRIGERAD validering - mer noggrann kontroll
  const isRegComplete = () => regInput.trim().length > 0;
  const isLocationComplete = () => annanPlats ? annanPlatsText.trim().length > 0 : (ort && station);
  const isVehicleStatusComplete = () => {
    if (!matarstallning.trim() || !drivmedelstyp) return false;

    if (drivmedelstyp === 'bensin_diesel') {
      if (!tankniva || adblue === null || spolarvatska === null) return false;
      if (tankniva === 'pafylld_nu' && (!liters.trim() || !bransletyp || !literpris.trim())) return false;
    }

    if (drivmedelstyp === 'elbil') {
      if (!laddniva.trim() || antalLaddkablar === null || spolarvatska === null) return false;
      const laddnivaParsed = parseInt(laddniva);
      if (isNaN(laddnivaParsed) || laddnivaParsed < 0 || laddnivaParsed > 100) return false;
    }

    return insynsskydd !== null && hjultyp !== null;
  };

  const isCleaningComplete = () => tvatt !== null && inre !== null;
  
  const isDamagesComplete = () => {
    if (!skadekontroll) return false;

    if (skadekontroll === 'nya_skador') {
      if (newDamages.length === 0) return false;
      // Kontrollera att alla nya skador har obligatoriska fält
      if (newDamages.some(damage => !damage.type || !damage.carPart || !damage.text.trim())) return false;
      if (newDamages.some(damage => damage.carPart && CAR_PARTS[damage.carPart].length > 0 && !damage.position)) return false;
      if (newDamages.some(damage => !damage.media.some(m => m.type === 'image') || !damage.media.some(m => m.type === 'video'))) return false;
    }

    // Kontrollera dokumenterade gamla skador
    const documentedOldDamages = existingDamages.filter(d => d.status === 'documented');
    if (documentedOldDamages.some(damage => !damage.userDescription?.trim())) return false;
    if (documentedOldDamages.some(damage => !damage.userType || !damage.userCarPart)) return false;
    if (documentedOldDamages.some(damage => damage.userCarPart && CAR_PARTS[damage.userCarPart].length > 0 && !damage.userPosition)) return false;
    if (documentedOldDamages.some(damage => !damage.media?.some(m => m.type === 'image') || !damage.media?.some(m => m.type === 'video'))) return false;

    return true;
  };

const isStatusComplete = () => {
  const statusSet = String(uthyrningsstatus ?? '').trim().length > 0;
  const noteSet   = String(preliminarAvslutNotering ?? '').trim().length > 0;
  return statusSet && noteSet;
};
  
  // KORRIGERAD canSave - mer omfattande kontroll
  const canSave = () => {
    const regOk = isRegComplete();
    const locationOk = isLocationComplete();
    const vehicleOk = isVehicleStatusComplete();
    const cleaningOk = isCleaningComplete();
// Befintliga skador: foto krävs, video frivilligt
const existingOk =
  (existingDamages ?? [])
    .filter(d => d.status !== 'not_selected')   // ignorera tomma/placeholder-rader
    .every(d => hasPhoto(d.media));

// Nya skador: både foto och video krävs för varje ny skada
const newOk =
  newDamages.length === 0
    ? true
    : newDamages.every(d => hasPhoto(d.media) && hasVideo(d.media));


const damagesOk = existingOk && newOk;
    const statusOk = isStatusComplete();
    
    console.log('Validation check:', {
      regOk,
      locationOk,
      vehicleOk,
      cleaningOk,
      damagesOk,
      statusOk,
      overall: regOk && locationOk && vehicleOk && cleaningOk && damagesOk && statusOk
    });
    
    return regOk && locationOk && vehicleOk && cleaningOk && damagesOk && statusOk;
  };

  const resetForm = () => {
    setRegInput('');
    setCarData([]);
    setExistingDamages([]);
    setShowSuggestions(false);
    setShowConfirmDialog(false);
    setDamageToFix(null);
    setShowFinalConfirmation(false);
    setShowFieldErrors(false);
    setNotFound(false);
    setOrt('');
    setStation('');
    setAnnanPlats(false);
    setAnnanPlatsText('');
    setMatarstallning('');
    setDrivmedelstyp(null);
    setTankniva(null);
    setLiters('');
    setBransletyp(null);
    setLiterpris('');
    setLaddniva('');
    setSpolarvatska(null);
    setInsynsskydd(null);
    setAntalLaddkablar(null);
    setHjultyp(null);
    setAdblue(null);
    setTvatt(null);
    setInre(null);
    setSkadekontroll(null);
    setNewDamages([]);
    setUthyrningsstatus(null);
    setPreliminarAvslutNotering('');
    setShowSuccessModal(false);
  };

  const handleSave = () => {
    if (canSave()) {
      setShowFinalConfirmation(true);
    } else {
      setShowFieldErrors(true);
      setTimeout(() => {
        const firstIncomplete = document.querySelector('.section-incomplete');
        if (firstIncomplete) {
          firstIncomplete.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    }
  };
const saveDraft = async () => {
  const reg = (regInput || '').toUpperCase().trim();
  if (!reg) { alert('Ange registreringsnummer först.'); return; }

  try {
    const { error } = await supabase
      .from('checkin_drafts')
      .upsert({ regnr: reg, data: {} }); // vi börjar minimalt
    if (error) throw error;
    alert('Utkast sparat.');
  } catch (e) {
    console.error(e);
    alert('Kunde inte spara utkast.');
  }
};

const confirmFinalSave = async () => {
  console.log('Sparar incheckning...');
  setShowFinalConfirmation(false);

  try {
    // Mappa din ORT_TILL_REGION ('NORR'|'MITT'|'SYD') till skrivsätt i mejlet
    const raw = (ORT_TILL_REGION?.[ort] || 'SYD').toString().toUpperCase();
    const region = raw === 'MITT' ? 'Mitt' : raw === 'NORR' ? 'Norr' : 'Syd';

    const regForMail = String(regInput || '').toUpperCase();

    await notifyCheckin({
      subjectBase: regForMail ? `Incheckning ${regForMail}` : 'Incheckning',
      regnr: regForMail,
      region,
      htmlBody: `
        <p>Reg.nr: <b>${regForMail || '—'}</b></p>
        <p>Ort/Station: ${ort || '—'} / ${station || '—'}</p>
      `
    });
  } catch (e) {
    console.error('Mail misslyckades (vi fortsätter ändå):', e);
  }

  setShowSuccessModal(true);
};


  // Autocomplete från 2 tecken
  const handleRegInputChange = (value: string) => {
    const upperValue = value.toUpperCase();
    setRegInput(upperValue);
    
    if (upperValue.length >= 2) {
      const immediateSuggestions = allRegistrations
        .filter(reg => reg.includes(upperValue))
        .slice(0, 5);
      setShowSuggestions(immediateSuggestions.length > 0);
    } else {
      setShowSuggestions(false);
    }
  };

  const selectSuggestion = (suggestion: string) => {
    setRegInput(suggestion);
    setShowSuggestions(false);
  };

  // Skadehantering funktioner
  const toggleExistingDamageStatus = (id: string, newStatus: 'documented' | 'fixed') => {
    if (newStatus === 'fixed') {
      setDamageToFix(id);
      setShowConfirmDialog(true);
    } else {
      setExistingDamages(prev => prev.map(d =>
        d.id === id ? {
          ...d,
          status: d.status === 'documented' ? 'not_selected' : 'documented',
          userDescription: d.status === 'documented' ? '' : d.userDescription,
          userType: d.status === 'documented' ? '' : d.userType,
          userCarPart: d.status === 'documented' ? '' : d.userCarPart,
          userPosition: d.status === 'documented' ? '' : d.userPosition,
          media: d.status === 'documented' ? [] : d.media
        } : d
      ));
    }
  };

  const confirmFixDamage = () => {
    if (damageToFix) {
      setExistingDamages(prev => prev.map(d =>
        d.id === damageToFix ? {
          ...d,
          status: 'fixed',
          userDescription: '',
          userType: '',
          userCarPart: '',
          userPosition: '',
          media: []
        } : d
      ));
    }
    setShowConfirmDialog(false);
    setDamageToFix(null);
  };

  const cancelFixDamage = () => {
    setShowConfirmDialog(false);
    setDamageToFix(null);
  };

  // Funktioner för gamla skador
  const updateExistingDamageType = (id: string, type: string) => {
    setExistingDamages(prev => prev.map(d =>
      d.id === id ? { ...d, userType: type, userCarPart: '', userPosition: '' } : d
    ));
  };

  const updateExistingDamageCarPart = (id: string, carPart: string) => {
    setExistingDamages(prev => prev.map(d =>
      d.id === id ? { ...d, userCarPart: carPart, userPosition: '' } : d
    ));
  };

  const updateExistingDamagePosition = (id: string, position: string) => {
    setExistingDamages(prev => prev.map(d =>
      d.id === id ? { ...d, userPosition: position } : d
    ));
  };

  const updateExistingDamageDescription = (id: string, description: string) => {
    setExistingDamages(prev => prev.map(d =>
      d.id === id ? { ...d, userDescription: description } : d
    ));
  };

  const updateExistingDamageMedia = async (id: string, files: FileList | null) => {
    if (!files) return;

    const newMediaFiles = await processFiles(Array.from(files));
    setExistingDamages(prev => prev.map(d =>
      d.id === id ? { ...d, media: [...(d.media || []), ...newMediaFiles] } : d
    ));
  };

  const removeExistingDamageMedia = (damageId: string, mediaIndex: number) => {
    setExistingDamages(prev => prev.map(d => {
      if (d.id === damageId && d.media) {
        const newMedia = d.media.filter((_, index) => index !== mediaIndex);
        return { ...d, media: newMedia };
      }
      return d;
    }));
  };

  // Funktioner för nya skador
  const addDamage = () => {
    setNewDamages(prev => [...prev, {
      id: Math.random().toString(36).slice(2),
      type: '',
      carPart: '',
      position: '',
      text: '',
      media: []
    }]);
  };

  const removeDamage = (id: string) => {
    setNewDamages(prev => prev.filter(d => d.id !== id));
  };

  const updateDamageType = (id: string, type: string) => {
    setNewDamages(prev => prev.map(d => d.id === id ? {...d, type, carPart: '', position: ''} : d));
  };

  const updateDamageCarPart = (id: string, carPart: string) => {
    setNewDamages(prev => prev.map(d => d.id === id ? {...d, carPart, position: ''} : d));
  };

  const updateDamagePosition = (id: string, position: string) => {
    setNewDamages(prev => prev.map(d => d.id === id ? {...d, position} : d));
  };

  const updateDamageText = (id: string, text: string) => {
    setNewDamages(prev => prev.map(d => d.id === id ? {...d, text} : d));
  };

  const updateDamageMedia = async (id: string, files: FileList | null) => {
    if (!files) return;

    const newMediaFiles = await processFiles(Array.from(files));
    setNewDamages(prev => prev.map(d =>
      d.id === id ? {...d, media: [...d.media, ...newMediaFiles]} : d
    ));
  };

  const removeDamageMedia = (damageId: string, mediaIndex: number) => {
    setNewDamages(prev => prev.map(d => {
      if (d.id === damageId) {
        const newMedia = d.media.filter((_, index) => index !== mediaIndex);
        return { ...d, media: newMedia };
      }
      return d;
    }));
  };

  // Visuella komponenter
  const SectionHeader = ({ title, isComplete }: { title: string; isComplete?: boolean }) => (
    <div style={{
      marginTop: '40px',
      marginBottom: '20px',
      paddingBottom: '12px',
      borderBottom: '2px solid #e5e7eb',
      display: 'flex',
      alignItems: 'center',
      gap: '12px'
    }}>
      <h2 style={{
        fontSize: '22px',
        fontWeight: '700',
        margin: 0,
        color: '#1f2937',
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        flex: 1
      }}>
        {title}
      </h2>
      {isComplete !== undefined && (
        <div style={{
          width: '24px',
          height: '24px',
          borderRadius: '50%',
          backgroundColor: isComplete ? '#10b981' : '#dc2626',
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '14px',
          fontWeight: 'bold'
        }}>
          {isComplete ? '✓' : '!'}
        </div>
      )}
    </div>
  );

  const SubSectionHeader = ({ title }: { title: string }) => (
    <div style={{
      marginTop: '24px',
      marginBottom: '16px',
      paddingBottom: '8px',
      borderBottom: '1px solid #d1d5db'
    }}>
      <h3 style={{
        fontSize: '18px',
        fontWeight: '600',
        margin: 0,
        color: '#374151'
      }}>
        {title}
      </h3>
    </div>
  );

const MediaUpload = ({
  damageId,
  isOld,
  onMediaUpdate,
  hasImage,
  hasVideo,
  videoRequired = false,
}: {
  damageId: string;
  isOld: boolean;
  onMediaUpdate: (id: string, files: FileList | null) => void;
  hasImage?: boolean;
  hasVideo?: boolean;
  videoRequired?: boolean;
}) => {
  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onMediaUpdate(damageId, e.target.files);
    // tillåt att välja samma fil igen
    e.currentTarget.value = '';
};
  return (
    <div style={{ marginBottom: '12px' }}>
      {/* FOTO */}
      <div style={{ position: 'relative', display: 'inline-block', width: '100%' }}>
        <input
          type="file"
          accept="image/*"
          multiple
          capture="environment"
          onChange={onChange}
          style={{ display: 'none' }}
          id={`${isOld ? 'old' : 'new'}-photo-input-${damageId}`}
        />
        <label
          htmlFor={`${isOld ? 'old' : 'new'}-photo-input-${damageId}`}
          style={{
            display: 'block',
            width: '100%',
            padding: '12px',
            border: hasImage ? '2px dashed #10b981' : '2px solid #dc2626',
            borderRadius: '6px',
            fontSize: '16px',
            backgroundColor: hasImage ? '#f0fdf4' : '#fee2e2',
            textAlign: 'center',
            cursor: 'pointer',
            color: hasImage ? '#047857' : '#dc2626',
            fontWeight: hasImage ? 'normal' : 'bold',
          }}
        >
          📷 {hasImage ? 'Lägg till fler bilder' : 'Ta foto *'}
        </label>
      </div>

      {/* VIDEO */}
      <div style={{ position: 'relative', display: 'inline-block', width: '100%', marginTop: 8 }}>
        <input
          type="file"
          accept="video/*"
          capture="environment"
          onChange={onChange}
          style={{ display: 'none' }}
          id={`${isOld ? 'old' : 'new'}-video-input-${damageId}`}
        />
        <label
          htmlFor={`${isOld ? 'old' : 'new'}-video-input-${damageId}`}
          style={{
            display: 'block',
            width: '100%',
            padding: '12px',
            border: hasVideo ? '2px dashed #10b981' : '2px solid #dc2626',
            borderRadius: '6px',
            fontSize: '16px',
            backgroundColor: hasVideo ? '#f0fdf4' : '#fee2e2',
            textAlign: 'center',
            cursor: 'pointer',
            color: hasVideo ? '#047857' : '#dc2626',
            fontWeight: hasVideo ? 'normal' : 'bold',
          }}
        >
🎥 {isOld
  ? (videoRequired ? 'Spela in video *' : 'Spela in video')
  : (videoRequired ? 'Spela in video med skada OCH reg.nr. *' : 'Spela in video med skada OCH reg.nr.')}
        </label>
      </div>

      {/* GALLERI */}
      <div style={{ position: 'relative', display: 'inline-block', width: '100%', marginTop: 8 }}>
        <input
          type="file"
          accept="image/*,video/*"
          multiple
          onChange={onChange}
          style={{ display: 'none' }}
          id={`${isOld ? 'old' : 'new'}-gallery-input-${damageId}`}
        />
        <label
          htmlFor={`${isOld ? 'old' : 'new'}-gallery-input-${damageId}`}
          style={{
            display: 'block',
            width: '100%',
            padding: '12px',
            border: '2px dashed #3b82f6',
            borderRadius: '6px',
            fontSize: '16px',
            backgroundColor: '#eff6ff',
            textAlign: 'center',
            cursor: 'pointer',
            color: '#2563eb',
          }}
        >
          📁 Välj från galleri
        </label>
      </div>
</div> // end: MediaUpload content wrapper
  );         // end: return of MediaUpload
};           // end: const MediaUpload = (...) => { ... }


function buildNotifyPayload() {
  // 1) Region
  const region =
    ORT_TILL_REGION[ort as keyof typeof ORT_TILL_REGION] ?? 'SYD';

  // 2) Stationnamn
  const stationName = annanPlats
    ? (annanPlatsText || '').trim()
    : (station || '').trim();

  // 3) Härled flaggor
  // Nya skador? (om du valt "nya skador" eller lagt in minst en ny skada)
  const hasNewDamages =
    skadekontroll === 'nya_skador' || newDamages.length > 0;

  // Behöver rekond/tvätt? (om inte uttryckligen rent)
  const needsRecond =
    tvatt !== 'behover_inte_tvattas' || inre === 'behover_rengoras_inuti';

  return {
    regnr: normalizeReg(regInput || ''),
    region,
    station: stationName,
    time: new Date().toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }),
    hasNewDamages,
    needsRecond,
  } as const;

}

// --- Steg 3: Hjälpare för att skicka notifiering ---
const sendNotify = async (target: 'station' | 'quality') => {
  try {
    // 1) Visa "skickar..." direkt
    if (target === 'station') {
      setSendState('sending-station');
      setSendMsg('Skickar till station…');
    } else {
      setSendState('sending-quality');
      setSendMsg('Skickar till kvalitet…');
    }

    // 2) Bygg payload och hämta mottagare
    const payload = buildNotifyPayload();
    const to = recipientsFor(payload.region, target);

    // 3) Skicka
    const res = await notifyCheckin({ ...payload, recipients: to });

    // 4) Visa resultat
    if (res?.ok) {
      setSendState('ok');
      setSendMsg('Notis skickad ✅');
    } else {
      setSendState('fail');
      setSendMsg('Kunde inte skicka ❌');
    }
  } catch (err) {
    console.error('notify fail', err);
    setSendState('fail');
    setSendMsg('Kunde inte skicka ❌');
  } finally {
    // 5) Städning efter ~4s
    setTimeout(() => setSendMsg(''), 4000);
    setTimeout(() => setSendState('idle'), 4000);
  }
}; // ⬅⬅ VIKTIGT: semikolon här, eftersom detta är en const-funktion

// Små wrappers – enkla att koppla på knappar
const notifyStation = () => sendNotify('station');
const notifyQuality = () => sendNotify('quality');
const canSend = isRegComplete() && isLocationComplete();
;
// Top-level return för komponenten

return (
  <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', color: '#111827' }}>

{!!sendMsg && (
  <span
    style={{
      marginLeft: 8,
      fontSize: 12,
      opacity: 0.95,
      // grön vid OK, röd vid fel, annars standard
      color:
        sendState === 'ok'  ? '#167d00' :
        sendState === 'fail' ? '#dc2626' :
        '#111827',
    }}
  >
    {sendMsg}
  </span>
)}
{TEST_MAIL && showTestButtons && (
  <div
    style={{
      maxWidth: '600px',
      margin: '12px auto',
      padding: '8px 12px',
      backgroundColor: '#fef9c3',
      border: '1px solid #eab308',
      borderRadius: '8px',
      display: 'flex',
      gap: '8px',
      alignItems: 'center',
    }}
  >
    <button
      type="button"
      onClick={() => canSend && sendNotify('quality')}
      disabled={!canSend || sendState === 'sending-quality'}
      style={{
        padding: '6px 10px',
        border: '1px solid #e5e7eb',
        borderRadius: '6px',
        opacity: (!canSend || sendState === 'sending-quality') ? 0.6 : 1,
        cursor: (!canSend || sendState === 'sending-quality') ? 'not-allowed' : 'pointer',
      }}
    >
      {sendState === 'sending-quality' ? 'Skickar…' : 'Skicka test till Kvalitet'}
    </button>

    <button
      type="button"
      onClick={() => canSend && sendNotify('station')}
      disabled={!canSend || sendState === 'sending-station'}
      style={{
        padding: '6px 10px',
        border: '1px solid #e5e7eb',
        borderRadius: '6px',
        opacity: (!canSend || sendState === 'sending-station') ? 0.6 : 1,
        cursor: (!canSend || sendState === 'sending-station') ? 'not-allowed' : 'pointer',
      }}
    >
      {sendState === 'sending-station' ? 'Skickar…' : 'Skicka test till Station'}
    </button>
  </div>
)}
      <div style={{
        maxWidth: '600px',
        margin: '0 auto',
        padding: '0 20px',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}>

        {/* 1. REGISTRERINGSNUMMER med autocomplete */}
        <div style={{
          backgroundColor: '#ffffff',
          padding: '24px',
          borderRadius: '12px',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          position: 'relative',
          border: showFieldErrors && !isRegComplete() ? '2px solid #dc2626' : '2px solid transparent'
        }} className={showFieldErrors && !isRegComplete() ? 'section-incomplete' : ''}>
          <SectionHeader title="Fordon" isComplete={isRegComplete()} />
          
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '16px' }}>
            Registreringsnummer *
          </label>
          <div style={{ position: 'relative' }}>
            <input
  type="text"
  value={regInput}
  onChange={(e) => handleRegInputChange(e.target.value)}
onKeyDown={(e) => {
  if (e.key === 'Enter') {
    const val = (e.currentTarget as HTMLInputElement).value;
    lookupDamages(val);
  }
}}

onBlur={(e) => {
  setTimeout(() => setShowSuggestions(false), 200);
  const val = (e.currentTarget as HTMLInputElement).value;
  lookupDamages(val);
}}



              placeholder="Skriv reg.nr"
              spellCheck={false}
              autoComplete="off"
              style={{
                width: '100%',
                padding: '14px',
                border: showFieldErrors && !isRegComplete() ? '2px solid #dc2626' : '2px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '18px',
                fontWeight: '600',
                backgroundColor: '#ffffff',
                textAlign: 'center',
                letterSpacing: '2px'
              }}
            />

            {showSuggestions && suggestions.length > 0 && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                backgroundColor: '#ffffff',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                zIndex: 10,
                maxHeight: '200px',
                overflowY: 'auto'
              }}>
                {suggestions.map((suggestion, index) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => selectSuggestion(suggestion)}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: 'none',
                      backgroundColor: '#ffffff',
                      textAlign: 'left',
                      fontSize: '16px',
                      fontWeight: '500',
                      cursor: 'pointer',
                      borderBottom: index === suggestions.length - 1 ? 'none' : '1px solid #f3f4f6',
                      transition: 'background-color 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ffffff'}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
          </div>

          {loading && <p style={{ color: '#033066', fontSize: '14px', marginTop: '8px' }}>Söker...</p>}
          {notFound && normalizedReg && !loading && (
            <p style={{ color: '#dc2626', fontSize: '14px', marginTop: '8px', fontWeight: '500' }}>Okänt reg.nr</p>
          )}
          {showFieldErrors && !isRegComplete() && (
            <p style={{ color: '#dc2626', fontSize: '14px', marginTop: '8px', fontWeight: '500' }}>
              ⚠️ Registreringsnummer är obligatoriskt
            </p>
          )}

          {/* Bilinfo med ALLA befintliga skador */}
          {carData.length > 0 && (
            <div style={{
              marginTop: '20px',
              padding: '20px',
              backgroundColor: '#f0f9ff',
              borderRadius: '8px',
              border: '1px solid #bfdbfe'
            }}>
              <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center' }}>
                <span style={{ fontWeight: '600', color: '#033066', minWidth: '130px' }}>Bilmodell:</span>
                <span style={{ fontWeight: '500' }}>{carModel || '---'}</span>
              </div>
              <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center' }}>
                <span style={{ fontWeight: '600', color: '#033066', minWidth: '130px' }}>Hjulförvaring:</span>
                <span style={{ fontWeight: '500' }}>{wheelStorage || '---'}</span>
              </div>
              <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center' }}>
                <span style={{ fontWeight: '600', color: '#033066', minWidth: '130px' }}>Saludatum:</span>
                {saludatum ? (
                  <span style={{
                    color: '#dc2626',
                    fontWeight: isDateWithinDays(saludatum, 10) ? 'bold' : '500'
                  }}>
                    {new Date(saludatum).toLocaleDateString('sv-SE')}
                  </span>
                ) : <span style={{ fontWeight: '500' }}> ---</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                <span style={{ fontWeight: '600', color: '#033066', minWidth: '130px' }}>Befintliga skador:</span>
                <div style={{ flex: 1 }}>
{damages && damages.length > 0 ? (
  <ul style={{ margin: 0, paddingLeft: '16px' }}>
    {damages.map((d, idx) => (
      <li key={`damage-${idx}`}>{d}</li>
    ))}
  </ul>
) : (
  <span style={{ fontWeight: '500' }}>---</span>
)}

                </div>
              </div>
            </div>
          )}
        </div>

        {/* 2. PLATS FÖR INCHECKNING - KORRIGERADE namn */}
        <div style={{
          backgroundColor: '#ffffff',
          padding: '24px',
          borderRadius: '12px',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          border: showFieldErrors && !isLocationComplete() ? '2px solid #dc2626' : '2px solid transparent'
        }} className={showFieldErrors && !isLocationComplete() ? 'section-incomplete' : ''}>
          <SectionHeader title="Plats för incheckning" isComplete={isLocationComplete()} />
          
          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
                Ort *
              </label>
              <select
                value={ort}
                onChange={(e) => {
                  setOrt(e.target.value);
                  setStation('');
                }}
                disabled={annanPlats}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: showFieldErrors && !ort && !annanPlats ? '2px solid #dc2626' : '2px solid #e5e7eb',
                  borderRadius: '6px',
                  fontSize: '16px',
                  backgroundColor: annanPlats ? '#f9fafb' : '#ffffff',
                  opacity: annanPlats ? 0.6 : 1
                }}
              >
                <option value="">Välj ort</option>
                {ORTER.map(ortOption => (
                  <option key={ortOption} value={ortOption}>{ortOption}</option>
                ))}
              </select>
            </div>

            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
                Station *
              </label>
              <select
                value={station}
                  id="station"

                onChange={(e) => setStation(e.target.value)}
                disabled={!ort || annanPlats}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: showFieldErrors && !station && !annanPlats ? '2px solid #dc2626' : '2px solid #e5e7eb',
                  borderRadius: '6px',
                  fontSize: '16px',
                  backgroundColor: (ort && !annanPlats) ? '#ffffff' : '#f9fafb',
                  opacity: (ort && !annanPlats) ? 1 : 0.6
                }}
              >
                <option value="">Välj station</option>
                {availableStations.map(stationOption => (
                  <option key={stationOption} value={stationOption}>{stationOption}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <input
                type="checkbox"
                checked={annanPlats}
                onChange={(e) => {
                  setAnnanPlats(e.target.checked);
                  if (e.target.checked) {
                    setOrt('');
                    setStation('');
                  } else {
                    setAnnanPlatsText('');
                  }
                }}
                style={{ transform: 'scale(1.2)' }}
              />
              <span style={{ fontWeight: '500' }}>Annan plats</span>
            </label>

            {annanPlats && (
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
                  Ange plats *
                </label>
                <input
                  type="text"
                  value={annanPlatsText}
                  onChange={(e) => setAnnanPlatsText(e.target.value)}
                  placeholder="T.ex. gatuadress"
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: showFieldErrors && !annanPlatsText.trim() ? '2px solid #dc2626' : '2px solid #e5e7eb',
                    borderRadius: '6px',
                    fontSize: '16px'
                  }}
                />
              </div>
            )}
          </div>

          {showFieldErrors && !isLocationComplete() && (
            <p style={{ color: '#dc2626', fontSize: '14px', fontWeight: '500', marginTop: '12px' }}>
              ⚠️ Plats för incheckning är obligatorisk
            </p>
          )}
        </div>

        {/* 3. FORDONSSTATUS - komplett med alla fält */}
        <div style={{
          backgroundColor: '#ffffff',
          padding: '24px',
          borderRadius: '12px',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          border: showFieldErrors && !isVehicleStatusComplete() ? '2px solid #dc2626' : '2px solid transparent'
        }} className={showFieldErrors && !isVehicleStatusComplete() ? 'section-incomplete' : ''}>
          <SectionHeader title="Fordonsstatus" isComplete={isVehicleStatusComplete()} />
          
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
              Mätarställning (km) *
            </label>
            <input
              type="number"
              inputMode="numeric"
              value={matarstallning}
              onChange={(e) => setMatarstallning(e.target.value)}
              placeholder="Ange mätarställning"
              style={{
                width: '100%',
                padding: '12px',
                border: showFieldErrors && !matarstallning.trim() ? '2px solid #dc2626' : '2px solid #e5e7eb',
                borderRadius: '6px',
                fontSize: '16px'
              }}
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '12px', fontWeight: '500' }}>
              Drivmedelstyp *
            </label>
            <div style={{ display: 'flex', gap: '12px' }}>
              {(['bensin_diesel', 'elbil'] as const).map(type => (
                <label key={type} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '12px 16px',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  backgroundColor: drivmedelstyp === type ? '#033066' : '#ffffff',
                  color: drivmedelstyp === type ? '#ffffff' : '#374151',
                  flex: 1,
                  justifyContent: 'center',
                  fontWeight: '500'
                }}>
                  <input
                    type="radio"
                    name="drivmedelstyp"
                    value={type}
                    checked={drivmedelstyp === type}
                    onChange={(e) => {
                      setDrivmedelstyp(e.target.value as 'bensin_diesel' | 'elbil');
                      setTankniva(null);
                      setLiters('');
                      setBransletyp(null);
                      setLiterpris('');
                      setLaddniva('');
                    }}
                    style={{ display: 'none' }}
                  />
                  <span>
                    {type === 'bensin_diesel' ? 'Bensin/Diesel' : 'Elbil'}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Komplett bensin/diesel sektion */}
          {drivmedelstyp === 'bensin_diesel' && (
            <>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '12px', fontWeight: '500' }}>
                  Tankstatus *
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {([
                    { value: 'fulltankad', label: 'Fulltankad' },
                    { value: 'tankas_senare', label: 'Behöver tankas senare' },
                    { value: 'pafylld_nu', label: 'Påfylld nu' }
                  ] as const).map(option => (
                    <label key={option.value} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '12px',
                      border: '2px solid #e5e7eb',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      backgroundColor: tankniva === option.value ? '#033066' : '#ffffff',
                      color: tankniva === option.value ? '#ffffff' : '#374151'
                    }}>
                      <input
                        type="radio"
                        name="tankniva"
                        value={option.value}
                        checked={tankniva === option.value}
                        onChange={(e) => setTankniva(e.target.value as any)}
                        style={{ display: 'none' }}
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {tankniva === 'pafylld_nu' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
                        Antal liter *
                      </label>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.1"
                        value={liters}
                        onChange={(e) => setLiters(e.target.value)}
                        placeholder="T.ex. 45.2"
                        style={{
                          width: '100%',
                          padding: '12px',
                          border: '2px solid #e5e7eb',
                          borderRadius: '6px',
                          fontSize: '16px'
                        }}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
                        Bränsletyp *
                      </label>
                      <select
                        value={bransletyp || ''}
                        onChange={(e) => setBransletyp(e.target.value as 'Bensin' | 'Diesel')}
                        style={{
                          width: '100%',
                          padding: '12px',
                          border: '2px solid #e5e7eb',
                          borderRadius: '6px',
                          fontSize: '16px',
                          backgroundColor: '#ffffff'
                        }}
                      >
                        <option value="">Välj typ</option>
                        <option value="Bensin">Bensin</option>
                        <option value="Diesel">Diesel</option>
                      </select>
                    </div>
                  </div>
                  
                  <div>
                    <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
                      Literpris (kr) *
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      value={literpris}
                      onChange={(e) => setLiterpris(e.target.value)}
                      placeholder="T.ex. 16.95"
                      style={{
                        width: '100%',
                        padding: '12px',
                        border: '2px solid #e5e7eb',
                        borderRadius: '6px',
                        fontSize: '16px'
                      }}
                    />
                  </div>
                </div>
              )}

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '12px', fontWeight: '500' }}>
                  AdBlue *
                </label>
                <div style={{ display: 'flex', gap: '12px' }}>
                  {[
                    { value: true, label: 'OK' },
                    { value: false, label: 'Behöver påfyllning' }
                  ].map(option => (
                    <label key={String(option.value)} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '12px 16px',
                      border: '2px solid #e5e7eb',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      backgroundColor: adblue === option.value ? '#033066' : '#ffffff',
                      color: adblue === option.value ? '#ffffff' : '#374151',
                      flex: 1,
                      justifyContent: 'center'
                    }}>
                      <input
                        type="radio"
                        name="adblue"
                        checked={adblue === option.value}
                        onChange={() => setAdblue(option.value)}
                        style={{ display: 'none' }}
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Komplett elbil sektion */}
          {drivmedelstyp === 'elbil' && (
            <>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
                  Laddningsnivå (%) *
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max="100"
                  value={laddniva}
                  onChange={(e) => setLaddniva(e.target.value)}
                  placeholder="T.ex. 85"
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '2px solid #e5e7eb',
                    borderRadius: '6px',
                    fontSize: '16px'
                  }}
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '12px', fontWeight: '500' }}>
                  Antal laddkablar *
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {(['0', '1', '2'] as const).map(antal => (
                    <label key={antal} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '12px 16px',
                      border: '2px solid #e5e7eb',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      backgroundColor: antalLaddkablar === antal ? '#033066' : '#ffffff',
                      color: antalLaddkablar === antal ? '#ffffff' : '#374151',
                      flex: 1,
                      justifyContent: 'center'
                    }}>
                      <input
                        type="radio"
                        name="antalLaddkablar"
                        value={antal}
                        checked={antalLaddkablar === antal}
                        onChange={(e) => setAntalLaddkablar(e.target.value as '0' | '1' | '2')}
                        style={{ display: 'none' }}
                      />
                      <span>{antal} st</span>
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Gemensamma fält */}
          <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: '12px', fontWeight: '500' }}>
                Spolarväska *
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {[
                  { value: true, label: 'OK' },
                  { value: false, label: 'Behöver påfyllning' }
                ].map(option => (
                  <label key={String(option.value)} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '12px',
                    border: '2px solid #e5e7eb',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    backgroundColor: spolarvatska === option.value ? '#033066' : '#ffffff',
                    color: spolarvatska === option.value ? '#ffffff' : '#374151',
                    flex: 1,
                    justifyContent: 'center'
                  }}>
                    <input
                      type="radio"
                      name="spolarvatska"
                      checked={spolarvatska === option.value}
                      onChange={() => setSpolarvatska(option.value)}
                      style={{ display: 'none' }}
                    />
                    <span style={{ fontSize: '14px' }}>{option.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: '12px', fontWeight: '500' }}>
                Insynsskydd *
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {[
                  { value: true, label: 'OK' },
                  { value: false, label: 'Saknas' }
                ].map(option => (
                  <label key={String(option.value)} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '12px',
                    border: '2px solid #e5e7eb',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    backgroundColor: insynsskydd === option.value ? '#033066' : '#ffffff',
                    color: insynsskydd === option.value ? '#ffffff' : '#374151',
                    flex: 1,
                    justifyContent: 'center'
                  }}>
                    <input
                      type="radio"
                      name="insynsskydd"
                      checked={insynsskydd === option.value}
                      onChange={() => setInsynsskydd(option.value)}
                      style={{ display: 'none' }}
                    />
                    <span style={{ fontSize: '14px' }}>{option.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '12px', fontWeight: '500' }}>
              Hjultyp *
            </label>
            <div style={{ display: 'flex', gap: '12px' }}>
              {(['Sommarthjul', 'Vinterhjul'] as const).map(typ => (
                <label key={typ} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '12px 16px',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  backgroundColor: hjultyp === typ ? '#033066' : '#ffffff',
                  color: hjultyp === typ ? '#ffffff' : '#374151',
                  flex: 1,
                  justifyContent: 'center'
                }}>
                  <input
                    type="radio"
                    name="hjultyp"
                    value={typ}
                    checked={hjultyp === typ}
                    onChange={(e) => setHjultyp(e.target.value as 'Sommarthjul' | 'Vinterhjul')}
                    style={{ display: 'none' }}
                  />
                  <span>{typ}</span>
                </label>
              ))}
            </div>
          </div>

          {showFieldErrors && !isVehicleStatusComplete() && (
            <p style={{ color: '#dc2626', fontSize: '14px', fontWeight: '500' }}>
              ⚠️ Alla fält under fordonsstatus är obligatoriska
            </p>
          )}
        </div>

        {/* 4. RENGÖRING */}
        <div style={{
          backgroundColor: '#ffffff',
          padding: '24px',
          borderRadius: '12px',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          border: showFieldErrors && !isCleaningComplete() ? '2px solid #dc2626' : '2px solid transparent'
        }} className={showFieldErrors && !isCleaningComplete() ? 'section-incomplete' : ''}>
          <SectionHeader title="Rengöring" isComplete={isCleaningComplete()} />
          
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '12px', fontWeight: '500' }}>
              Tvättning *
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {([
                { value: 'behover_inte_tvattas', label: 'Behöver inte tvättas' },
                { value: 'behover_tvattas', label: 'Behöver tvättas' },
                { value: 'behover_grovtvattas', label: 'Behöver grovtvättas' }
              ] as const).map(option => (
                <label key={option.value} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '12px',
                  border: '2px solid #e5e7eb',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  backgroundColor: tvatt === option.value ? '#033066' : '#ffffff',
                  color: tvatt === option.value ? '#ffffff' : '#374151'
                }}>
                  <input
                    type="radio"
                    name="tvatt"
                    value={option.value}
                    checked={tvatt === option.value}
                    onChange={(e) => setTvatt(e.target.value as any)}
                    style={{ display: 'none' }}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '12px', fontWeight: '500' }}>
              Inre *
            </label>
            <div style={{ display: 'flex', gap: '12px' }}>
              {([
                { value: 'ren_inuti', label: 'Ren inuti' },
                { value: 'behover_rengoras_inuti', label: 'Behöver rengöras inuti' }
              ] as const).map(option => (
                <label key={option.value} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '12px 16px',
                  border: '2px solid #e5e7eb',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  backgroundColor: inre === option.value ? '#033066' : '#ffffff',
                  color: inre === option.value ? '#ffffff' : '#374151',
                  flex: 1,
                  justifyContent: 'center'
                }}>
                  <input
                    type="radio"
                    name="inre"
                    value={option.value}
                    checked={inre === option.value}
                    onChange={(e) => setInre(e.target.value as any)}
                    style={{ display: 'none' }}
                  />
                  <span style={{ fontSize: '14px', textAlign: 'center' }}>{option.label}</span>
                </label>
              ))}
            </div>
          </div>

          {showFieldErrors && !isCleaningComplete() && (
            <p style={{ color: '#dc2626', fontSize: '14px', fontWeight: '500' }}>
              ⚠️ Alla rengöringsfält är obligatoriska
            </p>
          )}
        </div>

        {/* 5. SKADEKONTROLL med ÅTERSTÄLLD befintliga skador-sektion */}
        <div style={{
          backgroundColor: '#ffffff',
          padding: '24px',
          borderRadius: '12px',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          border: showFieldErrors && !isDamagesComplete() ? '2px solid #dc2626' : '2px solid transparent'
        }} className={showFieldErrors && !isDamagesComplete() ? 'section-incomplete' : ''}>
          

          <SectionHeader title="Skadekontroll" isComplete={isDamagesComplete()} />
{/* --- BEFINTLIGA SKADOR: dokumentation --- */}

{Array.isArray(existingDamages) && existingDamages.length > 0 && (
            <>
              <SubSectionHeader title="Befintliga skador" />
              <div style={{ marginBottom: '24px' }}>
                {existingDamages.map((damage) => (
                  <div key={damage.id} style={{
                    marginBottom: '16px',
                    padding: '16px',
                    border: damage.status === 'documented' ? '2px solid #10b981' : 
                           damage.status === 'fixed' ? '2px solid #6b7280' : '2px solid #e5e7eb',
                    borderRadius: '8px',
                    backgroundColor: damage.status === 'documented' ? '#f0fdf4' : 
                                   damage.status === 'fixed' ? '#f9fafb' : '#ffffff'
                  }}>
                    <div style={{ marginBottom: '12px' }}>
                      <div style={{ fontWeight: '600', marginBottom: '4px' }}>{damage.fullText}</div>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => toggleExistingDamageStatus(damage.id, 'documented')}
                          disabled={damage.status === 'fixed'}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '4px',
                            border: 'none',
                            fontSize: '14px',
                            fontWeight: '500',
                            cursor: damage.status === 'fixed' ? 'not-allowed' : 'pointer',
                            backgroundColor: damage.status === 'documented' ? '#10b981' : '#e5e7eb',
                            color: damage.status === 'documented' ? '#ffffff' : '#374151',
                            opacity: damage.status === 'fixed' ? 0.5 : 1
                          }}
                        >
                          {damage.status === 'documented' ? '✓ Dokumenterad' : 'Dokumentera'}
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleExistingDamageStatus(damage.id, 'fixed')}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '4px',
                            border: 'none',
                            fontSize: '14px',
                            fontWeight: '500',
                            cursor: 'pointer',
                            backgroundColor: damage.status === 'fixed' ? '#6b7280' : '#f59e0b',
                            color: '#ffffff'
                          }}
                        >
                          {damage.status === 'fixed' ? '✓ Åtgärdad' : 'Åtgärdad?'}
                        </button>
                      </div>
                    </div>

{damage.status !== 'fixed' && (
                      <div style={{ borderTop: '1px solid #d1d5db', paddingTop: '12px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                          <div>
                            <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: '500' }}>
                              1. Skadetyp *
                            </label>
                            <select
                              value={damage.userType || ''}
                              onChange={(e) => updateExistingDamageType(damage.id, e.target.value)}
                              style={{
                                width: '100%',
                                padding: '8px',
                                border: '1px solid #d1d5db',
                                borderRadius: '4px',
                                fontSize: '14px'
                              }}
                            >
                              <option value="">Välj typ</option>
                              {DAMAGE_TYPES.map(type => (
                                <option key={type} value={type}>{type}</option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: '500' }}>
                              2. Bildel *
                            </label>
                            <select
                              value={damage.userCarPart || ''}
                              onChange={(e) => updateExistingDamageCarPart(damage.id, e.target.value)}
                              style={{
                                width: '100%',
                                padding: '8px',
                                border: '1px solid #d1d5db',
                                borderRadius: '4px',
                                fontSize: '14px'
                              }}
                            >
                              <option value="">Välj bildel</option>
                              {(damage.userType ? getRelevantCarParts(damage.userType) : CAR_PART_OPTIONS).map(part => (
                                <option key={part} value={part}>{part}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {damage.userCarPart && CAR_PARTS[damage.userCarPart].length > 0 && (
                          <div style={{ marginBottom: '12px' }}>
                            <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: '500' }}>
                              3. Position *
                            </label>
                            <select
                              value={damage.userPosition || ''}
                              onChange={(e) => updateExistingDamagePosition(damage.id, e.target.value)}
                              style={{
                                width: '100%',
                                padding: '8px',
                                border: '1px solid #d1d5db',
                                borderRadius: '4px',
                                fontSize: '14px'
                              }}
                            >
                              <option value="">Välj position</option>
                              {CAR_PARTS[damage.userCarPart].map(pos => (
                                <option key={pos} value={pos}>{pos}</option>
                              ))}
                            </select>
                          </div>
                        )}

                        <div style={{ marginBottom: '12px' }}>
                          <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: '500' }}>
                            {damage.userCarPart && CAR_PARTS[damage.userCarPart].length > 0 ? '4. ' : '3. '}Din detaljerade beskrivning *
                          </label>
                          <textarea
                            value={damage.userDescription || ''}
                            onChange={(e) => updateExistingDamageDescription(damage.id, e.target.value)}
                            placeholder={`Beskriv "${damage.shortText}" mer detaljerat...`}
                            rows={3}
                            style={{
                              width: '100%',
                              padding: '8px',
                              border: '1px solid #d1d5db',
                              borderRadius: '4px',
                              fontSize: '14px',
                              resize: 'vertical',
                              minHeight: '80px'
                            }}
                          />
                        </div>

                        <MediaUpload
                          damageId={damage.id}
                          isOld={true}
                          onMediaUpdate={updateExistingDamageMedia}
                          hasImage={damage.media?.some(m => m.type === 'image') || false}
                          hasVideo={damage.media?.some(m => m.type === 'video') || false}
                        />

                        {damage.media && damage.media.length > 0 && (
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
                            {damage.media.map((media, index) => (
                              <div key={index} style={{ position: 'relative' }}>
                                {media.type === 'image' ? (
                                  <img
                                    src={media.preview}
                                    alt="Skadebild"
                                    style={{ width: '60px', height: '60px', objectFit: 'cover', borderRadius: '4px' }}
                                  />
                                ) : (
                                  <div style={{
                                    width: '60px',
                                    height: '60px',
                                    backgroundColor: '#f3f4f6',
                                    borderRadius: '4px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    backgroundImage: media.thumbnail ? `url(${media.thumbnail})` : undefined,
                                    backgroundSize: 'cover'
                                  }}>
                                    {!media.thumbnail && '🎥'}
                                  </div>
                                )}
                                <button
                                  type="button"
                                  onClick={() => removeExistingDamageMedia(damage.id, index)}
                                  style={{
                                    position: 'absolute',
                                    top: '-6px',
                                    right: '-6px',
                                    width: '20px',
                                    height: '20px',
                                    borderRadius: '50%',
                                    border: 'none',
                                    backgroundColor: '#dc2626',
                                    color: '#ffffff',
                                    fontSize: '12px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                  }}
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Skadekontroll val */}
          <SubSectionHeader title="Nya skador" />
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '12px', fontWeight: '500' }}>
              Skadekontroll *
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {([
                { value: 'inga_nya_skador', label: 'Inga nya skador' },
                { value: 'nya_skador', label: 'Nya skador upptäckta' },
                { value: 'ej_skadekontrollerad', label: 'Ej skadekontrollerad' }
              ] as const).map(option => (
                <label key={option.value} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '12px',
                  border: '2px solid #e5e7eb',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  backgroundColor: skadekontroll === option.value ? '#033066' : '#ffffff',
                  color: skadekontroll === option.value ? '#ffffff' : '#374151'
                }}>
                  <input
                    type="radio"
                    name="skadekontroll"
                    value={option.value}
                    checked={skadekontroll === option.value}
                    onChange={(e) => {
                      setSkadekontroll(e.target.value as any);
                      if (e.target.value !== 'nya_skador') {
                        setNewDamages([]);
                      }
                    }}
                    style={{ display: 'none' }}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Nya skador formulär med hierarkisk struktur */}
          {skadekontroll === 'nya_skador' && (
            <div>
              {newDamages.map((damage) => (
                <div key={damage.id} style={{
                  marginBottom: '20px',
                  padding: '16px',
                  border: '2px solid #f59e0b',
                  borderRadius: '8px',
                  backgroundColor: '#fffbeb'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h4 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>Ny skada</h4>
                    <button
                      type="button"
                      onClick={() => removeDamage(damage.id)}
                      style={{
                        padding: '4px 8px',
                        borderRadius: '4px',
                        border: 'none',
                        backgroundColor: '#dc2626',
                        color: '#ffffff',
                        fontSize: '12px',
                        cursor: 'pointer'
                      }}
                    >
                      Ta bort
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: '500' }}>
                        1. Skadetyp *
                      </label>
                      <select
                        value={damage.type}
                        onChange={(e) => updateDamageType(damage.id, e.target.value)}
                        style={{
                          width: '100%',
                          padding: '8px',
                          border: '1px solid #d1d5db',
                          borderRadius: '4px',
                          fontSize: '14px'
                        }}
                      >
                        <option value="">Välj typ</option>
                        {DAMAGE_TYPES.map(type => (
                          <option key={type} value={type}>{type}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: '500' }}>
                        2. Bildel *
                      </label>
                      <select
                        value={damage.carPart}
                        onChange={(e) => updateDamageCarPart(damage.id, e.target.value)}
                        disabled={!damage.type}
                        style={{
                          width: '100%',
                          padding: '8px',
                          border: '1px solid #d1d5db',
                          borderRadius: '4px',
                          fontSize: '14px',
                          backgroundColor: damage.type ? '#ffffff' : '#f9fafb',
                          opacity: damage.type ? 1 : 0.6
                        }}
                      >
                        <option value="">Välj bildel</option>
                        {(damage.type ? getRelevantCarParts(damage.type) : CAR_PART_OPTIONS).map(part => (
                          <option key={part} value={part}>{part}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {damage.carPart && CAR_PARTS[damage.carPart].length > 0 && (
                    <div style={{ marginBottom: '12px' }}>
                      <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: '500' }}>
                        3. Position *
                      </label>
                      <select
                        value={damage.position}
                        onChange={(e) => updateDamagePosition(damage.id, e.target.value)}
                        style={{
                          width: '100%',
                          padding: '8px',
                          border: '1px solid #d1d5db',
                          borderRadius: '4px',
                          fontSize: '14px'
                        }}
                      >
                        <option value="">Välj position</option>
                        {CAR_PARTS[damage.carPart].map(pos => (
                          <option key={pos} value={pos}>{pos}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: '500' }}>
                      {damage.carPart && CAR_PARTS[damage.carPart].length > 0 ? '4. ' : '3. '}Beskrivning av skada *
                    </label>
                    <input
                      type="text"
                      value={damage.text}
                      onChange={(e) => updateDamageText(damage.id, e.target.value)}
                      placeholder="Beskriv skadan mer detaljerat..."
                      disabled={!damage.carPart}
                      style={{
                        width: '100%',
                        padding: '12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '16px',
                        backgroundColor: damage.carPart ? '#ffffff' : '#f3f4f6',
                        color: damage.carPart ? '#000' : '#9ca3af'
                      }}
                    />
                  </div>

<MediaUpload
  damageId={damage.id}
  isOld={false}
  onMediaUpdate={updateDamageMedia}
  hasImage={damage.media.some(m => m.type === 'image')}
  hasVideo={damage.media.some(m => m.type === 'video')}
  videoRequired
/>

                  {damage.media.length > 0 && (
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
                      {damage.media.map((media, index) => (
                        <div key={index} style={{ position: 'relative' }}>
                          {media.type === 'image' ? (
                            <img
                              src={media.preview}
                              alt="Skadebild"
                              style={{ width: '60px', height: '60px', objectFit: 'cover', borderRadius: '4px' }}
                            />
                          ) : (
                            <div style={{
                              width: '60px',
                              height: '60px',
                              backgroundColor: '#f3f4f6',
                              borderRadius: '4px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              backgroundImage: media.thumbnail ? `url(${media.thumbnail})` : undefined,
                              backgroundSize: 'cover'
                            }}>
                              {!media.thumbnail && '🎥'}
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => removeDamageMedia(damage.id, index)}
                            style={{
                              position: 'absolute',
                              top: '-6px',
                              right: '-6px',
                              width: '20px',
                              height: '20px',
                              borderRadius: '50%',
                              border: 'none',
                              backgroundColor: '#dc2626',
                              color: '#ffffff',
                              fontSize: '12px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              <button
                type="button"
                onClick={addDamage}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '2px dashed #f59e0b',
                  borderRadius: '6px',
                  backgroundColor: '#fffbeb',
                  color: '#f59e0b',
                  fontSize: '16px',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
              >
                + Lägg till skada
              </button>
            </div>
          )}

          {showFieldErrors && !isDamagesComplete() && (
            <p style={{ color: '#dc2626', fontSize: '14px', fontWeight: '500' }}>
              ⚠️ Skadekontroll och alla skadeuppgifter är obligatoriska
            </p>
          )}
        </div>

        {/* 6. UTHYRNINGSSTATUS */}
        <div style={{
          backgroundColor: '#ffffff',
          padding: '24px',
          borderRadius: '12px',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          border: showFieldErrors && !isStatusComplete() ? '2px solid #dc2626' : '2px solid transparent'
        }} className={showFieldErrors && !isStatusComplete() ? 'section-incomplete' : ''}>
          <SectionHeader title="Uthyrningsstatus" isComplete={isStatusComplete()} />
          
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '12px', fontWeight: '500' }}>
              Status *
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {([
                { value: 'redo_for_uthyrning', label: 'Redo för uthyrning' },
                { value: 'ledig_tankad', label: 'Ledig, tankad' },
                { value: 'ledig_otankad', label: 'Ledig, otankad' },
                { value: 'klar_otankad', label: 'Klar, otankad' }
              ] as const).map(option => (
                <label key={option.value} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '12px',
                  border: '2px solid #e5e7eb',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  backgroundColor: uthyrningsstatus === option.value ? '#033066' : '#ffffff',
                  color: uthyrningsstatus === option.value ? '#ffffff' : '#374151'
                }}>
                  <input
                    type="radio"
                    name="uthyrningsstatus"
                    value={option.value}
                    checked={uthyrningsstatus === option.value}
                    onChange={(e) => setUthyrningsstatus(e.target.value as any)}
                    style={{ display: 'none' }}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
              Preliminär avslut notering *
            </label>
            <textarea
              value={preliminarAvslutNotering}
              onChange={(e) => setPreliminarAvslutNotering(e.target.value)}
              placeholder="Skriv en kort notering om incheckningen..."
              rows={3}
              style={{
                width: '100%',
                padding: '12px',
                border: showFieldErrors && !preliminarAvslutNotering.trim() ? '2px solid #dc2626' : '2px solid #e5e7eb',
                borderRadius: '6px',
                fontSize: '16px',
                resize: 'vertical',
                minHeight: '80px'
              }}
            />
          </div>

          {showFieldErrors && !isStatusComplete() && (
            <p style={{ color: '#dc2626', fontSize: '14px', fontWeight: '500' }}>
              ⚠️ Uthyrningsstatus och preliminär notering är obligatoriska
            </p>
          )}
        </div>

<div style={{ background: '#fff', padding: '24px', borderRadius: '12px', marginBottom: '24px' }}>
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: 10 }}>
    <button
      type="button"
      onClick={saveDraft}
      disabled={!regInput}
      style={{ padding: '12px', borderRadius: '8px', border: '1px solid #d1d5db' }}
    >
      Spara
    </button>

    <button
      type="button"
      onClick={() => setShowConfirmDialog(true)}
      disabled={!canSave()}
      style={{ padding: '12px', borderRadius: '8px', border: '1px solid #d1d5db' }}
    >
      Spara och checka in
    </button>
  </div>

  <button
    type="button"
    onClick={() => {
      if (confirm('Är du säker? Ny info kommer inte att sparas')) {
        window.location.href = '/';
      }
    }}
    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #d1d5db' }}
  >
    Avbryt
  </button>
</div>
      {/* ALLA BEKRÄFTELSEDIALOGER */}
      {showConfirmDialog && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            padding: '32px',
            margin: '20px',
            maxWidth: '400px',
            width: '100%',
            textAlign: 'center',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              backgroundColor: '#f59e0b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px',
              fontSize: '32px'
            }}>
              ⚠️
            </div>
            
            <h2 style={{
              fontSize: '20px',
              fontWeight: '600',
              marginBottom: '12px',
              color: '#1f2937'
            }}>
              Bekräfta åtgärdning
            </h2>
            
            <p style={{
              fontSize: '16px',
              color: '#6b7280',
              marginBottom: '24px'
            }}>
              Är du säker på att denna skada är åtgärdad?
              <br />
              <strong>"{existingDamages.find(d => d.id === damageToFix)?.fullText}"</strong>
            </p>
            
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={cancelFixDamage}
                style={{
                  flex: 1,
                  backgroundColor: '#f3f4f6',
                  color: '#374151',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  padding: '12px 24px',
                  fontSize: '16px',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
              >
                Avbryt
              </button>
              <button
                onClick={confirmFixDamage}
                style={{
                  flex: 1,
                  backgroundColor: '#10b981',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '12px 24px',
                  fontSize: '16px',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
              >
                ✅ Bekräfta
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUCCESS MODAL */}
      {showSuccessModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            padding: '32px',
            margin: '20px',
            maxWidth: '400px',
            width: '100%',
            textAlign: 'center',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              backgroundColor: '#10b981',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px',
              fontSize: '32px',
              color: '#ffffff'
            }}>
              ✓
            </div>
            
            <h2 style={{
              fontSize: '24px',
              fontWeight: '600',
              marginBottom: '12px',
              color: '#1f2937'
            }}>
              Tack {firstName}!
            </h2>
            
            <p style={{
              fontSize: '16px',
              color: '#6b7280',
              marginBottom: '24px'
            }}>
              Incheckning sparad för {regInput}
            </p>
            
            <button
              onClick={resetForm}
              style={{
                backgroundColor: '#033066',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '12px 24px',
                fontSize: '16px',
                fontWeight: '500',
                cursor: 'pointer',
                width: '100%'
              }}
            >
              Starta ny incheckning
            </button>
          </div>
        </div>
      )}
      {/* Final Confirmation Dialog - Detaljerad sammanfattning */}
      {showFinalConfirmation && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            padding: '32px',
            maxWidth: '600px',
            width: '100%',
            maxHeight: '80vh',
            overflowY: 'auto',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}>
            <h2 style={{
              fontSize: '24px',
              fontWeight: '600',
              marginBottom: '20px',
              color: '#1f2937',
              textAlign: 'center'
            }}>
              Bekräfta incheckning
            </h2>
            
            <div style={{
              backgroundColor: '#f8fafc',
              padding: '20px',
              borderRadius: '8px',
              marginBottom: '24px',
              fontSize: '14px',
              lineHeight: '1.6'
            }}>
              <p style={{ marginBottom: '16px', fontSize: '16px', fontWeight: '600' }}>
                <strong>{firstName}</strong> checkar in: <strong>{regInput}</strong>
              </p>
              
              <div style={{ marginBottom: '12px' }}>
                <strong>📍 Plats:</strong> {annanPlats ? annanPlatsText : `${ort} - ${station}`}
              </div>
              
              <div style={{ marginBottom: '12px' }}>
                <strong>🕐 Datum/Tid:</strong> {new Date().toLocaleString('sv-SE')}
              </div>
              
              <div style={{ marginBottom: '12px' }}>
                <strong>🚗 Fordon:</strong> {carModel || 'Okänd modell'} | Mätare: {matarstallning} km
              </div>
              
              <div style={{ marginBottom: '12px' }}>
                <strong>⛽ Drivmedel:</strong> {drivmedelstyp === 'bensin_diesel' ? 'Bensin/Diesel' : 'Elbil'}
                {drivmedelstyp === 'bensin_diesel' && tankniva === 'pafylld_nu' && (
                  <span> | Påfylld: {liters}L {bransletyp}</span>
                )}
                {drivmedelstyp === 'elbil' && (
                  <span> | Laddning: {laddniva}%</span>
                )}
              </div>
              
              <div style={{ marginBottom: '12px' }}>
                <strong>🧽 Rengöring:</strong> Tvätt {tvatt ? 'genomförd' : 'ej genomförd'}, 
                Inre skick: {inre?.replace(/_/g, ' ') || 'ej angivet'}
              </div>
              
              {existingDamages.some(d => d.status !== 'not_selected') && (
                <div style={{ marginBottom: '12px' }}>
                  <strong>⚠️ Befintliga skador:</strong> {existingDamages.filter(d => d.status === 'documented').length} dokumenterade, 
                  {existingDamages.filter(d => d.status === 'fixed').length} åtgärdade
                </div>
              )}
              
              {newDamages.length > 0 && (
                <div style={{ marginBottom: '12px' }}>
                  <strong>🔴 Nya skador:</strong> {newDamages.length} st
                </div>
              )}
              
              <div style={{ marginBottom: '12px' }}>
                <strong>🔧 Status:</strong> {uthyrningsstatus?.replace(/_/g, ' ') || 'ej angivet'}
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={() => setShowFinalConfirmation(false)}
                style={{
                  padding: '12px 24px',
                  backgroundColor: '#6b7280',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '16px',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
              >
                Tillbaka
              </button>
              <button
                onClick={() => {
                  setShowFinalConfirmation(false);
                  setShowSuccessModal(true);
                }}
                style={{
                  padding: '12px 24px',
                  backgroundColor: '#10b981',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '16px',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
              >
                Bekräfta sparande
              </button>
            </div>
          </div>
        </div>
      )}
</div>
  );
}

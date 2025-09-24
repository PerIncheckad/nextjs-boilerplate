
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchDamageCard, normalizeReg } from '@/lib/damages';
import { notifyCheckin, renderCheckinEmail } from '@/lib/notify';

const normRegion = (r: any): 'Syd' | 'Mitt' | 'Norr' => {
  const s = String(r || '').toUpperCase();
  if (s === 'NORR') return 'Norr';
  if (s === 'MITT') return 'Mitt';
  return 'Syd';
};


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
  process.env.NEXT_PUBLIC_BILKONTROLL_MAIL || 'per.andersson@mabi.se';

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
const ORTER = ['Malmö', 'Helsingborg', 'Ängelholm', 'Halmstad', 'Falkenberg', 'Trelleborg', 'Varberg', 'Lund'];

const STATIONER: Record<string, string[]> = {
  'Malmö': [
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
// === Hjälpare för media-uppladdning ===
const BUCKET = "damage-photos";

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

function partitionMediaByType(files: MediaFile[]) {
  const photos: File[] = [];
  const videos: File[] = [];
  
  for (const mediaFile of files ?? []) {
    if (mediaFile.type === 'image') photos.push(mediaFile.file);
    else if (mediaFile.type === 'video') videos.push(mediaFile.file);
  }
  
  return { photos, videos };
}

async function uploadOne(
  file: File,
  reg: string,
  damageId: string
): Promise<string> {
  const ext = file.name.split(".").pop() || "bin";
  const base = file.name.replace(/\.[^/.]+$/, "");
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 7);
  
  const path = `${slugify(reg)}/${slugify(damageId)}/${ts}-${rand}-${slugify(base)}.${ext}`;
  
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: false,
    });
    
  if (error) throw error;
  
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

async function uploadAllForDamage(
  damage: { id: string; media: MediaFile[] },
  reg: string
): Promise<{ photo_urls: string[]; video_urls: string[] }> {
  const { photos, videos } = partitionMediaByType(damage.media || []);
  
  const photo_urls = await Promise.all(photos.map(f => uploadOne(f, reg, damage.id)));
  const video_urls = await Promise.all(videos.map(f => uploadOne(f, reg, damage.id)));
  
  return { photo_urls, video_urls };
}
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
  const [isFinalSaving, setIsFinalSaving] = useState(false);


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
  // Status per befintlig skada (om den dokumenterats eller markerats som åtgärdad/hittar inte)
const [documentedExisting, setDocumentedExisting] = useState<
  { id: string; status: 'documented' | 'resolved' | null; media: MediaFile[] }[]
>([]);
useEffect(() => {
  // Behåll tidigare status om den finns, annars initiera till null
  setDocumentedExisting(prev => {
    const prevMap = new Map(prev.map(p => [String(p.id), p]));
    return (existingDamages ?? []).map(d =>
      prevMap.get(String((d as any).id)) ?? { id: String((d as any).id), status: null, media: [] }
    );
  });
}, [existingDamages]);

  
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
      if (newDamages.some(damage => !damage.type || !damage.carPart)) return false;
      if (newDamages.some(damage => damage.carPart && CAR_PARTS[damage.carPart].length > 0 && !damage.position)) return false;
      if (newDamages.some(damage => !damage.media.some(m => m.type === 'image') || !damage.media.some(m => m.type === 'video'))) return false;
    }

    // Kontrollera dokumenterade gamla skador
    const documentedOldDamages = existingDamages.filter(d => d.status === 'documented');
// Beskrivning är nu frivillig - ta bort denna rad helt
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

const isStatusComplete = () => {
  const statusSet = String(uthyrningsstatus ?? '').trim().length > 0;
  // Kommentarer är frivilligt
  return statusSet;
};
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

  function markExistingAsDocumented(id: string | number) {
  setDocumentedExisting(curr =>
    curr.map(x => String(x.id) === String(id) ? { ...x, status: 'documented' } : x)
  );
}

function markExistingAsResolved(id: string | number) {
  setDocumentedExisting(curr =>
    curr.map(x => String(x.id) === String(id) ? { ...x, status: 'resolved' } : x)
  );
}

function getExistingStatus(id: string | number): 'documented' | 'resolved' | null {
  return documentedExisting.find(x => String(x.id) === String(id))?.status ?? null;
}

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
const handleSubmitFinal = async () => {
  if (isFinalSaving) return;
  setIsFinalSaving(true);
  console.log('[UI] Slutför incheckning klickad');

const regOk     = !!String((regInput ?? viewRow?.regnr ?? '')).trim();
const placeOk   = !!String((ort ?? viewRow?.ort ?? '')).trim();
const stationOk = !!String((station ?? viewRow?.station ?? '')).trim();

  if (!regOk || !placeOk || !stationOk) {
    setIsFinalSaving(false);
    alert('Fyll i registreringsnr, ort och station.');
    return;
  }

  try {
    await confirmFinalSave();
    // valfritt: visa egen modal/success-toast här
  } catch (e) {
    console.error('Final save failed:', e);
    alert('Något gick fel vid sparandet.');
  } finally {
    setIsFinalSaving(false);
  }
};


const confirmFinalSave = async () => {
  console.log('Sparar incheckning...');
  setShowFinalConfirmation(false);
  
  try {
    // Bestäm region
    const raw = (ORT_TILL_REGION?.[ort] || 'SYD').toString().toUpperCase();
    const region = raw === 'MITT' ? 'Mitt' : raw === 'NORR' ? 'Norr' : 'Syd';
    const regForMail = String(regInput || '').toUpperCase();
    
    // Kontrollera om mejl ska skickas
    const hasNewDamages = skadekontroll === 'nya_skador' && newDamages.length > 0;
    const needsRecond = tvatt !== 'behover_inte_tvattas' || inre === 'behover_rengoras_inuti';
    const hasIssues = !insynsskydd || spolarvatska === false || (drivmedelstyp === 'bensin_diesel' && adblue === false);
    
    // Dokumenterade befintliga skador (första gången de dokumenteras)
    const documentedExisting = existingDamages.filter(d => d.status === 'documented');
    const hasNewlyDocumented = documentedExisting.length > 0;
    
    // Skicka till Bilkontroll ENDAST om:
    // - Nya skador finns
    // - Befintliga skador dokumenterats (första gången)
    // - Behöver rekond
    // - Avvikelser finns
    const sendToBilkontroll = hasNewDamages || hasNewlyDocumented || needsRecond || hasIssues;
    
    // Skicka till Station om nya skador eller rekond behövs
    const sendToStation = hasNewDamages || needsRecond;
    
    // Bygg mejlinnehåll
    const htmlBody = `
      <h2>Incheckning ${regForMail}</h2>
      <p><b>Bilmodell:</b> ${carModel || 'Okänd'}</p>
      <p><b>Ort/Station:</b> ${ort} / ${station}</p>
      <p><b>Incheckare:</b> ${firstName}</p>
      <p><b>Mätarställning:</b> ${matarstallning} km</p>
      
      <h3>Tankstatus</h3>
      <p>${drivmedelstyp === 'elbil' 
        ? `Laddning: ${laddniva}%` 
        : `Tank: ${tankniva === 'fulltankad' ? 'Fulltankad' : 
            tankniva === 'pafylld_nu' ? `Påfylld ${liters}L ${bransletyp} (${literpris} kr/L)` : 
            'Tankas senare'}`}</p>
      
      ${hasNewlyDocumented ? `
        <h3>Befintliga skador (nyligen dokumenterade)</h3>
        <ul>
          ${documentedExisting.map(d => `
            <li>${d.userType || d.fullText} - ${d.userCarPart || ''} ${d.userPosition || ''}</li>
          `).join('')}
        </ul>
      ` : ''}
      
      ${hasNewDamages ? `
        <h3>NYA SKADOR</h3>
        <ul>
          ${newDamages.map(d => `
            <li><b>${d.type}</b> - ${d.carPart} ${d.position} - ${d.text}</li>
          `).join('')}
        </ul>
      ` : ''}
      
      ${needsRecond ? '<p><b>⚠️ BEHÖVER REKOND/TVÄTT</b></p>' : ''}
      ${hasIssues ? '<p><b>⚠️ AVVIKELSER: Kontrollera insynsskydd/vätskor</b></p>' : ''}
      
      <p><b>Kommentarer:</b> ${preliminarAvslutNotering || 'Inga'}</p>
    `;
    

    
// Spara till Supabase
    const checkinData = {
      regnr: regForMail,
      bilmodell: carModel,
      ort,
      station,
      incheckare: firstName,
      matarstallning: parseInt(matarstallning),
      drivmedelstyp,
      tankniva,
      laddniva: drivmedelstyp === 'elbil' ? parseInt(laddniva) : null,
      liters: tankniva === 'pafylld_nu' ? parseFloat(liters) : null,
      bransletyp: tankniva === 'pafylld_nu' ? bransletyp : null,
      literpris: tankniva === 'pafylld_nu' ? parseFloat(literpris) : null,
      hjultyp,
      spolarvatska,
      insynsskydd,
      adblue: drivmedelstyp === 'bensin_diesel' ? adblue : null,
      antal_laddkablar: drivmedelstyp === 'elbil' ? antalLaddkablar : null,
      tvatt,
      inre,
      skadekontroll,
      uthyrningsstatus,
      kommentarer: preliminarAvslutNotering,
      region,
      status: 'completed',
      created_at: new Date().toISOString()
    };
    
    const { data: checkin, error: checkinError } = await supabase
      .from('checkins')
      .insert(checkinData)
      .select()
      .single();
    
    if (checkinError) throw checkinError;
    
// Spara skador om de finns
if (checkin && checkin.id) {
  // Befintliga dokumenterade skador
  for (const damage of documentedExisting) {
    let photo_urls: string[] = [];
    let video_urls: string[] = [];

    if (damage.media && damage.media.length > 0) {
      const uploaded = await uploadAllForDamage(
        { id: (damage as any).id || `existing-${Date.now()}`, media: damage.media },
        regForMail
      );
      photo_urls = uploaded.photo_urls;
      video_urls = uploaded.video_urls;
    }

    await supabase.from('checkin_damages').insert({
      checkin_id: checkin.id,
      type: 'existing',
      damage_type: damage.userType || damage.fullText,
      car_part: damage.userCarPart,
      position: damage.userPosition,
      description: damage.userDescription,
      photo_urls,
      video_urls
    });
  }

  // Nya skador
  for (const damage of newDamages) {
    let photo_urls: string[] = [];
    let video_urls: string[] = [];

    if (damage.media && damage.media.length > 0) {
      const uploaded = await uploadAllForDamage(
        { id: (damage as any).id || `new-${Date.now()}`, media: damage.media },
        regForMail
      );
      photo_urls = uploaded.photo_urls;
      video_urls = uploaded.video_urls;
    }

    await supabase.from('checkin_damages').insert({
      checkin_id: checkin.id,
      type: 'new',
      damage_type: damage.type,
      car_part: damage.carPart,
      position: damage.position,
      description: damage.text,
      photo_urls,
      video_urls
    });
  }
} // <-- exakt EN stängning för if-blocket här


  } catch (e) {
    console.error('Fel vid sparande:', e);
    alert('Något gick fel vid sparandet.');
    return;
  }

  // Skicka mejl (servern väljer mottagare: Bilkontroll + Region)
await notifyCheckin({
  subjectBase: 'Incheckning',
  region,     // samma region-variabel du redan använder
  htmlBody,   // den färdiga HTML du redan bygger till mejlet
});

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
      {/* end: MediaUpload content wrapper */}
    </div>
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

return ( 
  <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', color: '#111827' }}>
    {!!sendMsg && (
      <span
        style={{
          marginLeft: 8,
          fontSize: 12,
          opacity: 0.95,
          color:
            sendState === 'ok' ? '#167d00' :
            sendState === 'fail' ? '#dc2626' :
            '#111827',
        }}
      >
        {sendMsg}
      </span>
    )}
    
    <div style={{
      maxWidth: '600px',
      margin: '0 auto',
      padding: '0 20px',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
{/* 1. REGISTRERINGSNUMMER */}
<div style={{
  backgroundColor: '#ffffff',
  padding: '24px',
  borderRadius: '12px',
  marginBottom: '24px',
  marginTop: '24px',
  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
  position: 'relative',
  border: showFieldErrors && !isRegComplete() ? '2px solid #dc2626' : '2px solid transparent'
}}>
        <h2 style={{
          fontSize: '22px',
          fontWeight: '700',
          marginBottom: '20px',
          color: '#1f2937',
          textTransform: 'uppercase',
          borderBottom: '2px solid #e5e7eb',
          paddingBottom: '12px'
        }}>
          Fordon
        </h2>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '16px' }}>
          Registreringsnummer *
        </label>
        <input
          type="text"
          value={regInput}
          onChange={(e) => handleRegInputChange(e.target.value)}
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
            border: '1px solid #e5e7eb',
            borderRadius: '6px',
            marginTop: '4px',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
            zIndex: 10
          }}>
            {suggestions.map(suggestion => (
              <div
                key={suggestion}
                onClick={() => selectSuggestion(suggestion)}
                style={{
                  padding: '10px 14px',
                  cursor: 'pointer',
                  borderBottom: '1px solid #f3f4f6',
                  fontSize: '16px',
                  fontWeight: '500'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ffffff'}
              >
                {suggestion}
              </div>
            ))}
          </div>
        )}
{carModel && (
          <div style={{
            marginTop: '16px',
            padding: '16px',
            backgroundColor: '#f0f9ff',
            borderRadius: '8px',
            border: '1px solid #bfdbfe'
          }}>
            <div style={{ marginBottom: '8px' }}>
              <span style={{ fontWeight: '600' }}>Bilmodell:</span> {carModel}
            </div>
            {wheelStorage && wheelStorage !== '---' && (
              <div style={{ marginBottom: '8px' }}>
                <span style={{ fontWeight: '600' }}>Hjulförvaring:</span> {wheelStorage}
              </div>
            )}
            {damages && damages.length > 0 && (
              <div>
                <span style={{ fontWeight: '600' }}>Befintliga skador:</span>
                <ul style={{ marginTop: '8px', marginLeft: '20px' }}>
                  {damages.map((damage, idx) => (
                    <li key={idx} style={{ marginBottom: '4px' }}>{damage}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )} 
</div>    </div>
    {/* 2. PLATS FÖR INCHECKNING */}
      <div style={{
        backgroundColor: '#ffffff',
        padding: '24px',
        borderRadius: '12px',
        marginBottom: '24px',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        border: showFieldErrors && !isLocationComplete() ? '2px solid #dc2626' : '2px solid transparent'
      }}>
        <h2 style={{
          fontSize: '22px',
          fontWeight: '700',
          marginBottom: '20px',
          color: '#1f2937',
          textTransform: 'uppercase',
          borderBottom: '2px solid #e5e7eb',
          paddingBottom: '12px'
        }}>
          Plats för incheckning
        </h2>
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
              style={{
                width: '100%',
                padding: '12px',
                border: showFieldErrors && !ort ? '2px solid #dc2626' : '2px solid #e5e7eb',
                borderRadius: '6px',
                fontSize: '16px',
                backgroundColor: '#ffffff'
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
              onChange={(e) => setStation(e.target.value)}
              disabled={!ort}
              style={{
                width: '100%',
                padding: '12px',
                border: showFieldErrors && !station ? '2px solid #dc2626' : '2px solid #e5e7eb',
                borderRadius: '6px',
                fontSize: '16px',
                backgroundColor: ort ? '#ffffff' : '#f9fafb',
                opacity: ort ? 1 : 0.6
              }}
            >
              <option value="">Välj station</option>
              {availableStations.map(stationOption => (
                <option key={stationOption} value={stationOption}>{stationOption}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

    <div style={{
        backgroundColor: '#ffffff',
        padding: '24px',
        borderRadius: '12px',
        marginBottom: '24px',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
      }}>
        <h2>Fordonsstatus</h2>
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>
            Mätarställning *
          </label>
          <input
            type="number"
            value={matarstallning}
            onChange={(e) => setMatarstallning(e.target.value)}
            placeholder="Ange mätarställning"
            style={{
              width: '100%',
              padding: '12px',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              fontSize: '16px'
            }}
          />
        </div>
        
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>
            Hjul som sitter på *
          </label>
          <select
            value={hjultyp || ''}
            onChange={(e) => setHjultyp(e.target.value as 'Sommardäck' | 'Vinterdäck' | null)}
            style={{
              width: '100%',
              padding: '12px',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              fontSize: '16px'
            }}
          >
            <option value="">Välj hjultyp</option>
            <option value="Sommardäck">Sommardäck</option>
            <option value="Vinterdäck">Vinterdäck</option>
          </select>
        </div>
      </div>
    <div style={{
        backgroundColor: '#ffffff',
        padding: '24px',
        borderRadius: '12px',
        marginBottom: '24px',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
      }}>
        <h2>Tankning/Laddning</h2>
        
        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontWeight: '600', marginBottom: '8px', display: 'block' }}>
            Drivmedelstyp *
          </label>
          <div style={{ display: 'flex', gap: '16px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="radio"
                name="drivmedel"
                checked={drivmedelstyp === 'bensin_diesel'}
                onChange={() => setDrivmedelstyp('bensin_diesel')}
              />
              Bensin/Diesel
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="radio"
                name="drivmedel"
                checked={drivmedelstyp === 'elbil'}
                onChange={() => setDrivmedelstyp('elbil')}
              />
              Elbil
            </label>
          </div>
        </div>

        {drivmedelstyp === 'bensin_diesel' && (
          <div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontWeight: '600', marginBottom: '8px', display: 'block' }}>
                Tankstatus *
              </label>
              <select
                value={tankniva || ''}
                onChange={(e) => setTankniva(e.target.value as any)}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  fontSize: '16px'
                }}
              >
                <option value="">Välj tankstatus</option>
                <option value="fulltankad">Fulltankad</option>
                <option value="tankas_senare">Tankas senare</option>
                <option value="pafylld_nu">Påfylld nu</option>
              </select>
            </div>

            {tankniva === 'pafylld_nu' && (
              <>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ fontWeight: '600', marginBottom: '8px', display: 'block' }}>
                    Antal liter *
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={liters}
                    onChange={(e) => setLiters(e.target.value)}
                    placeholder="0.0"
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '6px',
                      fontSize: '16px'
                    }}
                  />
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ fontWeight: '600', marginBottom: '8px', display: 'block' }}>
                    Literpris *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={literpris}
                    onChange={(e) => setLiterpris(e.target.value)}
                    placeholder="0.00"
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '6px',
                      fontSize: '16px'
                    }}
                  />
                </div>
              </>
            )}
          </div>
        )}

        {drivmedelstyp === 'elbil' && (
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontWeight: '600', marginBottom: '8px', display: 'block' }}>
              Laddningsnivå (%) *
            </label>
            <input
              type="number"
              min="0"
              max="100"
              value={laddniva}
              onChange={(e) => setLaddniva(e.target.value)}
              placeholder="0-100"
              style={{
                width: '100%',
                padding: '12px',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                fontSize: '16px'
              }}
            />
          </div>
        )}
      </div>
    <div style={{
        backgroundColor: '#ffffff',
        padding: '24px',
        borderRadius: '12px',
        marginBottom: '24px',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
      }}>
        <h2>Befintliga skador</h2>
        
        {existingDamages && existingDamages.length > 0 ? (
          <div>
            <p style={{ marginBottom: '16px', color: '#6b7280' }}>
              Dessa skador finns redan registrerade. Dokumentera dem med foto.
            </p>
            {existingDamages.map((damage) => (
              <div key={damage.id} style={{
                padding: '16px',
                marginBottom: '12px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                backgroundColor: damage.status === 'documented' ? '#f0fdf4' : '#f9fafb'
              }}>
                <div style={{ fontWeight: '600', marginBottom: '8px' }}>
                  {damage.fullText || damage.shortText}
                </div>
                
                <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
                  <button
                    onClick={() => toggleExistingDamageStatus(damage.id, 'documented')}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: damage.status === 'documented' ? '#10b981' : '#e5e7eb',
                      color: damage.status === 'documented' ? '#ffffff' : '#374151',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer'
                    }}
                  >
                    {damage.status === 'documented' ? 'Dokumenterad' : 'Dokumentera'}
                  </button>
                  <button
                  onClick={() => toggleExistingDamageStatus(damage.id, 'fixed')}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: damage.status === 'fixed' ? '#f59e0b' : '#e5e7eb',
                    color: damage.status === 'fixed' ? '#ffffff' : '#374151',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    marginLeft: '8px'
                  }}
                >
                  {damage.status === 'fixed' ? 'Åtgärdad ✓' : 'Åtgärdad/hittar inte'}
                </button>
                </div>

                {damage.status === 'documented' && (
                  <div style={{ marginTop: '12px' }}>
                    <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>
                      Foto krävs, video frivilligt
                    </p>
                    {/* Här kommer MediaUpload-komponenten senare */}
<MediaUpload

                      damageId={damage.id}
                      isOld={true}
                      onMediaUpdate={updateExistingDamageMedia}
                      hasImage={hasPhoto(damage.media)}
                      hasVideo={hasVideo(damage.media)}
                      videoRequired={false}
                    />
                    
                    {damage.media && damage.media.length > 0 && (
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' }}>
                        {damage.media.map((m, i) => (
                          <div key={i} style={{ position: 'relative' }}>
                            {m.type === 'image' && (
                              <img src={m.preview} alt="" style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '4px' }} />
                            )}
                            {m.type === 'video' && (
                              m.thumbnail ? 
                                <img src={m.thumbnail} alt="video" style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '4px' }} /> : 
                                <div style={{ width: '80px', height: '80px', backgroundColor: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px' }}>🎥</div>
                            )}
                            <button
                              onClick={() => removeExistingDamageMedia(damage.id, i)}
                              style={{
                                position: 'absolute',
                                top: '-8px',
                                right: '-8px',
                                width: '24px',
                                height: '24px',
                                borderRadius: '50%',
                                backgroundColor: '#dc2626',
                                color: '#ffffff',
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: '12px'
                              }}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                        <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', marginBottom: '4px' }}>Typ av skada *</label>
                  <select
                    value={damage.userType || ''}
                    onChange={(e) => updateExistingDamageType(damage.id, e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '4px'
                    }}
                  >
                    <option value="">Välj typ</option>
                    {DAMAGE_TYPES.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>

                {damage.userType && (
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', marginBottom: '4px' }}>Placering *</label>
                    <select
                      value={damage.userCarPart || ''}
                      onChange={(e) => updateExistingDamageCarPart(damage.id, e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '4px'
                      }}
                    >
                      <option value="">Välj placering</option>
                      {getRelevantCarParts(damage.userType).map(part => (
                        <option key={part} value={part}>{part}</option>
                      ))}
                    </select>
                  </div>
                )}

                {damage.userCarPart && CAR_PARTS[damage.userCarPart].length > 0 && (
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', marginBottom: '4px' }}>Detalj *</label>
                    <select
                      value={damage.userPosition || ''}
                      onChange={(e) => updateExistingDamagePosition(damage.id, e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '4px'
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
                  <label style={{ display: 'block', marginBottom: '4px' }}>Beskrivning *</label>
                  <textarea
                    value={damage.userDescription || ''}
                    onChange={(e) => updateExistingDamageDescription(damage.id, e.target.value)}
                    placeholder="Beskriv skadan..."
                    style={{
                      width: '100%',
                      padding: '8px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '4px',
                      minHeight: '60px'
                    }}
                  />
                </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: '#6b7280' }}>Inga befintliga skador registrerade för detta fordon.</p>
        )}
      </div>
    <div style={{
        backgroundColor: '#ffffff',
        padding: '24px',
        borderRadius: '12px',
        marginBottom: '24px',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
      }}>
        <h2>Nya skador</h2>
        
        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontWeight: '600' }}>
            <input
              type="radio"
              name="skadekontroll"
              checked={skadekontroll === 'inga_nya_skador'}
              onChange={() => setSkadekontroll('inga_nya_skador')}
            />
            Inga nya skador
          </label>
        </div>
        
        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontWeight: '600' }}>
            <input
              type="radio"
              name="skadekontroll"
              checked={skadekontroll === 'nya_skador'}
              onChange={() => setSkadekontroll('nya_skador')}
            />
            Nya skador
          </label>
        </div>

        {skadekontroll === 'nya_skador' && (
          <div>
            <button
              onClick={addDamage}
              style={{
                padding: '8px 16px',
                backgroundColor: '#3b82f6',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                marginBottom: '16px'
              }}
            >
              Lägg till ny skada
            </button>

            {newDamages.map((damage) => (
              <div key={damage.id} style={{
                padding: '16px',
                marginBottom: '16px',
                border: '2px solid #dc2626',
                borderRadius: '8px',
                backgroundColor: '#fef2f2'
              }}>
                <button
                  onClick={() => removeDamage(damage.id)}
                  style={{
                    float: 'right',
                    padding: '4px 8px',
                    backgroundColor: '#dc2626',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  Ta bort
                </button>
                
                <h4 style={{ marginBottom: '12px' }}>Ny skada</h4>
                
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', marginBottom: '4px' }}>Typ av skada *</label>
                  <select
                    value={damage.type}
                    onChange={(e) => updateDamageType(damage.id, e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '4px'
                    }}
                  >
                    <option value="">Välj typ</option>
                    {DAMAGE_TYPES.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>

                {damage.type && (
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', marginBottom: '4px' }}>Placering *</label>
                    <select
                      value={damage.carPart}
                      onChange={(e) => updateDamageCarPart(damage.id, e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '4px'
                      }}
                    >
                      <option value="">Välj placering</option>
                      {getRelevantCarParts(damage.type).map(part => (
                        <option key={part} value={part}>{part}</option>
                      ))}
                    </select>
                  </div>
                )}

                {damage.carPart && CAR_PARTS[damage.carPart].length > 0 && (
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', marginBottom: '4px' }}>Detalj *</label>
                    <select
                      value={damage.position}
                      onChange={(e) => updateDamagePosition(damage.id, e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '4px'
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
                  <label style={{ display: 'block', marginBottom: '4px' }}>Beskrivning *</label>
                  <textarea
                    value={damage.text}
                    onChange={(e) => updateDamageText(damage.id, e.target.value)}
                    placeholder="Beskriv skadan..."
                    style={{
                      width: '100%',
                      padding: '8px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '4px',
                      minHeight: '60px'
                    }}
                  />
                </div>

<MediaUpload
                  damageId={damage.id}
                  isOld={false}
                  onMediaUpdate={updateDamageMedia}
                  hasImage={hasPhoto(damage.media)}
                  hasVideo={hasVideo(damage.media)}
                  videoRequired={true}
                />
                
                {damage.media && damage.media.length > 0 && (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' }}>
                    {damage.media.map((m, i) => (
                      <div key={i} style={{ position: 'relative' }}>
                        {m.type === 'image' && (
                          <img src={m.preview} alt="" style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '4px' }} />
                        )}
                        {m.type === 'video' && (
                          m.thumbnail ? 
                            <img src={m.thumbnail} alt="video" style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '4px' }} /> : 
                            <div style={{ width: '80px', height: '80px', backgroundColor: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px' }}>🎥</div>
                        )}
                        <button
                          onClick={() => removeDamageMedia(damage.id, i)}
                          style={{
                            position: 'absolute',
                            top: '-8px',
                            right: '-8px',
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            backgroundColor: '#dc2626',
                            color: '#ffffff',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '12px'
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
          </div>
        )}
      </div>
    <div style={{
        backgroundColor: '#ffffff',
        padding: '24px',
        borderRadius: '12px',
        marginBottom: '24px',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
      }}>
        <h2>Övriga detaljer</h2>
        
        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontWeight: '600', marginBottom: '8px', display: 'block' }}>
            Spolarvätska påfylld?
          </label>
          <div style={{ display: 'flex', gap: '16px' }}>
            <label>
              <input
                type="radio"
                checked={spolarvatska === true}
                onChange={() => setSpolarvatska(true)}
              />
              Ja
            </label>
            <label>
              <input
                type="radio"
                checked={spolarvatska === false}
                onChange={() => setSpolarvatska(false)}
              />
              Nej
            </label>
          </div>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontWeight: '600', marginBottom: '8px', display: 'block' }}>
            AdBlue påfylld? (för dieselbilar)
          </label>
          <div style={{ display: 'flex', gap: '16px' }}>
            <label>
              <input
                type="radio"
                checked={adblue === true}
                onChange={() => setAdblue(true)}
              />
              Ja
            </label>
            <label>
              <input
                type="radio"
                checked={adblue === false}
                onChange={() => setAdblue(false)}
              />
              Nej
            </label>
            <label>
              <input
                type="radio"
                checked={adblue === null}
                onChange={() => setAdblue(null)}
              />
              Ej tillämpligt
            </label>
          </div>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontWeight: '600', marginBottom: '8px', display: 'block' }}>
            Kommentarer (frivilligt)
          </label>
          <textarea
            value={preliminarAvslutNotering || ''}
            onChange={(e) => setPreliminarAvslutNotering(e.target.value)}
            placeholder="Beskriv bilens status och eventuella kommentarer..."
            style={{
              width: '100%',
              padding: '12px',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              fontSize: '16px',
              minHeight: '80px'
            }}
          />
        </div>
      <div style={{
        backgroundColor: '#ffffff',
        padding: '24px',
        borderRadius: '12px',
        marginBottom: '24px',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        border: '2px solid #3b82f6'
      }}>
        <h2 style={{ color: '#3b82f6', marginBottom: '16px' }}>Kontrollista - Allt måste vara OK</h2>
        <div style={{ display: 'grid', gap: '12px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px' }}>
            <input type="checkbox" /> ✓ Insynsskydd OK
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px' }}>
            <input type="checkbox" /> ✓ Dekal djur OK
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px' }}>
            <input type="checkbox" /> ✓ Dekal rökning OK
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px' }}>
            <input type="checkbox" /> ✓ Isskrapa OK
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px' }}>
            <input type="checkbox" /> ✓ P-skiva OK
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px' }}>
            <input type="checkbox" /> ✓ Skylt reg.plåt OK
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px' }}>
            <input type="checkbox" /> ✓ Dekal GPS OK
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px' }}>
            <input type="checkbox" /> ✓ Bilen tvättad
          </label>
        </div>
        
        <div style={{ 
          marginTop: '16px', 
          padding: '12px', 
          backgroundColor: '#fef2f2', 
          borderRadius: '6px',
          border: '1px solid #dc2626'
        }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#dc2626', fontWeight: 'bold' }}>
            <input type="checkbox" /> ⚠️ Behöver rekond (straffavgift kan tillkomma)
          </label>
        </div>
      </div>
      </div>
    <div style={{
        marginTop: '40px',
        paddingTop: '24px',
        borderTop: '2px solid #e5e7eb',
        display: 'flex',
        gap: '12px',
        justifyContent: 'center'
      }}>
        <button
onClick={saveDraft}
          style={{
            padding: '12px 24px',
            backgroundColor: '#6b7280',
            color: '#ffffff',
            border: 'none',
            borderRadius: '6px',
            fontSize: '16px',
            fontWeight: '600',
            cursor: 'pointer'
          }}
        >
          Spara utkast
        </button>
        
<button
  id="btn-final"
  type="button"
  onClick={handleSubmitFinal}
  disabled={isFinalSaving}
  style={{
    padding: '12px 24px',
    backgroundColor: isFinalSaving ? '#16a34a80' : '#16a34a',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: isFinalSaving ? 'not-allowed' : 'pointer',
    opacity: isFinalSaving ? 0.85 : 1,
  }}
>
  {isFinalSaving ? 'Sparar…' : 'Slutför incheckning'}
</button>


        
        <button
          onClick={resetForm}
          style={{
            padding: '12px 24px',
            backgroundColor: '#dc2626',
            color: '#ffffff',
            border: 'none',
            borderRadius: '6px',
            fontSize: '16px',
            fontWeight: '600',
            cursor: 'pointer'
          }}
        >
          Avbryt
        </button>
      </div>
  </div>
);

}

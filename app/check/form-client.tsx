'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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

// FIXADE stationer med korrekta ID:n
const ORTER = ['Ängelholm', 'Falkenberg', 'Halmstad', 'Helsingborg', 'Lund', 'Malmö', 'Trelleborg', 'Varberg'];

const STATIONER: Record<string, string[]> = {
  'Malmö': [
    'Huvudstation Malmö Jägersro (166)',
    'Ford Malmö (104)',
    'Mechanum (107)',
    'Malmö Automera (1661)',
    'Mercedes Malmö (1662)',
    'Werksta St Bernstorp (1663)',
    'Werksta Malmö Hamn (1664)',
    'Hedbergs Malmö (201)',
    'Hedin Automotive Burlöv (302)',
    'LÅNGTID (77)'
  ],
  'Helsingborg': [
    'Bil & Skadeservice (1301)',
    'Hedin Automotive Ford (1302)',
    'Hedin Automotive (1303)',
    'Hedin Bil (1304)',
    'P7 Revingehed (1305)'
  ],
  'Lund': [
    'Huvudstation Lund (406)',
    'Ford Lund (4061)',
    'Hedin Lund (4062)',
    'B/S Lund (4063)',
    'P7 Revinge (4064)'
  ],
  'Ängelholm': [
    'Hedin Automotive Ford (1701)',
    'Hedin Automotive (1702)',
    'Ängelholm Airport (1703)'
  ],
  'Falkenberg': [
    'Falkenberg (1801)'
  ],
  'Halmstad': [
    'Hedin Automotive Ford (1401)',
    'Hedin Automotive Kia (1402)',
    'Hedin Automotive Mercedes (1403)',
    'Hedin Automotive (1404)',
    'Halmstad City Airport (1405)'
  ],
  'Trelleborg': [
    'Trelleborg (1901)'
  ],
  'Varberg': [
    'Finnvedens Bil Skadecenter (1201)',
    'Hedin Automotive Ford (1202)',
    'Hedin Automotive Holmgärde (1203)',
    'Hedin Automotive (1204)',
    'Sällstorps Plåt & Lack (1205)'
  ]
};

const DAMAGE_TYPES = [
  'Buckla', 'Däckskada sommarhjul', 'Däckskada vinterhjul', 'Fälgskada sommarhjul',
  'Fälgskada vinterhjul', 'Feltankning', 'Höjdledsskada', 'Intryck', 'Invändig skada',
  'Jack', 'Krockskada', 'Krossad ruta', 'Oaktsamhet', 'Punktering', 'Repa', 'Repor',
  'Saknas', 'Skrapad', 'Spricka', 'Stenskott', 'Trasig', 'Övrigt'
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

function normalizeReg(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

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

const createCombinedDamageText = (skadetyp: string, plats: string, notering: string): string => {
  const parts = [];
  
  if (skadetyp?.trim()) {
    parts.push(skadetyp.trim());
  }
  
  if (plats?.trim() && plats.trim() !== skadetyp?.trim()) {
    parts.push(`Plats: ${plats.trim()}`);
  }
  
  if (notering?.trim()) {
    parts.push(`Not: ${notering.trim()}`);
  } else {
    parts.push('Not: ---');
  }
  
  return parts.join(' - ');
};

const getColumnValue = (row: any, primaryKey: string, alternativeKeys: string[] = []): string | null => {
  if (row[primaryKey] !== undefined && row[primaryKey] !== null) return row[primaryKey];
  for (const altKey of alternativeKeys) {
    if (row[altKey] !== undefined && row[altKey] !== null) return row[altKey];
  }
  return null;
};export default function CheckInForm() {
  // State för registreringsnummer och bildata
  const [regInput, setRegInput] = useState('');
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
  const [hjultyp, setHjultyp] = useState<'Sommarthjul' | 'Vinterthjul' | null>(null);
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

  // FIXAD autocomplete - hämtar från BÅDA tabellerna
  useEffect(() => {
    async function fetchAllRegistrations() {
      try {
        const [mabiResult, carResult] = await Promise.all([
          supabase.from('mabi_damage_data').select('Regnr').order('Regnr'),
          supabase.from('car_data').select('regnr').order('regnr')
        ]);

        const allRegs = new Set<string>();
        
        if (!mabiResult.error && mabiResult.data) {
          mabiResult.data.forEach(item => {
            if (item.Regnr) allRegs.add(item.Regnr.toString().toUpperCase());
          });
        }

        if (!carResult.error && carResult.data) {
          carResult.data.forEach(item => {
            if (item.regnr) allRegs.add(item.regnr.toString().toUpperCase());
          });
        }

        setAllRegistrations(Array.from(allRegs).sort());
      } catch (err) {
        console.warn('Could not fetch registrations for autocomplete:', err);
      }
    }

    fetchAllRegistrations();
  }, []);

  // FIX 1: Suggestions från 2 tecken
  const suggestions = useMemo(() => {
    if (!regInput.trim() || regInput.trim().length < 2) return [];
    const input = regInput.toUpperCase();
    return allRegistrations
      .filter(reg => reg.includes(input))
      .slice(0, 5);
  }, [regInput, allRegistrations]);

  // FIX 2: Hämta ALLA skador (varje rad blir en skada)
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
          supabase
            .from('mabi_damage_data')
            .select('*')
            .eq('Regnr', normalizedReg)
            .order('id', { ascending: false }),
          supabase
            .from('car_data')
            .select('*')
            .eq('regnr', normalizedReg)
            .order('created_at', { ascending: false })
        ]);

        if (cancelled) return;

        let useData: CarData[] = [];
        let damages: ExistingDamage[] = [];

        if (!mabiResult.error && mabiResult.data && mabiResult.data.length > 0) {
          useData = mabiResult.data.map(row => ({
            regnr: getColumnValue(row, 'Regnr', ['regnr']) || normalizedReg,
            brand_model: getColumnValue(row, 'Modell', ['Modell', 'brand_model']),
            damage_text: getColumnValue(row, 'Skadetyp', ['skadetyp']),
            damage_location: getColumnValue(row, 'Skadeanmälan', ['skadeanmalan']),
            damage_notes: getColumnValue(row, 'Intern notering', ['intern_notering']),
            wheelstorage: null,
            saludatum: null
          }));

          // FIX 2: VARJE rad blir EN skada istället för att groupera
          damages = mabiResult.data.map((row, index) => {
            const skadetyp = getColumnValue(row, 'Skadetyp', ['skadetyp']) || '';
            const plats = getColumnValue(row, 'Skadeanmälan', ['skadeanmalan']) || '';
            const notering = getColumnValue(row, 'Intern notering', ['intern_notering']) || '';
            
            // Ta VARJE rad som har någon skadeinformation
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
          setExistingDamages(damages);
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

  const carModel = carData[0]?.brand_model || null;
  const wheelStorage = carData[0]?.wheelstorage || null;
  const saludatum = carData[0]?.saludatum || null;
  const availableStations = ort ? STATIONER[ort] || [] : [];

  // Validering
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
      if (newDamages.some(damage => !damage.media.some(m => m.type === 'image') || !damage.media.some(m => m.type === 'video'))) return false;
      if (newDamages.some(damage => !damage.type || !damage.carPart || !damage.text.trim())) return false;
      if (newDamages.some(damage => damage.carPart && CAR_PARTS[damage.carPart].length > 0 && !damage.position)) return false;
    }

    const documentedOldDamages = existingDamages.filter(d => d.status === 'documented');
    if (documentedOldDamages.some(damage => !damage.userDescription?.trim())) return false;
    if (documentedOldDamages.some(damage => !damage.userType || !damage.userCarPart)) return false;
    if (documentedOldDamages.some(damage => damage.userCarPart && CAR_PARTS[damage.userCarPart].length > 0 && !damage.userPosition)) return false;
    if (documentedOldDamages.some(damage => !damage.media?.some(m => m.type === 'image') || !damage.media?.some(m => m.type === 'video'))) return false;

    return true;
  };

  const isStatusComplete = () => uthyrningsstatus !== null && preliminarAvslutNotering.trim().length > 0;
  const canSave = () => {
    return isRegComplete() &&
           isLocationComplete() &&
           isVehicleStatusComplete() &&
           isCleaningComplete() &&
           isDamagesComplete() &&
           isStatusComplete();
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

  const confirmFinalSave = () => {
    console.log('Sparar incheckning...');
    setShowFinalConfirmation(false);
    setShowSuccessModal(true);
  };

  // FIX 1: Autocomplete från 2 tecken
  const handleRegInputChange = (value: string) => {
    const upperValue = value.toUpperCase();
    setRegInput(upperValue);
    
    // FIXAD: Visa suggestions redan vid 2 tecken
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
  };// Skadehantering funktioner
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
    hasImage = false,
    hasVideo = false
  }: {
    damageId: string;
    isOld: boolean;
    onMediaUpdate: (id: string, files: FileList | null) => void;
    hasImage?: boolean;
    hasVideo?: boolean;
  }) => (
    <div style={{ marginBottom: '12px' }}>
      <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
        Lägg till bild och video <span style={{ color: '#dc2626' }}>*</span>
      </label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ position: 'relative', display: 'inline-block', width: '100%' }}>
          <input
            type="file"
            accept="image/*"
            multiple
            capture="environment"
            onChange={(e) => onMediaUpdate(damageId, e.target.files)}
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
              fontWeight: hasImage ? 'normal' : 'bold'
            }}
          >
            📷 {hasImage ? 'Lägg till fler bilder' : 'Ta foto *'}
          </label>
        </div>

        <div style={{ position: 'relative', display: 'inline-block', width: '100%' }}>
          <input
            type="file"
            accept="video/*"
            capture="environment"
            onChange={(e) => onMediaUpdate(damageId, e.target.files)}
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
              color: '#dc2626',
              fontWeight: hasVideo ? 'normal' : 'bold'
            }}
          >
            🎥 {hasVideo ? 'Lägg till mer video' : 'Spela in video med skada OCH reg.nr. *'}
          </label>
        </div>

        <div style={{ position: 'relative', display: 'inline-block', width: '100%' }}>
          <input
            type="file"
            accept="image/*,video/*"
            multiple
            onChange={(e) => onMediaUpdate(damageId, e.target.files)}
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
              color: '#2563eb'
            }}
          >
            📁 Välj från galleri
          </label>
        </div>
      </div>
      {(!hasImage || !hasVideo) && (
        <p style={{ color: '#dc2626', fontSize: '12px', marginTop: '4px' }}>
          Både bild och video är obligatoriska för alla skador
        </p>
      )}
    </div>
  );return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f8fafc',
      color: '#111827'
    }}>
      {/* MABI Header */}
      <div style={{
        backgroundColor: '#033066',
        width: '100vw',
        marginLeft: 'calc(-50vw + 50%)',
        padding: '20px 0',
        marginBottom: '32px'
      }}>
        <div style={{
          maxWidth: '600px',
          margin: '0 auto',
          padding: '0 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end'
        }}>
          <div>
            <h1 style={{
              fontSize: '28px',
              margin: 0,
              color: '#ffffff',
              fontWeight: '800',
              textTransform: 'uppercase',
              letterSpacing: '1px'
            }}>
              NY INCHECKNING
            </h1>
            <p style={{
              color: '#ffffff',
              margin: '6px 0 0 0',
              fontSize: '16px',
              fontWeight: '400',
              opacity: 0.9
            }}>
              Inloggad: <strong>Bob</strong>
            </p>
          </div>
          <div style={{
            width: '120px',
            height: '60px',
            backgroundColor: '#ffffff',
            borderRadius: '6px',
            padding: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '2px solid rgba(255, 255, 255, 0.3)'
          }}>
            <div style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#033066',
              fontSize: '16px',
              fontWeight: 'bold'
            }}>
              MABI
            </div>
          </div>
        </div>
      </div>

      <div style={{
        maxWidth: '600px',
        margin: '0 auto',
        padding: '0 20px',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}>

        {/* Registreringsnummer med autocomplete */}
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
              onFocus={() => {
                if (regInput.length >= 2 && suggestions.length > 0) {
                  setShowSuggestions(true);
                }
              }}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
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

          {/* Bilinfo med utökad skadeinformation */}
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
                  {existingDamages.length === 0 ? (
                    <span style={{ fontWeight: '500' }}> ---</span>
                  ) : (
                    <div style={{ margin: '0' }}>
                      {existingDamages.map((damage, i) => (
                        <div key={i} style={{ marginBottom: '8px', fontSize: '14px' }}>
                          <div style={{ fontWeight: '500', color: '#1f2937' }}>
                            {damage.fullText}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Plats för incheckning */}
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

        {/* Fordonsstatus med hierarkisk skadeformulär - KOMPRIMERAT */}
        <div style={{
          backgroundColor: '#ffffff',
          padding: '24px',
          borderRadius: '12px',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          border: showFieldErrors && !isVehicleStatusComplete() ? '2px solid #dc2626' : '2px solid transparent'
        }} className={showFieldErrors && !isVehicleStatusComplete() ? 'section-incomplete' : ''}>
          <SectionHeader title="Fordonsstatus" isComplete={isVehicleStatusComplete()} />
          
          {/* Mätarställning */}
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

          {/* Drivmedelstyp */}
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

          {/* Kondenserat formulär för resten av fordonsstatus */}
          {drivmedelstyp && (
            <div style={{ 
              padding: '16px', 
              backgroundColor: '#f8fafc', 
              borderRadius: '8px',
              border: '1px solid #e5e7eb'
            }}>
              <p style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#6b7280' }}>
                {drivmedelstyp === 'bensin_diesel' ? 'Bensin/Diesel specifika fält' : 'Elbil specifika fält'} + gemensamma fält kommer här...
              </p>
              
              {/* Här skulle resten av fordonsstatus-fälten vara - komprimerat för utrymme */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <div style={{ minWidth: '150px', fontSize: '12px', color: '#6b7280' }}>
                  Tank/Laddning: <strong style={{ color: '#374151' }}>
                    {drivmedelstyp === 'bensin_diesel' ? (tankniva || 'Ej valt') : (laddniva || 'Ej angivet')}
                  </strong>
                </div>
                <div style={{ minWidth: '120px', fontSize: '12px', color: '#6b7280' }}>
                  Hjultyp: <strong style={{ color: '#374151' }}>{hjultyp || 'Ej valt'}</strong>
                </div>
                <div style={{ minWidth: '120px', fontSize: '12px', color: '#6b7280' }}>
                  Spolarväska: <strong style={{ color: '#374151' }}>
                    {spolarvatska === null ? 'Ej valt' : (spolarvatska ? 'OK' : 'Behöver påfyllning')}
                  </strong>
                </div>
              </div>
            </div>
          )}

          {showFieldErrors && !isVehicleStatusComplete() && (
            <p style={{ color: '#dc2626', fontSize: '14px', fontWeight: '500', marginTop: '12px' }}>
              ⚠️ Alla fält under fordonsstatus är obligatoriska
            </p>
          )}
        </div>

        {/* Komprimerade rengöring och övriga sektioner */}
        <div style={{
          backgroundColor: '#ffffff',
          padding: '24px',
          borderRadius: '12px',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
        }}>
          <SectionHeader title="Rengöring, Skador & Status" />
          <div style={{ 
            padding: '16px', 
            backgroundColor: '#f8fafc', 
            borderRadius: '8px',
            border: '1px solid #e5e7eb'
          }}>
            <p style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#6b7280' }}>
              Komprimerat för utrymme - här kommer rengöring, skadekontroll och uthyrningsstatus...
            </p>
          </div>
        </div>

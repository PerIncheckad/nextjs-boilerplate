'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// FIXAD getColumnValue för korrekt kolumnmappning
const getColumnValue = (row: any, primaryName: string, fallbacks: string[] = []) => {
  // Prova först det primära namnet
  if (row[primaryName] !== undefined && row[primaryName] !== null) {
    return String(row[primaryName]).trim() || null;
  }
  
  // Prova fallbacks
  for (const fallback of fallbacks) {
    if (row[fallback] !== undefined && row[fallback] !== null) {
      return String(row[fallback]).trim() || null;
    }
  }
  
  return null;
};

type CarData = {
  regnr: string;
  brand_model: string | null;
  damage_text: string | null;      // H: Skadetyp
  damage_detail: string | null;    // K: Skadeanmälan  
  damage_notes: string | null;     // M: Intern notering
  wheelstorage: string | null;
  saludatum: string | null;
};

type ExistingDamage = {
  id: string;
  shortText: string;
  detailText?: string;
  fullText: string;
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

type NewDamage = {
  id: string;
  type: string;
  carPart: string;
  position: string;
  description: string;
  media: MediaFile[];
};

// KORRIGERADE stationsnamn från "Stationer o Depåer Albarone"
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
    'Sturup'
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
  'Ängelholm': [
    'FORD Ängelholm',
    'Mekonomen Ängelholm',
    'Flyget Ängelholm'
  ],
  'Halmstad': [
    'Flyget Halmstad',
    'KIA Halmstad', 
    'FORD Halmstad'
  ],
  'Falkenberg': [],
  'Trelleborg': [],
  'Varberg': [
    'Ford Varberg',
    'Hedin Automotive Varberg',
    'Sällstorp lack plåt',
    'Finnveden plåt'
  ],
  'Lund': [
    'Ford Lund',
    'Hedin Lund',
    'B/S Lund', 
    'P7 Revinge'
  ]
};

const DAMAGE_TYPES = [
  'Buckla', 'Däckskada sommarhjul', 'Däckskada vinterhjul', 'Fälgskada sommarhjul',
  'Fälgskada vinterhjul', 'Feltankning', 'Höjdledsskada', 'Intryck', 'Invändig skada',
  'Jack', 'Krockskada', 'Krossad ruta', 'Oaktsamhet', 'Punktering', 'Repa',
  'Spricka', 'Stenskott', 'Trasig', 'Övrigt'
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

function normalizeReg(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// FIXAD funktion för att skapa combined text för befintliga skador
const createCombinedDamageText = (skadetyp: string, skadeanmalan: string, internNotering: string): string => {
  const parts: string[] = [];
  
  if (skadetyp) {
    parts.push(skadetyp);
  }
  
  if (skadeanmalan && skadeanmalan !== skadetyp) {
    parts.push(skadeanmalan);
  }
  
  if (internNotering && internNotering !== '---' && internNotering.trim()) {
    parts.push(`Intern not: ${internNotering}`);
  }
  
  return parts.join(' - ') || 'Okänd skada';
};export default function FormClient() {
  // State för registreringsnummer och bildata
  const [regInput, setRegInput] = useState('');
  const [carData, setCarData] = useState<CarData[]>([]);
  const [existingDamages, setExistingDamages] = useState<ExistingDamage[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  // State för formulärfält
  const [ort, setOrt] = useState('');
  const [station, setStation] = useState('');
  const [annanPlats, setAnnanPlats] = useState(false);
  const [annanPlatsText, setAnnanPlatsText] = useState('');
  const [matarstallning, setMatarstallning] = useState('');
  const [drivmedelstyp, setDrivmedelstyp] = useState<'bensin_diesel' | 'elbil' | null>(null);
  const [tankniva, setTankniva] = useState<'full' | 'pafylld_nu' | null>(null);
  const [liters, setLiters] = useState('');
  const [bransletyp, setBransletyp] = useState<'bensin' | 'diesel' | null>(null);
  const [laddniva, setLaddniva] = useState('');
  const [spolarvatska, setSpolarvatska] = useState<boolean | null>(null);
  const [insynsskydd, setInsynsskydd] = useState<boolean | null>(null);
  const [antalLaddkablar, setAntalLaddkablar] = useState<0 | 1 | 2 | null>(null);
  const [hjultyp, setHjultyp] = useState<'sommar' | 'vinter' | null>(null);
  const [adblue, setAdblue] = useState<boolean | null>(null);
  const [tvatt, setTvatt] = useState<boolean | null>(null);
  const [inre, setInre] = useState<'bra' | 'acceptabelt' | 'daligt' | null>(null);
  const [skadekontroll, setSkadekontroll] = useState<'inga_skador' | 'befintliga_skador' | 'nya_skador' | null>(null);
  const [newDamages, setNewDamages] = useState<NewDamage[]>([]);
  const [uthyrningsstatus, setUthyrningsstatus] = useState<'klar_tankad' | 'klar_otankad' | null>(null);
  const [preliminarAvslutNotering, setPreliminarAvslutNotering] = useState('');

  // UI state
  const [showFieldErrors, setShowFieldErrors] = useState(false);
  const [showFinalConfirmation, setShowFinalConfirmation] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [damageToFix, setDamageToFix] = useState<string | null>(null);

  const normalizedReg = useMemo(() => normalizeReg(regInput), [regInput]);

  // FIXAD autocomplete - startar vid 2 tecken istället för 3
  useEffect(() => {
    if (regInput.length >= 2) {
      const fetchSuggestions = async () => {
        try {
          const { data, error } = await supabase
            .from('mabi_damage_data')
            .select('Regnr')
            .ilike('Regnr', `${regInput}%`)
            .limit(10);

          if (!error && data) {
            const uniqueSuggestions = [...new Set(data.map(row => row.Regnr).filter(Boolean))];
            setSuggestions(uniqueSuggestions);
          }
        } catch (err) {
          console.error('Autocomplete error:', err);
        }
      };

      const timeoutId = setTimeout(fetchSuggestions, 300);
      return () => clearTimeout(timeoutId);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }, [regInput]);

  // FIXAD datahämtning - hämtar ALLA tre kolumner (H, K, M)
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
        // FIX 1: Läs från mabi_damage_data för rika skadedata
        const { data: mabiData, error: mabiError } = await supabase
          .from('mabi_damage_data')
          .select('*')
          .eq('Regnr', normalizedReg)
          .order('id', { ascending: false });

        if (cancelled) return;

        let useData: CarData[] = [];
        let damages: ExistingDamage[] = [];

        if (!mabiError && mabiData && mabiData.length > 0) {
          // Mappa från mabi_damage_data
          useData = mabiData.map(row => ({
            regnr: getColumnValue(row, 'Regnr', ['regnr']),
            brand_model: getColumnValue(row, 'Modell', ['Modell', 'brand_model']),
            damage_text: getColumnValue(row, 'Skadetyp', ['skadetyp']),
            damage_detail: getColumnValue(row, 'Skadeanmälan', ['skadeanmalan']),
            damage_notes: getColumnValue(row, 'Intern notering', ['intern_notering']),
            wheelstorage: null,
            saludatum: null
          }));

          // FIX 2: Skapa skador från ALLA TRE kolumner (H, K, M)
          damages = mabiData
            .filter(row => {
              const skadetyp = getColumnValue(row, 'Skadetyp', ['skadetyp']) || '';
              const skadeanmalan = getColumnValue(row, 'Skadeanmälan', ['skadeanmalan']) || '';
              const internNotering = getColumnValue(row, 'Intern notering', ['intern_notering']) || '';
              return skadetyp || skadeanmalan || internNotering;
            })
            .map((row, index) => {
              const skadetyp = getColumnValue(row, 'Skadetyp', ['skadetyp']) || '';
              const skadeanmalan = getColumnValue(row, 'Skadeanmälan', ['skadeanmalan']) || '';
              const internNotering = getColumnValue(row, 'Intern notering', ['intern_notering']) || '';
              
              const fullText = createCombinedDamageText(skadetyp, skadeanmalan, internNotering);
              
              return {
                id: `mabi-${index}`,
                shortText: skadetyp || skadeanmalan || 'Okänd skada',
                detailText: skadeanmalan !== skadetyp ? skadeanmalan : undefined,
                fullText,
                status: 'not_selected' as const,
                userType: '',
                userCarPart: '',
                userPosition: '',
                userDescription: '',
                media: []
              };
            });
        } else {
          // Om inte hittat i mabi_damage_data, sök i car_data
          const { data: carData, error: carError } = await supabase
            .from('car_data')
            .select('*')
            .eq('regnr', normalizedReg)
            .order('created_at', { ascending: false });

          if (!carError && carData && carData.length > 0) {
            const validData = carData.filter(row => row.wheelstorage !== null && row.saludatum !== null);
            useData = validData.length > 0 ? validData : carData;

            damages = useData
              .map((item, index) => {
                if (!item.damage_text) return null;

                const shortText = item.damage_text;
                const detailText = item.damage_detail || null;
                const fullText = detailText ? `${shortText} - ${detailText}` : shortText;

                return {
                  id: `existing-${index}`,
                  shortText,
                  detailText,
                  fullText,
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
  const availableStations = ort ? STATIONER[ort] || [] : [];// FIXAD validering - alla fält kontrolleras korrekt
  const isRegComplete = () => regInput.trim().length > 0;
  const isLocationComplete = () => annanPlats ? annanPlatsText.trim().length > 0 : (ort && station);
  const isVehicleStatusComplete = () => {
    if (!matarstallning.trim()) return false;
    if (drivmedelstyp === null) return false;
    
    if (drivmedelstyp === 'bensin_diesel') {
      if (tankniva === null) return false;
      if (tankniva === 'pafylld_nu' && (!liters.trim() || !bransletyp)) return false;
    }
    
    if (drivmedelstyp === 'elbil') {
      if (!laddniva.trim()) return false;
      const laddnivaParsed = parseInt(laddniva);
      if (isNaN(laddnivaParsed) || laddnivaParsed < 0 || laddnivaParsed > 100) return false;
    }
    
    return true;
  };

  const isCleaningComplete = () => {
    return spolarvatska !== null && insynsskydd !== null && antalLaddkablar !== null && 
           hjultyp !== null && adblue !== null && tvatt !== null && inre !== null;
  };

  const isDamageCheckComplete = () => {
    if (skadekontroll === null) return false;
    
    if (skadekontroll === 'befintliga_skador') {
      return existingDamages.some(d => d.status === 'documented' || d.status === 'fixed');
    }
    
    if (skadekontroll === 'nya_skador') {
      return newDamages.length > 0 && newDamages.every(d => 
        d.type && d.carPart && d.position && d.description.trim()
      );
    }
    
    return true; // 'inga_skador'
  };

  const isStatusComplete = () => {
    return uthyrningsstatus !== null && preliminarAvslutNotering.trim().length > 0;
  };

  // FIXAD canSave - alla sektioner måste vara kompletta
  const canSave = () => {
    console.log('=== VALIDERING ===');
    console.log('Reg complete:', isRegComplete());
    console.log('Location complete:', isLocationComplete());
    console.log('Vehicle status complete:', isVehicleStatusComplete());
    console.log('Cleaning complete:', isCleaningComplete());
    console.log('Damage check complete:', isDamageCheckComplete());
    console.log('Status complete:', isStatusComplete());
    
    return isRegComplete() && 
           isLocationComplete() && 
           isVehicleStatusComplete() && 
           isCleaningComplete() && 
           isDamageCheckComplete() && 
           isStatusComplete();
  };

  // FIXAD handleSave - med debug-logging
  const handleSave = () => {
    console.log('handleSave called');
    console.log('canSave():', canSave());
    
    if (canSave()) {
      console.log('Validering OK - visar final confirmation');
      setShowFinalConfirmation(true);
    } else {
      console.log('Validering misslyckades - visar fel');
      setShowFieldErrors(true);
      
      // Scrolla till första ofullständiga sektion
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
    console.log('Dokumenterade gamla skador:', existingDamages.filter(d => d.status === 'documented'));
    console.log('Åtgärdade gamla skador:', existingDamages.filter(d => d.status === 'fixed'));
    console.log('Nya skador:', newDamages);
    
    setShowFinalConfirmation(false);
    setShowSuccessModal(true);
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

  // Funktioner för autocomplete
  const handleRegInputChange = (value: string) => {
    setRegInput(value.toUpperCase());
    // FIXAD - visa suggestions redan från 2 tecken om det finns matches
    const shouldShow = value.length >= 2 && suggestions.length > 0;
    setShowSuggestions(shouldShow);
  };

  const selectSuggestion = (suggestion: string) => {
    setRegInput(suggestion);
    setShowSuggestions(false);
  };

  // Funktioner för befintliga skador
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
        d.id === damageToFix ? { ...d, status: 'fixed' as const } : d
      ));
      setDamageToFix(null);
      setShowConfirmDialog(false);
    }
  };

  const updateExistingDamageField = (id: string, field: keyof ExistingDamage, value: any) => {
    setExistingDamages(prev => prev.map(d =>
      d.id === id ? { ...d, [field]: value } : d
    ));
  };

  // Funktioner för nya skador
  const addNewDamage = () => {
    const newDamage: NewDamage = {
      id: `new-${Date.now()}`,
      type: '',
      carPart: '',
      position: '',
      description: '',
      media: []
    };
    setNewDamages(prev => [...prev, newDamage]);
  };

  const removeNewDamage = (id: string) => {
    setNewDamages(prev => prev.filter(d => d.id !== id));
  };

  const updateNewDamage = (id: string, field: keyof NewDamage, value: any) => {
    setNewDamages(prev => prev.map(d =>
      d.id === id ? { ...d, [field]: value } : d
    ));
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
    return CAR_PART_OPTIONS;
  };

  // Media-hantering
  const getFileType = (file: File): 'image' | 'video' => {
    return file.type.startsWith('image/') ? 'image' : 'video';
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
        resolve('');
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
  };return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f8fafc',
      padding: '16px'
    }}>
      <div style={{
        maxWidth: '800px',
        margin: '0 auto'
      }}>
        {/* Header */}
        <div style={{
          backgroundColor: '#ffffff',
          padding: '24px',
          borderRadius: '12px',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          textAlign: 'center'
        }}>
          <div style={{
            width: '120px',
            height: '40px',
            backgroundColor: '#033066',
            margin: '0 auto 16px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff',
            fontWeight: '600',
            fontSize: '18px'
          }}>
            MABI
          </div>
          <h1 style={{
            fontSize: '28px',
            fontWeight: '700',
            margin: '0 0 8px 0',
            color: '#1f2937'
          }}>
            Incheckning av fordon
          </h1>
          <p style={{
            color: '#6b7280',
            margin: '0',
            fontSize: '16px'
          }}>
            Fyll i alla obligatoriska fält för att slutföra incheckningen
          </p>
        </div>

        {/* Sektion 1: Fordon */}
        <div style={{
          backgroundColor: '#ffffff',
          padding: '24px',
          borderRadius: '12px',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
        }}>
          <h2 style={{
            fontSize: '20px',
            fontWeight: '600',
            marginBottom: '20px',
            color: '#1f2937'
          }}>
            Fordon
          </h2>

          <div style={{ position: 'relative', marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
              Registreringsnummer *
            </label>
            <input
              type="text"
              value={regInput}
              onChange={(e) => handleRegInputChange(e.target.value)}
              onFocus={() => setShowSuggestions(regInput.length >= 2 && suggestions.length > 0)}
              placeholder="Ange registreringsnummer"
              style={{
                width: '100%',
                padding: '12px',
                border: showFieldErrors && !isRegComplete() ? '2px solid #dc2626' : '1px solid #d1d5db',
                backgroundColor: showFieldErrors && !isRegComplete() ? '#fef2f2' : '#ffffff',
                borderRadius: '6px',
                fontSize: '16px'
              }}
            />
            
            {/* Autocomplete dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                backgroundColor: '#ffffff',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                zIndex: 10,
                maxHeight: '200px',
                overflowY: 'auto'
              }}>
                {suggestions.map((suggestion, index) => (
                  <div
                    key={index}
                    onClick={() => selectSuggestion(suggestion)}
                    style={{
                      padding: '12px',
                      cursor: 'pointer',
                      borderBottom: index < suggestions.length - 1 ? '1px solid #e5e7eb' : 'none'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#f3f4f6';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '#ffffff';
                    }}
                  >
                    {suggestion}
                  </div>
                ))}
              </div>
            )}
          </div>

          {loading && (
            <p style={{ color: '#6b7280', fontStyle: 'italic' }}>
              Söker fordonsinformation...
            </p>
          )}

          {notFound && regInput && (
            <p style={{ color: '#dc2626', fontWeight: '500' }}>
              ⚠️ Okänt registreringsnummer
            </p>
          )}

          {carModel && (
            <div style={{
              backgroundColor: '#f0f9ff',
              padding: '16px',
              borderRadius: '8px',
              marginBottom: '16px'
            }}>
              <p style={{ margin: '0 0 8px 0', fontWeight: '500' }}>
                <strong>Bilmodell:</strong> {carModel}
              </p>
              {wheelStorage && (
                <p style={{ margin: '0 0 8px 0' }}>
                  <strong>Hjulförvaring:</strong> {wheelStorage}
                </p>
              )}
              {saludatum && (
                <p style={{ margin: '0' }}>
                  <strong>Saludatum:</strong> {saludatum}
                </p>
              )}
            </div>
          )}

          {/* Befintliga skador */}
          {existingDamages.length > 0 && (
            <div style={{
              backgroundColor: '#fffbeb',
              padding: '16px',
              borderRadius: '8px',
              marginBottom: '16px'
            }}>
              <h3 style={{
                fontSize: '16px',
                fontWeight: '600',
                marginBottom: '12px',
                color: '#92400e'
              }}>
                Befintliga skador ({existingDamages.length})
              </h3>
              {existingDamages.map((damage) => (
                <div key={damage.id} style={{
                  padding: '8px 0',
                  borderBottom: '1px solid #fde68a'
                }}>
                  <p style={{ margin: '0', fontSize: '14px' }}>
                    {damage.fullText}
                  </p>
                </div>
              ))}
            </div>
          )}

          {showFieldErrors && !isRegComplete() && (
            <p style={{ color: '#dc2626', fontSize: '14px', fontWeight: '500' }}>
              ⚠️ Registreringsnummer är obligatoriskt
            </p>
          )}
        </div>

        {/* Sektion 2: Plats */}
        <div style={{
          backgroundColor: '#ffffff',
          padding: '24px',
          borderRadius: '12px',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
        }}>
          <h2 style={{
            fontSize: '20px',
            fontWeight: '600',
            marginBottom: '20px',
            color: '#1f2937'
          }}>
            Plats för incheckning
          </h2>

          <div style={{ marginBottom: '16px' }}>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              marginBottom: '12px',
              fontSize: '14px'
            }}>
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
                style={{ marginRight: '8px' }}
              />
              Annan plats (fritext)
            </label>

            {annanPlats ? (
              <input
                type="text"
                value={annanPlatsText}
                onChange={(e) => setAnnanPlatsText(e.target.value)}
                placeholder="Beskriv platsen för incheckning"
                style={{
                  width: '100%',
                  padding: '12px',
                  border: showFieldErrors && !isLocationComplete() ? '2px solid #dc2626' : '1px solid #d1d5db',
                  backgroundColor: showFieldErrors && !isLocationComplete() ? '#fef2f2' : '#ffffff',
                  borderRadius: '6px',
                  fontSize: '16px'
                }}
              />
            ) : (
              <>
                <div style={{ marginBottom: '16px' }}>
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
                      border: showFieldErrors && !isLocationComplete() ? '2px solid #dc2626' : '1px solid #d1d5db',
                      backgroundColor: showFieldErrors && !isLocationComplete() ? '#fef2f2' : '#ffffff',
                      borderRadius: '6px',
                      fontSize: '16px'
                    }}
                  >
                    <option value="">Välj ort</option>
                    {ORTER.map(ortName => (
                      <option key={ortName} value={ortName}>{ortName}</option>
                    ))}
                  </select>
                </div>

                {ort && (
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
                      Station/Depå *
                    </label>
                    <select
                      value={station}
                      onChange={(e) => setStation(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '12px',
                        border: showFieldErrors && !isLocationComplete() ? '2px solid #dc2626' : '1px solid #d1d5db',
                        backgroundColor: showFieldErrors && !isLocationComplete() ? '#fef2f2' : '#ffffff',
                        borderRadius: '6px',
                        fontSize: '16px'
                      }}
                    >
                      <option value="">Välj station/depå</option>
                      {availableStations.map(stationName => (
                        <option key={stationName} value={stationName}>{stationName}</option>
                      ))}
                    </select>
                  </div>
                )}
              </>
            )}
          </div>

          {showFieldErrors && !isLocationComplete() && (
            <p style={{ color: '#dc2626', fontSize: '14px', fontWeight: '500' }}>
              ⚠️ Ort och station/depå eller annan plats är obligatorisk
            </p>
          )}
        </div>

        {/* Sektion 3: Fordonsstatus */}
        <div className={`${showFieldErrors && !isVehicleStatusComplete() ? 'section-incomplete' : ''}`} style={{
          backgroundColor: '#ffffff',
          padding: '24px',
          borderRadius: '12px',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
        }}>
          <h2 style={{
            fontSize: '20px',
            fontWeight: '600',
            marginBottom: '20px',
            color: '#1f2937'
          }}>
            Fordonsstatus
          </h2>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
              Mätarställning *
            </label>
            <input
              type="text"
              value={matarstallning}
              onChange={(e) => setMatarstallning(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="Ange kilometerställning"
              style={{
                width: '100%',
                padding: '12px',
                border: showFieldErrors && !matarstallning.trim() ? '2px solid #dc2626' : '1px solid #d1d5db',
                backgroundColor: showFieldErrors && !matarstallning.trim() ? '#fef2f2' : '#ffffff',
                borderRadius: '6px',
                fontSize: '16px'
              }}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
              Drivmedelstyp *
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setDrivmedelstyp('bensin_diesel')}
                style={{
                  padding: '10px 16px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  backgroundColor: drivmedelstyp === 'bensin_diesel' ? '#dbeafe' : '#ffffff',
                  color: drivmedelstyp === 'bensin_diesel' ? '#1e40af' : '#374151',
                  cursor: 'pointer'
                }}
              >
                Bensin/Diesel
              </button>
              <button
                type="button"
                onClick={() => setDrivmedelstyp('elbil')}
                style={{
                  padding: '10px 16px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  backgroundColor: drivmedelstyp === 'elbil' ? '#dbeafe' : '#ffffff',
                  color: drivmedelstyp === 'elbil' ? '#1e40af' : '#374151',
                  cursor: 'pointer'
                }}
              >
                Elbil
              </button>
            </div>
          </div>

          {drivmedelstyp === 'bensin_diesel' && (
            <>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
                  Tanknivå *
                </label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => setTankniva('full')}
                    style={{
                      padding: '10px 16px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      backgroundColor: tankniva === 'full' ? '#dbeafe' : '#ffffff',
                      color: tankniva === 'full' ? '#1e40af' : '#374151',
                      cursor: 'pointer'
                    }}
                  >
                    Fulltankad
                  </button>
                  <button
                    type="button"
                    onClick={() => setTankniva('pafylld_nu')}
                    style={{
                      padding: '10px 16px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      backgroundColor: tankniva === 'pafylld_nu' ? '#dbeafe' : '#ffffff',
                      color: tankniva === 'pafylld_nu' ? '#1e40af' : '#374151',
                      cursor: 'pointer'
                    }}
                  >
                    Påfylld nu
                  </button>
                </div>
              </div>

              {tankniva === 'pafylld_nu' && (
                <>
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
                      Antal liter påfyllda *
                    </label>
                    <input
                      type="text"
                      value={liters}
                      onChange={(e) => {
                        const value = e.target.value.replace(/[^0-9,]/g, '');
                        setLiters(value);
                      }}
                      placeholder="t.ex. 25,5"
                      style={{
                        width: '100%',
                        padding: '12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '16px'
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
                      Bränsletyp *
                    </label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() => setBransletyp('bensin')}
                        style={{
                          padding: '10px 16px',
                          border: '1px solid #d1d5db',
                          borderRadius: '6px',
                          backgroundColor: bransletyp === 'bensin' ? '#dbeafe' : '#ffffff',
                          color: bransletyp === 'bensin' ? '#1e40af' : '#374151',
                          cursor: 'pointer'
                        }}
                      >
                        Bensin
                      </button>
                      <button
                        type="button"
                        onClick={() => setBransletyp('diesel')}
                        style={{
                          padding: '10px 16px',
                          border: '1px solid #d1d5db',
                          borderRadius: '6px',
                          backgroundColor: bransletyp === 'diesel' ? '#dbeafe' : '#ffffff',
                          color: bransletyp === 'diesel' ? '#1e40af' : '#374151',
                          cursor: 'pointer'
                        }}
                      >
                        Diesel
                      </button>
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {drivmedelstyp === 'elbil' && (
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
                Laddnivå (%) *
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
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '16px'
                }}
              />
            </div>
          )}

          {showFieldErrors && !isVehicleStatusComplete() && (
            <p style={{ color: '#dc2626', fontSize: '14px', fontWeight: '500' }}>
              ⚠️ Alla fordonsstatus-fält är obligatoriska
            </p>
          )}
        </div>{/* Sektion 4: Rengöring */}
        <div className={`${showFieldErrors && !isCleaningComplete() ? 'section-incomplete' : ''}`} style={{
          backgroundColor: '#ffffff',
          padding: '24px',
          borderRadius: '12px',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
        }}>
          <h2 style={{
            fontSize: '20px',
            fontWeight: '600',
            marginBottom: '20px',
            color: '#1f2937'
          }}>
            Rengöring
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
                Spolarvätska OK? *
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setSpolarvatska(true)}
                  style={{
                    padding: '8px 16px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    backgroundColor: spolarvatska === true ? '#dcfce7' : '#ffffff',
                    color: spolarvatska === true ? '#166534' : '#374151',
                    cursor: 'pointer'
                  }}
                >
                  Ja
                </button>
                <button
                  type="button"
                  onClick={() => setSpolarvatska(false)}
                  style={{
                    padding: '8px 16px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    backgroundColor: spolarvatska === false ? '#fef2f2' : '#ffffff',
                    color: spolarvatska === false ? '#dc2626' : '#374151',
                    cursor: 'pointer'
                  }}
                >
                  Nej
                </button>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
                Insynsskydd OK? *
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setInsynsskydd(true)}
                  style={{
                    padding: '8px 16px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    backgroundColor: insynsskydd === true ? '#dcfce7' : '#ffffff',
                    color: insynsskydd === true ? '#166534' : '#374151',
                    cursor: 'pointer'
                  }}
                >
                  Ja
                </button>
                <button
                  type="button"
                  onClick={() => setInsynsskydd(false)}
                  style={{
                    padding: '8px 16px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    backgroundColor: insynsskydd === false ? '#fef2f2' : '#ffffff',
                    color: insynsskydd === false ? '#dc2626' : '#374151',
                    cursor: 'pointer'
                  }}
                >
                  Nej
                </button>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
                Antal laddsladdar *
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {[0, 1, 2].map(num => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setAntalLaddkablar(num as 0 | 1 | 2)}
                    style={{
                      padding: '8px 16px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      backgroundColor: antalLaddkablar === num ? '#dbeafe' : '#ffffff',
                      color: antalLaddkablar === num ? '#1e40af' : '#374151',
                      cursor: 'pointer'
                    }}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
                Hjultyp *
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setHjultyp('sommar')}
                  style={{
                    padding: '8px 16px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    backgroundColor: hjultyp === 'sommar' ? '#dbeafe' : '#ffffff',
                    color: hjultyp === 'sommar' ? '#1e40af' : '#374151',
                    cursor: 'pointer'
                  }}
                >
                  Sommar
                </button>
                <button
                  type="button"
                  onClick={() => setHjultyp('vinter')}
                  style={{
                    padding: '8px 16px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    backgroundColor: hjultyp === 'vinter' ? '#dbeafe' : '#ffffff',
                    color: hjultyp === 'vinter' ? '#1e40af' : '#374151',
                    cursor: 'pointer'
                  }}
                >
                  Vinter
                </button>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
                AdBlue OK? *
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setAdblue(true)}
                  style={{
                    padding: '8px 16px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    backgroundColor: adblue === true ? '#dcfce7' : '#ffffff',
                    color: adblue === true ? '#166534' : '#374151',
                    cursor: 'pointer'
                  }}
                >
                  Ja
                </button>
                <button
                  type="button"
                  onClick={() => setAdblue(false)}
                  style={{
                    padding: '8px 16px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    backgroundColor: adblue === false ? '#fef2f2' : '#ffffff',
                    color: adblue === false ? '#dc2626' : '#374151',
                    cursor: 'pointer'
                  }}
                >
                  Nej
                </button>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
                Tvätt genomförd? *
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setTvatt(true)}
                  style={{
                    padding: '8px 16px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    backgroundColor: tvatt === true ? '#dcfce7' : '#ffffff',
                    color: tvatt === true ? '#166534' : '#374151',
                    cursor: 'pointer'
                  }}
                >
                  Ja
                </button>
                <button
                  type="button"
                  onClick={() => setTvatt(false)}
                  style={{
                    padding: '8px 16px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    backgroundColor: tvatt === false ? '#fef2f2' : '#ffffff',
                    color: tvatt === false ? '#dc2626' : '#374151',
                    cursor: 'pointer'
                  }}
                >
                  Nej
                </button>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
                Inre skick *
              </label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setInre('bra')}
                  style={{
                    padding: '8px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    backgroundColor: inre === 'bra' ? '#dcfce7' : '#ffffff',
                    color: inre === 'bra' ? '#166534' : '#374151',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                >
                  Bra
                </button>
                <button
                  type="button"
                  onClick={() => setInre('acceptabelt')}
                  style={{
                    padding: '8px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    backgroundColor: inre === 'acceptabelt' ? '#fef3c7' : '#ffffff',
                    color: inre === 'acceptabelt' ? '#92400e' : '#374151',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                >
                  Acceptabelt
                </button>
                <button
                  type="button"
                  onClick={() => setInre('daligt')}
                  style={{
                    padding: '8px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    backgroundColor: inre === 'daligt' ? '#fef2f2' : '#ffffff',
                    color: inre === 'daligt' ? '#dc2626' : '#374151',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                >
                  Dåligt
                </button>
              </div>
            </div>
          </div>

          {showFieldErrors && !isCleaningComplete() && (
            <p style={{ color: '#dc2626', fontSize: '14px', fontWeight: '500', marginTop: '16px' }}>
              ⚠️ Alla rengöringsfält är obligatoriska
            </p>
          )}
        </div>

        {/* Sektion 5: Skadekontroll */}
        <div className={`${showFieldErrors && !isDamageCheckComplete() ? 'section-incomplete' : ''}`} style={{
          backgroundColor: '#ffffff',
          padding: '24px',
          borderRadius: '12px',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
        }}>
          <h2 style={{
            fontSize: '20px',
            fontWeight: '600',
            marginBottom: '20px',
            color: '#1f2937'
          }}>
            Skadekontroll
          </h2>

          {/* Befintliga skador sektion */}
          {existingDamages.length > 0 && (
            <div style={{
              backgroundColor: '#fef7cd',
              padding: '16px',
              borderRadius: '8px',
              marginBottom: '20px'
            }}>
              <h3 style={{
                fontSize: '16px',
                fontWeight: '600',
                marginBottom: '16px',
                color: '#92400e'
              }}>
                Befintliga skador ({existingDamages.length})
              </h3>
              
              {existingDamages.map((damage) => (
                <div key={damage.id} style={{
                  backgroundColor: '#ffffff',
                  padding: '12px',
                  borderRadius: '6px',
                  marginBottom: '8px',
                  border: '1px solid #fde68a'
                }}>
                  <p style={{ margin: '0 0 8px 0', fontWeight: '500' }}>
                    {damage.fullText}
                  </p>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => toggleExistingDamageStatus(damage.id, 'documented')}
                      style={{
                        padding: '6px 12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        backgroundColor: damage.status === 'documented' ? '#dbeafe' : '#ffffff',
                        color: damage.status === 'documented' ? '#1e40af' : '#374151',
                        cursor: 'pointer',
                        fontSize: '14px'
                      }}
                    >
                      {damage.status === 'documented' ? 'Dokumenterad ✓' : 'Dokumentera'}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleExistingDamageStatus(damage.id, 'fixed')}
                      style={{
                        padding: '6px 12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        backgroundColor: damage.status === 'fixed' ? '#dcfce7' : '#ffffff',
                        color: damage.status === 'fixed' ? '#166534' : '#374151',
                        cursor: 'pointer',
                        fontSize: '14px'
                      }}
                    >
                      {damage.status === 'fixed' ? 'Åtgärdad ✓' : 'Markera som åtgärdad'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
              Skadekontroll *
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setSkadekontroll('inga_skador')}
                style={{
                  padding: '10px 16px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  backgroundColor: skadekontroll === 'inga_skador' ? '#dcfce7' : '#ffffff',
                  color: skadekontroll === 'inga_skador' ? '#166534' : '#374151',
                  cursor: 'pointer'
                }}
              >
                Inga skador
              </button>
              {existingDamages.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSkadekontroll('befintliga_skador')}
                  style={{
                    padding: '10px 16px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    backgroundColor: skadekontroll === 'befintliga_skador' ? '#fef3c7' : '#ffffff',
                    color: skadekontroll === 'befintliga_skador' ? '#92400e' : '#374151',
                    cursor: 'pointer'
                  }}
                >
                  Befintliga skador
                </button>
              )}
              <button
                type="button"
                onClick={() => setSkadekontroll('nya_skador')}
                style={{
                  padding: '10px 16px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  backgroundColor: skadekontroll === 'nya_skador' ? '#fef2f2' : '#ffffff',
                  color: skadekontroll === 'nya_skador' ? '#dc2626' : '#374151',
                  cursor: 'pointer'
                }}
              >
                Nya skador
              </button>
            </div>
          </div>

          {skadekontroll === 'nya_skador' && (
            <div style={{
              backgroundColor: '#fef2f2',
              padding: '16px',
              borderRadius: '8px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '600', margin: '0', color: '#dc2626' }}>
                  Nya skador
                </h3>
                <button
                  type="button"
                  onClick={addNewDamage}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#dc2626',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                >
                  Lägg till skada
                </button>
              </div>

              {newDamages.map((damage) => (
                <div key={damage.id} style={{
                  backgroundColor: '#ffffff',
                  padding: '16px',
                  borderRadius: '6px',
                  marginBottom: '12px',
                  border: '1px solid #fecaca'
                }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '12px' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: '500' }}>
                        Skadetyp *
                      </label>
                      <select
                        value={damage.type}
                        onChange={(e) => updateNewDamage(damage.id, 'type', e.target.value)}
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
                        Bildel *
                      </label>
                      <select
                        value={damage.carPart}
                        onChange={(e) => {
                          updateNewDamage(damage.id, 'carPart', e.target.value);
                          updateNewDamage(damage.id, 'position', '');
                        }}
                        style={{
                          width: '100%',
                          padding: '8px',
                          border: '1px solid #d1d5db',
                          borderRadius: '4px',
                          fontSize: '14px'
                        }}
                      >
                        <option value="">Välj bildel</option>
                        {(damage.type ? getRelevantCarParts(damage.type) : CAR_PART_OPTIONS).map(part => (
                          <option key={part} value={part}>{part}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: '500' }}>
                        Position *
                      </label>
                      <select
                        value={damage.position}
                        onChange={(e) => updateNewDamage(damage.id, 'position', e.target.value)}
                        disabled={!damage.carPart}
                        style={{
                          width: '100%',
                          padding: '8px',
                          border: '1px solid #d1d5db',
                          borderRadius: '4px',
                          fontSize: '14px',
                          opacity: !damage.carPart ? 0.5 : 1
                        }}
                      >
                        <option value="">Välj position</option>
                        {damage.carPart && CAR_PARTS[damage.carPart]?.map(pos => (
                          <option key={pos} value={pos}>{pos}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: '500' }}>
                      Beskrivning *
                    </label>
                    <textarea
                      value={damage.description}
                      onChange={(e) => updateNewDamage(damage.id, 'description', e.target.value)}
                      placeholder="Beskriv skadan detaljerat..."
                      rows={2}
                      style={{
                        width: '100%',
                        padding: '8px',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '14px',
                        resize: 'vertical'
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <input
                        type="file"
                        multiple
                        accept="image/*,video/*"
                        onChange={async (e) => {
                          if (e.target.files) {
                            const files = Array.from(e.target.files);
                            const mediaFiles = await processFiles(files);
                            updateNewDamage(damage.id, 'media', [...damage.media, ...mediaFiles]);
                          }
                        }}
                        style={{ display: 'none' }}
                        id={`file-${damage.id}`}
                      />
                      <label
                        htmlFor={`file-${damage.id}`}
                        style={{
                          padding: '8px 12px',
                          backgroundColor: '#3b82f6',
                          color: '#ffffff',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '14px',
                          display: 'inline-block'
                        }}
                      >
                        Lägg till bild/video
                      </label>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeNewDamage(damage.id)}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#ef4444',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '14px'
                      }}
                    >
                      Ta bort
                    </button>
                  </div>

                  {damage.media.length > 0 && (
                    <div style={{ marginTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {damage.media.map((media, index) => (
                        <div key={index} style={{ position: 'relative' }}>
                          {media.type === 'image' ? (
                            <img
                              src={media.preview}
                              alt="Skadebild"
                              style={{
                                width: '80px',
                                height: '80px',
                                objectFit: 'cover',
                                borderRadius: '4px',
                                border: '1px solid #d1d5db'
                              }}
                            />
                          ) : (
                            <div style={{
                              width: '80px',
                              height: '80px',
                              backgroundColor: '#f3f4f6',
                              borderRadius: '4px',
                              border: '1px solid #d1d5db',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '12px'
                            }}>
                              📹 Video
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              const newMedia = damage.media.filter((_, i) => i !== index);
                              updateNewDamage(damage.id, 'media', newMedia);
                            }}
                            style={{
                              position: 'absolute',
                              top: '-4px',
                              right: '-4px',
                              width: '20px',
                              height: '20px',
                              borderRadius: '50%',
                              backgroundColor: '#ef4444',
                              color: '#ffffff',
                              border: 'none',
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
            </div>
          )}

          {showFieldErrors && !isDamageCheckComplete() && (
            <p style={{ color: '#dc2626', fontSize: '14px', fontWeight: '500' }}>
              ⚠️ Skadekontroll är obligatorisk
            </p>
          )}
        </div>

        {/* Sektion 6: Uthyrningsstatus */}
        <div className={`${showFieldErrors && !isStatusComplete() ? 'section-incomplete' : ''}`} style={{
          backgroundColor: '#ffffff',
          padding: '24px',
          borderRadius: '12px',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
        }}>
          <h2 style={{
            fontSize: '20px',
            fontWeight: '600',
            marginBottom: '20px',
            color: '#1f2937'
          }}>
            Uthyrningsstatus
          </h2>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
              Status *
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setUthyrningsstatus('klar_tankad')}
                style={{
                  padding: '10px 16px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  backgroundColor: uthyrningsstatus === 'klar_tankad' ? '#dcfce7' : '#ffffff',
                  color: uthyrningsstatus === 'klar_tankad' ? '#166534' : '#374151',
                  cursor: 'pointer'
                }}
              >
                Klar tankad
              </button>
              <button
                type="button"
                onClick={() => setUthyrningsstatus('klar_otankad')}
                style={{
                  padding: '10px 16px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  backgroundColor: uthyrningsstatus === 'klar_otankad' ? '#fef3c7' : '#ffffff',
                  color: uthyrningsstatus === 'klar_otankad' ? '#92400e' : '#374151',
                  cursor: 'pointer'
                }}
              >
                Klar otankad
              </button>
            </div>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
              Preliminär avslutnotering *
            </label>
            <textarea
              value={preliminarAvslutNotering}
              onChange={(e) => setPreliminarAvslutNotering(e.target.value)}
              placeholder="Preliminära kommentarer för avslut..."
              rows={3}
              style={{
                width: '100%',
                padding: '12px',
                border: showFieldErrors && !preliminarAvslutNotering.trim() ? '2px solid #dc2626' : '1px solid #d1d5db',
                backgroundColor: showFieldErrors && !preliminarAvslutNotering.trim() ? '#fef2f2' : '#ffffff',
                borderRadius: '6px',
                fontSize: '16px',
                resize: 'vertical'
              }}
            />
          </div>

          {showFieldErrors && !isStatusComplete() && (
            <p style={{ color: '#dc2626', fontSize: '14px', fontWeight: '500' }}>
              ⚠️ Uthyrningsstatus och preliminär notering är obligatoriska
            </p>
          )}
        </div>

        {/* Smart spara-knapp */}
        <div style={{ 
          backgroundColor: '#ffffff',
          padding: '24px',
          borderRadius: '12px',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          textAlign: 'center'
        }}>
          <button
            type="button"
            onClick={handleSave}
            style={{
              width: '100%',
              padding: '18px',
              backgroundColor: canSave() ? '#10b981' : '#6b7280',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '20px',
              fontWeight: '600',
              cursor: 'pointer',
              opacity: 1,
              boxShadow: canSave() ? '0 4px 12px rgba(16, 185, 129, 0.3)' : 'none'
            }}
          >
            {canSave() ? 'Spara incheckning' : 'Visa saknade fält'}
          </button>
          <p style={{ 
            textAlign: 'center', 
            color: '#666', 
            fontSize: '12px', 
            margin: '16px 0 0 0'
          }}>
            © Albarone AB 2025
          </p>
        </div>

      </div>

      {/* Final Confirmation Dialog */}
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
                <strong>Bob</strong> checkar in: <strong>{regInput}</strong>
              </p>
              
              <div style={{ marginBottom: '12px' }}>
                <strong>📍 Plats:</strong> {annanPlats ? annanPlatsText : `${ort} - ${station}`}
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
                <strong>🔧 Status:</strong> {uthyrningsstatus === 'klar_tankad' ? 'Klar tankad' : 'Klar otankad'}
              </div>
              
              {existingDamages.some(d => d.status !== 'not_selected') && (
                <div style={{ marginBottom: '12px' }}>
                  <strong>⚠️ Befintliga skador:</strong> {existingDamages.filter(d => d.status === 'documented').length} dokumenterade, {existingDamages.filter(d => d.status === 'fixed').length} åtgärdade
                </div>
              )}
              
              {newDamages.length > 0 && (
                <div style={{ marginBottom: '12px' }}>
                  <strong>🔴 Nya skador:</strong> {newDamages.length} st
                </div>
              )}
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
                onClick={confirmFinalSave}
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

      {/* Confirm Fix Dialog */}
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
            padding: '24px',
            maxWidth: '400px',
            width: '90%',
            textAlign: 'center'
          }}>
            <h3 style={{ marginBottom: '16px', color: '#1f2937' }}>
              Bekräfta åtgärd
            </h3>
            <p style={{ marginBottom: '20px', color: '#6b7280' }}>
              Är du säker på att denna skada har åtgärdats?
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={() => {
                  setShowConfirmDialog(false);
                  setDamageToFix(null);
                }}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#6b7280',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                Avbryt
              </button>
              <button
                onClick={confirmFixDamage}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#10b981',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                Bekräfta
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
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
              Tack Bob!
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
    </div>
  );
}

const CAR_PART_OPTIONS = Object.keys(CAR_PARTS).sort();

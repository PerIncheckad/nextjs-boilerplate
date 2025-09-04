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
  damage_detail?: string | null;
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

// Platser och stationer
const ORTER = ['MALMÖ', 'HELSINGBORG', 'ÄNGELHOLM', 'HALMSTAD', 'FALKENBERG', 'TRELLEBORG', 'VARBERG', 'LUND'];

const STATIONER: Record<string, string[]> = {
  'MALMÖ': ['Huvudstation Malmö Jägersro', 'Ford Malmö', 'Mechanum', 'Malmö Automera', 'Mercedes Malmö'],
  'HELSINGBORG': ['Huvudstation Helsingborg', 'HBSC Helsingborg', 'Ford Helsingborg', 'Transport Helsingborg'],
  'ÄNGELHOLM': ['Huvudstation Ängelholm', 'FORD Ängelholm', 'Mekonomen Ängelholm'],
  'HALMSTAD': ['Huvudstation Halmstad', 'Flyget Halmstad', 'KIA Halmstad'],
  'FALKENBERG': ['Huvudstation Falkenberg'],
  'TRELLEBORG': ['Huvudstation Trelleborg'],
  'VARBERG': ['Huvudstation Varberg', 'Ford Varberg', 'Hedin Automotive Varberg'],
  'LUND': ['Huvudstation Lund', 'Ford Lund', 'Hedin Lund', 'B/S Lund']
};

// Skadetyper (alfabetisk ordning)
const DAMAGE_TYPES = [
  'Buckla',
  'Däckskada sommarhjul',
  'Däckskada vinterhjul', 
  'Fälgskada sommarhjul',
  'Fälgskada vinterhjul',
  'Feltankning',
  'Höjdledsskada',
  'Intryck',
  'Invändig skada',
  'Jack',
  'Krockskada',
  'Krossad ruta',
  'Oaktsamhet',
  'Punktering',
  'Repa',
  'Repor',
  'Saknas',
  'Skrapad',
  'Spricka',
  'Stenskott',
  'Trasig',
  'Övrigt'
].sort();

// Uppdaterade bildelar och positioner - Motorhuv bara Utsida
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
  'Motorhuv': ['Utsida'], // Bara Utsida
  'Skärm': ['Höger bak', 'Höger fram', 'Vänster bak', 'Vänster fram'],
  'Stötfångare fram': ['Bak', 'Fram', 'Höger bak', 'Höger fram', 'Vänster bak', 'Vänster fram'],
  'Tak': [],
  'Tröskel': ['Höger', 'Vänster'],
  'Yttre backspegel': ['Höger', 'Vänster']
};

// TAJT skadelogik - mer specifik
const getRelevantCarParts = (damageType: string): string[] => {
  const lowerType = damageType.toLowerCase();
  
  // Däck-relaterade skador - bara däck
  if (lowerType.includes('däckskada')) {
    return ['Däck'];
  }
  
  // Fälg-relaterade skador - bara fälg
  if (lowerType.includes('fälgskada')) {
    return ['Fälg'];
  }
  
  // Punktering - bara däck
  if (lowerType.includes('punktering')) {
    return ['Däck'];
  }
  
  // Glas-relaterade skador
  if (lowerType.includes('ruta') || lowerType.includes('stenskott')) {
    return ['Glas', 'Motorhuv', 'Tak'].sort();
  }
  
  // Krockskador - karosseri
  if (lowerType.includes('krock')) {
    return ['Stötfångare fram', 'Skärm', 'Dörr utsida', 'Bagagelucka', 'Motorhuv'].sort();
  }
  
  // Höjdledsskador - tak och motorhuv
  if (lowerType.includes('höjdled')) {
    return ['Tak', 'Motorhuv', 'Bagagelucka'].sort();
  }
  
  // Övriga skador - alla delar
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

export default function CheckInForm() {
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

  // Hämta alla registreringsnummer för autocomplete
  useEffect(() => {
    async function fetchAllRegistrations() {
      try {
        const { data, error } = await supabase
          .from('car_data')
          .select('regnr')
          .order('regnr');

        if (!error && data) {
          const uniqueRegs = [...new Set(data.map(item => item.regnr))].filter(Boolean);
          setAllRegistrations(uniqueRegs);
        }
      } catch (err) {
        console.warn('Could not fetch registrations for autocomplete:', err);
      }
    }
    
    fetchAllRegistrations();
  }, []);

  const suggestions = useMemo(() => {
    if (!regInput.trim()) return [];
    const input = regInput.toUpperCase();
    return allRegistrations
      .filter(reg => reg.toUpperCase().startsWith(input))
      .slice(0, 5);
  }, [regInput, allRegistrations]);

  // Hämta bildata
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
        const { data, error } = await supabase
          .from('car_data')
          .select('*')
          .eq('regnr', normalizedReg)
          .order('created_at', { ascending: false });

        if (cancelled) return;

        if (error) {
          console.error('Database error:', error);
          setNotFound(true);
          setCarData([]);
          setExistingDamages([]);
        } else if (data && data.length > 0) {
          const validData = data.filter(row => row.wheelstorage !== null && row.saludatum !== null);
          const useData = validData.length > 0 ? validData : data;
          
          setCarData(useData);
          
          const damages: ExistingDamage[] = useData
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

  // SEKTIONSVALIDERING för visuell feedback
  const isRegComplete = () => regInput.trim().length > 0;
  
  const isLocationComplete = () => {
    return annanPlats ? annanPlatsText.trim().length > 0 : (ort && station);
  };
  
  const isVehicleStatusComplete = () => {
    if (!matarstallning.trim() || !drivmedelstyp) return false;
    
    if (drivmedelstyp === 'bensin_diesel') {
      if (!tankniva || !adblue === null) return false;
      if (tankniva === 'pafylld_nu' && (!liters.trim() || !bransletyp)) return false;
    }
    
    if (drivmedelstyp === 'elbil') {
      if (!laddniva.trim() || antalLaddkablar === null) return false;
      const laddnivaParsed = parseInt(laddniva);
      if (isNaN(laddnivaParsed) || laddnivaParsed < 0 || laddnivaParsed > 100) return false;
    }
    
    return spolarvatska !== null && insynsskydd !== null && hjultyp !== null;
  };
  
  const isCleaningComplete = () => tvatt !== null && inre !== null;
  
  const isDamagesComplete = () => {
    if (!skadekontroll) return false;
    
    if (skadekontroll === 'nya_skador') {
      if (newDamages.length === 0) return false;
      // Kräver både bild och video
      if (newDamages.some(damage => !damage.media.some(m => m.type === 'image') || !damage.media.some(m => m.type === 'video'))) return false;
      if (newDamages.some(damage => !damage.type || !damage.carPart || !damage.text.trim())) return false;
      if (newDamages.some(damage => damage.carPart && CAR_PARTS[damage.carPart].length > 0 && !damage.position)) return false;
    }
    
    // Kontrollera dokumenterade gamla skador
    const documentedOldDamages = existingDamages.filter(d => d.status === 'documented');
    if (documentedOldDamages.some(damage => !damage.userDescription?.trim())) return false;
    if (documentedOldDamages.some(damage => !damage.userType || !damage.userCarPart)) return false;
    if (documentedOldDamages.some(damage => damage.userCarPart && CAR_PARTS[damage.userCarPart].length > 0 && !damage.userPosition)) return false;
    // Gamla skador kräver också bild och video
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

  // UPPDATERAD handleSave - visar antingen fel eller bekräftelse
  const handleSave = () => {
    if (canSave()) {
      setShowFinalConfirmation(true);
    } else {
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

  const handleRegInputChange = (value: string) => {
    setRegInput(value.toUpperCase());
    setShowSuggestions(value.length > 0 && suggestions.length > 0);
  };

  const selectSuggestion = (suggestion: string) => {
    setRegInput(suggestion);
    setShowSuggestions(false);
  };

  // VISUELL FEEDBACK komponenter
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

  // Media upload component - uppdaterad text
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
        {/* Foto-knapp */}
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

        {/* Video-knapp */}
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
              border: hasVideo ? '2px dashed #dc2626' : '2px solid #dc2626',
              borderRadius: '6px',
              fontSize: '16px',
              backgroundColor: hasVideo ? '#fef2f2' : '#fee2e2',
              textAlign: 'center',
              cursor: 'pointer',
              color: '#dc2626',
              fontWeight: hasVideo ? 'normal' : 'bold'
            }}
          >
            🎥 {hasVideo ? 'Lägg till mer video' : 'Spela in video med skada OCH reg.nr. *'}
          </label>
        </div>

        {/* Galleri-knapp */}
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
  );

  return (
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
            <img 
              src={`/mabi-logo.png?v=${Date.now()}`}
              alt="MABI" 
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: 'contain'
              }}
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                e.currentTarget.nextElementSibling!.style.display = 'flex';
              }}
            />
            <div style={{
              width: '100%',
              height: '100%',
              display: 'none',
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
      }}>{/* Registreringsnummer med visuell feedback */}
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
              onFocus={() => setShowSuggestions(regInput.length > 0 && suggestions.length > 0)}
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
          
          {notFound && normalizedReg && (
            <p style={{ color: '#dc2626', fontSize: '14px', marginTop: '8px', fontWeight: '500' }}>Okänt reg.nr</p>
          )}
          
          {showFieldErrors && !isRegComplete() && (
            <p style={{ color: '#dc2626', fontSize: '14px', marginTop: '8px', fontWeight: '500' }}>
              ⚠️ Registreringsnummer är obligatoriskt
            </p>
          )}

          {/* Bilinfo */}
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
                <span style={{ fontWeight: '500' }}>{carModel || '—'}</span>
              </div>
              <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center' }}>
                <span style={{ fontWeight: '600', color: '#033066', minWidth: '130px' }}>Hjulförvaring:</span> 
                <span style={{ fontWeight: '500' }}>{wheelStorage || '—'}</span>
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
                ) : <span style={{ fontWeight: '500' }}> —</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                <span style={{ fontWeight: '600', color: '#033066', minWidth: '130px' }}>Befintliga skador:</span>
                <div style={{ flex: 1 }}>
                  {existingDamages.length === 0 ? (
                    <span style={{ fontWeight: '500' }}> —</span>
                  ) : (
                    <ul style={{ margin: '0', paddingLeft: '20px' }}>
                      {existingDamages.map((damage, i) => (
                        <li key={i} style={{ marginBottom: '4px' }}>{damage.fullText}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Plats för incheckning med visuell feedback */}
        <div style={{ 
          backgroundColor: '#ffffff',
          padding: '24px',
          borderRadius: '12px',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          border: showFieldErrors && !isLocationComplete() ? '2px solid #dc2626' : '2px solid transparent'
        }} className={showFieldErrors && !isLocationComplete() ? 'section-incomplete' : ''}>
          <SectionHeader title="Plats för incheckning" isComplete={isLocationComplete()} />
        
          {!annanPlats && (
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
                    border: showFieldErrors && !ort ? '2px solid #dc2626' : '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '16px',
                    backgroundColor: '#ffffff'
                  }}
                >
                  <option value="">— Välj ort —</option>
                  {ORTER.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
                  Station / Depå *
                </label>
                <select
                  value={station}
                  onChange={(e) => setStation(e.target.value)}
                  disabled={!ort}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: showFieldErrors && !station ? '2px solid #dc2626' : '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '16px',
                    backgroundColor: ort ? '#ffffff' : '#f3f4f6',
                    color: ort ? '#000' : '#9ca3af'
                  }}
                >
                  <option value="">— Välj station / depå —</option>
                  {availableStations.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </>
          )}

          <button
            type="button"
            onClick={() => {
              setAnnanPlats(!annanPlats);
              if (!annanPlats) {
                setOrt('');
                setStation('');
              } else {
                setAnnanPlatsText('');
              }
            }}
            style={{
              background: 'none',
              border: 'none',
              color: '#033066',
              textDecoration: 'underline',
              cursor: 'pointer',
              fontSize: '14px',
              marginBottom: '16px'
            }}
          >
            {annanPlats ? '← Tillbaka till ort/station' : '+ Annan plats (fritext)'}
          </button>

          {annanPlats && (
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
                Annan plats *
              </label>
              <input
                type="text"
                value={annanPlatsText}
                onChange={(e) => setAnnanPlatsText(e.target.value)}
                placeholder="Beskriv platsen..."
                style={{
                  width: '100%',
                  padding: '12px',
                  border: showFieldErrors && !annanPlatsText.trim() ? '2px solid #dc2626' : '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '16px',
                  backgroundColor: '#ffffff'
                }}
              />
            </div>
          )}
          
          {showFieldErrors && !isLocationComplete() && (
            <p style={{ color: '#dc2626', fontSize: '14px', marginTop: '8px', fontWeight: '500' }}>
              ⚠️ Ort och station/depå eller annan plats är obligatorisk
            </p>
          )}
        </div>

        {/* Fordonsstatus med smart drivmedelslogik och feedback */}
        <div style={{ 
          backgroundColor: '#ffffff',
          padding: '24px',
          borderRadius: '12px',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          border: showFieldErrors && !isVehicleStatusComplete() ? '2px solid #dc2626' : '2px solid transparent'
        }} className={showFieldErrors && !isVehicleStatusComplete() ? 'section-incomplete' : ''}>
          <SectionHeader title="Fordonsstatus" isComplete={isVehicleStatusComplete()} />
        
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
              Mätarställning *
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9\s]*"
                value={matarstallning}
                onChange={(e) => {
                  const value = e.target.value.replace(/[^0-9\s]/g, '');
                  setMatarstallning(value);
                }}
                placeholder="ex. 42180"
                style={{
                  flex: 1,
                  padding: '12px',
                  border: showFieldErrors && !matarstallning.trim() ? '2px solid #dc2626' : '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '16px',
                  backgroundColor: '#ffffff'
                }}
              />
              <span style={{ color: '#666', fontWeight: '500' }}>km</span>
            </div>
          </div>

          {/* Drivmedel */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
              Drivmedel *
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                type="button"
                onClick={() => {
                  setDrivmedelstyp('bensin_diesel');
                  setLaddniva('');
                  setAntalLaddkablar(null);
                }}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: showFieldErrors && !drivmedelstyp ? '2px solid #dc2626' : '1px solid #d1d5db',
                  borderRadius: '6px',
                  backgroundColor: drivmedelstyp === 'bensin_diesel' ? '#033066' : '#ffffff',
                  color: drivmedelstyp === 'bensin_diesel' ? '#ffffff' : '#000',
                  cursor: 'pointer'
                }}
              >
                Bensin/Diesel
              </button>
              <button
                type="button"
                onClick={() => {
                  setDrivmedelstyp('elbil');
                  setTankniva(null);
                  setLiters('');
                  setBransletyp(null);
                  setAdblue(null);
                }}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: showFieldErrors && !drivmedelstyp ? '2px solid #dc2626' : '1px solid #d1d5db',
                  borderRadius: '6px',
                  backgroundColor: drivmedelstyp === 'elbil' ? '#033066' : '#ffffff',
                  color: drivmedelstyp === 'elbil' ? '#ffffff' : '#000',
                  cursor: 'pointer'
                }}
              >
                Elbil
              </button>
            </div>
          </div>

          {/* Tanknivå för bensin/diesel */}
          {drivmedelstyp === 'bensin_diesel' && (
            <>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
                  Tanknivå *
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setTankniva('fulltankad')}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      backgroundColor: tankniva === 'fulltankad' ? '#10b981' : '#ffffff',
                      color: tankniva === 'fulltankad' ? '#ffffff' : '#000',
                      cursor: 'pointer'
                    }}
                  >
                    Fulltankad
                  </button>
                  <button
                    type="button"
                    onClick={() => setTankniva('tankas_senare')}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      backgroundColor: tankniva === 'tankas_senare' ? '#f59e0b' : '#ffffff',
                      color: tankniva === 'tankas_senare' ? '#ffffff' : '#000',
                      cursor: 'pointer'
                    }}
                  >
                    Ej fulltankad - tankas senare
                  </button>
                  <button
                    type="button"
                    onClick={() => setTankniva('pafylld_nu')}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      backgroundColor: tankniva === 'pafylld_nu' ? '#033066' : '#ffffff',
                      color: tankniva === 'pafylld_nu' ? '#ffffff' : '#000',
                      cursor: 'pointer'
                    }}
                  >
                    Ej fulltankad - påfylld nu
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
                      inputMode="decimal"
                      pattern="[0-9,]*"
                      value={liters}
                      onChange={(e) => {
                        let value = e.target.value;
                        value = value.replace(/\./g, ',');
                        value = value.replace(/[^0-9,]/g, '');
                        const parts = value.split(',');
                        if (parts.length > 2) {
                          value = parts[0] + ',' + parts[1];
                        }
                        if (/^\d{0,4}(,\d{0,1})?$/.test(value)) {
                          setLiters(value);
                        }
                      }}
                      placeholder="ex. 12,5"
                      style={{
                        width: '200px',
                        padding: '12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '16px',
                        backgroundColor: '#ffffff'
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
                        onClick={() => setBransletyp('Bensin')}
                        style={{
                          flex: 1,
                          padding: '12px',
                          border: '1px solid #d1d5db',
                          borderRadius: '6px',
                          backgroundColor: bransletyp === 'Bensin' ? '#033066' : '#ffffff',
                          color: bransletyp === 'Bensin' ? '#ffffff' : '#000',
                          cursor: 'pointer'
                        }}
                      >
                        Bensin
                      </button>
                      <button
                        type="button"
                        onClick={() => setBransletyp('Diesel')}
                        style={{
                          flex: 1,
                          padding: '12px',
                          border: '1px solid #d1d5db',
                          borderRadius: '6px',
                          backgroundColor: bransletyp === 'Diesel' ? '#033066' : '#ffffff',
                          color: bransletyp === 'Diesel' ? '#ffffff' : '#000',
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

          {/* Laddnivå för elbil */}
          {drivmedelstyp === 'elbil' && (
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
                Laddnivå *
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={laddniva}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^0-9]/g, '');
                    const numValue = parseInt(value);
                    if (value === '' || (numValue >= 0 && numValue <= 100)) {
                      setLaddniva(value);
                    }
                  }}
                  placeholder="ex. 85"
                  style={{
                    width: '100px',
                    padding: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '16px',
                    backgroundColor: '#ffffff'
                  }}
                />
                <span style={{ color: '#666', fontWeight: '500' }}>%</span>
              </div>
            </div>
          )}

          {/* Övriga fordonsstatus-fält - smart layout */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: drivmedelstyp === 'bensin_diesel' ? '1fr 1fr' : '1fr', 
            gap: '16px', 
            marginBottom: '16px' 
          }}>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
                Spolarvätska OK? *
              </label>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  type="button"
                  onClick={() => setSpolarvatska(true)}
                  style={{
                    flex: 1,
                    padding: '8px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    backgroundColor: spolarvatska === true ? '#10b981' : '#ffffff',
                    color: spolarvatska === true ? '#ffffff' : '#000',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                >
                  Ja
                </button>
                <button
                  type="button"
                  onClick={() => setSpolarvatska(false)}
                  style={{
                    flex: 1,
                    padding: '8px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    backgroundColor: spolarvatska === false ? '#dc2626' : '#ffffff',
                    color: spolarvatska === false ? '#ffffff' : '#000',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                >
                  Nej
                </button>
              </div>
            </div>

            {/* AdBlue visas bara för bensin/diesel */}
            {drivmedelstyp === 'bensin_diesel' && (
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
                  AdBlue OK? *
                </label>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    type="button"
                    onClick={() => setAdblue(true)}
                    style={{
                      flex: 1,
                      padding: '8px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      backgroundColor: adblue === true ? '#10b981' : '#ffffff',
                      color: adblue === true ? '#ffffff' : '#000',
                      cursor: 'pointer',
                      fontSize: '14px'
                    }}
                  >
                    Ja
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdblue(false)}
                    style={{
                      flex: 1,
                      padding: '8px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      backgroundColor: adblue === false ? '#dc2626' : '#ffffff',
                      color: adblue === false ? '#ffffff' : '#000',
                      cursor: 'pointer',
                      fontSize: '14px'
                    }}
                  >
                    Nej
                  </button>
                </div>
              </div>
            )}
          </div>

          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: drivmedelstyp === 'elbil' ? '1fr 1fr' : '1fr', 
            gap: '16px', 
            marginBottom: '16px' 
          }}>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
                Insynsskydd OK? *
              </label>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  type="button"
                  onClick={() => setInsynsskydd(true)}
                  style={{
                    flex: 1,
                    padding: '8px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    backgroundColor: insynsskydd === true ? '#10b981' : '#ffffff',
                    color: insynsskydd === true ? '#ffffff' : '#000',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                >
                  Ja
                </button>
                <button
                  type="button"
                  onClick={() => setInsynsskydd(false)}
                  style={{
                    flex: 1,
                    padding: '8px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    backgroundColor: insynsskydd === false ? '#dc2626' : '#ffffff',
                    color: insynsskydd === false ? '#ffffff' : '#000',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                >
                  Nej
                </button>
              </div>
            </div>

            {/* Laddkablar visas bara för elbilar */}
            {drivmedelstyp === 'elbil' && (
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
                  Antal laddkablar *
                </label>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    type="button"
                    onClick={() => setAntalLaddkablar('0')}
                    style={{
                      flex: 1,
                      padding: '8px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      backgroundColor: antalLaddkablar === '0' ? '#033066' : '#ffffff',
                      color: antalLaddkablar === '0' ? '#ffffff' : '#000',
                      cursor: 'pointer',
                      fontSize: '14px'
                    }}
                  >
                    0
                  </button>
                  <button
                    type="button"
                    onClick={() => setAntalLaddkablar('1')}
                    style={{
                      flex: 1,
                      padding: '8px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      backgroundColor: antalLaddkablar === '1' ? '#033066' : '#ffffff',
                      color: antalLaddkablar === '1' ? '#ffffff' : '#000',
                      cursor: 'pointer',
                      fontSize: '14px'
                    }}
                  >
                    1
                  </button>
                  <button
                    type="button"
                    onClick={() => setAntalLaddkablar('2')}
                    style={{
                      flex: 1,
                      padding: '8px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      backgroundColor: antalLaddkablar === '2' ? '#033066' : '#ffffff',
                      color: antalLaddkablar === '2' ? '#ffffff' : '#000',
                      cursor: 'pointer',
                      fontSize: '14px'
                    }}
                  >
                    2
                  </button>
                </div>
              </div>
            )}
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
              Hjul som sitter på *
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setHjultyp('Sommarthjul')}
                style={{
                  flex: 1,
                  padding: '12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  backgroundColor: hjultyp === 'Sommarthjul' ? '#f59e0b' : '#ffffff',
                  color: hjultyp === 'Sommarthjul' ? '#ffffff' : '#000',
                  cursor: 'pointer'
                }}
              >
                Sommarhjul
              </button>
              <button
                type="button"
                onClick={() => setHjultyp('Vinterthjul')}
                style={{
                  flex: 1,
                  padding: '12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  backgroundColor: hjultyp === 'Vinterthjul' ? '#3b82f6' : '#ffffff',
                  color: hjultyp === 'Vinterthjul' ? '#ffffff' : '#000',
                  cursor: 'pointer'
                }}
              >
                Vinterhjul
              </button>
            </div>
          </div>
          
          {showFieldErrors && !isVehicleStatusComplete() && (
            <p style={{ color: '#dc2626', fontSize: '14px', marginTop: '8px', fontWeight: '500' }}>
              ⚠️ Alla fordonsstatus-fält är obligatoriska
            </p>
          )}
        </div>

        {/* Rengöring med feedback */}
        <div style={{ 
          backgroundColor: '#ffffff',
          padding: '24px',
          borderRadius: '12px',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          border: showFieldErrors && !isCleaningComplete() ? '2px solid #dc2626' : '2px solid transparent'
        }} className={showFieldErrors && !isCleaningComplete() ? 'section-incomplete' : ''}>
          <SectionHeader title="Rengöring" isComplete={isCleaningComplete()} />

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
              Utvändig tvätt *
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setTvatt('behover_tvattas')}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  backgroundColor: tvatt === 'behover_tvattas' ? '#f59e0b' : '#ffffff',
                  color: tvatt === 'behover_tvattas' ? '#ffffff' : '#000',
                  cursor: 'pointer'
                }}
              >
                Behöver tvättas
              </button>
              <button
                type="button"
                onClick={() => setTvatt('behover_grovtvattas')}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  backgroundColor: tvatt === 'behover_grovtvattas' ? '#dc2626' : '#ffffff',
                  color: tvatt === 'behover_grovtvattas' ? '#ffffff' : '#000',
                  cursor: 'pointer'
                }}
              >
                Behöver grovtvättas
              </button>
              <button
                type="button"
                onClick={() => setTvatt('behover_inte_tvattas')}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  backgroundColor: tvatt === 'behover_inte_tvattas' ? '#10b981' : '#ffffff',
                  color: tvatt === 'behover_inte_tvattas' ? '#ffffff' : '#000',
                  cursor: 'pointer'
                }}
              >
                Behöver inte tvättas
              </button>
            </div>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
              Inre rengöring *
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setInre('behover_rengoras_inuti')}
                style={{
                  flex: 1,
                  padding: '12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  backgroundColor: inre === 'behover_rengoras_inuti' ? '#f59e0b' : '#ffffff',
                  color: inre === 'behover_rengoras_inuti' ? '#ffffff' : '#000',
                  cursor: 'pointer'
                }}
              >
                Behöver rengöras inuti
              </button>
              <button
                type="button"
                onClick={() => setInre('ren_inuti')}
                style={{
                  flex: 1,
                  padding: '12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  backgroundColor: inre === 'ren_inuti' ? '#10b981' : '#ffffff',
                  color: inre === 'ren_inuti' ? '#ffffff' : '#000',
                  cursor: 'pointer'
                }}
              >
                Ren inuti
              </button>
            </div>
          </div>
          
          {showFieldErrors && !isCleaningComplete() && (
            <p style={{ color: '#dc2626', fontSize: '14px', marginTop: '8px', fontWeight: '500' }}>
              ⚠️ Alla rengöringsfält är obligatoriska
            </p>
          )}
        </div>{/* Skador med tajt logik och feedback */}
        <div style={{ 
          backgroundColor: '#ffffff',
          padding: '24px',
          borderRadius: '12px',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          border: showFieldErrors && !isDamagesComplete() ? '2px solid #dc2626' : '2px solid transparent'
        }} className={showFieldErrors && !isDamagesComplete() ? 'section-incomplete' : ''}>
          <SectionHeader title="Skador" isComplete={isDamagesComplete()} />

          {/* Gamla skador */}
          <SubSectionHeader title="Gamla skador" />
          <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '16px' }}>
            Klicka på de befintliga skador du vill dokumentera eller markera som åtgärdade.
          </p>

          {existingDamages.length > 0 ? (
            <div style={{ marginBottom: '20px' }}>
              {existingDamages.map(damage => (
                <div key={damage.id} style={{ marginBottom: '16px' }}>
                  <div style={{
                    border: '2px solid',
                    borderColor: damage.status === 'fixed' ? '#10b981' : damage.status === 'documented' ? '#2563eb' : '#d1d5db',
                    borderRadius: '8px',
                    padding: '16px',
                    backgroundColor: damage.status === 'fixed' ? '#f0fdf4' : damage.status === 'documented' ? '#eff6ff' : '#ffffff'
                  }}>
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between',
                      marginBottom: damage.status === 'not_selected' ? '0' : '12px'
                    }}>
                      <div style={{
                        fontSize: '16px',
                        fontWeight: '500',
                        color: damage.status === 'fixed' ? '#047857' : damage.status === 'documented' ? '#1e40af' : '#374151',
                        flex: 1
                      }}>
                        {damage.status === 'fixed' && '✅ '}
                        {damage.status === 'documented' && '📝 '}
                        {damage.fullText}
                      </div>
                      
                      {damage.status === 'fixed' && (
                        <span style={{
                          backgroundColor: '#10b981',
                          color: '#ffffff',
                          padding: '4px 8px',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: '600'
                        }}>
                          ÅTGÄRDAT
                        </span>
                      )}
                      
                      {damage.status === 'documented' && (
                        <span style={{
                          backgroundColor: '#2563eb',
                          color: '#ffffff',
                          padding: '4px 8px',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: '600'
                        }}>
                          DOKUMENTERAT
                        </span>
                      )}
                    </div>

                    {damage.status === 'not_selected' && (
                      <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                        <button
                          type="button"
                          onClick={() => toggleExistingDamageStatus(damage.id, 'documented')}
                          style={{
                            flex: 1,
                            padding: '10px',
                            border: '1px solid #2563eb',
                            borderRadius: '6px',
                            backgroundColor: '#ffffff',
                            color: '#2563eb',
                            cursor: 'pointer',
                            fontSize: '14px',
                            fontWeight: '500'
                          }}
                        >
                          📝 Dokumentera
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleExistingDamageStatus(damage.id, 'fixed')}
                          style={{
                            flex: 1,
                            padding: '10px',
                            border: '1px solid #10b981',
                            borderRadius: '6px',
                            backgroundColor: '#ffffff',
                            color: '#10b981',
                            cursor: 'pointer',
                            fontSize: '14px',
                            fontWeight: '500'
                          }}
                        >
                          ✅ Åtgärdat
                        </button>
                      </div>
                    )}

                    {damage.status !== 'not_selected' && (
                      <button
                        type="button"
                        onClick={() => setExistingDamages(prev => prev.map(d => 
                          d.id === damage.id ? { 
                            ...d, 
                            status: 'not_selected', 
                            userType: '',
                            userCarPart: '',
                            userPosition: '',
                            userDescription: '', 
                            media: [] 
                          } : d
                        ))}
                        style={{
                          padding: '8px 16px',
                          border: '1px solid #6b7280',
                          borderRadius: '6px',
                          backgroundColor: '#ffffff',
                          color: '#6b7280',
                          cursor: 'pointer',
                          fontSize: '12px',
                          marginTop: '8px'
                        }}
                      >
                        ↶ Återställ
                      </button>
                    )}

                    {/* Dokumentationsformulär för gamla skador */}
                    {damage.status === 'documented' && (
                      <div style={{ marginTop: '12px' }}>
                        <div style={{ marginBottom: '12px' }}>
                          <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
                            1. Typ av skada *
                          </label>
                          <select
                            value={damage.userType || ''}
                            onChange={(e) => updateExistingDamageType(damage.id, e.target.value)}
                            style={{
                              width: '100%',
                              padding: '12px',
                              border: '1px solid #d1d5db',
                              borderRadius: '6px',
                              fontSize: '16px',
                              backgroundColor: '#ffffff'
                            }}
                          >
                            <option value="">— Välj typ av skada —</option>
                            {DAMAGE_TYPES.map(type => (
                              <option key={type} value={type}>{type}</option>
                            ))}
                          </select>
                        </div>

                        <div style={{ marginBottom: '12px' }}>
                          <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
                            2. Del på bilen *
                          </label>
                          <select
                            value={damage.userCarPart || ''}
                            onChange={(e) => updateExistingDamageCarPart(damage.id, e.target.value)}
                            disabled={!damage.userType}
                            style={{
                              width: '100%',
                              padding: '12px',
                              border: '1px solid #d1d5db',
                              borderRadius: '6px',
                              fontSize: '16px',
                              backgroundColor: damage.userType ? '#ffffff' : '#f3f4f6',
                              color: damage.userType ? '#000' : '#9ca3af'
                            }}
                          >
                            <option value="">— Välj bil-del —</option>
                            {(damage.userType ? getRelevantCarParts(damage.userType) : CAR_PART_OPTIONS).map(part => (
                              <option key={part} value={part}>{part}</option>
                            ))}
                          </select>
                        </div>

                        {damage.userCarPart && CAR_PARTS[damage.userCarPart].length > 0 && (
                          <div style={{ marginBottom: '12px' }}>
                            <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
                              3. Position *
                            </label>
                            <select
                              value={damage.userPosition || ''}
                              onChange={(e) => updateExistingDamagePosition(damage.id, e.target.value)}
                              style={{
                                width: '100%',
                                padding: '12px',
                                border: '1px solid #d1d5db',
                                borderRadius: '6px',
                                fontSize: '16px',
                                backgroundColor: '#ffffff'
                              }}
                            >
                              <option value="">— Välj position —</option>
                              {CAR_PARTS[damage.userCarPart].sort().map(position => (
                                <option key={position} value={position}>{position}</option>
                              ))}
                            </select>
                          </div>
                        )}

                        <div style={{ marginBottom: '12px' }}>
                          <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
                            {damage.userCarPart && CAR_PARTS[damage.userCarPart].length > 0 ? '4. ' : '3. '}Din detaljerade beskrivning *
                          </label>
                          <textarea
                            value={damage.userDescription || ''}
                            onChange={(e) => updateExistingDamageDescription(damage.id, e.target.value)}
                            placeholder={`Beskriv "${damage.shortText}" mer detaljerat...`}
                            rows={4}
                            style={{
                              width: '100%',
                              padding: '12px',
                              border: '1px solid #d1d5db',
                              borderRadius: '6px',
                              fontSize: '16px',
                              backgroundColor: '#ffffff',
                              resize: 'vertical',
                              minHeight: '100px'
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
                          <div style={{ 
                            marginTop: '12px',
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                            gap: '12px'
                          }}>
                            {damage.media.map((mediaFile, index) => (
                              <div key={index} style={{ 
                                position: 'relative',
                                width: '120px',
                                height: '120px'
                              }}>
                                {mediaFile.type === 'image' ? (
                                  <img
                                    src={mediaFile.preview}
                                    alt={`Skadebild ${index + 1}`}
                                    style={{
                                      width: '100%',
                                      height: '100%',
                                      objectFit: 'cover',
                                      borderRadius: '8px',
                                      border: '1px solid #d1d5db'
                                    }}
                                  />
                                ) : (
                                  <div style={{
                                    width: '100%',
                                    height: '100%',
                                    borderRadius: '8px',
                                    border: '1px solid #d1d5db',
                                    position: 'relative',
                                    overflow: 'hidden'
                                  }}>
                                    {mediaFile.thumbnail ? (
                                      <img
                                        src={mediaFile.thumbnail}
                                        alt={`Video thumbnail ${index + 1}`}
                                        style={{
                                          width: '100%',
                                          height: '100%',
                                          objectFit: 'cover'
                                        }}
                                      />
                                    ) : (
                                      <div style={{
                                        width: '100%',
                                        height: '100%',
                                        backgroundColor: '#6b7280',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: 'white',
                                        fontSize: '24px'
                                      }}>
                                        ▶
                                      </div>
                                    )}
                                    <div style={{
                                      position: 'absolute',
                                      top: '4px',
                                      left: '4px',
                                      backgroundColor: 'rgba(0,0,0,0.8)',
                                      color: 'white',
                                      padding: '2px 6px',
                                      borderRadius: '4px',
                                      fontSize: '10px',
                                      fontWeight: 'bold'
                                    }}>
                                      VIDEO
                                    </div>
                                  </div>
                                )}
                                <button
                                  type="button"
                                  onClick={() => removeExistingDamageMedia(damage.id, index)}
                                  style={{
                                    position: 'absolute',
                                    top: '2px',
                                    right: '2px',
                                    width: '24px',
                                    height: '24px',
                                    borderRadius: '50%',
                                    backgroundColor: '#dc2626',
                                    color: '#ffffff',
                                    border: '2px solid #ffffff',
                                    cursor: 'pointer',
                                    fontSize: '12px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontWeight: 'bold',
                                    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.3)',
                                    zIndex: 10
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
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: '#6b7280', fontSize: '16px', marginBottom: '24px', fontStyle: 'italic' }}>
              Inga befintliga skador hittades för detta fordon.
            </p>
          )}

          {/* Nya skador */}
          <SubSectionHeader title="Nya skador" />

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
              Skadekontroll *
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                type="button"
                onClick={() => {
                  setSkadekontroll('ej_skadekontrollerad');
                  setNewDamages([]);
                }}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  backgroundColor: skadekontroll === 'ej_skadekontrollerad' ? '#6b7280' : '#ffffff',
                  color: skadekontroll === 'ej_skadekontrollerad' ? '#ffffff' : '#000',
                  cursor: 'pointer'
                }}
              >
                Ej skadekontrollerad
              </button>
              <button
                type="button"
                onClick={() => setSkadekontroll('nya_skador')}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  backgroundColor: skadekontroll === 'nya_skador' ? '#dc2626' : '#ffffff',
                  color: skadekontroll === 'nya_skador' ? '#ffffff' : '#000',
                  cursor: 'pointer'
                }}
              >
                Nya skador
              </button>
              <button
                type="button"
                onClick={() => {
                  setSkadekontroll('inga_nya_skador');
                  setNewDamages([]);
                }}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  backgroundColor: skadekontroll === 'inga_nya_skador' ? '#10b981' : '#ffffff',
                  color: skadekontroll === 'inga_nya_skador' ? '#ffffff' : '#000',
                  cursor: 'pointer'
                }}
              >
                Inga nya skador
              </button>
            </div>
          </div>

          {/* Nya skador fält - med tajt skadehierarki */}
          {skadekontroll === 'nya_skador' && (
            <>
              {newDamages.map(damage => (
                <div key={damage.id} style={{
                  padding: '16px',
                  border: '1px solid #fed7aa',
                  borderRadius: '8px',
                  marginBottom: '16px',
                  backgroundColor: '#fefce8'
                }}>
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
                      1. Typ av skada *
                    </label>
                    <select
                      value={damage.type}
                      onChange={(e) => updateDamageType(damage.id, e.target.value)}
                      style={{
                        width: '100%',
                        padding: '12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '16px',
                        backgroundColor: '#ffffff'
                      }}
                    >
                      <option value="">— Välj typ av skada —</option>
                      {DAMAGE_TYPES.map(type => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>

                  {/* TAJT skadelogik - smart filtrering */}
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
                      2. Del på bilen *
                    </label>
                    <select
                      value={damage.carPart}
                      onChange={(e) => updateDamageCarPart(damage.id, e.target.value)}
                      disabled={!damage.type}
                      style={{
                        width: '100%',
                        padding: '12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '16px',
                        backgroundColor: damage.type ? '#ffffff' : '#f3f4f6',
                        color: damage.type ? '#000' : '#9ca3af'
                      }}
                    >
                      <option value="">— Välj bil-del —</option>
                      {(damage.type ? getRelevantCarParts(damage.type) : CAR_PART_OPTIONS).map(part => (
                        <option key={part} value={part}>{part}</option>
                      ))}
                    </select>
                  </div>

                  {damage.carPart && CAR_PARTS[damage.carPart].length > 0 && (
                    <div style={{ marginBottom: '12px' }}>
                      <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
                        3. Position *
                      </label>
                      <select
                        value={damage.position}
                        onChange={(e) => updateDamagePosition(damage.id, e.target.value)}
                        style={{
                          width: '100%',
                          padding: '12px',
                          border: '1px solid #d1d5db',
                          borderRadius: '6px',
                          fontSize: '16px',
                          backgroundColor: '#ffffff'
                        }}
                      >
                        <option value="">— Välj position —</option>
                        {CAR_PARTS[damage.carPart].sort().map(position => (
                          <option key={position} value={position}>{position}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
                      {damage.carPart && CAR_PARTS[damage.carPart].length > 0 ? '4. ' : '3. '}Beskrivning av skada *
                    </label>
                    <textarea
                      value={damage.text}
                      onChange={(e) => updateDamageText(damage.id, e.target.value)}
                      placeholder="Beskriv skadan mer detaljerat..."
                      disabled={!damage.carPart}
                      rows={4}
                      style={{
                        width: '100%',
                        padding: '12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '16px',
                        backgroundColor: damage.carPart ? '#ffffff' : '#f3f4f6',
                        color: damage.carPart ? '#000' : '#9ca3af',
                        resize: 'vertical',
                        minHeight: '100px'
                      }}
                    />
                  </div>

                  <MediaUpload 
                    damageId={damage.id} 
                    isOld={false} 
                    onMediaUpdate={updateDamageMedia} 
                    hasImage={damage.media.some(m => m.type === 'image')}
                    hasVideo={damage.media.some(m => m.type === 'video')}
                  />

                  {damage.media.length > 0 && (
                    <div style={{ 
                      marginTop: '12px',
                      marginBottom: '12px',
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                      gap: '12px'
                    }}>
                      {damage.media.map((mediaFile, index) => (
                        <div key={index} style={{ 
                          position: 'relative',
                          width: '120px',
                          height: '120px'
                        }}>
                          {mediaFile.type === 'image' ? (
                            <img
                              src={mediaFile.preview}
                              alt={`Skadebild ${index + 1}`}
                              style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                                borderRadius: '8px',
                                border: '1px solid #d1d5db'
                              }}
                            />
                          ) : (
                            <div style={{
                              width: '100%',
                              height: '100%',
                              borderRadius: '8px',
                              border: '1px solid #d1d5db',
                              position: 'relative',
                              overflow: 'hidden'
                            }}>
                              {mediaFile.thumbnail ? (
                                <img
                                  src={mediaFile.thumbnail}
                                  alt={`Video thumbnail ${index + 1}`}
                                  style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover'
                                  }}
                                />
                              ) : (
                                <div style={{
                                  width: '100%',
                                  height: '100%',
                                  backgroundColor: '#6b7280',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: 'white',
                                  fontSize: '24px'
                                }}>
                                  ▶
                                </div>
                              )}
                              <div style={{
                                position: 'absolute',
                                top: '4px',
                                left: '4px',
                                backgroundColor: 'rgba(0,0,0,0.8)',
                                color: 'white',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontSize: '10px',
                                fontWeight: 'bold'
                              }}>
                                VIDEO
                              </div>
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => removeDamageMedia(damage.id, index)}
                            style={{
                              position: 'absolute',
                              top: '2px',
                              right: '2px',
                              width: '24px',
                              height: '24px',
                              borderRadius: '50%',
                              backgroundColor: '#dc2626',
                              color: '#ffffff',
                              border: '2px solid #ffffff',
                              cursor: 'pointer',
                              fontSize: '12px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 'bold',
                              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.3)',
                              zIndex: 10
                            }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => removeDamage(damage.id)}
                    style={{
                      padding: '8px 16px',
                      border: '1px solid #dc2626',
                      borderRadius: '6px',
                      backgroundColor: '#ffffff',
                      color: '#dc2626',
                      cursor: 'pointer',
                      fontSize: '14px'
                    }}
                  >
                    Ta bort skada
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={addDamage}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#033066',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                  fontSize: '16px',
                  marginBottom: '16px'
                }}
              >
                {newDamages.length === 0 ? 'Lägg till skada' : 'Lägg till ytterligare skada'}
              </button>
            </>
          )}
          
          {showFieldErrors && !isDamagesComplete() && (
            <p style={{ color: '#dc2626', fontSize: '14px', marginTop: '8px', fontWeight: '500' }}>
              ⚠️ Skadekontroll är obligatorisk. Vid nya skador krävs bild och video.
            </p>
          )}
        </div>

        {/* Uthyrningsstatus med feedback */}
        <div style={{ 
          backgroundColor: '#ffffff',
          padding: '24px',
          borderRadius: '12px',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          border: showFieldErrors && !isStatusComplete() ? '2px solid #dc2626' : '2px solid transparent'
        }} className={showFieldErrors && !isStatusComplete() ? 'section-incomplete' : ''}>
          <SectionHeader title="Uthyrningsstatus" isComplete={isStatusComplete()} />

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
              Status *
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setUthyrningsstatus('redo_for_uthyrning')}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  backgroundColor: uthyrningsstatus === 'redo_for_uthyrning' ? '#10b981' : '#ffffff',
                  color: uthyrningsstatus === 'redo_for_uthyrning' ? '#ffffff' : '#000',
                  cursor: 'pointer'
                }}
              >
                Redo för uthyrning
              </button>
              <button
                type="button"
                onClick={() => setUthyrningsstatus('ledig_tankad')}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  backgroundColor: uthyrningsstatus === 'ledig_tankad' ? '#3b82f6' : '#ffffff',
                  color: uthyrningsstatus === 'ledig_tankad' ? '#ffffff' : '#000',
                  cursor: 'pointer'
                }}
              >
                Ledig tankad
              </button>
              <button
                type="button"
                onClick={() => setUthyrningsstatus('ledig_otankad')}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  backgroundColor: uthyrningsstatus === 'ledig_otankad' ? '#f59e0b' : '#ffffff',
                  color: uthyrningsstatus === 'ledig_otankad' ? '#ffffff' : '#000',
                  cursor: 'pointer'
                }}
              >
                Ledig otankad
              </button>
              <button
                type="button"
                onClick={() => setUthyrningsstatus('klar_otankad')}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  backgroundColor: uthyrningsstatus === 'klar_otankad' ? '#6b7280' : '#ffffff',
                  color: uthyrningsstatus === 'klar_otankad' ? '#ffffff' : '#000',
                  cursor: 'pointer'
                }}
              >
                Klar otankad
              </button>
            </div>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
              Prel. avslut notering *
            </label>
            <textarea
              value={preliminarAvslutNotering}
              onChange={(e) => setPreliminarAvslutNotering(e.target.value)}
              placeholder="Preliminära kommentarer för avslut..."
              rows={4}
              style={{
                width: '100%',
                padding: '12px',
                border: showFieldErrors && !preliminarAvslutNotering.trim() ? '2px solid #dc2626' : '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '16px',
                backgroundColor: '#ffffff',
                resize: 'vertical',
                minHeight: '100px'
              }}
            />
          </div>
          
          {showFieldErrors && !isStatusComplete() && (
            <p style={{ color: '#dc2626', fontSize: '14px', marginTop: '8px', fontWeight: '500' }}>
              ⚠️ Status och preliminär avslut notering är obligatoriska
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

      {/* Bekräftelsedialog för "Åtgärdat" */}
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
              fontSize: '32px',
              color: '#ffffff'
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

      {/* FINAL CONFIRMATION - Sammanfattningsdialog */}
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
                <strong>📍 Plats:</strong> {annanPlats ? annanPlatsText : `${ort}, ${station}`}
              </div>
              
              <div style={{ marginBottom: '12px' }}>
                <strong>🕐 Datum/Tid:</strong> {new Date().toLocaleString('sv-SE')}
              </div>
              
              <div style={{ marginBottom: '12px' }}>
                <strong>🚗 Fordonsstatus:</strong> {matarstallning} km, {drivmedelstyp === 'bensin_diesel' ? 
                  `${tankniva?.replace('_', ' ')}${tankniva === 'pafylld_nu' ? ` (${liters}L ${bransletyp})` : ''}` : 
                  `${laddniva}% laddning`}, {hjultyp?.toLowerCase()}
              </div>
              
              <div style={{ marginBottom: '12px' }}>
                <strong>🧽 Rengöring:</strong> {tvatt?.replace('_', ' ')}, {inre?.replace('_', ' ')}
              </div>
              
              <div style={{ marginBottom: '12px' }}>
                <strong>⚠️ Gamla skador:</strong> {existingDamages.filter(d => d.status === 'documented').length} dokumenterade, {existingDamages.filter(d => d.status === 'fixed').length} åtgärdade
              </div>
              
              <div style={{ marginBottom: '12px' }}>
                <strong>🆕 Nya skador:</strong> {skadekontroll === 'nya_skador' ? `${newDamages.length} rapporterade` : skadekontroll?.replace('_', ' ')}
              </div>
              
              <div style={{ marginBottom: '12px' }}>
                <strong>📋 Status:</strong> {uthyrningsstatus?.replace('_', ' ')}
              </div>
              
              <div>
                <strong>📝 Avslut notering:</strong> {preliminarAvslutNotering}
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => setShowFinalConfirmation(false)}
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
                ← Återgå till formuläret
              </button>
              <button
                onClick={confirmFinalSave}
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
                ✅ Bekräfta & Spara
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

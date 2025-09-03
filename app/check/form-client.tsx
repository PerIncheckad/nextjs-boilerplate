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
  damage_detail?: string | null; // Ny kolumn för mer detaljerad skadebeskrivning
  wheelstorage: string | null;
  saludatum: string | null;
};

// Detaljerad skada från databas
type ExistingDamage = {
  id: string;
  shortText: string; // t.ex. "Lackskada"
  detailText?: string; // t.ex. "höger framskärm"
  fullText: string; // t.ex. "Lackskada - höger framskärm"
  documented?: boolean; // Om användaren valt att dokumentera denna skada
  userDescription?: string; // Användarens egen beskrivning
  media?: MediaFile[]; // Bilder/videos som användaren lagt till
};

// Media-typ för att hantera både bilder och videos
type MediaFile = {
  file: File;
  type: 'image' | 'video';
  preview?: string; // För bilder
  thumbnail?: string; // För videos
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

// Kompletta skadetyper från din lista
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
];

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

// Hjälpfunktion för att identifiera filtyp
const getFileType = (file: File): 'image' | 'video' => {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  return 'image'; // default
};

// Hjälpfunktion för att skapa video-thumbnail
const createVideoThumbnail = (file: File): Promise<string> => {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    
    video.addEventListener('loadedmetadata', () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      video.currentTime = 0.5; // Ta thumbnail från 0.5 sekunder
    });
    
    video.addEventListener('seeked', () => {
      ctx.drawImage(video, 0, 0);
      const thumbnail = canvas.toDataURL('image/jpeg', 0.8);
      resolve(thumbnail);
    });
    
    video.addEventListener('error', () => {
      // Fallback till en standard video-ikon som data URL
      resolve('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyMCIgdmlld0JveD0iMCAwIDEyMCAxMjAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjEyMCIgaGVpZ2h0PSIxMjAiIGZpbGw9IiM2YjcyODAiLz48cGF0aCBkPSJNNDUgNDBWODBMNzUgNjBMNDUgNDBaIiBmaWxsPSJ3aGl0ZSIvPjwvc3ZnPg==');
    });
    
    video.src = URL.createObjectURL(file);
  });
};

// Hjälpfunktion för att konvertera File[] till MediaFile[]
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
  const [allRegistrations, setAllRegistrations] = useState<string[]>([]); // För autocomplete
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

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
  
  // Skador - gamla (från databas) och nya
  const [existingDamages, setExistingDamages] = useState<ExistingDamage[]>([]);
  const [skadekontroll, setSkadekontroll] = useState<'ej_skadekontrollerad' | 'nya_skador' | 'inga_nya_skador' | null>(null);
  const [newDamages, setNewDamages] = useState<{id: string; type: string; text: string; media: MediaFile[]}[]>([]);
  
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

  // Filtrera förslag baserat på input
  const suggestions = useMemo(() => {
    if (!regInput.trim()) return [];
    const input = regInput.toUpperCase();
    return allRegistrations
      .filter(reg => reg.toUpperCase().startsWith(input))
      .slice(0, 5); // Max 5 förslag
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
          
          // Skapa ExistingDamage-objekt från databasen
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
                documented: false,
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

  // Extrahera data
  const carModel = carData[0]?.brand_model || null;
  const wheelStorage = carData[0]?.wheelstorage || null;
  const saludatum = carData[0]?.saludatum || null;

  const availableStations = ort ? STATIONER[ort] || [] : [];

  const canSave = () => {
    if (!regInput.trim()) return false;
    if (!matarstallning.trim()) return false;
    
    const hasLocation = annanPlats ? 
      annanPlatsText.trim().length > 0 : 
      (ort && station);
      
    if (!hasLocation) return false;
    
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
    
    if (spolarvatska === null) return false;
    if (insynsskydd === null) return false;
    if (antalLaddkablar === null) return false;
    if (hjultyp === null) return false;
    if (adblue === null) return false;
    if (tvatt === null) return false;
    if (inre === null) return false;
    if (skadekontroll === null) return false;
    
    if (skadekontroll === 'nya_skador') {
      if (newDamages.length === 0) return false;
      if (newDamages.some(damage => !damage.type || !damage.text.trim())) return false;
    }
    
    // Kontrollera att dokumenterade gamla skador har beskrivning
    const documentedOldDamages = existingDamages.filter(d => d.documented);
    if (documentedOldDamages.some(damage => !damage.userDescription?.trim())) return false;
    
    if (uthyrningsstatus === null) return false;
    
    // Obligatorisk preliminär avslut notering
    if (!preliminarAvslutNotering.trim()) return false;
    
    return true;
  };

  const resetForm = () => {
    setRegInput('');
    setCarData([]);
    setExistingDamages([]);
    setShowSuggestions(false);
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

  const handleSave = () => {
    console.log('Sparar incheckning...');
    console.log('Dokumenterade gamla skador:', existingDamages.filter(d => d.documented));
    console.log('Nya skador:', newDamages);
    setShowSuccessModal(true);
  };

  // Funktioner för befintliga skador
  const toggleExistingDamageDocumentation = (id: string) => {
    setExistingDamages(prev => prev.map(d => 
      d.id === id ? { ...d, documented: !d.documented, userDescription: d.documented ? '' : d.userDescription, media: d.documented ? [] : d.media } : d
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
      text: '',
      media: []
    }]);
  };

  const removeDamage = (id: string) => {
    setNewDamages(prev => prev.filter(d => d.id !== id));
  };

  const updateDamageType = (id: string, type: string) => {
    setNewDamages(prev => prev.map(d => d.id === id ? {...d, type} : d));
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

  // Hantera reg.nr input och autocomplete
  const handleRegInputChange = (value: string) => {
    setRegInput(value.toUpperCase());
    setShowSuggestions(value.length > 0 && suggestions.length > 0);
  };

  const selectSuggestion = (suggestion: string) => {
    setRegInput(suggestion);
    setShowSuggestions(false);
  };

  // Förbättrad sektion-separator med större, tydligare rubriker
  const SectionHeader = ({ title }: { title: string }) => (
    <div style={{
      marginTop: '40px',
      marginBottom: '20px',
      paddingBottom: '12px',
      borderBottom: '2px solid #e5e7eb'
    }}>
      <h2 style={{ 
        fontSize: '22px', 
        fontWeight: '700', 
        margin: 0,
        color: '#1f2937',
        letterSpacing: '0.05em',
        textTransform: 'uppercase'
      }}>
        {title}
      </h2>
    </div>
  );

  // Undersektion för skador
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

  // Media upload component - nu med separata knappar för Android-kompatibilitet
  const MediaUpload = ({ 
    damageId, 
    isOld, 
    onMediaUpdate 
  }: { 
    damageId: string; 
    isOld: boolean; 
    onMediaUpdate: (id: string, files: FileList | null) => void; 
  }) => (
    <div style={{ marginBottom: '12px' }}>
      <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
        Lägg till bild eller video
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
              border: '2px dashed #10b981',
              borderRadius: '6px',
              fontSize: '16px',
              backgroundColor: '#f0fdf4',
              textAlign: 'center',
              cursor: 'pointer',
              color: '#047857'
            }}
          >
            📷 Ta foto
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
              border: '2px dashed #dc2626',
              borderRadius: '6px',
              fontSize: '16px',
              backgroundColor: '#fef2f2',
              textAlign: 'center',
              cursor: 'pointer',
              color: '#dc2626'
            }}
          >
            🎥 Spela in video
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
    </div>
  );

  return (
    <div style={{ 
      minHeight: '100vh',
      backgroundColor: '#f8fafc',
      color: '#111827'
    }}>
      {/* Full-width MABI Header med Cobalt Blue från brandguiden */}
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
          
          {/* MABI-logga med vit bakgrund */}
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
                // Fallback till text-logga om bilden inte laddar
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
      }}>{/* Registreringsnummer med autocomplete */}
        <div style={{ 
          backgroundColor: '#ffffff',
          padding: '24px',
          borderRadius: '12px',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          position: 'relative'
        }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '16px' }}>
            Registreringsnummer *
          </label>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              value={regInput}
              onChange={(e) => handleRegInputChange(e.target.value)}
              onFocus={() => setShowSuggestions(regInput.length > 0 && suggestions.length > 0)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)} // Delay för att hantera klick på förslag
              placeholder="Skriv reg.nr"
              spellCheck={false}
              autoComplete="off"
              style={{
                width: '100%',
                padding: '14px',
                border: '2px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '18px',
                fontWeight: '600',
                backgroundColor: '#ffffff',
                textAlign: 'center',
                letterSpacing: '2px'
              }}
            />
            
            {/* Autocomplete-förslag */}
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

        {/* Plats för incheckning */}
        <div style={{ 
          backgroundColor: '#ffffff',
          padding: '24px',
          borderRadius: '12px',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
        }}>
          <SectionHeader title="Plats för incheckning" />
        
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
                    border: '1px solid #d1d5db',
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
                    border: '1px solid #d1d5db',
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
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '16px',
                  backgroundColor: '#ffffff'
                }}
              />
            </div>
          )}
        </div>

        {/* Fordonsstatus - utan "Bränsle/Energi"-rubrik */}
        <div style={{ 
          backgroundColor: '#ffffff',
          padding: '24px',
          borderRadius: '12px',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
        }}>
          <SectionHeader title="Fordonsstatus" />
        
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
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '16px',
                  backgroundColor: '#ffffff'
                }}
              />
              <span style={{ color: '#666', fontWeight: '500' }}>km</span>
            </div>
          </div>

          {/* Drivmedel direkt utan underrubrik */}
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
                }}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #d1d5db',
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
                }}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #d1d5db',
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

          {/* Visa tanknivå för bensin/diesel */}
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

          {/* Visa laddnivå för elbil */}
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

          {/* Övriga fordonsstatus-fält i kompakt layout */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
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
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
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
        </div>

        {/* Rengöring */}
        <div style={{ 
          backgroundColor: '#ffffff',
          padding: '24px',
          borderRadius: '12px',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
        }}>
          <SectionHeader title="Rengöring" />

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
        </div>

        {/* Skador */}
        <div style={{ 
          backgroundColor: '#ffffff',
          padding: '24px',
          borderRadius: '12px',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
        }}>
          <SectionHeader title="Skador" />

          {/* Gamla skador - nu från databas */}
          <SubSectionHeader title="Gamla skador" />
          <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '16px' }}>
            Klicka på de befintliga skador du vill dokumentera mer detaljerat med egen beskrivning och bild/video.
          </p>

          {existingDamages.length > 0 ? (
            <div style={{ marginBottom: '20px' }}>
              {existingDamages.map(damage => (
                <div key={damage.id} style={{ marginBottom: '12px' }}>
                  <button
                    type="button"
                    onClick={() => toggleExistingDamageDocumentation(damage.id)}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '2px solid #d1d5db',
                      borderRadius: '8px',
                      backgroundColor: damage.documented ? '#dbeafe' : '#ffffff',
                      color: damage.documented ? '#1e40af' : '#374151',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontSize: '16px',
                      fontWeight: damage.documented ? '600' : '500',
                      transition: 'all 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px'
                    }}
                  >
                    <span style={{
                      width: '20px',
                      height: '20px',
                      border: '2px solid',
                      borderColor: damage.documented ? '#1e40af' : '#9ca3af',
                      borderRadius: '4px',
                      backgroundColor: damage.documented ? '#1e40af' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '14px',
                      color: '#ffffff'
                    }}>
                      {damage.documented ? '✓' : ''}
                    </span>
                    {damage.fullText}
                  </button>

                  {damage.documented && (
                    <div style={{
                      marginTop: '12px',
                      padding: '16px',
                      border: '1px solid #bfdbfe',
                      borderRadius: '8px',
                      backgroundColor: '#eff6ff'
                    }}>
                      <div style={{ marginBottom: '12px' }}>
                        <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
                          Din detaljerade beskrivning *
                        </label>
                        <textarea
                          value={damage.userDescription || ''}
                          onChange={(e) => updateExistingDamageDescription(damage.id, e.target.value)}
                          placeholder={`Beskriv "${damage.shortText}" mer detaljerat...`}
                          rows={3}
                          style={{
                            width: '100%',
                            padding: '12px',
                            border: '1px solid #d1d5db',
                            borderRadius: '6px',
                            fontSize: '16px',
                            backgroundColor: '#ffffff',
                            resize: 'vertical'
                          }}
                        />
                      </div>

                      <MediaUpload 
                        damageId={damage.id} 
                        isOld={true} 
                        onMediaUpdate={updateExistingDamageMedia} 
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

          {/* Nya skador fält */}
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
                      Typ av skada *
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

                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
                      Beskrivning av skada *
                    </label>
                    <input
                      type="text"
                      value={damage.text}
                      onChange={(e) => updateDamageText(damage.id, e.target.value)}
                      placeholder="Beskriv skadan..."
                      style={{
                        width: '100%',
                        padding: '12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '16px',
                        backgroundColor: '#ffffff'
                      }}
                    />
                  </div>

                  <MediaUpload 
                    damageId={damage.id} 
                    isOld={false} 
                    onMediaUpdate={updateDamageMedia} 
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
        </div>

        {/* Uthyrningsstatus */}
        <div style={{ 
          backgroundColor: '#ffffff',
          padding: '24px',
          borderRadius: '12px',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
        }}>
          <SectionHeader title="Uthyrningsstatus" />

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

          {/* Prel. avslut notering - nu obligatorisk */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
              Prel. avslut notering *
            </label>
            <textarea
              value={preliminarAvslutNotering}
              onChange={(e) => setPreliminarAvslutNotering(e.target.value)}
              placeholder="Preliminära kommentarer för avslut..."
              rows={3}
              style={{
                width: '100%',
                padding: '12px',
                border: preliminarAvslutNotering.trim() ? '1px solid #d1d5db' : '2px solid #dc2626',
                borderRadius: '6px',
                fontSize: '16px',
                backgroundColor: '#ffffff',
                resize: 'vertical'
              }}
            />
            {!preliminarAvslutNotering.trim() && (
              <p style={{ color: '#dc2626', fontSize: '12px', marginTop: '4px' }}>
                Detta fält är obligatoriskt
              </p>
            )}
          </div>
        </div>

        {/* Spara knapp */}
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
            disabled={!canSave()}
            style={{
              width: '100%',
              padding: '18px',
              backgroundColor: canSave() ? '#10b981' : '#9ca3af',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '20px',
              fontWeight: '600',
              cursor: canSave() ? 'pointer' : 'not-allowed',
              opacity: canSave() ? 1 : 0.6,
              boxShadow: canSave() ? '0 4px 12px rgba(16, 185, 129, 0.3)' : 'none'
            }}
          >
            {canSave() ? 'Spara incheckning' : 'Fyll i alla obligatoriska fält'}
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

'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';

// Constants
const MABI_LOGO_URL = "https://ufioaijcmaujlvmveyra.supabase.co/storage/v1/object/public/MABI%20Syd%20logga/MABI%20Syd%20logga%202.png";
const BACKGROUND_IMAGE_URL = "https://ufioaijcmaujlvmveyra.supabase.co/storage/v1/object/public/Svart%20bakgrund%20MB%20grill/MB%20front%20grill%20logo.jpg";

const ORTER = ['Malmö', 'Helsingborg', 'Ängelholm', 'Halmstad', 'Falkenberg', 'Trelleborg', 'Varberg', 'Lund'].sort();

const STATIONER: Record<string, string[]> = {
  'Malmö': ['FORD Malmö', 'MB Malmö', 'Mechanum', 'Malmö Automera', 'Mercedes Malmö', 'Werksta St Bernstorp', 'Werksta Malmö Hamn', 'Hedbergs Malmö', 'Hedin Automotive Burlöv', 'Sturup'],
  'Helsingborg': ['MB Helsingborg', 'HBSC Helsingborg', 'FORD Helsingborg', 'Transport Helsingborg', 'S. Jönsson', 'BMW Helsingborg', 'KIA Helsingborg', 'Euromaster Helsingborg', 'B/S Klippan', 'B/S Munka-Ljungby', 'B/S Helsingborg', 'Werksta Helsingborg', 'Båstad'],
  'Lund': ['FORD Lund', 'Hedin Lund', 'B/S Lund', 'P7 Revinge'],
  'Ängelholm': ['FORD Ängelholm', 'Mekonomen Ängelholm', 'Flyget Ängelholm'],
  'Falkenberg': ['Falkenberg'],
  'Halmstad': ['Flyget Halmstad', 'KIA Halmstad', 'FORD Halmstad'],
  'Trelleborg': ['Trelleborg'],
  'Varberg': ['FORD Varberg', 'Hedin Automotive Varberg', 'Sällstorp lack plåt', 'Finnveden plåt']
};

type MediaFile = {
  file: File;
  type: 'image' | 'video';
  preview?: string;
  thumbnail?: string;
};

const capitalizeFirstLetter = (str: string): string => {
  return str.charAt(0).toUpperCase() + str.slice(1);
};

const getFirstNameFromEmail = (email: string): string => {
  if (!email) return 'Okänd';
  const namePart = email.split('@')[0];
  const firstName = namePart.split('.')[0];
  return capitalizeFirstLetter(firstName);
};

const getFullNameFromEmail = (email: string): string => {
  if (!email) return 'Okänd';
  const namePart = email.split('@')[0];
  const parts = namePart.split('.');
  if (parts.length >= 2) {
    const firstName = capitalizeFirstLetter(parts[0]);
    const lastName = capitalizeFirstLetter(parts[1]);
    return `${firstName} ${lastName}`;
  }
  return capitalizeFirstLetter(parts[0]);
};

const getFileType = (file: File) => file.type.startsWith('video') ? 'video' : 'image';

const createVideoThumbnail = (file: File): Promise<string> => new Promise(resolve => {
  const video = document.createElement('video');
  video.src = URL.createObjectURL(file);
  video.onloadeddata = () => { video.currentTime = 1; };
  video.onseeked = () => {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) { resolve(''); return; }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    resolve(canvas.toDataURL());
    URL.revokeObjectURL(video.src);
  };
  video.onerror = () => { resolve(''); URL.revokeObjectURL(video.src); };
});

const processFiles = async (files: FileList): Promise<MediaFile[]> => {
  return await Promise.all(Array.from(files).map(async file => {
    const type = getFileType(file);
    if (type === 'video') {
      const thumbnail = await createVideoThumbnail(file);
      return { file, type, thumbnail };
    }
    return { file, type, preview: URL.createObjectURL(file) };
  }));
};

const hasPhoto = (files?: MediaFile[]) => Array.isArray(files) && files.some(f => f?.type === 'image');
const hasVideo = (files?: MediaFile[]) => Array.isArray(files) && files.some(f => f?.type === 'video');

// Fuel type constants
const FUEL_TYPES = {
  BENSIN: 'Bensin',
  DIESEL: 'Diesel',
  HYBRID_BENSIN: 'Hybrid (bensin)',
  HYBRID_DIESEL: 'Hybrid (diesel)',
  EL_FULL: 'El (full)'
} as const;

export default function NybilForm() {
  const [firstName, setFirstName] = useState('');
  const [fullName, setFullName] = useState('');
  const [regInput, setRegInput] = useState('');
  const [bilmarke, setBilmarke] = useState('');
  const [modell, setModell] = useState('');
  const [ort, setOrt] = useState('');
  const [station, setStation] = useState('');
  const [matarstallning, setMatarstallning] = useState('');
  const [hjultyp, setHjultyp] = useState<'Sommardäck' | 'Vinterdäck' | null>(null);
  
  // Fuel/charging
  const [bransletyp, setBransletyp] = useState<'Bensin' | 'Diesel' | 'Hybrid (bensin)' | 'Hybrid (diesel)' | 'El (full)' | null>(null);
  const [laddnivaProcent, setLaddnivaProcent] = useState('');
  const [tankstatus, setTankstatus] = useState<'mottogs_fulltankad' | 'tankad_nu' | 'ej_upptankad' | null>(null);
  const [upptankningLiter, setUpptankningLiter] = useState('');
  const [upptankningLiterpris, setUpptankningLiterpris] = useState('');
  
  // Equipment inventory - discrete counts
  const [antalInsynsskydd, setAntalInsynsskydd] = useState<0 | 1 | 2>(0);
  const [antalBocker, setAntalBocker] = useState<0 | 1 | 2 | 3>(0);
  const [antalCoc, setAntalCoc] = useState<0 | 1>(0);
  const [antalNycklar, setAntalNycklar] = useState<0 | 1 | 2>(0);
  const [nycklarBeskrivning, setNycklarBeskrivning] = useState('');
  const [antalLaddkablar, setAntalLaddkablar] = useState<0 | 1 | 2>(0);
  const [hjulEjMonterade, setHjulEjMonterade] = useState<'Vinterdäck' | 'Sommardäck' | null>(null);
  const [hjulForvaring, setHjulForvaring] = useState('');
  const [antalLasbultar, setAntalLasbultar] = useState<0 | 1 | 2 | 3 | 4>(0);
  
  // Current location
  const [platsAktuellOrt, setPlatsAktuellOrt] = useState('');
  const [platsAktuellStation, setPlatsAktuellStation] = useState('');
  
  // Mileage status: 'same' or 'new'
  const [matarstallningMode, setMatarstallningMode] = useState<'same' | 'new' | null>(null);
  const [matarstallningAktuell, setMatarstallningAktuell] = useState('');
  
  // Ready for rental
  const [klarForUthyrning, setKlarForUthyrning] = useState<boolean | null>(null);
  const [klarForUthyrningNotering, setKlarForUthyrningNotering] = useState('');
  
  // Notes and media
  const [anteckningar, setAnteckningar] = useState('');
  const [media, setMedia] = useState<MediaFile[]>([]);
  
  // UI state
  const [isSaving, setIsSaving] = useState(false);
  const [showFieldErrors, setShowFieldErrors] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  
  const normalizedReg = useMemo(() => regInput.toUpperCase().replace(/\s/g, ''), [regInput]);
  const availableStations = useMemo(() => STATIONER[ort] || [], [ort]);
  const availableStationsAktuell = useMemo(() => STATIONER[platsAktuellOrt] || [], [platsAktuellOrt]);
  const currentYear = useMemo(() => new Date().getFullYear(), []);
  
  const isElectric = bransletyp === FUEL_TYPES.EL_FULL;
  const isHybrid = bransletyp === FUEL_TYPES.HYBRID_BENSIN || bransletyp === FUEL_TYPES.HYBRID_DIESEL;
  const needsLaddkablar = isElectric || isHybrid;
  
  const hasFordonStatusErrors = useMemo(() => {
    if (!matarstallning || !hjultyp || !bransletyp) return true;
    if (isElectric && !laddnivaProcent) return true;
    if (!isElectric && (!tankstatus || (tankstatus === 'tankad_nu' && (!upptankningLiter || !upptankningLiterpris)))) return true;
    return false;
  }, [matarstallning, hjultyp, bransletyp, isElectric, laddnivaProcent, tankstatus, upptankningLiter, upptankningLiterpris]);
  
  const handleLaddningChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val === '') { 
      setLaddnivaProcent(''); 
      return; 
    }
    const num = parseInt(val, 10);
    if (!isNaN(num)) {
      setLaddnivaProcent(num > 100 ? '100' : num < 0 ? '0' : val);
    }
  };
  
  const formIsValid = useMemo(() => {
    // Required: regnr, bilmarke, modell, ort, station, matarstallning, hjultyp, bransletyp
    if (!regInput || !bilmarke || !modell || !ort || !station || !matarstallning || !hjultyp || !bransletyp) return false;
    
    // If El (full): require laddniva_procent (0-100)
    if (isElectric) {
      const laddniva = parseInt(laddnivaProcent, 10);
      if (!laddnivaProcent || isNaN(laddniva) || laddniva < 0 || laddniva > 100) return false;
    }
    
    // Else (Bensin/Diesel/Hybrids): require tankstatus
    if (!isElectric) {
      if (!tankstatus) return false;
      // If tankstatus = 'tankad_nu', require upptankning_liter and upptankning_literpris (> 0)
      if (tankstatus === 'tankad_nu') {
        const liter = parseFloat(upptankningLiter);
        const literpris = parseFloat(upptankningLiterpris);
        if (!upptankningLiter || !upptankningLiterpris || isNaN(liter) || isNaN(literpris) || liter <= 0 || literpris <= 0) return false;
      }
    }
    
    // Required wheels-to-storage: both hjul_ej_monterade and hjul_forvaring must be present
    if (!hjulEjMonterade || !hjulForvaring.trim()) return false;
    
    // Require current location
    if (!platsAktuellOrt || !platsAktuellStation) return false;
    
    // Status nu section validations
    // Require matarstallning mode choice
    if (!matarstallningMode) return false;
    
    // If "new" mileage mode: require value and it must be > matarstallning_inkop
    if (matarstallningMode === 'new') {
      const inkop = parseInt(matarstallning, 10);
      const aktuell = parseInt(matarstallningAktuell, 10);
      if (!matarstallningAktuell || isNaN(aktuell) || isNaN(inkop) || aktuell <= inkop) return false;
    }
    
    // Require klar_for_uthyrning choice
    if (klarForUthyrning === null) return false;
    
    // If klarForUthyrning is false (NEJ), require notering
    if (klarForUthyrning === false && !klarForUthyrningNotering.trim()) return false;
    
    return true;
  }, [regInput, bilmarke, modell, ort, station, matarstallning, hjultyp, bransletyp, isElectric, laddnivaProcent, tankstatus, upptankningLiter, upptankningLiterpris, hjulEjMonterade, hjulForvaring, platsAktuellOrt, platsAktuellStation, matarstallningMode, matarstallningAktuell, klarForUthyrning, klarForUthyrningNotering]);
  
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const email = user?.email || '';
      setFirstName(getFirstNameFromEmail(email));
      setFullName(getFullNameFromEmail(email));
    };
    getUser();
    
    // Cleanup function to revoke all object URLs on unmount
    return () => {
      media.forEach(m => {
        if (m.preview) URL.revokeObjectURL(m.preview);
        if (m.thumbnail) URL.revokeObjectURL(m.thumbnail);
      });
    };
  }, [media]);
  
  const handleMediaUpdate = async (files: FileList) => {
    const processed = await processFiles(files);
    setMedia(prev => [...prev, ...processed]);
  };
  
  const handleMediaRemove = (index: number) => {
    setMedia(prev => {
      const newMedia = [...prev];
      const removedItem = newMedia[index];
      // Clean up object URLs to prevent memory leaks
      if (removedItem?.preview) {
        URL.revokeObjectURL(removedItem.preview);
      }
      if (removedItem?.thumbnail) {
        URL.revokeObjectURL(removedItem.thumbnail);
      }
      newMedia.splice(index, 1);
      return newMedia;
    });
  };
  
  const handleShowErrors = () => {
    setShowFieldErrors(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const firstError = document.querySelector('.card[data-error="true"], .field[data-error="true"]') as HTMLElement | null;
        if (firstError) {
          firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
          const focusable = firstError.querySelector('input, select, textarea') as HTMLElement | null;
          focusable?.focus();
        }
      });
    });
  };
  
  const resetForm = () => {
    setRegInput('');
    setBilmarke('');
    setModell('');
    setOrt('');
    setStation('');
    setMatarstallning('');
    setHjultyp(null);
    setBransletyp(null);
    setLaddnivaProcent('');
    setTankstatus(null);
    setUpptankningLiter('');
    setUpptankningLiterpris('');
    setAntalInsynsskydd(0);
    setAntalBocker(0);
    setAntalCoc(0);
    setAntalNycklar(0);
    setNycklarBeskrivning('');
    setAntalLaddkablar(0);
    setHjulEjMonterade(null);
    setHjulForvaring('');
    setAntalLasbultar(0);
    setPlatsAktuellOrt('');
    setPlatsAktuellStation('');
    setMatarstallningMode(null);
    setMatarstallningAktuell('');
    setKlarForUthyrning(null);
    setKlarForUthyrningNotering('');
    setAnteckningar('');
    setMedia([]);
    setShowFieldErrors(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  
  const handleSubmit = async () => {
    if (!formIsValid) {
      handleShowErrors();
      return;
    }
    
    setIsSaving(true);
    try {
      const now = new Date();
      
      // Prepare data for database
      const inventoryData = {
        regnr: normalizedReg,
        bilmarke,
        modell,
        registrerad_av: firstName,
        fullstandigt_namn: fullName,
        registreringsdatum: now.toISOString().split('T')[0],
        plats_mottagning_ort: ort,
        plats_mottagning_station: station,
        matarstallning_inkop: matarstallning,
        hjultyp,
        hjul_forvaring: hjulForvaring,
        hjul_ej_monterade: hjulEjMonterade,
        antal_insynsskydd: antalInsynsskydd,
        antal_bocker: antalBocker,
        antal_coc: antalCoc,
        antal_nycklar: antalNycklar,
        nycklar_beskrivning: nycklarBeskrivning || null,
        antal_laddkablar: needsLaddkablar ? antalLaddkablar : 0,
        antal_lasbultar: antalLasbultar,
        bransletyp,
        laddniva_procent: isElectric && laddnivaProcent ? parseInt(laddnivaProcent, 10) : null,
        tankstatus: !isElectric ? tankstatus : null,
        upptankning_liter: !isElectric && tankstatus === 'tankad_nu' && upptankningLiter ? parseFloat(upptankningLiter) : null,
        upptankning_literpris: !isElectric && tankstatus === 'tankad_nu' && upptankningLiterpris ? parseFloat(upptankningLiterpris) : null,
        plats_aktuell_ort: platsAktuellOrt,
        plats_aktuell_station: platsAktuellStation,
        matarstallning_aktuell: matarstallningMode === 'new' && matarstallningAktuell ? parseInt(matarstallningAktuell, 10) : null,
        klar_for_uthyrning: klarForUthyrning,
        klar_for_uthyrning_notering: klarForUthyrning === false ? klarForUthyrningNotering : null,
        anteckningar: anteckningar || null,
        photo_urls: [],
        video_urls: [],
        media_folder: null
      };
      
      // Insert into database
      const { data, error } = await supabase
        .from('nybil_inventering')
        .insert([inventoryData])
        .select();
      
      if (error) {
        console.error('Database error:', error);
        alert(`Fel vid sparande: ${error.message}`);
        return;
      }
      
      console.log('Successfully saved:', data);
      setShowSuccessModal(true);
      setTimeout(() => {
        setShowSuccessModal(false);
        resetForm();
      }, 3000);
      
    } catch (error) {
      console.error('Save error:', error);
      alert('Något gick fel vid sparande. Vänligen försök igen.');
    } finally {
      setIsSaving(false);
    }
  };
  
  const handleCancel = () => {
    if (confirm('Är du säker? Alla ifyllda data kommer att raderas.')) {
      resetForm();
    }
  };
  
  return (
    <div className="nybil-form">
      <GlobalStyles backgroundUrl={BACKGROUND_IMAGE_URL} />
      {isSaving && <SpinnerOverlay />}
      {showSuccessModal && <SuccessModal firstName={firstName} />}
      
      <div className="main-header">
        <img src={MABI_LOGO_URL} alt="MABI Logo" className="main-logo" />
        {fullName && <p className="user-info">Inloggad: {fullName}</p>}
      </div>
      
      <Card data-error={showFieldErrors && (!regInput || !bilmarke || !modell)}>
        <SectionHeader title="Fordon" />
        <Field label="Registreringsnummer *">
          <input
            type="text"
            value={regInput}
            onChange={(e) => setRegInput(e.target.value)}
            placeholder="ABC 123"
            className="reg-input"
          />
        </Field>
        <div className="grid-2-col">
          <Field label="Bilmärke *">
            <input
              type="text"
              value={bilmarke}
              onChange={(e) => setBilmarke(e.target.value)}
              placeholder="t.ex. Mercedes-Benz"
            />
          </Field>
          <Field label="Modell *">
            <input
              type="text"
              value={modell}
              onChange={(e) => setModell(e.target.value)}
              placeholder="t.ex. C220"
            />
          </Field>
        </div>
      </Card>
      
      <Card data-error={showFieldErrors && (!ort || !station)}>
        <SectionHeader title="Plats för mottagning av ny bil" />
        <div className="grid-2-col">
          <Field label="Ort *">
            <select value={ort} onChange={e => { setOrt(e.target.value); setStation(''); }}>
              <option value="">Välj ort</option>
              {ORTER.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>
          <Field label="Station *">
            <select value={station} onChange={e => setStation(e.target.value)} disabled={!ort}>
              <option value="">Välj station</option>
              {availableStations.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
        </div>
      </Card>
      
      <Card data-error={showFieldErrors && hasFordonStatusErrors}>
        <SectionHeader title="Fordonsstatus" />
        <Field label="Mätarställning vid inköp (km) *">
          <input
            type="number"
            value={matarstallning}
            onChange={e => setMatarstallning(e.target.value)}
            placeholder="12345"
          />
        </Field>
        
        <SubSectionHeader title="Däck" />
        <Field label="Däcktyp som sitter på *">
          <div className="grid-2-col">
            <ChoiceButton
              onClick={() => setHjultyp('Sommardäck')}
              isActive={hjultyp === 'Sommardäck'}
              isSet={hjultyp !== null}
            >
              Sommardäck
            </ChoiceButton>
            <ChoiceButton
              onClick={() => setHjultyp('Vinterdäck')}
              isActive={hjultyp === 'Vinterdäck'}
              isSet={hjultyp !== null}
            >
              Vinterdäck
            </ChoiceButton>
          </div>
        </Field>
        
        <SubSectionHeader title="Drivmedel" />
        <Field label="Drivmedel *">
          <div className="grid-2-col">
            <ChoiceButton
              onClick={() => { setBransletyp(FUEL_TYPES.BENSIN); setTankstatus(null); setLaddnivaProcent(''); }}
              isActive={bransletyp === FUEL_TYPES.BENSIN}
              isSet={bransletyp !== null}
            >
              Bensin
            </ChoiceButton>
            <ChoiceButton
              onClick={() => { setBransletyp(FUEL_TYPES.DIESEL); setTankstatus(null); setLaddnivaProcent(''); }}
              isActive={bransletyp === FUEL_TYPES.DIESEL}
              isSet={bransletyp !== null}
            >
              Diesel
            </ChoiceButton>
          </div>
          <div className="grid-2-col" style={{ marginTop: '0.5rem' }}>
            <ChoiceButton
              onClick={() => { setBransletyp(FUEL_TYPES.HYBRID_BENSIN); setTankstatus(null); setLaddnivaProcent(''); }}
              isActive={bransletyp === FUEL_TYPES.HYBRID_BENSIN}
              isSet={bransletyp !== null}
            >
              Hybrid (bensin)
            </ChoiceButton>
            <ChoiceButton
              onClick={() => { setBransletyp(FUEL_TYPES.HYBRID_DIESEL); setTankstatus(null); setLaddnivaProcent(''); }}
              isActive={bransletyp === FUEL_TYPES.HYBRID_DIESEL}
              isSet={bransletyp !== null}
            >
              Hybrid (diesel)
            </ChoiceButton>
          </div>
          <div style={{ marginTop: '0.5rem' }}>
            <ChoiceButton
              onClick={() => { setBransletyp(FUEL_TYPES.EL_FULL); setTankstatus(null); setUpptankningLiter(''); setUpptankningLiterpris(''); }}
              isActive={bransletyp === FUEL_TYPES.EL_FULL}
              isSet={bransletyp !== null}
              className="full-width-choice"
            >
              El (full)
            </ChoiceButton>
          </div>
        </Field>
        
        {isElectric && (
          <Field label="Laddnivå (%) *">
            <input
              type="number"
              value={laddnivaProcent}
              onChange={handleLaddningChange}
              placeholder="0-100"
              min="0"
              max="100"
            />
          </Field>
        )}
        
        {!isElectric && bransletyp && (
          <>
            <Field label="Tankstatus *">
              <div className="grid-3-col">
                <ChoiceButton
                  onClick={() => { setTankstatus('mottogs_fulltankad'); setUpptankningLiter(''); setUpptankningLiterpris(''); }}
                  isActive={tankstatus === 'mottogs_fulltankad'}
                  isSet={tankstatus !== null}
                >
                  Mottogs fulltankad
                </ChoiceButton>
                <ChoiceButton
                  onClick={() => setTankstatus('tankad_nu')}
                  isActive={tankstatus === 'tankad_nu'}
                  isSet={tankstatus !== null}
                >
                  Tankad nu av MABI
                </ChoiceButton>
                <ChoiceButton
                  onClick={() => { setTankstatus('ej_upptankad'); setUpptankningLiter(''); setUpptankningLiterpris(''); }}
                  isActive={tankstatus === 'ej_upptankad'}
                  isSet={tankstatus !== null}
                >
                  Ej upptankad vid mottagande
                </ChoiceButton>
              </div>
            </Field>
            
            {tankstatus === 'tankad_nu' && (
              <div className="grid-2-col">
                <Field label="Antal liter *">
                  <input
                    type="number"
                    value={upptankningLiter}
                    onChange={e => setUpptankningLiter(e.target.value)}
                    placeholder="50"
                    step="0.01"
                    min="0"
                  />
                </Field>
                <Field label="Literpris (kr) *">
                  <input
                    type="number"
                    value={upptankningLiterpris}
                    onChange={e => setUpptankningLiterpris(e.target.value)}
                    placeholder="20.50"
                    step="0.01"
                    min="0"
                  />
                </Field>
              </div>
            )}
          </>
        )}
      </Card>
      
      <Card>
        <SectionHeader title="Utrustning" />
        
        <Field label="Antal insynsskydd">
          <div className="grid-3-col">
            <ChoiceButton onClick={() => setAntalInsynsskydd(0)} isActive={antalInsynsskydd === 0}>0</ChoiceButton>
            <ChoiceButton onClick={() => setAntalInsynsskydd(1)} isActive={antalInsynsskydd === 1}>1</ChoiceButton>
            <ChoiceButton onClick={() => setAntalInsynsskydd(2)} isActive={antalInsynsskydd === 2}>2</ChoiceButton>
          </div>
        </Field>
        
        <Field label="Antal böcker/manualer">
          <div className="grid-4-col">
            <ChoiceButton onClick={() => setAntalBocker(0)} isActive={antalBocker === 0}>0</ChoiceButton>
            <ChoiceButton onClick={() => setAntalBocker(1)} isActive={antalBocker === 1}>1</ChoiceButton>
            <ChoiceButton onClick={() => setAntalBocker(2)} isActive={antalBocker === 2}>2</ChoiceButton>
            <ChoiceButton onClick={() => setAntalBocker(3)} isActive={antalBocker === 3}>3</ChoiceButton>
          </div>
        </Field>
        
        <Field label="Antal COC-dokument">
          <div className="grid-2-col">
            <ChoiceButton onClick={() => setAntalCoc(0)} isActive={antalCoc === 0}>0</ChoiceButton>
            <ChoiceButton onClick={() => setAntalCoc(1)} isActive={antalCoc === 1}>1</ChoiceButton>
          </div>
        </Field>
        
        <Field label="Antal nycklar">
          <div className="grid-3-col">
            <ChoiceButton onClick={() => setAntalNycklar(0)} isActive={antalNycklar === 0}>0</ChoiceButton>
            <ChoiceButton onClick={() => setAntalNycklar(1)} isActive={antalNycklar === 1}>1</ChoiceButton>
            <ChoiceButton onClick={() => setAntalNycklar(2)} isActive={antalNycklar === 2}>2</ChoiceButton>
          </div>
        </Field>
        
        <Field label="Beskrivning av nycklar (frivilligt)">
          <input
            type="text"
            value={nycklarBeskrivning}
            onChange={e => setNycklarBeskrivning(e.target.value)}
            placeholder="t.ex. 1 vanlig nyckel, 1 reservnyckel"
          />
        </Field>
        
        {needsLaddkablar && (
          <Field label="Antal laddkablar">
            <div className="grid-3-col">
              <ChoiceButton onClick={() => setAntalLaddkablar(0)} isActive={antalLaddkablar === 0}>0</ChoiceButton>
              <ChoiceButton onClick={() => setAntalLaddkablar(1)} isActive={antalLaddkablar === 1}>1</ChoiceButton>
              <ChoiceButton onClick={() => setAntalLaddkablar(2)} isActive={antalLaddkablar === 2}>2</ChoiceButton>
            </div>
          </Field>
        )}
        
        <SubSectionHeader title="Medföljande hjul till förvaring" />
        <Field label="Typ *">
          <div className="grid-2-col">
            <ChoiceButton
              onClick={() => setHjulEjMonterade('Vinterdäck')}
              isActive={hjulEjMonterade === 'Vinterdäck'}
              isSet={hjulEjMonterade !== null}
            >
              Vinterdäck
            </ChoiceButton>
            <ChoiceButton
              onClick={() => setHjulEjMonterade('Sommardäck')}
              isActive={hjulEjMonterade === 'Sommardäck'}
              isSet={hjulEjMonterade !== null}
            >
              Sommardäck
            </ChoiceButton>
          </div>
        </Field>
        
        <Field label="Förvaring *">
          <input
            type="text"
            value={hjulForvaring}
            onChange={e => setHjulForvaring(e.target.value)}
            placeholder="t.ex. Station Malmö, hylla 3"
          />
        </Field>
        
        <Field label="Antal låsbultar">
          <div className="grid-5-col">
            <ChoiceButton onClick={() => setAntalLasbultar(0)} isActive={antalLasbultar === 0}>0</ChoiceButton>
            <ChoiceButton onClick={() => setAntalLasbultar(1)} isActive={antalLasbultar === 1}>1</ChoiceButton>
            <ChoiceButton onClick={() => setAntalLasbultar(2)} isActive={antalLasbultar === 2}>2</ChoiceButton>
            <ChoiceButton onClick={() => setAntalLasbultar(3)} isActive={antalLasbultar === 3}>3</ChoiceButton>
            <ChoiceButton onClick={() => setAntalLasbultar(4)} isActive={antalLasbultar === 4}>4</ChoiceButton>
          </div>
        </Field>
        
        <div className="media-section">
          <MediaUpload
            id="general-photo"
            onUpload={handleMediaUpdate}
            hasFile={hasPhoto(media)}
            fileType="image"
            label="Lägg till foton"
            isOptional={true}
          />
          <MediaUpload
            id="general-video"
            onUpload={handleMediaUpdate}
            hasFile={hasVideo(media)}
            fileType="video"
            label="Lägg till videor"
            isOptional={true}
          />
        </div>
        <div className="media-previews">
          {media.map((m, i) => (
            <MediaButton key={i} onRemove={() => handleMediaRemove(i)}>
              <img src={m.thumbnail || m.preview} alt="preview" />
            </MediaButton>
          ))}
        </div>
      </Card>
      
      <Card data-error={showFieldErrors && (!platsAktuellOrt || !platsAktuellStation || !matarstallningMode || (matarstallningMode === 'new' && (!matarstallningAktuell || parseInt(matarstallningAktuell, 10) <= parseInt(matarstallning, 10))) || klarForUthyrning === null || (klarForUthyrning === false && !klarForUthyrningNotering.trim()))}>
        <SectionHeader title="Status nu" />
        
        <SubSectionHeader title="Var är bilen nu?" />
        <div className="grid-2-col">
          <Field label="Ort *">
            <select value={platsAktuellOrt} onChange={e => { setPlatsAktuellOrt(e.target.value); setPlatsAktuellStation(''); }}>
              <option value="">Välj ort</option>
              {ORTER.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>
          <Field label="Station *">
            <select value={platsAktuellStation} onChange={e => setPlatsAktuellStation(e.target.value)} disabled={!platsAktuellOrt}>
              <option value="">Välj station</option>
              {availableStationsAktuell.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
        </div>
        
        <SubSectionHeader title="Mätarställning nu" />
        <Field label="Välj alternativ *">
          <div className="grid-2-col">
            <ChoiceButton
              onClick={() => { setMatarstallningMode('same'); setMatarstallningAktuell(''); }}
              isActive={matarstallningMode === 'same'}
              isSet={matarstallningMode !== null}
            >
              Samma som angavs ovan
            </ChoiceButton>
            <ChoiceButton
              onClick={() => setMatarstallningMode('new')}
              isActive={matarstallningMode === 'new'}
              isSet={matarstallningMode !== null}
            >
              Ny mätarställning
            </ChoiceButton>
          </div>
        </Field>
        
        {matarstallningMode === 'new' && (
          <Field label="Ny mätarställning (km) *">
            <input
              type="number"
              value={matarstallningAktuell}
              onChange={e => setMatarstallningAktuell(e.target.value)}
              placeholder="Måste vara högre än vid inköp"
            />
            {matarstallningAktuell && matarstallning && parseInt(matarstallningAktuell, 10) <= parseInt(matarstallning, 10) && (
              <div style={{ color: 'var(--color-danger)', fontSize: '0.875rem', marginTop: '0.5rem' }}>
                Mätarställningen måste vara högre än vid inköp ({matarstallning} km)
              </div>
            )}
          </Field>
        )}
        
        <SubSectionHeader title="Klar för uthyrning?" />
        <Field label="Status *">
          <div className="grid-2-col">
            <ChoiceButton
              onClick={() => { setKlarForUthyrning(true); setKlarForUthyrningNotering(''); }}
              isActive={klarForUthyrning === true}
              isSet={klarForUthyrning !== null}
            >
              JA
            </ChoiceButton>
            <ChoiceButton
              onClick={() => setKlarForUthyrning(false)}
              isActive={klarForUthyrning === false}
              isSet={klarForUthyrning !== null}
            >
              NEJ
            </ChoiceButton>
          </div>
        </Field>
        
        {klarForUthyrning === false && (
          <Field label="Motivering *">
            <textarea
              value={klarForUthyrningNotering}
              onChange={e => setKlarForUthyrningNotering(e.target.value)}
              placeholder="Beskriv varför bilen inte är klar för uthyrning..."
              rows={3}
            />
          </Field>
        )}
      </Card>
      
      <Card>
        <SectionHeader title="Övrigt" />
        <Field label="Anteckningar (frivilligt)">
          <textarea
            value={anteckningar}
            onChange={e => setAnteckningar(e.target.value)}
            placeholder="Övrig information om bilen..."
            rows={4}
          />
        </Field>
      </Card>
      
      <div className="form-actions">
        <Button onClick={handleCancel} variant="secondary">Avbryt</Button>
        <Button
          onClick={formIsValid ? handleSubmit : handleShowErrors}
          disabled={isSaving}
          variant={formIsValid ? 'success' : 'primary'}
        >
          {isSaving ? 'Sparar...' : (formIsValid ? 'Registrera bil' : 'Visa saknad information')}
        </Button>
      </div>
      
      <footer className="copyright-footer">
        &copy; {currentYear} Albarone AB &mdash; Alla rättigheter förbehållna
      </footer>
    </div>
  );
}

// Sub-components
const Card: React.FC<React.PropsWithChildren<any>> = ({ children, ...props }) => (
  <div className="card" {...props}>{children}</div>
);

const SectionHeader: React.FC<{ title: string }> = ({ title }) => (
  <div className="section-header"><h2>{title}</h2></div>
);

const SubSectionHeader: React.FC<{ title: string }> = ({ title }) => (
  <div className="sub-section-header"><h3>{title}</h3></div>
);

const Field: React.FC<React.PropsWithChildren<{ label: string }>> = ({ label, children }) => (
  <div className="field"><label>{label}</label>{children}</div>
);

const Button: React.FC<React.PropsWithChildren<{
  onClick?: () => void;
  variant?: string;
  disabled?: boolean;
  style?: object;
  className?: string;
}>> = ({ onClick, variant = 'primary', disabled, children, ...props }) => (
  <button
    onClick={onClick}
    className={`btn ${variant} ${disabled ? 'disabled' : ''}`}
    disabled={disabled}
    {...props}
  >
    {children}
  </button>
);

const ChoiceButton: React.FC<{
  onClick: () => void;
  isActive: boolean;
  children: React.ReactNode;
  className?: string;
  isSet?: boolean;
}> = ({ onClick, isActive, children, className, isSet = false }) => {
  let btnClass = 'choice-btn';
  if (className) btnClass += ` ${className}`;
  if (isActive) btnClass += ' active default';
  else if (isSet) btnClass += ' disabled-choice';
  return <button onClick={onClick} className={btnClass}>{children}</button>;
};

const MediaUpload: React.FC<{
  id: string;
  onUpload: (files: FileList) => void;
  hasFile: boolean;
  fileType: 'image' | 'video';
  label: string;
  isOptional?: boolean;
}> = ({ id, onUpload, hasFile, fileType, label, isOptional = false }) => {
  let className = 'media-label';
  if (hasFile) className += ' active';
  else if (isOptional) className += ' optional';
  else className += ' mandatory';
  
  const buttonText = hasFile
    ? `Lägg till ${fileType === 'image' ? 'fler foton' : 'fler videor'}`
    : label;
  
  return (
    <div className="media-upload">
      <label htmlFor={id} className={className}>{buttonText}</label>
      <input
        id={id}
        type="file"
        accept={`${fileType}/*`}
        capture="environment"
        onChange={e => e.target.files && onUpload(e.target.files)}
        style={{ display: 'none' }}
        multiple
      />
    </div>
  );
};

const MediaButton: React.FC<React.PropsWithChildren<{ onRemove?: () => void }>> = ({
  children,
  onRemove
}) => (
  <div className="media-btn">
    {children}
    {onRemove && (
      <button onClick={onRemove} className="remove-media-btn">×</button>
    )}
  </div>
);

const SuccessModal: React.FC<{ firstName: string }> = ({ firstName }) => (
  <>
    <div className="modal-overlay" />
    <div className="modal-content success-modal">
      <div className="success-icon">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{width: '3rem', height: '3rem'}}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15L15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h3>Tack {firstName}!</h3>
      <p>Bilregistreringen har sparats.</p>
    </div>
  </>
);

const SpinnerOverlay = () => (
  <div className="modal-overlay spinner-overlay">
    <div className="spinner"></div>
    <p>Sparar...</p>
  </div>
);

const GlobalStyles: React.FC<{ backgroundUrl: string }> = ({ backgroundUrl }) => (
  <style jsx global>{`
    :root {
      --color-bg: #f8fafc;
      --color-card: #ffffff;
      --color-text: #1f2937;
      --color-text-secondary: #6b7280;
      --color-primary: #2563eb;
      --color-primary-light: #eff6ff;
      --color-success: #16a34a;
      --color-success-light: #f0fdf4;
      --color-danger: #dc2626;
      --color-danger-light: #fef2f2;
      --color-warning: #f59e0b;
      --color-warning-light: #fffbeb;
      --color-border: #e5e7eb;
      --color-border-focus: #3b82f6;
      --color-disabled: #a1a1aa;
      --color-disabled-light: #f4f4f5;
      --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
      --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
    }
    
    /* Hide global background and show new background for /nybil page */
    .background-img {
      display: none !important;
    }
    
    body::before {
      content: '';
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-image: url('${backgroundUrl}');
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
      opacity: 0.45;
      filter: brightness(0.65);
      z-index: -1;
      pointer-events: none;
    }
    
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background-color: #e8f5e9; /* Light green tint */
      color: var(--color-text);
      margin: 0;
      padding: 0;
    }
    
    .nybil-form {
      max-width: 700px;
      margin: 0 auto;
      padding: 1rem;
      box-sizing: border-box;
    }
    
    .main-header {
      text-align: center;
      margin-bottom: 1.5rem;
    }
    
    .main-logo {
      max-width: 188px;
      height: auto;
      margin: 0 auto 1rem auto;
      display: block;
    }
    
    .user-info {
      font-weight: 500;
      color: var(--color-text-secondary);
      margin: 0;
    }
    
    .card {
      background-color: rgba(255, 255, 255, 0.92);
      padding: 1.5rem;
      border-radius: 12px;
      margin-bottom: 1.5rem;
      box-shadow: var(--shadow-md);
      border: 2px solid transparent;
      transition: border-color 0.3s;
    }
    
    .card[data-error="true"] {
      border: 2px solid var(--color-danger);
    }
    
    .field[data-error="true"] input,
    .field[data-error="true"] select,
    .field[data-error="true"] textarea {
      border: 2px solid var(--color-danger) !important;
    }
    
    .section-header {
      padding-bottom: 0.75rem;
      border-bottom: 1px solid var(--color-border);
      margin-bottom: 1.5rem;
    }
    
    .section-header h2 {
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--color-text);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin: 0;
    }
    
    .sub-section-header {
      margin-top: 2rem;
      margin-bottom: 1rem;
    }
    
    .sub-section-header h3 {
      font-size: 1rem;
      font-weight: 600;
      color: var(--color-text);
      margin: 0;
    }
    
    .field {
      margin-bottom: 1rem;
    }
    
    .field label {
      display: block;
      margin-bottom: 0.5rem;
      font-weight: 500;
      font-size: 0.875rem;
    }
    
    .field input,
    .field select,
    .field textarea {
      width: 100%;
      padding: 0.75rem;
      border: 1px solid var(--color-border);
      border-radius: 6px;
      font-size: 1rem;
      background-color: white;
      box-sizing: border-box;
    }
    
    .field input:focus,
    .field select:focus,
    .field textarea:focus {
      outline: 2px solid var(--color-border-focus);
      border-color: transparent;
    }
    
    .field select[disabled] {
      background-color: var(--color-disabled-light);
      cursor: not-allowed;
    }
    
    .reg-input {
      text-align: center;
      font-weight: 600;
      letter-spacing: 2px;
      text-transform: uppercase;
    }
    
    .grid-2-col {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
    }
    
    .grid-3-col {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1rem;
    }
    
    .grid-4-col {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1rem;
    }
    
    .grid-5-col {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 1rem;
    }
    
    .form-actions {
      margin-top: 2rem;
      padding-top: 1.5rem;
      border-top: 1px solid var(--color-border);
      display: flex;
      gap: 1rem;
      justify-content: flex-end;
      padding-bottom: 1.5rem;
    }
    
    .copyright-footer {
      text-align: center;
      margin-top: 2rem;
      padding: 1.5rem 0 3rem 0;
      color: var(--color-text-secondary);
      font-size: 0.875rem;
    }
    
    .btn {
      padding: 0.75rem 1.5rem;
      border: none;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    
    .btn.primary {
      background-color: var(--color-primary);
      color: white;
    }
    
    .btn.secondary {
      background-color: var(--color-border);
      color: var(--color-text);
    }
    
    .btn.success {
      background-color: var(--color-success);
      color: white;
    }
    
    .btn.disabled {
      background-color: var(--color-disabled-light);
      color: var(--color-disabled);
      cursor: not-allowed;
    }
    
    .btn:not(:disabled):hover {
      filter: brightness(1.1);
    }
    
    .choice-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      min-width: 0;
      padding: 0.85rem 1rem;
      border-radius: 8px;
      border: 2px solid var(--color-border);
      background-color: white;
      color: var(--color-text);
      font-weight: 600;
      font-size: 1rem;
      cursor: pointer;
      transition: all 0.2s;
      box-sizing: border-box;
    }
    
    .choice-btn:hover {
      filter: brightness(1.05);
    }
    
    .choice-btn.active.default {
      border-color: var(--color-success);
      background-color: var(--color-success-light);
      color: var(--color-success);
    }
    
    .choice-btn.disabled-choice {
      border-color: var(--color-border);
      background-color: var(--color-bg);
      color: var(--color-disabled);
      cursor: default;
    }
    
    .choice-btn.full-width-choice {
      width: 100%;
    }
    
    .media-section {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
      margin-top: 1rem;
    }
    
    .media-label {
      display: block;
      text-align: center;
      padding: 1.5rem 1rem;
      border: 2px dashed;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
      font-weight: 600;
    }
    
    .media-label:hover {
      filter: brightness(0.95);
    }
    
    .media-label.active {
      border-style: solid;
      border-color: var(--color-success);
      background-color: var(--color-success-light);
      color: var(--color-success);
    }
    
    .media-label.mandatory {
      border-color: var(--color-danger);
      background-color: var(--color-danger-light);
      color: var(--color-danger);
    }
    
    .media-label.optional {
      border-color: var(--color-warning);
      background-color: var(--color-warning-light);
      color: #92400e;
    }
    
    .media-previews {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-top: 1rem;
    }
    
    .media-btn {
      position: relative;
      width: 70px;
      height: 70px;
      border-radius: 8px;
      overflow: hidden;
      background-color: var(--color-border);
    }
    
    .media-btn img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    
    .remove-media-btn {
      position: absolute;
      top: 2px;
      right: 2px;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background-color: var(--color-danger);
      color: white;
      border: 2px solid white;
      cursor: pointer;
      font-size: 1rem;
      font-weight: bold;
      line-height: 1;
      padding: 0;
    }
    
    .remove-media-btn:hover {
      background-color: #b91c1c;
    }
    
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: rgba(0, 0, 0, 0.5);
      z-index: 100;
    }
    
    .modal-content {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background-color: rgba(255, 255, 255, 0.92);
      padding: 2rem;
      border-radius: 12px;
      z-index: 101;
      box-shadow: var(--shadow-md);
      width: 90%;
      max-width: 600px;
    }
    
    .success-modal {
      text-align: center;
    }
    
    .success-icon {
      font-size: 3rem;
      color: var(--color-success);
      margin-bottom: 1rem;
    }
    
    .spinner-overlay {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 1.2rem;
      font-weight: 600;
    }
    
    .spinner {
      border: 5px solid #f3f3f3;
      border-top: 5px solid var(--color-primary);
      border-radius: 50%;
      width: 50px;
      height: 50px;
      animation: spin 1s linear infinite;
      margin-bottom: 1rem;
    }
    
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    
    @media (max-width: 480px) {
      .grid-2-col {
        grid-template-columns: 1fr;
      }
      .grid-3-col {
        grid-template-columns: 1fr;
      }
      .grid-4-col {
        grid-template-columns: repeat(2, 1fr);
      }
      .grid-5-col {
        grid-template-columns: repeat(2, 1fr);
      }
    }
  `}</style>
);

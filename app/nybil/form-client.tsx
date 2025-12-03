'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { DAMAGE_OPTIONS, DAMAGE_TYPES } from '@/data/damage-options';

// Constants
const MABI_LOGO_URL = "https://ufioaijcmaujlvmveyra.supabase.co/storage/v1/object/public/MABI%20Syd%20logga/MABI%20Syd%20logga%202.png";
const BACKGROUND_IMAGE_URL = "https://ufioaijcmaujlvmveyra.supabase.co/storage/v1/object/public/Silver%20logo%20white%20bkgrd/MB-logo-white-logo.jpg";

const ORTER = ['Malmö', 'Helsingborg', 'Ängelholm', 'Halmstad', 'Falkenberg', 'Trelleborg', 'Varberg', 'Lund'].sort();

// Huvudstationer for Planerad Station and Saluinfo
const HUVUDSTATIONER = [
  { name: 'Falkenberg', id: 282 },
  { name: 'Halmstad', id: 274 },
  { name: 'Helsingborg', id: 170 },
  { name: 'Lund', id: 406 },
  { name: 'Malmö', id: 166 },
  { name: 'Trelleborg', id: 283 },
  { name: 'Varberg', id: 290 },
  { name: 'Ängelholm', id: 171 }
];

// Car brands for dropdown
const BILMARKEN = ['BMW', 'Citroen', 'Ford', 'KIA', 'MB', 'MG', 'Opel', 'Peugeot', 'Renault', 'SEAT', 'VW', 'Annat'];

const STATIONER: Record<string, string[]> = {
  'Malmö': ['FORD Malmö', 'MB Malmö', 'Mechanum', 'Malmö Automera', 'Werksta St Bernstorp', 'Werksta Malmö Hamn', 'Hedbergs Malmö', 'Hedin Automotive Burlöv', 'Sturup'],
  'Helsingborg': ['MB Helsingborg', 'HBSC Helsingborg', 'FORD Helsingborg', 'Transport Helsingborg', 'S. Jönsson', 'BMW Helsingborg', 'KIA Helsingborg', 'Euromaster Helsingborg', 'B/S Klippan', 'Euromaster Helsingborg Däckhotell', 'Bilia Helsingborg', 'Mekonomen Helsingborg Berga', 'Werksta Helsingborg', 'Svensk Bilåtervinning', 'Hedin Helsingborg', 'KKV Helsingborg', 'Hedbergs Helsingborg', 'Bilia Ängelholm', 'Euromaster Ängelholm', 'Mekonomen Ängelholm', 'Flyget Ängelholm'],
  'Lund': ['FORD Lund', 'Hedin Lund', 'B/S Lund', 'P7 Revinge'],
  'Ängelholm': ['FORD Ängelholm', 'Mekonomen Ängelholm', 'Flyget Ängelholm'],
  'Falkenberg': ['Falkenberg'],
  'Halmstad': ['Flyget Halmstad', 'KIA Halmstad', 'FORD Halmstad'],
  'Trelleborg': ['Trelleborg'],
  'Varberg': ['FORD Varberg', 'Hedin Automotive Varberg', 'Sällstorp lack plåt', 'Finnveden plåt']
};

const capitalizeFirstLetter = (str: string): string => {
  return str.charAt(0).toUpperCase() + str.slice(1);
};

// Slugify function for consistent folder/file naming (same as /check)
const slugify = (str: string): string => {
  if (!str) return '';
  const replacements: Record<string, string> = {
    'å': 'a', 'ä': 'a', 'ö': 'o',
    'Å': 'A', 'Ä': 'A', 'Ö': 'O',
    ' ': '-'
  };
  
  let result = str.toString();
  for (const [char, replacement] of Object.entries(replacements)) {
    result = result.split(char).join(replacement);
  }
  
  return result.toLowerCase()
    .replace(/&/g, '-and-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+|-+$/g, '');
};

// Map fuel type from UI display to database value
const mapBransletypForDb = (uiValue: string | null): string | null => {
  if (uiValue === '100% el') return 'El (full)';
  return uiValue; // 'Bensin', 'Diesel', 'Hybrid (bensin)', 'Hybrid (diesel)' are the same
};

// Build position string for damage folder/file naming
const buildPositionString = (positions: Array<{ carPart: string; position: string }>): string => {
  const result = slugify(positions.map(p => {
    const part = p.carPart || '';
    const pos = p.position || '';
    return pos ? `${part}-${pos}` : part;
  }).filter(Boolean).join('-'));
  return result || 'okand';
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

// Fuel type constants
const FUEL_TYPES = {
  BENSIN: 'Bensin',
  DIESEL: 'Diesel',
  HYBRID_BENSIN: 'Hybrid (bensin)',
  HYBRID_DIESEL: 'Hybrid (diesel)',
  EL_FULL: '100% el'
} as const;

// Regex for Swedish license plate validation
const REG_NR_REGEX = /^[A-Z]{3}[0-9]{2}[0-9A-Z]$/;

// Photo types and helpers
type PhotoFile = {
  file: File;
  preview: string;
};

// Damage entry type for tracking damage information
type DamagePosition = {
  id: string;
  carPart: string;
  position: string;
};

type DamageEntry = {
  id: string;
  damageType: string;
  positions: DamagePosition[];
  comment: string;
  photos: PhotoFile[];
};

const formatDateForFolder = (date: Date): string => {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}${month}${day}`;
};

// Helper function to get file extension
const getFileExtension = (file: File): string => {
  return file.name.split('.').pop()?.toLowerCase() || 'jpg';
};

// Generic upload function for Supabase storage buckets
async function uploadToStorage(file: File, path: string, bucket: string, upsert: boolean = false): Promise<string> {
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 1000;
  
  console.log(`Uploading to bucket: ${bucket}, path: ${path}, file: ${file.name}, type: ${file.type}, size: ${file.size}`);
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { error, data: uploadData } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type, upsert });
      
      console.log(`Upload attempt ${attempt}/${MAX_RETRIES} - result:`, { error, uploadData });
      
      if (error && !/already exists/i.test(error.message || '')) {
        console.error(`Storage upload error for ${path} (attempt ${attempt}/${MAX_RETRIES}):`, {
          message: error.message,
          name: error.name,
          error: JSON.stringify(error)
        });
        
        if (attempt < MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * attempt));
          continue;
        }
        
        throw new Error(`Fel vid uppladdning av foto: ${error.message}`);
      }
      
      const { data, error: urlError } = supabase.storage.from(bucket).getPublicUrl(path);
      if (urlError || !data?.publicUrl) {
        console.error(`Error getting public URL for ${path}:`, urlError);
        if (attempt < MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * attempt));
          continue;
        }
        throw new Error('Fel vid uppladdning. Vänligen försök igen.');
      }
      
      console.log(`Upload successful, public URL: ${data.publicUrl}`);
      return data.publicUrl;
    } catch (e) {
      console.error(`Upload exception (attempt ${attempt}/${MAX_RETRIES}):`, e);
      
      if (e instanceof Error && e.message.includes('Fel vid uppladdning')) {
        throw e;
      }
      
      if (attempt < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * attempt));
        continue;
      }
      
      throw new Error('Fel vid uppladdning. Vänligen försök igen.');
    }
  }
  
  throw new Error('Fel vid uppladdning. Vänligen försök igen.');
}

// Upload function for nybil-photos bucket
const uploadNybilPhoto = (file: File, path: string) => uploadToStorage(file, path, 'nybil-photos', false);

// Upload function for damage-photos bucket (same as /check uses)
const uploadDamagePhoto = (file: File, path: string) => uploadToStorage(file, path, 'damage-photos', true);

export default function NybilForm() {
  const [firstName, setFirstName] = useState('');
  const [fullName, setFullName] = useState('');
  const [regInput, setRegInput] = useState('');
  const [bilmarke, setBilmarke] = useState('');
  const [bilmarkeAnnat, setBilmarkeAnnat] = useState('');
  const [modell, setModell] = useState('');
  const [ort, setOrt] = useState('');
  const [station, setStation] = useState('');
  
  // Planerad station
  const [planeradStation, setPlaneradStation] = useState('');
  
  // Vehicle status
  const [matarstallning, setMatarstallning] = useState('');
  const [hjultyp, setHjultyp] = useState<'Sommardäck' | 'Vinterdäck' | null>(null);
  
  // Wheels to storage (now in Fordonsstatus section)
  const [hjulTillForvaring, setHjulTillForvaring] = useState<'Vinterdäck' | 'Sommardäck' | 'Inga medföljande hjul' | null>(null);
  const [hjulForvaringOrt, setHjulForvaringOrt] = useState('');
  const [hjulForvaringSpec, setHjulForvaringSpec] = useState('');
  
  // Fuel/charging
  const [bransletyp, setBransletyp] = useState<'Bensin' | 'Diesel' | 'Hybrid (bensin)' | 'Hybrid (diesel)' | '100% el' | null>(null);
  const [vaxel, setVaxel] = useState<'Automat' | 'Manuell' | null>(null);
  const [laddnivaProcent, setLaddnivaProcent] = useState('');
  const [tankstatus, setTankstatus] = useState<'mottogs_fulltankad' | 'tankad_nu' | 'ej_upptankad' | null>(null);
  const [upptankningLiter, setUpptankningLiter] = useState('');
  const [upptankningLiterpris, setUpptankningLiterpris] = useState('');
  
  // Contract terms (AVTALSVILLKOR)
  const [serviceintervall, setServiceintervall] = useState<'15000' | '25000' | '30000' | 'Annat' | null>(null);
  const [serviceintervallAnnat, setServiceintervallAnnat] = useState('');
  const [maxKmManad, setMaxKmManad] = useState<'1200' | '3000' | 'Annat' | null>(null);
  const [maxKmManadAnnat, setMaxKmManadAnnat] = useState('');
  const [avgiftOverKm, setAvgiftOverKm] = useState<'1' | '2' | 'Annat' | null>(null);
  const [avgiftOverKmAnnat, setAvgiftOverKmAnnat] = useState('');
  
  // Equipment inventory
  const [antalInsynsskydd, setAntalInsynsskydd] = useState<null | 0 | 1 | 2>(null);
  const [instruktionsbok, setInstruktionsbok] = useState<boolean | null>(null);
  const [instruktionsbokForvaringOrt, setInstruktionsbokForvaringOrt] = useState('');
  const [instruktionsbokForvaringSpec, setInstruktionsbokForvaringSpec] = useState('');
  const [coc, setCoc] = useState<boolean | null>(null);
  const [cocForvaringOrt, setCocForvaringOrt] = useState('');
  const [cocForvaringSpec, setCocForvaringSpec] = useState('');
  const [antalNycklar, setAntalNycklar] = useState<null | 1 | 2>(null);
  const [extranyckelForvaringOrt, setExtranyckelForvaringOrt] = useState('');
  const [extranyckelForvaringSpec, setExtranyckelForvaringSpec] = useState('');
  const [antalLaddkablar, setAntalLaddkablar] = useState<null | 0 | 1 | 2>(null);
  const [laddkablarForvaringOrt, setLaddkablarForvaringOrt] = useState('');
  const [laddkablarForvaringSpec, setLaddkablarForvaringSpec] = useState('');
  const [lasbultarMed, setLasbultarMed] = useState<boolean | null>(null);
  const [dragkrok, setDragkrok] = useState<boolean | null>(null);
  const [gummimattor, setGummimattor] = useState<boolean | null>(null);
  const [dackkompressor, setDackkompressor] = useState<boolean | null>(null);
  const [stoldGps, setStoldGps] = useState<boolean | null>(null);
  const [stoldGpsSpec, setStoldGpsSpec] = useState('');
  
  // Connectivity (UPPKOPPLING)
  const [mbmeAktiverad, setMbmeAktiverad] = useState<boolean | null>(null);
  const [vwConnectAktiverad, setVwConnectAktiverad] = useState<boolean | null>(null);
  
  // Current location
  const [platsAktuellOrt, setPlatsAktuellOrt] = useState('');
  const [platsAktuellStation, setPlatsAktuellStation] = useState('');
  const [matarstallningAktuell, setMatarstallningAktuell] = useState('');
  
  // Saluinfo (optional)
  const [saludatum, setSaludatum] = useState('');
  const [saluStation, setSaluStation] = useState('');
  
  // Buyer info (KÖPARE - optional)
  const [kopareForetag, setKopareForetag] = useState('');
  const [returort, setReturort] = useState('');
  const [returadress, setReturadress] = useState('');
  const [attention, setAttention] = useState('');
  const [noteringForsaljning, setNoteringForsaljning] = useState('');
  
  // Notes (ÖVRIGT)
  const [anteckningar, setAnteckningar] = useState('');
  
  // Ready for rental (KLAR FÖR UTHYRNING)
  const [klarForUthyrning, setKlarForUthyrning] = useState<boolean | null>(null);
  const [ejUthyrningsbarAnledning, setEjUthyrningsbarAnledning] = useState('');
  
  // UI state
  const [isSaving, setIsSaving] = useState(false);
  const [showFieldErrors, setShowFieldErrors] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showRegWarningModal, setShowRegWarningModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [matarstallningError, setMatarstallningError] = useState('');
  
  // Duplicate detection state
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateInfo, setDuplicateInfo] = useState<{
    existsInBilkontroll: boolean;
    existsInNybil: boolean;
    previousRegistration: { id: string; regnr: string; registreringsdatum: string; bilmarke: string; modell: string; duplicate_group_id?: string } | null;
  } | null>(null);
  const [isDuplicate, setIsDuplicate] = useState(false);
  
  // Photo state
  const [photoFront, setPhotoFront] = useState<PhotoFile | null>(null);
  const [photoBack, setPhotoBack] = useState<PhotoFile | null>(null);
  const [additionalPhotos, setAdditionalPhotos] = useState<PhotoFile[]>([]);
  
  // Damage state
  const [harSkadorVidLeverans, setHarSkadorVidLeverans] = useState<boolean | null>(null);
  const [damages, setDamages] = useState<DamageEntry[]>([]);
  const [showDamageModal, setShowDamageModal] = useState(false);
  const [currentDamageId, setCurrentDamageId] = useState<string | null>(null);
  
  const normalizedReg = useMemo(() => regInput.toUpperCase().replace(/\s/g, ''), [regInput]);
  const availableStations = useMemo(() => STATIONER[ort] || [], [ort]);
  const availableStationsAktuell = useMemo(() => STATIONER[platsAktuellOrt] || [], [platsAktuellOrt]);
  const currentYear = useMemo(() => new Date().getFullYear(), []);
  
  const isElectric = bransletyp === FUEL_TYPES.EL_FULL;
  const isHybrid = bransletyp === FUEL_TYPES.HYBRID_BENSIN || bransletyp === FUEL_TYPES.HYBRID_DIESEL;
  const isBensinOrDiesel = bransletyp === FUEL_TYPES.BENSIN || bransletyp === FUEL_TYPES.DIESEL;
  const needsLaddkablar = isElectric || isHybrid;
  const needsVaxelQuestion = isBensinOrDiesel;
  const locationDiffers = platsAktuellOrt && platsAktuellStation && (platsAktuellOrt !== ort || platsAktuellStation !== station);
  const wheelsNeedStorage = hjulTillForvaring === 'Vinterdäck' || hjulTillForvaring === 'Sommardäck';
  
  // For UPPKOPPLING section visibility
  const showMbmeQuestion = bilmarke === 'MB';
  const showVwConnectQuestion = bilmarke === 'VW';
  const showUppkopplingSection = showMbmeQuestion || showVwConnectQuestion;
  
  // Charging cables storage needed check
  const laddkablarNeedsStorage = useMemo(() => {
    if (isHybrid && antalLaddkablar !== null && antalLaddkablar >= 1) return true;
    if (isElectric && antalLaddkablar !== null && antalLaddkablar > 1) return true;
    return false;
  }, [isHybrid, isElectric, antalLaddkablar]);
  
  const hasFordonStatusErrors = useMemo(() => {
    if (!matarstallning || !hjultyp || !bransletyp || hjulTillForvaring === null) return true;
    if (needsVaxelQuestion && vaxel === null) return true;
    if (wheelsNeedStorage && (!hjulForvaringOrt || !hjulForvaringSpec.trim())) return true;
    if (isElectric && !laddnivaProcent) return true;
    if (!isElectric && (!tankstatus || (tankstatus === 'tankad_nu' && (!upptankningLiter || !upptankningLiterpris)))) return true;
    return false;
  }, [matarstallning, hjultyp, bransletyp, hjulTillForvaring, needsVaxelQuestion, vaxel, wheelsNeedStorage, hjulForvaringOrt, hjulForvaringSpec, isElectric, laddnivaProcent, tankstatus, upptankningLiter, upptankningLiterpris]);
  
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
  
  // Helper function to reset fuel-related fields when changing fuel type
  const handleFuelTypeChange = (newFuelType: typeof bransletyp) => {
    setBransletyp(newFuelType);
    setTankstatus(null);
    setLaddnivaProcent('');
    setUpptankningLiter('');
    setUpptankningLiterpris('');
    setVaxel(null);
    setAntalLaddkablar(null);
    setLaddkablarForvaringOrt('');
    setLaddkablarForvaringSpec('');
  };
  
  // Helper function to handle brand change and reset related fields
  const handleBrandChange = (newBrand: string) => {
    setBilmarke(newBrand);
    setBilmarkeAnnat('');
    setMbmeAktiverad(null);
    setVwConnectAktiverad(null);
  };
  
  // Photo handlers
  const handlePhotoFrontChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Revoke previous preview URL if exists
      if (photoFront?.preview) URL.revokeObjectURL(photoFront.preview);
      setPhotoFront({ file, preview: URL.createObjectURL(file) });
    }
    // Reset input value so same file can be selected again
    e.target.value = '';
  };
  
  const handlePhotoBackChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (photoBack?.preview) URL.revokeObjectURL(photoBack.preview);
      setPhotoBack({ file, preview: URL.createObjectURL(file) });
    }
    e.target.value = '';
  };
  
  const handleAdditionalPhotosChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const newPhotos: PhotoFile[] = Array.from(files).map(file => ({
        file,
        preview: URL.createObjectURL(file)
      }));
      setAdditionalPhotos(prev => [...prev, ...newPhotos]);
    }
    e.target.value = '';
  };
  
  const removeAdditionalPhoto = (index: number) => {
    setAdditionalPhotos(prev => {
      const photo = prev[index];
      if (photo?.preview) URL.revokeObjectURL(photo.preview);
      return prev.filter((_, i) => i !== index);
    });
  };
  
  const retakePhotoFront = () => {
    if (photoFront?.preview) URL.revokeObjectURL(photoFront.preview);
    setPhotoFront(null);
  };
  
  const retakePhotoBack = () => {
    if (photoBack?.preview) URL.revokeObjectURL(photoBack.preview);
    setPhotoBack(null);
  };
  
  const equipmentMissing = useMemo(() => {
    if (antalInsynsskydd === null) return true;
    if (instruktionsbok === null) return true;
    if (instruktionsbok === true && (!instruktionsbokForvaringOrt || !instruktionsbokForvaringSpec.trim())) return true;
    if (coc === null) return true;
    if (coc === true && (!cocForvaringOrt || !cocForvaringSpec.trim())) return true;
    if (antalNycklar === null) return true;
    if (antalNycklar === 2 && (!extranyckelForvaringOrt || !extranyckelForvaringSpec.trim())) return true;
    if (needsLaddkablar && antalLaddkablar === null) return true;
    if (laddkablarNeedsStorage && (!laddkablarForvaringOrt || !laddkablarForvaringSpec.trim())) return true;
    if (lasbultarMed === null) return true;
    if (dragkrok === null) return true;
    if (gummimattor === null) return true;
    if (dackkompressor === null) return true;
    if (stoldGps === null) return true;
    if (stoldGps === true && !stoldGpsSpec.trim()) return true;
    return false;
  }, [antalInsynsskydd, instruktionsbok, instruktionsbokForvaringOrt, instruktionsbokForvaringSpec, coc, cocForvaringOrt, cocForvaringSpec, antalNycklar, extranyckelForvaringOrt, extranyckelForvaringSpec, needsLaddkablar, antalLaddkablar, laddkablarNeedsStorage, laddkablarForvaringOrt, laddkablarForvaringSpec, lasbultarMed, dragkrok, gummimattor, dackkompressor, stoldGps, stoldGpsSpec]);
  
  const avtalsvillkorMissing = useMemo(() => {
    // All Avtalsvillkor fields are now optional
    // Only check "Annat" fields if the corresponding option is selected
    if (serviceintervall === 'Annat' && !serviceintervallAnnat.trim()) return true;
    if (maxKmManad === 'Annat' && !maxKmManadAnnat.trim()) return true;
    if (avgiftOverKm === 'Annat' && !avgiftOverKmAnnat.trim()) return true;
    return false;
  }, [serviceintervall, serviceintervallAnnat, maxKmManad, maxKmManadAnnat, avgiftOverKm, avgiftOverKmAnnat]);
  
  const uppkopplingMissing = useMemo(() => {
    if (showMbmeQuestion && mbmeAktiverad === null) return true;
    if (showVwConnectQuestion && vwConnectAktiverad === null) return true;
    return false;
  }, [showMbmeQuestion, mbmeAktiverad, showVwConnectQuestion, vwConnectAktiverad]);
  
  const klarForUthyrningMissing = useMemo(() => {
    if (klarForUthyrning === null) return true;
    if (klarForUthyrning === false && !ejUthyrningsbarAnledning.trim()) return true;
    return false;
  }, [klarForUthyrning, ejUthyrningsbarAnledning]);
  
  // Photo validation - front and back photos are required
  const photosMissing = useMemo(() => {
    return !photoFront || !photoBack;
  }, [photoFront, photoBack]);
  
  // Damage validation
  const damagesMissing = useMemo(() => {
    // Must answer the question
    if (harSkadorVidLeverans === null) return true;
    // If there are damages, at least one must be documented with required fields
    if (harSkadorVidLeverans === true) {
      if (damages.length === 0) return true;
      // Each damage must have type, at least one position with carPart, and at least one photo
      for (const damage of damages) {
        if (!damage.damageType) return true;
        if (damage.positions.length === 0 || damage.positions.some(p => !p.carPart)) return true;
        // Check if position is required based on damage type and car part
        for (const pos of damage.positions) {
          if (pos.carPart) {
            const availablePositions = DAMAGE_OPTIONS[damage.damageType as keyof typeof DAMAGE_OPTIONS]?.[pos.carPart as keyof (typeof DAMAGE_OPTIONS)[keyof typeof DAMAGE_OPTIONS]] || [];
            if (availablePositions.length > 0 && !pos.position) return true;
          }
        }
        if (damage.photos.length === 0) return true;
      }
    }
    return false;
  }, [harSkadorVidLeverans, damages]);
  
  const formIsValid = useMemo(() => {
    // Required basic fields - FORDON
    if (!regInput || !bilmarke || !modell) return false;
    if (bilmarke === 'Annat' && !bilmarkeAnnat.trim()) return false;
    // PLATS FÖR MOTTAGNING
    if (!ort || !station) return false;
    // PLANERAD STATION - now optional, no validation needed
    // FORDONSSTATUS
    if (hasFordonStatusErrors) return false;
    // AVTALSVILLKOR
    if (avtalsvillkorMissing) return false;
    // UTRUSTNING
    if (equipmentMissing) return false;
    // UPPKOPPLING (conditional)
    if (showUppkopplingSection && uppkopplingMissing) return false;
    // FOTON
    if (photosMissing) return false;
    // SKADOR VID LEVERANS
    if (damagesMissing) return false;
    // VAR ÄR BILEN NU?
    if (!platsAktuellOrt || !platsAktuellStation) return false;
    if (locationDiffers && !matarstallningAktuell) return false;
    // KLAR FÖR UTHYRNING
    if (klarForUthyrningMissing) return false;
    return true;
  }, [regInput, bilmarke, bilmarkeAnnat, modell, ort, station, hasFordonStatusErrors, avtalsvillkorMissing, equipmentMissing, showUppkopplingSection, uppkopplingMissing, photosMissing, damagesMissing, platsAktuellOrt, platsAktuellStation, locationDiffers, matarstallningAktuell, klarForUthyrningMissing]);
  
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const email = user?.email || '';
      setFirstName(getFirstNameFromEmail(email));
      setFullName(getFullNameFromEmail(email));
    };
    getUser();
  }, []);
  
  // Cleanup photo preview URLs on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (photoFront?.preview) URL.revokeObjectURL(photoFront.preview);
      if (photoBack?.preview) URL.revokeObjectURL(photoBack.preview);
      additionalPhotos.forEach(p => p.preview && URL.revokeObjectURL(p.preview));
    };
  }, [photoFront, photoBack, additionalPhotos]);
  
  // Prevent background scroll when confirm modal is open
  useEffect(() => {
    if (showConfirmModal) {
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { 
        document.body.style.overflow = previousOverflow; 
      };
    }
  }, [showConfirmModal]);
  
  const handleShowErrors = () => {
    setShowFieldErrors(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const firstError = document.querySelector('.card[data-error="true"], .field[data-error="true"]') as HTMLElement | null;
        if (firstError) {
          const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          const rect = firstError.getBoundingClientRect();
          const targetTop = window.scrollY + rect.top - 80;
          try {
            window.scrollTo({ top: targetTop, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
          } catch {
            firstError.scrollIntoView({ block: 'center' });
          }
          setTimeout(() => {
            const focusable = firstError.querySelector('input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])') as HTMLElement | null;
            focusable?.focus();
          }, 150);
        }
      });
    });
  };
  
  // Helper function to cleanup damage photo previews
  const cleanupDamagePhotoPreviews = (damagesToClean: DamageEntry[]) => {
    damagesToClean.forEach(d => d.photos.forEach(p => p.preview && URL.revokeObjectURL(p.preview)));
  };
  
  const resetForm = () => {
    setRegInput('');
    setBilmarke('');
    setBilmarkeAnnat('');
    setModell('');
    setOrt('');
    setStation('');
    setPlaneradStation('');
    setMatarstallning('');
    setHjultyp(null);
    setHjulTillForvaring(null);
    setHjulForvaringOrt('');
    setHjulForvaringSpec('');
    setBransletyp(null);
    setVaxel(null);
    setLaddnivaProcent('');
    setTankstatus(null);
    setUpptankningLiter('');
    setUpptankningLiterpris('');
    setServiceintervall(null);
    setServiceintervallAnnat('');
    setMaxKmManad(null);
    setMaxKmManadAnnat('');
    setAvgiftOverKm(null);
    setAvgiftOverKmAnnat('');
    setAntalInsynsskydd(null);
    setInstruktionsbok(null);
    setInstruktionsbokForvaringOrt('');
    setInstruktionsbokForvaringSpec('');
    setCoc(null);
    setCocForvaringOrt('');
    setCocForvaringSpec('');
    setAntalNycklar(null);
    setExtranyckelForvaringOrt('');
    setExtranyckelForvaringSpec('');
    setAntalLaddkablar(null);
    setLaddkablarForvaringOrt('');
    setLaddkablarForvaringSpec('');
    setLasbultarMed(null);
    setDragkrok(null);
    setGummimattor(null);
    setDackkompressor(null);
    setStoldGps(null);
    setStoldGpsSpec('');
    setMbmeAktiverad(null);
    setVwConnectAktiverad(null);
    // Reset photos
    if (photoFront?.preview) URL.revokeObjectURL(photoFront.preview);
    if (photoBack?.preview) URL.revokeObjectURL(photoBack.preview);
    additionalPhotos.forEach(p => p.preview && URL.revokeObjectURL(p.preview));
    setPhotoFront(null);
    setPhotoBack(null);
    setAdditionalPhotos([]);
    // Reset damages - cleanup photo previews
    cleanupDamagePhotoPreviews(damages);
    setHarSkadorVidLeverans(null);
    setDamages([]);
    setShowDamageModal(false);
    setCurrentDamageId(null);
    setPlatsAktuellOrt('');
    setPlatsAktuellStation('');
    setMatarstallningAktuell('');
    setSaludatum('');
    setSaluStation('');
    setKopareForetag('');
    setReturort('');
    setReturadress('');
    setAttention('');
    setNoteringForsaljning('');
    setAnteckningar('');
    setKlarForUthyrning(null);
    setEjUthyrningsbarAnledning('');
    setShowFieldErrors(false);
    setShowRegWarningModal(false);
    setShowConfirmModal(false);
    // Reset duplicate state
    setShowDuplicateModal(false);
    setDuplicateInfo(null);
    setIsDuplicate(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  
  // Damage handlers
  const addNewDamage = () => {
    const newDamage: DamageEntry = {
      id: `damage-${Date.now()}`,
      damageType: '',
      positions: [{ id: `pos-${Date.now()}`, carPart: '', position: '' }],
      comment: '',
      photos: []
    };
    setDamages(prev => [...prev, newDamage]);
    setCurrentDamageId(newDamage.id);
    setShowDamageModal(true);
  };
  
  const editDamage = (damageId: string) => {
    setCurrentDamageId(damageId);
    setShowDamageModal(true);
  };
  
  const removeDamage = (damageId: string) => {
    setDamages(prev => {
      const damage = prev.find(d => d.id === damageId);
      if (damage) {
        cleanupDamagePhotoPreviews([damage]);
      }
      return prev.filter(d => d.id !== damageId);
    });
  };
  
  const updateDamageField = (damageId: string, field: keyof DamageEntry, value: any) => {
    setDamages(prev => prev.map(d => {
      if (d.id !== damageId) return d;
      // If changing damageType, reset positions
      if (field === 'damageType' && value !== d.damageType) {
        return { ...d, [field]: value, positions: [{ id: `pos-${Date.now()}`, carPart: '', position: '' }] };
      }
      return { ...d, [field]: value };
    }));
  };
  
  const updateDamagePosition = (damageId: string, positionId: string, field: 'carPart' | 'position', value: string) => {
    setDamages(prev => prev.map(d => {
      if (d.id !== damageId) return d;
      const updatedPositions = d.positions.map(p => {
        if (p.id !== positionId) return p;
        // If changing carPart, reset position
        if (field === 'carPart') {
          return { ...p, carPart: value, position: '' };
        }
        return { ...p, [field]: value };
      });
      return { ...d, positions: updatedPositions };
    }));
  };
  
  const addDamagePosition = (damageId: string) => {
    setDamages(prev => prev.map(d => {
      if (d.id !== damageId) return d;
      return { ...d, positions: [...d.positions, { id: `pos-${Date.now()}`, carPart: '', position: '' }] };
    }));
  };
  
  const removeDamagePosition = (damageId: string, positionId: string) => {
    setDamages(prev => prev.map(d => {
      if (d.id !== damageId) return d;
      if (d.positions.length <= 1) return d;
      return { ...d, positions: d.positions.filter(p => p.id !== positionId) };
    }));
  };
  
  const handleDamagePhotoChange = (damageId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const newPhotos: PhotoFile[] = Array.from(files).map(file => ({
        file,
        preview: URL.createObjectURL(file)
      }));
      setDamages(prev => prev.map(d => {
        if (d.id !== damageId) return d;
        return { ...d, photos: [...d.photos, ...newPhotos] };
      }));
    }
    e.target.value = '';
  };
  
  const removeDamagePhoto = (damageId: string, photoIndex: number) => {
    setDamages(prev => prev.map(d => {
      if (d.id !== damageId) return d;
      const photo = d.photos[photoIndex];
      if (photo?.preview) URL.revokeObjectURL(photo.preview);
      return { ...d, photos: d.photos.filter((_, i) => i !== photoIndex) };
    }));
  };
  
  const closeDamageModal = () => {
    setShowDamageModal(false);
    setCurrentDamageId(null);
  };
  
  const getCurrentDamage = () => damages.find(d => d.id === currentDamageId);
  
  // Check reg nr format before proceeding
  const isRegNrValid = REG_NR_REGEX.test(normalizedReg);
  
  // Mätarställning validation function - reused by handleRegisterClick and WarningModal onConfirm
  const validateMatarstallning = (): boolean => {
    // Check if both values exist and current is less than or equal to purchase
    if (matarstallningAktuell && matarstallning) {
      const inkopValue = parseInt(matarstallning, 10);
      const aktuellValue = parseInt(matarstallningAktuell, 10);
      if (!isNaN(inkopValue) && !isNaN(aktuellValue) && aktuellValue <= inkopValue) {
        setMatarstallningError('Aktuell mätarställning måste vara större än mätarställning vid leverans.');
        // Scroll to the error field using requestAnimationFrame (same pattern as handleShowErrors)
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const errorField = document.getElementById('matarstallning-aktuell-field');
            if (errorField) {
              errorField.scrollIntoView({ behavior: 'smooth', block: 'center' });
              // Focus the input after scroll animation
              setTimeout(() => {
                const input = errorField.querySelector('input') as HTMLInputElement | null;
                input?.focus();
              }, 150);
            }
          });
        });
        return false; // Validation failed
      }
    }
    return true; // Validation passed
  };

  // Check for duplicate registrations
  const checkForDuplicate = async (regnr: string): Promise<{
    existsInBilkontroll: boolean;
    existsInNybil: boolean;
    previousRegistration: { id: string; regnr: string; registreringsdatum: string; bilmarke: string; modell: string; duplicate_group_id?: string; created_at?: string; fullstandigt_namn?: string } | null;
  }> => {
    const normalizedRegnr = regnr.toUpperCase().replace(/\s/g, '');
    console.log('Checking duplicate for:', normalizedRegnr);
    
    // Check vehicles table (Bilkontroll-filen) - use ilike for case-insensitive matching
    const { data: vehicleMatch, error: vehicleError } = await supabase
      .from('vehicles')
      .select('regnr')
      .ilike('regnr', normalizedRegnr)
      .maybeSingle();
    
    if (vehicleError) {
      console.error('Error checking vehicles table:', vehicleError);
    }
    console.log('Vehicle match:', vehicleMatch);
    
    // Check nybil_inventering table - use ilike for case-insensitive matching
    // Include created_at and fullstandigt_namn for modal display
    // Order by created_at ASCENDING to get the FIRST (original) registration for original_registration_id
    const { data: nybilMatch, error: nybilError } = await supabase
      .from('nybil_inventering')
      .select('id, regnr, registreringsdatum, bilmarke, modell, duplicate_group_id, created_at, fullstandigt_namn')
      .ilike('regnr', normalizedRegnr)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    
    if (nybilError) {
      console.error('Error checking nybil_inventering table:', nybilError);
    }
    console.log('Nybil match:', nybilMatch);
    console.log('Nybil match id type:', typeof nybilMatch?.id, 'value:', nybilMatch?.id);
    
    // The ID is a UUID string from Supabase, keep it as-is
    const previousRegistration = nybilMatch ? {
      ...nybilMatch,
      id: String(nybilMatch.id) // Ensure it's a string (UUID)
    } : null;
    
    const result = {
      existsInBilkontroll: !!vehicleMatch,
      existsInNybil: !!nybilMatch,
      previousRegistration: previousRegistration as { id: string; regnr: string; registreringsdatum: string; bilmarke: string; modell: string; duplicate_group_id?: string; created_at?: string; fullstandigt_namn?: string } | null
    };
    console.log('Duplicate result:', result);
    console.log('previousRegistration.id:', previousRegistration?.id, 'type:', typeof previousRegistration?.id);
    
    return result;
  };

  const handleRegisterClick = async () => {
    console.log('handleRegisterClick called');
    // Reset error and duplicate state
    setMatarstallningError('');
    setIsDuplicate(false);
    setDuplicateInfo(null);
    
    if (!formIsValid) {
      console.log('Form is not valid, showing errors');
      handleShowErrors();
      return;
    }
    // Step 1: Check reg nr format - if invalid, show warning modal (user can confirm to proceed)
    if (!isRegNrValid) {
      console.log('Reg nr format invalid, showing warning modal');
      setShowRegWarningModal(true);
      return;
    }
    // Step 2: Mätarställning validation - this BLOCKS submission
    if (!validateMatarstallning()) {
      console.log('Mätarställning validation failed');
      return;
    }
    // Step 3: Check for duplicates
    console.log('Checking for duplicates with normalizedReg:', normalizedReg);
    try {
      const duplicateResult = await checkForDuplicate(normalizedReg);
      console.log('Duplicate check completed:', duplicateResult);
      if (duplicateResult.existsInBilkontroll || duplicateResult.existsInNybil) {
        console.log('Duplicate found! Showing duplicate modal');
        setDuplicateInfo(duplicateResult);
        setShowDuplicateModal(true);
        return;
      }
    } catch (error) {
      console.error('Error checking for duplicates:', error);
      // Continue anyway - don't block registration if duplicate check fails
    }
    // Step 4: All validations passed - show confirmation modal
    console.log('No duplicate found, showing confirmation modal');
    setShowConfirmModal(true);
  };

  // Handle creating a duplicate registration
  const handleCreateDuplicate = () => {
    setShowDuplicateModal(false);
    setIsDuplicate(true);
    setShowConfirmModal(true);
  };
  
  const handleConfirmAndSubmit = async () => {
    console.log('handleConfirmAndSubmit called');
    console.log('isDuplicate:', isDuplicate);
    console.log('duplicateInfo:', duplicateInfo);
    setShowConfirmModal(false);
    setShowRegWarningModal(false);
    setIsSaving(true);
    try {
      const now = new Date();
      const planeradStationObj = HUVUDSTATIONER.find(s => s.name === planeradStation);
      // Determine effective vaxel value
      const effectiveVaxel = needsVaxelQuestion ? vaxel : 'Automat';
      // Determine effective bilmarke
      const effectiveBilmarke = bilmarke === 'Annat' ? bilmarkeAnnat : bilmarke;
      
      // Upload photos to Supabase Storage
      const dateStr = formatDateForFolder(now);
      
      // Determine folder suffix for duplicates
      // For duplicates, query to count existing registrations for this regnr+date
      let folderSuffix = '';
      if (isDuplicate) {
        try {
          const { data: existingRegs, error } = await supabase
            .from('nybil_inventering')
            .select('id')
            .eq('regnr', normalizedReg)
            .eq('registreringsdatum', now.toISOString().split('T')[0]);
          
          if (!error && existingRegs) {
            const duplicateCount = existingRegs.length;
            folderSuffix = `-DUBBLETT-${duplicateCount}`;
          } else {
            // Fallback to timestamp if query fails
            folderSuffix = `-DUBBLETT-${Math.floor(now.getTime() / 1000)}`;
          }
        } catch (e) {
          console.error('Error counting duplicates:', e);
          // Fallback to timestamp
          folderSuffix = `-DUBBLETT-${Math.floor(now.getTime() / 1000)}`;
        }
      }
      
      console.log('Creating media folder with normalizedReg:', normalizedReg, 'regInput:', regInput);
      
      // NEW folder structure:
      // Reference photos: REGNR/NYBIL-REFERENS/YYYYMMDD-NYBIL{-DUBBLETT-N}/
      // Damage photos: REGNR/SKADOR/YYYYMMDD-skadetyp-etc-NYBIL{-DUBBLETT-N}/
      
      const nybilEventFolder = `${dateStr}-NYBIL${folderSuffix}`;
      const referensFolder = `${normalizedReg}/NYBIL-REFERENS/${nybilEventFolder}`;
      
      // mediaFolder is used by the email notification (notify-nybil route) for the 
      // "Nybilsfoton" link. It points to the reference photos folder.
      const mediaFolder = referensFolder;
      console.log('Reference folder path:', referensFolder);
      const photoUrls: string[] = [];
      
      // Upload front photo to NYBIL-REFERENS subfolder
      if (photoFront) {
        const frontExt = getFileExtension(photoFront.file);
        const frontUrl = await uploadNybilPhoto(photoFront.file, `${referensFolder}/framifran.${frontExt}`);
        photoUrls.push(frontUrl);
      }
      
      // Upload back photo to NYBIL-REFERENS subfolder
      if (photoBack) {
        const backExt = getFileExtension(photoBack.file);
        const backUrl = await uploadNybilPhoto(photoBack.file, `${referensFolder}/bakifran.${backExt}`);
        photoUrls.push(backUrl);
      }
      
      // Upload additional photos to NYBIL-REFERENS/ovriga subfolder
      for (let i = 0; i < additionalPhotos.length; i++) {
        const photo = additionalPhotos[i];
        const ext = getFileExtension(photo.file);
        const url = await uploadNybilPhoto(photo.file, `${referensFolder}/ovriga/${i + 1}.${ext}`);
        photoUrls.push(url);
      }
      
      // Upload damage photos to damage-photos bucket and save to damages table
      let savedNybilId: number | null = null;
      
      // Generate duplicate_group_id if this is a duplicate
      const duplicateGroupId = isDuplicate 
        ? (duplicateInfo?.previousRegistration?.duplicate_group_id || crypto.randomUUID())
        : null;
      
      console.log('Duplicate fields:', {
        isDuplicate,
        duplicateGroupId,
        previousRegistration: duplicateInfo?.previousRegistration
      });
      
      const inventoryData = {
        regnr: normalizedReg,
        bilmarke: effectiveBilmarke,
        bilmarke_annat: bilmarke === 'Annat' ? bilmarkeAnnat : null,
        modell,
        bilmodell: modell, // Alias for modell column
        registrerad_av: firstName,
        fullstandigt_namn: fullName,
        registreringsdatum: now.toISOString().split('T')[0],
        ankomstdatum: now.toISOString().split('T')[0], // Alias for registreringsdatum
        plats_mottagning_ort: ort,
        plats_mottagning_station: station,
        planerad_station: planeradStation,
        planerad_station_id: planeradStationObj?.id || null,
        matarstallning_inkop: matarstallning,
        hjultyp,
        monterade_dack: hjultyp, // Alias for hjultyp (what tires are mounted)
        hjul_ej_monterade: hjulTillForvaring,
        hjul_till_forvaring: hjulTillForvaring, // Alias for hjul_ej_monterade column
        hjul_forvaring_ort: wheelsNeedStorage ? hjulForvaringOrt : null,
        hjul_forvaring_station: wheelsNeedStorage ? hjulForvaringOrt : null, // Alias for hjul_forvaring_ort column
        hjul_forvaring: wheelsNeedStorage ? hjulForvaringSpec : null,
        bransletyp: mapBransletypForDb(bransletyp),
        vaxel: effectiveVaxel,
        laddniva_procent: isElectric && laddnivaProcent ? parseInt(laddnivaProcent, 10) : null,
        tankstatus: !isElectric ? tankstatus : null,
        upptankning_liter: !isElectric && tankstatus === 'tankad_nu' && upptankningLiter ? parseFloat(upptankningLiter) : null,
        upptankning_literpris: !isElectric && tankstatus === 'tankad_nu' && upptankningLiterpris ? parseFloat(upptankningLiterpris) : null,
        serviceintervall: serviceintervall === 'Annat' ? serviceintervallAnnat : serviceintervall,
        max_km_manad: maxKmManad === 'Annat' ? maxKmManadAnnat : maxKmManad,
        avgift_over_km: avgiftOverKm === 'Annat' ? avgiftOverKmAnnat : avgiftOverKm,
        antal_insynsskydd: antalInsynsskydd,
        instruktionsbok: instruktionsbok,
        instruktionsbok_forvaring_ort: instruktionsbok ? instruktionsbokForvaringOrt : null,
        instruktionsbok_forvaring_spec: instruktionsbok ? instruktionsbokForvaringSpec : null,
        coc: coc,
        coc_forvaring_ort: coc ? cocForvaringOrt : null,
        coc_forvaring_spec: coc ? cocForvaringSpec : null,
        antal_nycklar: antalNycklar,
        extranyckel_forvaring_ort: antalNycklar === 2 ? extranyckelForvaringOrt : null,
        extranyckel_forvaring_spec: antalNycklar === 2 ? extranyckelForvaringSpec : null,
        antal_laddkablar: needsLaddkablar ? (antalLaddkablar ?? 0) : 0,
        laddkablar_forvaring_ort: laddkablarNeedsStorage ? laddkablarForvaringOrt : null,
        laddkablar_forvaring_spec: laddkablarNeedsStorage ? laddkablarForvaringSpec : null,
        lasbultar_med: lasbultarMed,
        dragkrok,
        gummimattor,
        dackkompressor,
        kompressor: dackkompressor, // Alias for dackkompressor column
        stold_gps: stoldGps,
        stold_gps_spec: stoldGps ? stoldGpsSpec : null,
        mbme_aktiverad: showMbmeQuestion ? mbmeAktiverad : null,
        vw_connect_aktiverad: showVwConnectQuestion ? vwConnectAktiverad : null,
        plats_aktuell_ort: platsAktuellOrt,
        plats_aktuell_station: platsAktuellStation,
        matarstallning_aktuell: locationDiffers ? matarstallningAktuell : null,
        saludatum: saludatum || null,
        salu_station: saluStation || null,
        kopare_foretag: kopareForetag || null,
        returort: returort || null,
        returadress: returadress || null,
        attention: attention || null,
        notering_forsaljning: noteringForsaljning || null,
        anteckningar: anteckningar || null,
        klar_for_uthyrning: klarForUthyrning,
        ej_uthyrningsbar_anledning: klarForUthyrning === false ? ejUthyrningsbarAnledning : null,
        har_skador_vid_leverans: harSkadorVidLeverans === true && damages.length > 0,
        photo_urls: photoUrls,
        video_urls: [],
        media_folder: mediaFolder,
        // Duplicate handling fields
        is_duplicate: isDuplicate,
        duplicate_group_id: duplicateGroupId
        // Note: original_registration_id is NOT set - use duplicate_group_id instead for tracking duplicates
      };
      console.log('Attempting to insert inventoryData:', inventoryData);
      const { data, error } = await supabase
        .from('nybil_inventering')
        .insert([inventoryData])
        .select();
      console.log('Database insert result - data:', data, 'error:', error);
      if (error) {
        console.error('Database error:', error);
        alert(`Fel vid sparande: ${error.message}`);
        return;
      }
      
      savedNybilId = data?.[0]?.id || null;
      console.log('Saved nybil ID:', savedNybilId);
      
      // If this is a duplicate, update the first registration to have the same duplicate_group_id
      if (isDuplicate && duplicateGroupId && duplicateInfo?.previousRegistration?.id) {
        // Only update if the first registration doesn't already have a duplicate_group_id
        if (!duplicateInfo.previousRegistration.duplicate_group_id) {
          const { error: updateError } = await supabase
            .from('nybil_inventering')
            .update({ duplicate_group_id: duplicateGroupId })
            .eq('id', duplicateInfo.previousRegistration.id);
          
          if (updateError) {
            console.error('Error updating first registration with duplicate_group_id:', updateError);
          } else {
            console.log('Updated first registration with duplicate_group_id:', duplicateGroupId);
          }
        }
      }
      
      // Upload damage photos and save to damages table
      // Track uploaded damage photo URLs and folders for email notification
      const uploadedDamagePhotoUrls: Record<string, string[]> = {};
      const uploadedDamageFolders: Record<string, string> = {};
      
      if (harSkadorVidLeverans && damages.length > 0) {
        const firstNameLower = fullName.split(' ')[0].toLowerCase();
        
        for (let i = 0; i < damages.length; i++) {
          const damage = damages[i];
          const damagePhotoUrls: string[] = [];
          
          // NEW folder structure for NYBIL damage photos:
          // REGNR/SKADOR/YYYYMMDD-skadetyp-placering-position-förnamn-NYBIL{-DUBBLETT-N}/
          const skadetyp = slugify(damage.damageType);
          const positionString = buildPositionString(damage.positions);
          
          const skadaFolder = `${normalizedReg}/SKADOR/${dateStr}-${skadetyp}-${positionString}-${firstNameLower}-NYBIL${folderSuffix}`;
          
          // Build filename: REGNR-YYYYMMDD-skadetyp-placering_N.ext
          const baseFileName = `${normalizedReg}-${dateStr}-${skadetyp}-${positionString}`;
          
          // Upload each photo for this damage
          for (let j = 0; j < damage.photos.length; j++) {
            const photo = damage.photos[j];
            const ext = getFileExtension(photo.file);
            const fileName = `${baseFileName}_${j + 1}.${ext}`;
            const damagePhotoUrl = await uploadDamagePhoto(photo.file, `${skadaFolder}/${fileName}`);
            damagePhotoUrls.push(damagePhotoUrl);
          }
          
          // Upload kommentar.txt if comment exists
          if (damage.comment && damage.comment.trim()) {
            const commentBlob = new Blob([damage.comment], { type: 'text/plain' });
            const commentFile = new File([commentBlob], 'kommentar.txt', { type: 'text/plain' });
            await uploadDamagePhoto(commentFile, `${skadaFolder}/kommentar.txt`);
          }
          
          // Store for email notification
          uploadedDamagePhotoUrls[damage.id] = damagePhotoUrls;
          uploadedDamageFolders[damage.id] = skadaFolder;
          
          // Save to damages table with correct column names matching schema
          const { error: damageError } = await supabase.from('damages').insert({
            regnr: normalizedReg,
            damage_date: now.toISOString().split('T')[0],
            damage_type: damage.damageType,
            damage_type_raw: damage.damageType,
            user_type: damage.damageType,
            description: damage.comment || null,
            inchecker_name: fullName,
            status: 'complete',
            uploads: {
              photo_urls: damagePhotoUrls,
              video_urls: [],
              folder: skadaFolder
            },
            user_positions: damage.positions.map(pos => ({
              carPart: pos.carPart,
              position: pos.position
            })),
            source: 'NYBIL',
            nybil_inventering_id: savedNybilId,
            created_at: now.toISOString()
          });
          
          if (damageError) {
            console.error('Error saving damage:', damageError);
            // Continue with other damages even if one fails
          }
        }
      }
      
      // Send confirmation email notification
      try {
        const emailPayload = {
          regnr: normalizedReg,
          bilmarke: effectiveBilmarke,
          modell,
          matarstallning,
          matarstallning_aktuell: locationDiffers ? matarstallningAktuell : null,
          hjultyp,
          hjul_till_forvaring: hjulTillForvaring,
          hjul_forvaring_ort: wheelsNeedStorage ? hjulForvaringOrt : null,
          hjul_forvaring_spec: wheelsNeedStorage ? hjulForvaringSpec : null,
          bransletyp,
          vaxel: effectiveVaxel,
          plats_mottagning_ort: ort,
          plats_mottagning_station: station,
          planerad_station: planeradStation,
          plats_aktuell_ort: platsAktuellOrt,
          plats_aktuell_station: platsAktuellStation,
          // Contract terms
          serviceintervall: serviceintervall === 'Annat' ? serviceintervallAnnat : serviceintervall,
          max_km_manad: maxKmManad === 'Annat' ? maxKmManadAnnat : maxKmManad,
          avgift_over_km: avgiftOverKm === 'Annat' ? avgiftOverKmAnnat : avgiftOverKm,
          // Fuel/charging status
          tankstatus: !isElectric ? tankstatus : null,
          laddniva_procent: isElectric && laddnivaProcent ? parseInt(laddnivaProcent, 10) : null,
          // MB/VW Connect status
          mbme_aktiverad: showMbmeQuestion ? mbmeAktiverad : null,
          vw_connect_aktiverad: showVwConnectQuestion ? vwConnectAktiverad : null,
          // Equipment
          antal_nycklar: antalNycklar,
          extranyckel_forvaring_ort: antalNycklar === 2 ? extranyckelForvaringOrt : null,
          extranyckel_forvaring_spec: antalNycklar === 2 ? extranyckelForvaringSpec : null,
          antal_laddkablar: needsLaddkablar ? antalLaddkablar : 0,
          laddkablar_forvaring_ort: laddkablarNeedsStorage ? laddkablarForvaringOrt : null,
          laddkablar_forvaring_spec: laddkablarNeedsStorage ? laddkablarForvaringSpec : null,
          dragkrok,
          gummimattor,
          dackkompressor,
          stold_gps: stoldGps,
          stold_gps_spec: stoldGps ? stoldGpsSpec : null,
          antal_insynsskydd: antalInsynsskydd,
          lasbultar_med: lasbultarMed,
          instruktionsbok,
          instruktionsbok_forvaring_ort: instruktionsbok ? instruktionsbokForvaringOrt : null,
          instruktionsbok_forvaring_spec: instruktionsbok ? instruktionsbokForvaringSpec : null,
          coc,
          coc_forvaring_ort: coc ? cocForvaringOrt : null,
          coc_forvaring_spec: coc ? cocForvaringSpec : null,
          // Saluinfo
          saludatum: saludatum || null,
          salu_station: saluStation || null,
          kopare_foretag: kopareForetag || null,
          attention: attention || null,
          returort: returort || null,
          returadress: returadress || null,
          notering_forsaljning: noteringForsaljning || null,
          // Damages
          har_skador_vid_leverans: harSkadorVidLeverans === true && damages.length > 0,
          skador: damages.map(d => ({
            damageType: d.damageType,
            positions: d.positions.map(p => ({
              carPart: p.carPart,
              position: p.position
            })),
            comment: d.comment,
            photoUrls: uploadedDamagePhotoUrls[d.id] || [],
            folder: uploadedDamageFolders[d.id] || null
          })),
          // Rental status
          klar_for_uthyrning: klarForUthyrning,
          ej_uthyrningsbar_anledning: klarForUthyrning === false ? ejUthyrningsbarAnledning : null,
          // Notes
          anteckningar: anteckningar || null,
          // Metadata
          registrerad_av: fullName,
          photo_urls: photoUrls,
          media_folder: mediaFolder,
          // Duplicate info
          is_duplicate: isDuplicate,
          previous_registration: isDuplicate && duplicateInfo?.previousRegistration ? {
            regnr: duplicateInfo.previousRegistration.regnr,
            registreringsdatum: duplicateInfo.previousRegistration.registreringsdatum,
            bilmarke: duplicateInfo.previousRegistration.bilmarke,
            modell: duplicateInfo.previousRegistration.modell
          } : null,
          exists_in_bilkontroll: duplicateInfo?.existsInBilkontroll || false
        };

        console.log('Sending email notification with payload:', emailPayload);
        const notifyResponse = await fetch('/api/notify-nybil', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(emailPayload)
        });

        if (!notifyResponse.ok) {
          const errorText = await notifyResponse.text();
          console.error('Email notification failed:', errorText);
          // Continue - email failure shouldn't block success
        } else {
          console.log('Email notification sent successfully');
        }
      } catch (emailError) {
        console.error('Error sending email notification:', emailError);
        // Continue - email failure shouldn't block success
      }
      
      console.log('Registration complete, showing success modal');
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
  
  // Get formatted summary for confirmation modal
  const getFormSummary = () => {
    const effectiveBilmarke = bilmarke === 'Annat' ? bilmarkeAnnat : bilmarke;
    const effectiveVaxel = needsVaxelQuestion ? vaxel : 'Automat';
    const effectiveServiceintervall = serviceintervall === 'Annat' ? serviceintervallAnnat : serviceintervall;
    const effectiveMaxKm = maxKmManad === 'Annat' ? maxKmManadAnnat : maxKmManad;
    const effectiveAvgift = avgiftOverKm === 'Annat' ? avgiftOverKmAnnat : avgiftOverKm;
    
    // Build laddkablar förvaring string
    let laddkablarForvaring = '';
    if (laddkablarNeedsStorage && laddkablarForvaringOrt && laddkablarForvaringSpec) {
      laddkablarForvaring = `${laddkablarForvaringOrt}, ${laddkablarForvaringSpec}`;
    }
    
    // Calculate charging/tank warnings (same logic as /check)
    const showChargeWarning = isElectric && laddnivaProcent !== null && laddnivaProcent !== '' && parseInt(laddnivaProcent, 10) < 95;
    const showNotRefueled = !isElectric && tankstatus === 'ej_upptankad';
    
    return {
      fordon: {
        regnr: normalizedReg,
        bilmarke: effectiveBilmarke,
        modell
      },
      mottagning: {
        ort,
        station
      },
      planeradStation,
      status: {
        matarstallning,
        matarstallningAktuell: locationDiffers ? matarstallningAktuell : '',
        hjultyp,
        hjulTillForvaring,
        bransletyp,
        vaxel: effectiveVaxel
      },
      // Charging/tank status for warnings
      laddnivaProcent: isElectric ? laddnivaProcent : null,
      tankstatus: !isElectric ? tankstatus : null,
      showChargeWarning,
      showNotRefueled,
      avtalsvillkor: {
        serviceintervall: effectiveServiceintervall,
        maxKmManad: effectiveMaxKm,
        avgiftOverKm: effectiveAvgift
      },
      stoldGps,
      stoldGpsSpec,
      saludatum: saludatum || '',
      // Utrustning fields
      antalInsynsskydd,
      instruktionsbok,
      instruktionsbokForvaringOrt,
      instruktionsbokForvaringSpec,
      coc,
      cocForvaringOrt,
      cocForvaringSpec,
      antalNycklar,
      extranyckelForvaringOrt,
      extranyckelForvaringSpec,
      antalLaddkablar,
      laddkablarForvaring,
      lasbultarMed,
      dragkrok,
      gummimattor,
      dackkompressor,
      hjulForvaringOrt,
      hjulForvaringSpec,
      // Photo summary
      photos: {
        hasFront: !!photoFront,
        hasBack: !!photoBack,
        additionalCount: additionalPhotos.length
      },
      // Damages summary
      damages: harSkadorVidLeverans && damages.length > 0 ? damages.map(d => ({
        damageType: d.damageType,
        placement: d.positions.map(p => p.carPart).filter(Boolean).join(', '),
        position: d.positions.map(p => p.position).filter(Boolean).join(', '),
        comment: d.comment,
        photoCount: d.photos.length
      })) : [],
      harSkadorVidLeverans,
      klarForUthyrning: klarForUthyrning ? 'Ja' : 'Nej'
    };
  };
  
  return (
    <div className="nybil-form">
      <GlobalStyles backgroundUrl={BACKGROUND_IMAGE_URL} />
      {isSaving && <SpinnerOverlay />}
      {showSuccessModal && <SuccessModal firstName={firstName} />}
      {showDamageModal && currentDamageId && (
        <DamageModal
          damage={getCurrentDamage()!}
          onClose={closeDamageModal}
          onUpdateField={(field, value) => updateDamageField(currentDamageId, field, value)}
          onUpdatePosition={(positionId, field, value) => updateDamagePosition(currentDamageId, positionId, field, value)}
          onAddPosition={() => addDamagePosition(currentDamageId)}
          onRemovePosition={(positionId) => removeDamagePosition(currentDamageId, positionId)}
          onPhotoChange={(e) => handleDamagePhotoChange(currentDamageId, e)}
          onRemovePhoto={(index) => removeDamagePhoto(currentDamageId, index)}
        />
      )}
      {showRegWarningModal && (
        <WarningModal
          title="Registreringsnummer"
          message={`Är du säker? ${normalizedReg} är inte i standardformat.`}
          onCancel={() => setShowRegWarningModal(false)}
          onConfirm={async () => {
            setShowRegWarningModal(false);
            // After confirming reg.nr warning, run mätarställning validation
            if (!validateMatarstallning()) {
              return; // Block if mätarställning validation fails
            }
            // Check for duplicates before showing confirmation modal
            console.log('Reg warning confirmed, checking for duplicates with:', normalizedReg);
            try {
              const duplicateResult = await checkForDuplicate(normalizedReg);
              console.log('Duplicate check result after reg warning:', duplicateResult);
              if (duplicateResult.existsInBilkontroll || duplicateResult.existsInNybil) {
                console.log('Duplicate found after reg warning! Showing duplicate modal');
                setDuplicateInfo(duplicateResult);
                setShowDuplicateModal(true);
                return;
              }
            } catch (error) {
              console.error('Error checking for duplicates after reg warning:', error);
              // Continue anyway - don't block registration if duplicate check fails
            }
            setShowConfirmModal(true);
          }}
          cancelText="Avbryt"
          confirmText="Fortsätt ändå"
        />
      )}
      {showDuplicateModal && duplicateInfo && (
        <DuplicateWarningModal
          regnr={normalizedReg}
          existsInBilkontroll={duplicateInfo.existsInBilkontroll}
          existsInNybil={duplicateInfo.existsInNybil}
          previousRegistration={duplicateInfo.previousRegistration}
          onCancel={() => {
            setShowDuplicateModal(false);
            setDuplicateInfo(null);
          }}
          onConfirm={handleCreateDuplicate}
        />
      )}
      {showConfirmModal && (
        <ConfirmationModal
          summary={getFormSummary()}
          onCancel={() => setShowConfirmModal(false)}
          onConfirm={handleConfirmAndSubmit}
        />
      )}
      <div className="main-header">
        <img src={MABI_LOGO_URL} alt="MABI Logo" className="main-logo" />
        <h1 className="page-title">NY BIL</h1>
        {fullName && <p className="user-info">Inloggad: {fullName}</p>}
      </div>
      
      {/* FORDON Section */}
      <Card data-error={showFieldErrors && (!regInput || !bilmarke || !modell || (bilmarke === 'Annat' && !bilmarkeAnnat.trim()))}>
        <SectionHeader title="Fordon" />
        <Field label="Registreringsnummer *">
          <input type="text" value={regInput} onChange={(e) => setRegInput(e.target.value)} placeholder="ABC 123" className="reg-input" />
        </Field>
        <div className="grid-2-col">
          <Field label="Bilmärke *">
            <select value={bilmarke} onChange={(e) => handleBrandChange(e.target.value)}>
              <option value="">Välj bilmärke</option>
              {BILMARKEN.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </Field>
          <Field label="Modell *">
            <input type="text" value={modell} onChange={(e) => setModell(e.target.value)} placeholder="t.ex. T-Cross" />
          </Field>
        </div>
        {bilmarke === 'Annat' && (
          <Field label="Specificera bilmärke *">
            <input type="text" value={bilmarkeAnnat} onChange={(e) => setBilmarkeAnnat(e.target.value)} placeholder="Ange bilmärke" />
          </Field>
        )}
      </Card>
      
      {/* PLATS FÖR MOTTAGNING Section */}
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
      
      {/* PLANERAD STATION Section */}
      <Card>
        <SectionHeader title="Planerad station" />
        <Field label="Planerad station">
          <select value={planeradStation} onChange={e => setPlaneradStation(e.target.value)}>
            <option value="">Välj planerad station</option>
            {HUVUDSTATIONER.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
          </select>
        </Field>
      </Card>
      
      {/* FORDONSSTATUS Section */}
      <Card data-error={showFieldErrors && hasFordonStatusErrors}>
        <SectionHeader title="Fordonsstatus" />
        <Field label="Mätarställning vid leverans (km) *">
          <input type="number" value={matarstallning} onChange={e => setMatarstallning(e.target.value)} placeholder="12345" />
        </Field>
        
        <SubSectionHeader title="Däck" />
        <Field label="Däcktyp som sitter på *">
          <div className="grid-2-col">
            <ChoiceButton onClick={() => setHjultyp('Sommardäck')} isActive={hjultyp === 'Sommardäck'} isSet={hjultyp !== null}>Sommardäck</ChoiceButton>
            <ChoiceButton onClick={() => setHjultyp('Vinterdäck')} isActive={hjultyp === 'Vinterdäck'} isSet={hjultyp !== null}>Vinterdäck</ChoiceButton>
          </div>
        </Field>
        <Field label="Hjul till förvaring *">
          <div className="grid-3-col">
            <ChoiceButton onClick={() => { setHjulTillForvaring('Vinterdäck'); setHjulForvaringOrt(''); setHjulForvaringSpec(''); }} isActive={hjulTillForvaring === 'Vinterdäck'} isSet={hjulTillForvaring !== null}>Vinterdäck</ChoiceButton>
            <ChoiceButton onClick={() => { setHjulTillForvaring('Sommardäck'); setHjulForvaringOrt(''); setHjulForvaringSpec(''); }} isActive={hjulTillForvaring === 'Sommardäck'} isSet={hjulTillForvaring !== null}>Sommardäck</ChoiceButton>
            <ChoiceButton onClick={() => { setHjulTillForvaring('Inga medföljande hjul'); setHjulForvaringOrt(''); setHjulForvaringSpec(''); }} isActive={hjulTillForvaring === 'Inga medföljande hjul'} isSet={hjulTillForvaring !== null}>Inga medföljande hjul</ChoiceButton>
          </div>
        </Field>
        {wheelsNeedStorage && (
          <>
            <Field label="Förvaringsort *">
              <select value={hjulForvaringOrt} onChange={e => setHjulForvaringOrt(e.target.value)}>
                <option value="">Välj förvaringsort</option>
                {ORTER.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
            <Field label="Specificera förvaring av hjul *">
              <input type="text" value={hjulForvaringSpec} onChange={e => setHjulForvaringSpec(e.target.value)} placeholder="t.ex. Hylla 3, rum B" />
            </Field>
          </>
        )}
        
        <SubSectionHeader title="Drivmedel" />
        <Field label="Drivmedel *">
          <div className="grid-2-col">
            <ChoiceButton onClick={() => handleFuelTypeChange(FUEL_TYPES.BENSIN)} isActive={bransletyp === FUEL_TYPES.BENSIN} isSet={bransletyp !== null}>Bensin</ChoiceButton>
            <ChoiceButton onClick={() => handleFuelTypeChange(FUEL_TYPES.DIESEL)} isActive={bransletyp === FUEL_TYPES.DIESEL} isSet={bransletyp !== null}>Diesel</ChoiceButton>
          </div>
          <div className="grid-2-col" style={{ marginTop: '0.5rem' }}>
            <ChoiceButton onClick={() => handleFuelTypeChange(FUEL_TYPES.HYBRID_BENSIN)} isActive={bransletyp === FUEL_TYPES.HYBRID_BENSIN} isSet={bransletyp !== null}>Hybrid (bensin)</ChoiceButton>
            <ChoiceButton onClick={() => handleFuelTypeChange(FUEL_TYPES.HYBRID_DIESEL)} isActive={bransletyp === FUEL_TYPES.HYBRID_DIESEL} isSet={bransletyp !== null}>Hybrid (diesel)</ChoiceButton>
          </div>
          <div style={{ marginTop: '0.5rem' }}>
            <ChoiceButton onClick={() => handleFuelTypeChange(FUEL_TYPES.EL_FULL)} isActive={bransletyp === FUEL_TYPES.EL_FULL} isSet={bransletyp !== null} className="full-width-choice">100% el</ChoiceButton>
          </div>
        </Field>
        
        {/* Växel question - only for Bensin/Diesel */}
        {needsVaxelQuestion && (
          <Field label="Växel *">
            <div className="grid-2-col">
              <ChoiceButton onClick={() => setVaxel('Automat')} isActive={vaxel === 'Automat'} isSet={vaxel !== null}>Automat</ChoiceButton>
              <ChoiceButton onClick={() => setVaxel('Manuell')} isActive={vaxel === 'Manuell'} isSet={vaxel !== null}>Manuell</ChoiceButton>
            </div>
          </Field>
        )}
        
        {isElectric && (
          <Field label="Laddnivå (%) *">
            <input type="number" value={laddnivaProcent} onChange={handleLaddningChange} placeholder="0-100" min="0" max="100" />
          </Field>
        )}
        {!isElectric && bransletyp && (
          <>
            <Field label="Tankstatus *">
              <div className="grid-3-col">
                <ChoiceButton onClick={() => { setTankstatus('mottogs_fulltankad'); setUpptankningLiter(''); setUpptankningLiterpris(''); }} isActive={tankstatus === 'mottogs_fulltankad'} isSet={tankstatus !== null}>Mottogs fulltankad</ChoiceButton>
                <ChoiceButton onClick={() => setTankstatus('tankad_nu')} isActive={tankstatus === 'tankad_nu'} isSet={tankstatus !== null}>Tankad nu av MABI</ChoiceButton>
                <ChoiceButton onClick={() => { setTankstatus('ej_upptankad'); setUpptankningLiter(''); setUpptankningLiterpris(''); }} isActive={tankstatus === 'ej_upptankad'} isSet={tankstatus !== null}>Ej upptankad</ChoiceButton>
              </div>
            </Field>
            {tankstatus === 'tankad_nu' && (
              <div className="grid-2-col">
                <Field label="Antal liter *">
                  <input type="number" value={upptankningLiter} onChange={e => setUpptankningLiter(e.target.value)} placeholder="50" step="0.01" min="0" />
                </Field>
                <Field label="Literpris (kr) *">
                  <input type="number" value={upptankningLiterpris} onChange={e => setUpptankningLiterpris(e.target.value)} placeholder="20.50" step="0.01" min="0" />
                </Field>
              </div>
            )}
          </>
        )}
      </Card>
      
      {/* AVTALSVILLKOR Section */}
      <Card data-error={showFieldErrors && avtalsvillkorMissing}>
        <SectionHeader title="Avtalsvillkor" />
        <Field label="Serviceintervall km">
          <div className="grid-4-col">
            <ChoiceButton onClick={() => { setServiceintervall('15000'); setServiceintervallAnnat(''); }} isActive={serviceintervall === '15000'} isSet={serviceintervall !== null}>15000</ChoiceButton>
            <ChoiceButton onClick={() => { setServiceintervall('25000'); setServiceintervallAnnat(''); }} isActive={serviceintervall === '25000'} isSet={serviceintervall !== null}>25000</ChoiceButton>
            <ChoiceButton onClick={() => { setServiceintervall('30000'); setServiceintervallAnnat(''); }} isActive={serviceintervall === '30000'} isSet={serviceintervall !== null}>30000</ChoiceButton>
            <ChoiceButton onClick={() => setServiceintervall('Annat')} isActive={serviceintervall === 'Annat'} isSet={serviceintervall !== null}>Annat</ChoiceButton>
          </div>
        </Field>
        {serviceintervall === 'Annat' && (
          <Field label="Specificera serviceintervall">
            <input type="number" value={serviceintervallAnnat} onChange={e => setServiceintervallAnnat(e.target.value)} placeholder="Ange serviceintervall" />
          </Field>
        )}
        <Field label="Max km/månad">
          <div className="grid-3-col">
            <ChoiceButton onClick={() => { setMaxKmManad('1200'); setMaxKmManadAnnat(''); }} isActive={maxKmManad === '1200'} isSet={maxKmManad !== null}>1200</ChoiceButton>
            <ChoiceButton onClick={() => { setMaxKmManad('3000'); setMaxKmManadAnnat(''); }} isActive={maxKmManad === '3000'} isSet={maxKmManad !== null}>3000</ChoiceButton>
            <ChoiceButton onClick={() => setMaxKmManad('Annat')} isActive={maxKmManad === 'Annat'} isSet={maxKmManad !== null}>Annat</ChoiceButton>
          </div>
        </Field>
        {maxKmManad === 'Annat' && (
          <Field label="Specificera max km/månad">
            <input type="number" value={maxKmManadAnnat} onChange={e => setMaxKmManadAnnat(e.target.value)} placeholder="Ange max km/månad" />
          </Field>
        )}
        <Field label="Avgift över-km">
          <div className="grid-3-col">
            <ChoiceButton onClick={() => { setAvgiftOverKm('1'); setAvgiftOverKmAnnat(''); }} isActive={avgiftOverKm === '1'} isSet={avgiftOverKm !== null}>1 kr</ChoiceButton>
            <ChoiceButton onClick={() => { setAvgiftOverKm('2'); setAvgiftOverKmAnnat(''); }} isActive={avgiftOverKm === '2'} isSet={avgiftOverKm !== null}>2 kr</ChoiceButton>
            <ChoiceButton onClick={() => setAvgiftOverKm('Annat')} isActive={avgiftOverKm === 'Annat'} isSet={avgiftOverKm !== null}>Annat</ChoiceButton>
          </div>
        </Field>
        {avgiftOverKm === 'Annat' && (
          <Field label="Specificera avgift över-km">
            <input type="number" value={avgiftOverKmAnnat} onChange={e => setAvgiftOverKmAnnat(e.target.value)} placeholder="Ange avgift" />
          </Field>
        )}
      </Card>
      
      {/* UTRUSTNING Section */}
      <Card data-error={showFieldErrors && equipmentMissing}>
        <SectionHeader title="Utrustning" />
        <Field label="Antal insynsskydd * (räkna inte lastnät)">
          <div className="grid-3-col">
            <ChoiceButton onClick={() => setAntalInsynsskydd(0)} isActive={antalInsynsskydd === 0} isSet={antalInsynsskydd !== null}>0</ChoiceButton>
            <ChoiceButton onClick={() => setAntalInsynsskydd(1)} isActive={antalInsynsskydd === 1} isSet={antalInsynsskydd !== null}>1</ChoiceButton>
            <ChoiceButton onClick={() => setAntalInsynsskydd(2)} isActive={antalInsynsskydd === 2} isSet={antalInsynsskydd !== null}>2</ChoiceButton>
          </div>
        </Field>
        
        <Field label="Medföljande Instruktionsbok/Manual? *">
          <div className="grid-2-col">
            <ChoiceButton onClick={() => { setInstruktionsbok(true); }} isActive={instruktionsbok === true} isSet={instruktionsbok !== null}>Ja</ChoiceButton>
            <ChoiceButton onClick={() => { setInstruktionsbok(false); setInstruktionsbokForvaringOrt(''); setInstruktionsbokForvaringSpec(''); }} isActive={instruktionsbok === false} isSet={instruktionsbok !== null}>Nej</ChoiceButton>
          </div>
        </Field>
        {instruktionsbok === true && (
          <>
            <Field label="Förvaringsort *">
              <select value={instruktionsbokForvaringOrt} onChange={e => setInstruktionsbokForvaringOrt(e.target.value)}>
                <option value="">Välj förvaringsort</option>
                {ORTER.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
            <Field label="Specificera förvaring av instruktionsbok *">
              <input type="text" value={instruktionsbokForvaringSpec} onChange={e => setInstruktionsbokForvaringSpec(e.target.value)} placeholder="t.ex. Hyllplats 18F" />
            </Field>
          </>
        )}
        
        <Field label="Medföljande COC? *">
          <div className="grid-2-col">
            <ChoiceButton onClick={() => { setCoc(true); }} isActive={coc === true} isSet={coc !== null}>Ja</ChoiceButton>
            <ChoiceButton onClick={() => { setCoc(false); setCocForvaringOrt(''); setCocForvaringSpec(''); }} isActive={coc === false} isSet={coc !== null}>Nej</ChoiceButton>
          </div>
        </Field>
        {coc === true && (
          <>
            <Field label="Förvaringsort *">
              <select value={cocForvaringOrt} onChange={e => setCocForvaringOrt(e.target.value)}>
                <option value="">Välj förvaringsort</option>
                {ORTER.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
            <Field label="Specificera förvaring av COC *">
              <input type="text" value={cocForvaringSpec} onChange={e => setCocForvaringSpec(e.target.value)} placeholder="t.ex. Kontoret" />
            </Field>
          </>
        )}
        
        <Field label="Antal nycklar *">
          <div className="grid-2-col">
            <ChoiceButton onClick={() => { setAntalNycklar(1); setExtranyckelForvaringOrt(''); setExtranyckelForvaringSpec(''); }} isActive={antalNycklar === 1} isSet={antalNycklar !== null}>1</ChoiceButton>
            <ChoiceButton onClick={() => setAntalNycklar(2)} isActive={antalNycklar === 2} isSet={antalNycklar !== null}>2</ChoiceButton>
          </div>
        </Field>
        {antalNycklar === 2 && (
          <>
            <Field label="Förvaringsort *">
              <select value={extranyckelForvaringOrt} onChange={e => setExtranyckelForvaringOrt(e.target.value)}>
                <option value="">Välj förvaringsort</option>
                {ORTER.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
            <Field label="Specificera förvaring av extranyckel *">
              <input type="text" value={extranyckelForvaringSpec} onChange={e => setExtranyckelForvaringSpec(e.target.value)} placeholder="t.ex. Nyckelskåp" />
            </Field>
          </>
        )}
        
        {/* Laddkablar - different logic for Hybrid vs Electric */}
        {needsLaddkablar && (
          <>
            <Field label="Antal laddkablar *">
              {isHybrid ? (
                <div className="grid-3-col">
                  <ChoiceButton onClick={() => { setAntalLaddkablar(0); setLaddkablarForvaringOrt(''); setLaddkablarForvaringSpec(''); }} isActive={antalLaddkablar === 0} isSet={antalLaddkablar !== null}>0</ChoiceButton>
                  <ChoiceButton onClick={() => setAntalLaddkablar(1)} isActive={antalLaddkablar === 1} isSet={antalLaddkablar !== null}>1</ChoiceButton>
                  <ChoiceButton onClick={() => setAntalLaddkablar(2)} isActive={antalLaddkablar === 2} isSet={antalLaddkablar !== null}>2</ChoiceButton>
                </div>
              ) : (
                <div className="grid-2-col">
                  <ChoiceButton onClick={() => { setAntalLaddkablar(1); setLaddkablarForvaringOrt(''); setLaddkablarForvaringSpec(''); }} isActive={antalLaddkablar === 1} isSet={antalLaddkablar !== null}>1</ChoiceButton>
                  <ChoiceButton onClick={() => setAntalLaddkablar(2)} isActive={antalLaddkablar === 2} isSet={antalLaddkablar !== null}>2</ChoiceButton>
                </div>
              )}
            </Field>
            {laddkablarNeedsStorage && (
              <>
                <Field label="Förvaringsort *">
                  <select value={laddkablarForvaringOrt} onChange={e => setLaddkablarForvaringOrt(e.target.value)}>
                    <option value="">Välj förvaringsort</option>
                    {ORTER.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </Field>
                <Field label="Specificera förvaring av laddkabel/laddkablar *">
                  <input type="text" value={laddkablarForvaringSpec} onChange={e => setLaddkablarForvaringSpec(e.target.value)} placeholder="t.ex. Hyllplats 9G" />
                </Field>
              </>
            )}
          </>
        )}
        
        <Field label="Låsbultar med? *">
          <div className="grid-2-col">
            <ChoiceButton onClick={() => setLasbultarMed(true)} isActive={lasbultarMed === true} isSet={lasbultarMed !== null}>Ja</ChoiceButton>
            <ChoiceButton onClick={() => setLasbultarMed(false)} isActive={lasbultarMed === false} isSet={lasbultarMed !== null}>Nej</ChoiceButton>
          </div>
        </Field>
        
        <Field label="Dragkrok *">
          <div className="grid-2-col">
            <ChoiceButton onClick={() => setDragkrok(true)} isActive={dragkrok === true} isSet={dragkrok !== null}>Ja</ChoiceButton>
            <ChoiceButton onClick={() => setDragkrok(false)} isActive={dragkrok === false} isSet={dragkrok !== null}>Nej</ChoiceButton>
          </div>
        </Field>
        
        <Field label="Gummimattor *">
          <div className="grid-2-col">
            <ChoiceButton onClick={() => setGummimattor(true)} isActive={gummimattor === true} isSet={gummimattor !== null}>Ja</ChoiceButton>
            <ChoiceButton onClick={() => setGummimattor(false)} isActive={gummimattor === false} isSet={gummimattor !== null}>Nej</ChoiceButton>
          </div>
        </Field>
        
        <Field label="Däckkompressor *">
          <div className="grid-2-col">
            <ChoiceButton onClick={() => setDackkompressor(true)} isActive={dackkompressor === true} isSet={dackkompressor !== null}>Ja</ChoiceButton>
            <ChoiceButton onClick={() => setDackkompressor(false)} isActive={dackkompressor === false} isSet={dackkompressor !== null}>Nej</ChoiceButton>
          </div>
        </Field>
        
        <Field label="Stöld-GPS monterad *">
          <div className="grid-2-col">
            <ChoiceButton onClick={() => setStoldGps(true)} isActive={stoldGps === true} isSet={stoldGps !== null}>Ja</ChoiceButton>
            <ChoiceButton onClick={() => { setStoldGps(false); setStoldGpsSpec(''); }} isActive={stoldGps === false} isSet={stoldGps !== null}>Nej</ChoiceButton>
          </div>
        </Field>
        {stoldGps === true && (
          <div className="follow-up-field">
            <Field label="Specificera stöld-GPS *">
              <input type="text" value={stoldGpsSpec} onChange={e => setStoldGpsSpec(e.target.value)} placeholder="t.ex. Modell, placering" />
            </Field>
          </div>
        )}
      </Card>
      
      {/* UPPKOPPLING Section - only for MB or VW */}
      {showUppkopplingSection && (
        <Card data-error={showFieldErrors && uppkopplingMissing}>
          <SectionHeader title="Uppkoppling" />
          {showMbmeQuestion && (
            <Field label="MBme aktiverad *">
              <div className="grid-2-col">
                <ChoiceButton onClick={() => setMbmeAktiverad(true)} isActive={mbmeAktiverad === true} isSet={mbmeAktiverad !== null}>Ja</ChoiceButton>
                <ChoiceButton onClick={() => setMbmeAktiverad(false)} isActive={mbmeAktiverad === false} isSet={mbmeAktiverad !== null}>Nej</ChoiceButton>
              </div>
            </Field>
          )}
          {showVwConnectQuestion && (
            <Field label="VW Connect aktiverad *">
              <div className="grid-2-col">
                <ChoiceButton onClick={() => setVwConnectAktiverad(true)} isActive={vwConnectAktiverad === true} isSet={vwConnectAktiverad !== null}>Ja</ChoiceButton>
                <ChoiceButton onClick={() => setVwConnectAktiverad(false)} isActive={vwConnectAktiverad === false} isSet={vwConnectAktiverad !== null}>Nej</ChoiceButton>
              </div>
            </Field>
          )}
        </Card>
      )}
      
      {/* FOTON Section */}
      <Card data-error={showFieldErrors && photosMissing}>
        <SectionHeader title="Foton" />
        <p className="section-note">Ta bilder av bilen framifrån och bakifrån. Du kan även lägga till fler bilder.</p>
        
        <div className="photo-grid">
          {/* Front photo */}
          <div className="photo-item">
            <Field label="Ta bild framifrån *">
              {photoFront ? (
                <div className="photo-preview-container">
                  <img src={photoFront.preview} alt="Framifrån" className="photo-preview" />
                  <button type="button" onClick={retakePhotoFront} className="retake-btn">Ta om</button>
                </div>
              ) : (
                <label className="photo-upload-label mandatory">
                  <span>📷 Ta bild framifrån</span>
                  <input 
                    type="file" 
                    accept="image/*" 
                    capture="environment" 
                    onChange={handlePhotoFrontChange}
                    style={{ display: 'none' }}
                  />
                </label>
              )}
            </Field>
          </div>
          
          {/* Back photo */}
          <div className="photo-item">
            <Field label="Ta bild bakifrån *">
              {photoBack ? (
                <div className="photo-preview-container">
                  <img src={photoBack.preview} alt="Bakifrån" className="photo-preview" />
                  <button type="button" onClick={retakePhotoBack} className="retake-btn">Ta om</button>
                </div>
              ) : (
                <label className="photo-upload-label mandatory">
                  <span>📷 Ta bild bakifrån</span>
                  <input 
                    type="file" 
                    accept="image/*" 
                    capture="environment" 
                    onChange={handlePhotoBackChange}
                    style={{ display: 'none' }}
                  />
                </label>
              )}
            </Field>
          </div>
        </div>
        
        {/* Additional photos */}
        <Field label="Lägg till fler bilder (frivilligt)">
          <label className="photo-upload-label optional">
            <span>📷 {additionalPhotos.length > 0 ? 'Lägg till fler bilder' : 'Lägg till bilder'}</span>
            <input 
              type="file" 
              accept="image/*" 
              capture="environment" 
              multiple
              onChange={handleAdditionalPhotosChange}
              style={{ display: 'none' }}
            />
          </label>
        </Field>
        
        {additionalPhotos.length > 0 && (
          <div className="additional-photos-preview">
            {additionalPhotos.map((photo, index) => (
              <div key={index} className="additional-photo-item">
                <img src={photo.preview} alt={`Övrig bild ${index + 1}`} />
                <button type="button" onClick={() => removeAdditionalPhoto(index)} className="remove-photo-btn">×</button>
              </div>
            ))}
          </div>
        )}
      </Card>
      
      {/* SKADOR VID LEVERANS Section */}
      <Card data-error={showFieldErrors && damagesMissing}>
        <SectionHeader title="Skador vid leverans" />
        <Field label="Har bilen skador vid leverans? *">
          <div className="grid-2-col">
            <ChoiceButton 
              onClick={() => { setHarSkadorVidLeverans(false); setDamages([]); }} 
              isActive={harSkadorVidLeverans === false} 
              isSet={harSkadorVidLeverans !== null}
            >
              Inga skador
            </ChoiceButton>
            <ChoiceButton 
              onClick={() => setHarSkadorVidLeverans(true)} 
              isActive={harSkadorVidLeverans === true} 
              isSet={harSkadorVidLeverans !== null}
            >
              Skador vid leverans
            </ChoiceButton>
          </div>
        </Field>
        
        {harSkadorVidLeverans === true && (
          <>
            {/* Lista befintliga skador */}
            {damages.length > 0 && (
              <div className="damage-list">
                {damages.map((damage, index) => (
                  <div key={damage.id} className="damage-item-card">
                    <div className="damage-info">
                      <strong>Skada {index + 1}:</strong> {damage.damageType || 'Ej vald'}
                      <span className="damage-location">
                        {damage.positions.map(p => p.carPart).filter(Boolean).join(', ') || 'Placering ej vald'}
                        {damage.positions.some(p => p.position) && ` - ${damage.positions.map(p => p.position).filter(Boolean).join(', ')}`}
                      </span>
                      <span className="damage-photos">{damage.photos.length} foto(n)</span>
                    </div>
                    <div className="damage-actions">
                      <button type="button" onClick={() => editDamage(damage.id)} className="damage-edit-btn">Redigera</button>
                      <button type="button" onClick={() => removeDamage(damage.id)} className="damage-remove-btn">Ta bort</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {/* Knapp för att lägga till skada */}
            <button 
              type="button" 
              className="add-damage-btn"
              onClick={addNewDamage}
            >
              + Lägg till skada
            </button>
            
            {/* Varning om inga skador dokumenterade */}
            {damages.length === 0 && (
              <p className="warning-text">
                Du har valt &quot;Skador vid leverans&quot; men inga skador är dokumenterade.
              </p>
            )}
          </>
        )}
      </Card>
      
      {/* VAR ÄR BILEN NU Section */}
      <Card data-error={showFieldErrors && (!platsAktuellOrt || !platsAktuellStation || (locationDiffers && !matarstallningAktuell))}>
        <SectionHeader title="Var är bilen nu?" />
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
        {locationDiffers && (
          <div id="matarstallning-aktuell-field">
            <Field label="Aktuell mätarställning (km) *">
              <input 
                type="number" 
                value={matarstallningAktuell} 
                onChange={e => { 
                  setMatarstallningAktuell(e.target.value); 
                  setMatarstallningError(''); // Clear error when user types
                }} 
                placeholder="12345"
                data-error={!!matarstallningError}
              />
            </Field>
            {matarstallningError && (
              <p className="error-text" style={{ color: 'var(--color-danger)', fontSize: '0.875rem', marginTop: '0.5rem' }}>
                {matarstallningError}
              </p>
            )}
          </div>
        )}
      </Card>
      
      {/* SALUINFO Section - optional */}
      <Card>
        <SectionHeader title="Saluinfo" />
        <p className="section-note">Frivillig sektion</p>
        <Field label="Saludatum">
          <input type="date" value={saludatum} onChange={e => setSaludatum(e.target.value)} />
        </Field>
        <Field label="Station">
          <select value={saluStation} onChange={e => setSaluStation(e.target.value)}>
            <option value="">Välj station</option>
            {HUVUDSTATIONER.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
          </select>
        </Field>
      </Card>
      
      {/* KÖPARE Section - optional */}
      <Card>
        <SectionHeader title="Köpare" />
        <p className="section-note">Frivillig sektion</p>
        <Field label="Köpare (företag)">
          <input type="text" value={kopareForetag} onChange={e => setKopareForetag(e.target.value)} placeholder="Företagsnamn" />
        </Field>
        <Field label="Returort för fordonsförsäljning">
          <input type="text" value={returort} onChange={e => setReturort(e.target.value)} placeholder="Ort" />
        </Field>
        <Field label="Returadress försäljning">
          <input type="text" value={returadress} onChange={e => setReturadress(e.target.value)} placeholder="Adress" />
        </Field>
        <Field label="Attention">
          <input type="text" value={attention} onChange={e => setAttention(e.target.value)} placeholder="Kontaktperson" />
        </Field>
        <Field label="Notering fordonsförsäljning">
          <textarea value={noteringForsaljning} onChange={e => setNoteringForsaljning(e.target.value)} placeholder="Övriga noteringar..." rows={3} />
        </Field>
      </Card>
      
      {/* KLAR FÖR UTHYRNING Section */}
      <Card data-error={showFieldErrors && klarForUthyrningMissing}>
        <SectionHeader title="Klar för uthyrning" />
        <Field label="Klar för uthyrning? *">
          <div className="grid-2-col">
            <ChoiceButton onClick={() => { setKlarForUthyrning(true); setEjUthyrningsbarAnledning(''); }} isActive={klarForUthyrning === true} isSet={klarForUthyrning !== null}>Ja</ChoiceButton>
            <ChoiceButton onClick={() => setKlarForUthyrning(false)} isActive={klarForUthyrning === false} isSet={klarForUthyrning !== null}>Nej</ChoiceButton>
          </div>
        </Field>
        {klarForUthyrning === false && (
          <Field label="Specificera varför *">
            <textarea value={ejUthyrningsbarAnledning} onChange={e => setEjUthyrningsbarAnledning(e.target.value)} placeholder="Ange anledning..." rows={3} />
          </Field>
        )}
      </Card>
      
      {/* ÖVRIGT Section */}
      <Card>
        <SectionHeader title="Övrigt" />
        <Field label="Anteckningar (frivilligt)">
          <textarea value={anteckningar} onChange={e => setAnteckningar(e.target.value)} placeholder="Övrig information om bilen..." rows={4} />
        </Field>
      </Card>
      
      <div className="form-actions">
        <Button onClick={handleCancel} variant="secondary">Avbryt</Button>
        <Button onClick={handleRegisterClick} disabled={isSaving} variant={formIsValid ? 'success' : 'primary'}>
          {isSaving ? 'Sparar...' : (formIsValid ? 'Registrera bil' : 'Visa saknad information')}
        </Button>
      </div>
      <footer className="copyright-footer">&copy; {currentYear} Albarone AB &mdash; Alla rättigheter förbehållna</footer>
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

const Button: React.FC<React.PropsWithChildren<{ onClick?: () => void; variant?: string; disabled?: boolean; style?: object; className?: string; }>> = ({ onClick, variant = 'primary', disabled, children, ...props }) => (
  <button onClick={onClick} className={`btn ${variant} ${disabled ? 'disabled' : ''}`} disabled={disabled} {...props}>{children}</button>
);

const ChoiceButton: React.FC<{ onClick: () => void; isActive: boolean; children: React.ReactNode; className?: string; isSet?: boolean; }> = ({ onClick, isActive, children, className, isSet = false }) => {
  let btnClass = 'choice-btn';
  if (className) btnClass += ` ${className}`;
  if (isActive) btnClass += ' active default';
  else if (isSet) btnClass += ' disabled-choice';
  return <button onClick={onClick} className={btnClass}>{children}</button>;
};

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
      <p>Bilen är registrerad!</p>
    </div>
  </>
);

type WarningModalProps = {
  title: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
  cancelText?: string;
  confirmText?: string;
};

const WarningModal: React.FC<WarningModalProps> = ({ title, message, onCancel, onConfirm, cancelText = 'Avbryt', confirmText = 'Bekräfta' }) => (
  <>
    <div className="modal-overlay" />
    <div className="modal-content warning-modal">
      <h3>{title}</h3>
      <p>{message}</p>
      <div className="modal-actions">
        <button onClick={onCancel} className="btn secondary">{cancelText}</button>
        <button onClick={onConfirm} className="btn primary">{confirmText}</button>
      </div>
    </div>
  </>
);

type DuplicateWarningModalProps = {
  regnr: string;
  existsInBilkontroll: boolean;
  existsInNybil: boolean;
  previousRegistration: { regnr: string; registreringsdatum: string; bilmarke: string; modell: string; created_at?: string; fullstandigt_namn?: string } | null;
  onCancel: () => void;
  onConfirm: () => void;
};

const DuplicateWarningModal: React.FC<DuplicateWarningModalProps> = ({ 
  regnr, 
  existsInBilkontroll, 
  existsInNybil, 
  previousRegistration, 
  onCancel, 
  onConfirm 
}) => {
  // Format previous registration time and date (e.g. "kl 12:51, 2025-11-29")
  const formatPreviousTimeDate = () => {
    if (!previousRegistration) return '';
    
    if (previousRegistration.created_at) {
      const createdDate = new Date(previousRegistration.created_at);
      const hours = createdDate.getHours().toString().padStart(2, '0');
      const minutes = createdDate.getMinutes().toString().padStart(2, '0');
      return `kl ${hours}:${minutes}, ${previousRegistration.registreringsdatum}`;
    }
    return previousRegistration.registreringsdatum;
  };

  return (
    <>
      <div className="modal-overlay" />
      <div className="modal-content warning-modal duplicate-warning-modal">
        <h3>Reg.nr {regnr} är redan registrerat</h3>
        {previousRegistration && (
          <div className="duplicate-info" style={{ marginTop: '16px', padding: '12px', backgroundColor: '#f9fafb', borderRadius: '6px' }}>
            <p style={{ margin: '0 0 4px 0' }}><strong>Tidigare registrering:</strong> {previousRegistration.bilmarke} {previousRegistration.modell}</p>
            <p style={{ margin: 0, color: '#6b7280' }}>
              Registrerad av {previousRegistration.fullstandigt_namn || 'okänd'} {formatPreviousTimeDate()}
            </p>
          </div>
        )}
        {existsInBilkontroll && !existsInNybil && (
          <p style={{ marginTop: '16px', color: '#6b7280', fontStyle: 'italic' }}>
            Finns i Bilkontroll-listan.
          </p>
        )}
        <div className="modal-actions">
          <button onClick={onCancel} className="btn secondary">Avbryt</button>
          <button onClick={onConfirm} className="btn primary">Skapa dubblett</button>
        </div>
      </div>
    </>
  );
};

type DamageSummary = {
  damageType: string;
  placement: string;
  position: string;
  comment: string;
  photoCount: number;
};

type FormSummary = {
  fordon: { regnr: string; bilmarke: string; modell: string };
  mottagning: { ort: string; station: string };
  planeradStation: string;
  status: { matarstallning: string; matarstallningAktuell: string; hjultyp: string | null; hjulTillForvaring: string | null; bransletyp: string | null; vaxel: string | null };
  // Charging/tank status
  laddnivaProcent: string | null;
  tankstatus: 'mottogs_fulltankad' | 'tankad_nu' | 'ej_upptankad' | null;
  showChargeWarning: boolean;
  showNotRefueled: boolean;
  avtalsvillkor: { serviceintervall: string | null; maxKmManad: string | null; avgiftOverKm: string | null };
  stoldGps: boolean | null;
  stoldGpsSpec: string;
  saludatum: string;
  // Utrustning fields
  antalInsynsskydd: number | null;
  instruktionsbok: boolean | null;
  instruktionsbokForvaringOrt: string;
  instruktionsbokForvaringSpec: string;
  coc: boolean | null;
  cocForvaringOrt: string;
  cocForvaringSpec: string;
  antalNycklar: number | null;
  extranyckelForvaringOrt: string;
  extranyckelForvaringSpec: string;
  antalLaddkablar: number | null;
  laddkablarForvaring: string;
  lasbultarMed: boolean | null;
  dragkrok: boolean | null;
  gummimattor: boolean | null;
  dackkompressor: boolean | null;
  hjulForvaringOrt: string;
  hjulForvaringSpec: string;
  // Photo summary
  photos: { hasFront: boolean; hasBack: boolean; additionalCount: number };
  // Damages summary
  damages: DamageSummary[];
  harSkadorVidLeverans: boolean | null;
  klarForUthyrning: string;
};

type ConfirmationModalProps = {
  summary: FormSummary;
  onCancel: () => void;
  onConfirm: () => void;
};

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({ summary, onCancel, onConfirm }) => (
  <>
    <div className="modal-overlay" />
    <div className="modal-content confirmation-modal">
      {summary.showChargeWarning && <div className="charge-warning-banner">Säkerställ att bilen omedelbart sätts på laddning!</div>}
      {summary.showNotRefueled && <div className="charge-warning-banner">Bilen måste tankas!</div>}
      <h3>Bekräfta registrering</h3>
      <div className="summary-section">
        <h4>Fordon</h4>
        <p><strong>Reg.nr:</strong> {summary.fordon.regnr}</p>
        <p><strong>Bilmärke:</strong> {summary.fordon.bilmarke}</p>
        <p><strong>Modell:</strong> {summary.fordon.modell}</p>
      </div>
      <div className="summary-section">
        <h4>Plats för mottagning</h4>
        <p><strong>Ort:</strong> {summary.mottagning.ort}</p>
        <p><strong>Station:</strong> {summary.mottagning.station}</p>
      </div>
      <div className="summary-section">
        <h4>Planerad station</h4>
        <p>{summary.planeradStation}</p>
      </div>
      <div className="summary-section">
        <h4>Fordonsstatus</h4>
        <p><strong>Mätarställning:</strong> {summary.status.matarstallning} km</p>
        {summary.status.matarstallningAktuell && (
          <p><strong>Aktuell mätarställning:</strong> {summary.status.matarstallningAktuell} km</p>
        )}
        <p><strong>Däcktyp:</strong> {summary.status.hjultyp}</p>
        <p><strong>Hjul till förvaring:</strong> {summary.status.hjulTillForvaring}</p>
        <p><strong>Drivmedel:</strong> {summary.status.bransletyp}</p>
        <p><strong>Växel:</strong> {summary.status.vaxel}</p>
      </div>
      <div className="summary-section">
        <h4>Avtalsvillkor</h4>
        <p><strong>Serviceintervall:</strong> {summary.avtalsvillkor.serviceintervall}</p>
        <p><strong>Max km/månad:</strong> {summary.avtalsvillkor.maxKmManad}</p>
        <p><strong>Avgift över-km:</strong> {summary.avtalsvillkor.avgiftOverKm} kr</p>
      </div>
      <div className="summary-section">
        <h4>Utrustning</h4>
        <p><strong>Antal insynsskydd:</strong> {summary.antalInsynsskydd}</p>
        <p><strong>Instruktionsbok/Manual:</strong> {summary.instruktionsbok ? 'Ja' : 'Nej'}</p>
        {summary.instruktionsbok && summary.instruktionsbokForvaringOrt && (
          <p><strong>Förvaring instruktionsbok:</strong> {summary.instruktionsbokForvaringOrt}, {summary.instruktionsbokForvaringSpec}</p>
        )}
        <p><strong>COC-dokument:</strong> {summary.coc ? 'Ja' : 'Nej'}</p>
        {summary.coc && summary.cocForvaringOrt && (
          <p><strong>Förvaring COC:</strong> {summary.cocForvaringOrt}, {summary.cocForvaringSpec}</p>
        )}
        <p><strong>Antal nycklar:</strong> {summary.antalNycklar}</p>
        {summary.antalNycklar === 2 && summary.extranyckelForvaringOrt && (
          <p><strong>Förvaring extranyckel:</strong> {summary.extranyckelForvaringOrt}, {summary.extranyckelForvaringSpec}</p>
        )}
        {summary.antalLaddkablar !== null && summary.antalLaddkablar > 0 && (
          <>
            <p><strong>Antal laddkablar:</strong> {summary.antalLaddkablar}</p>
            {summary.laddkablarForvaring && <p><strong>Förvaring laddkablar:</strong> {summary.laddkablarForvaring}</p>}
          </>
        )}
        <p><strong>Låsbultar med:</strong> {summary.lasbultarMed ? 'Ja' : 'Nej'}</p>
        <p><strong>Dragkrok:</strong> {summary.dragkrok ? 'Ja' : 'Nej'}</p>
        <p><strong>Gummimattor:</strong> {summary.gummimattor ? 'Ja' : 'Nej'}</p>
        <p><strong>Däckkompressor:</strong> {summary.dackkompressor ? 'Ja' : 'Nej'}</p>
        {summary.status.hjulTillForvaring && summary.status.hjulTillForvaring !== 'Inga medföljande hjul' && (
          <p><strong>Hjul till förvaring:</strong> {summary.status.hjulTillForvaring} - {summary.hjulForvaringOrt}, {summary.hjulForvaringSpec}</p>
        )}
        <p><strong>Stöld-GPS:</strong> {summary.stoldGps ? 'Ja' : 'Nej'}</p>
        {summary.stoldGps && summary.stoldGpsSpec && (
          <p><strong>Stöld-GPS specifikation:</strong> {summary.stoldGpsSpec}</p>
        )}
      </div>
      <div className="summary-section">
        <h4>Foton</h4>
        <p><strong>Bild framifrån:</strong> {summary.photos.hasFront ? '✅ Ja' : '❌ Nej'}</p>
        <p><strong>Bild bakifrån:</strong> {summary.photos.hasBack ? '✅ Ja' : '❌ Nej'}</p>
        {summary.photos.additionalCount > 0 && (
          <p><strong>Övriga bilder:</strong> {summary.photos.additionalCount} st</p>
        )}
      </div>
      {summary.damages && summary.damages.length > 0 && (
        <div className="summary-section summary-section-warning">
          <h4>⚠️ Skador vid leverans</h4>
          {summary.damages.map((d, i) => (
            <p key={i}>
              <strong>Skada {i + 1}:</strong> {d.damageType} - {d.placement}
              {d.position && `, ${d.position}`}
              {d.comment && <span> ({d.comment})</span>}
              <span className="damage-photo-count"> [{d.photoCount} foto(n)]</span>
            </p>
          ))}
        </div>
      )}
      <div className="summary-section">
        <h4>Klar för uthyrning</h4>
        <p>{summary.klarForUthyrning}</p>
      </div>
      <div className="modal-actions">
        <button onClick={onCancel} className="btn secondary">Avbryt</button>
        <button onClick={onConfirm} className="btn success">Bekräfta</button>
      </div>
    </div>
  </>
);

type DamageModalProps = {
  damage: DamageEntry;
  onClose: () => void;
  onUpdateField: (field: keyof DamageEntry, value: any) => void;
  onUpdatePosition: (positionId: string, field: 'carPart' | 'position', value: string) => void;
  onAddPosition: () => void;
  onRemovePosition: (positionId: string) => void;
  onPhotoChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemovePhoto: (index: number) => void;
};

const DamageModal: React.FC<DamageModalProps> = ({ 
  damage, 
  onClose, 
  onUpdateField, 
  onUpdatePosition, 
  onAddPosition, 
  onRemovePosition, 
  onPhotoChange, 
  onRemovePhoto 
}) => {
  const availablePlaceringar = damage.damageType 
    ? Object.keys(DAMAGE_OPTIONS[damage.damageType as keyof typeof DAMAGE_OPTIONS] || {}).sort((a, b) => a.localeCompare(b, 'sv')) 
    : [];
  
  return (
    <>
      <div className="modal-overlay" onClick={onClose} />
      <div className="modal-content damage-modal">
        <h3>Dokumentera skada</h3>
        
        <div className="field">
          <label>Typ av skada *</label>
          <select 
            value={damage.damageType} 
            onChange={e => onUpdateField('damageType', e.target.value)}
          >
            <option value="">Välj skadetyp</option>
            {DAMAGE_TYPES.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>
        
        {damage.positions.map((pos, index) => {
          const rawPositioner = (damage.damageType && pos.carPart && DAMAGE_OPTIONS[damage.damageType as keyof typeof DAMAGE_OPTIONS]?.[pos.carPart as keyof (typeof DAMAGE_OPTIONS)[keyof typeof DAMAGE_OPTIONS]] || []);
          const availablePositioner = rawPositioner.length > 0 ? [...rawPositioner].sort((a, b) => a.localeCompare(b, 'sv')) : [];
          const showPositionDropdown = availablePositioner.length > 0;
          
          return (
            <div key={pos.id} className="damage-position-row">
              <div className={showPositionDropdown ? "grid-2-col" : ""}>
                <div className="field">
                  <label>{index === 0 ? 'Placering *' : ''}</label>
                  <select 
                    value={pos.carPart} 
                    onChange={e => onUpdatePosition(pos.id, 'carPart', e.target.value)}
                    disabled={!damage.damageType}
                  >
                    <option value="">Välj placering...</option>
                    {availablePlaceringar.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                {showPositionDropdown && (
                  <div className="field">
                    <label>{index === 0 ? 'Position *' : ''}</label>
                    <select 
                      value={pos.position} 
                      onChange={e => onUpdatePosition(pos.id, 'position', e.target.value)}
                    >
                      <option value="">Välj position...</option>
                      {availablePositioner.map(posOpt => (
                        <option key={posOpt} value={posOpt}>{posOpt}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              {damage.positions.length > 1 && (
                <button 
                  type="button" 
                  onClick={() => onRemovePosition(pos.id)} 
                  className="remove-position-btn"
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
        
        <button 
          type="button" 
          onClick={onAddPosition} 
          className="add-position-btn"
        >
          + Lägg till position
        </button>
        
        <div className="field">
          <label>Kommentar (frivilligt)</label>
          <textarea 
            value={damage.comment} 
            onChange={e => onUpdateField('comment', e.target.value)}
            placeholder="Beskriv skadan..."
            rows={2}
          />
        </div>
        
        <div className="field">
          <label>Foton * (minst ett foto krävs)</label>
          <label className={`photo-upload-label ${damage.photos.length > 0 ? 'active' : 'mandatory'}`}>
            <span>📷 {damage.photos.length > 0 ? 'Lägg till fler foton' : 'Ta foto av skadan'}</span>
            <input 
              type="file" 
              accept="image/*" 
              capture="environment"
              multiple
              onChange={onPhotoChange}
              style={{ display: 'none' }}
            />
          </label>
        </div>
        
        {damage.photos.length > 0 && (
          <div className="damage-photo-previews">
            {damage.photos.map((photo, index) => (
              <div key={index} className="damage-photo-item">
                <img src={photo.preview} alt={`Skadefoto ${index + 1}`} />
                <button 
                  type="button" 
                  onClick={() => onRemovePhoto(index)} 
                  className="remove-photo-btn"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        
        <div className="modal-actions">
          <button onClick={onClose} className="btn primary">Klar</button>
        </div>
      </div>
    </>
  );
};

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
    .background-img { display: none !important; }
    body::before {
      content: '';
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background-image: url('${backgroundUrl}');
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
      opacity: 0.45;
      filter: brightness(0.65);
      z-index: -1;
      pointer-events: none;
    }
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; background-color: white; color: var(--color-text); margin:0; padding:0; }
    .nybil-form { max-width:700px; margin:0 auto; padding:1rem; box-sizing:border-box; }
    .main-header { text-align:center; margin-bottom:1.5rem; }
    .main-logo { max-width:188px; height:auto; margin:0 auto 1rem auto; display:block; }
    .user-info { font-weight:500; color:var(--color-text-secondary); margin:0; }
    .page-title { font-size:1.25rem; font-weight:700; color:var(--color-text); text-transform:uppercase; letter-spacing:.05em; margin:0 0 .5rem 0; }
    .card { background-color:rgba(255,255,255,0.92); padding:1.5rem; border-radius:12px; margin-bottom:1.5rem; box-shadow:var(--shadow-md); border:2px solid transparent; transition:border-color .3s; }
    .card[data-error="true"] { border:2px solid var(--color-danger); }
    .field[data-error="true"] input, .field[data-error="true"] select, .field[data-error="true"] textarea { border:2px solid var(--color-danger)!important; }
    input[data-error="true"] { border:2px solid var(--color-danger)!important; }
    .section-header { padding-bottom:.75rem; border-bottom:1px solid var(--color-border); margin-bottom:1.5rem; }
    .section-header h2 { font-size:1.25rem; font-weight:700; color:var(--color-text); text-transform:uppercase; letter-spacing:.05em; margin:0; }
    .sub-section-header { margin-top:2rem; margin-bottom:1rem; }
    .sub-section-header h3 { font-size:1rem; font-weight:600; color:var(--color-text); margin:0; }
    .field { margin-bottom:1rem; }
    .field label { display:block; margin-bottom:.5rem; font-weight:500; font-size:.875rem; }
    .follow-up-field { margin-left:1.5rem; }
    .field input, .field select, .field textarea { width:100%; padding:.75rem; border:1px solid var(--color-border); border-radius:6px; font-size:1rem; background-color:white; box-sizing:border-box; }
    .field input:focus, .field select:focus, .field textarea:focus { outline:2px solid var(--color-border-focus); border-color:transparent; }
    .field select[disabled] { background-color:var(--color-disabled-light); cursor:not-allowed; }
    .reg-input { text-align:center; font-weight:600; letter-spacing:2px; text-transform:uppercase; }
    .grid-2-col { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:1rem; }
    .grid-3-col { display:grid; grid-template-columns:repeat(3,1fr); gap:1rem; }
    .grid-4-col { display:grid; grid-template-columns:repeat(4,1fr); gap:1rem; }
    .grid-5-col { display:grid; grid-template-columns:repeat(5,1fr); gap:1rem; }
    .form-actions { margin-top:2rem; padding-top:1.5rem; border-top:1px solid var(--color-border); display:flex; gap:1rem; justify-content:flex-end; padding-bottom:1.5rem; }
    .copyright-footer { position:fixed; bottom:0; left:0; right:0; text-align:center; padding:1rem 0; background-color:rgba(255, 255, 255, 0.95); border-top:1px solid var(--color-border); color:var(--color-text-secondary); font-size:.875rem; z-index:100; box-shadow:0 -2px 8px rgba(0, 0, 0, 0.05); }
    .nybil-form { padding-bottom:4rem; }
    .btn { padding:.75rem 1.5rem; border:none; border-radius:8px; font-weight:600; cursor:pointer; transition:all .2s; }
    .btn.primary { background-color:var(--color-primary); color:white; }
    .btn.secondary { background-color:var(--color-border); color:var(--color-text); }
    .btn.success { background-color:var(--color-success); color:white; }
    .btn.disabled { background-color:var(--color-disabled-light); color:var(--color-disabled); cursor:not-allowed; }
    .btn:not(:disabled):hover { filter:brightness(1.1); }
    .choice-btn { display:flex; align-items:center; justify-content:center; width:100%; min-width:0; padding:.85rem 1rem; border-radius:8px; border:2px solid var(--color-border); background-color:white; color:var(--color-text); font-weight:600; font-size:1rem; cursor:pointer; transition:all .2s; box-sizing:border-box; }
    .choice-btn:hover { filter:brightness(1.05); }
    .choice-btn.active.default { border-color:var(--color-success); background-color:var(--color-success-light); color:var(--color-success); }
    .choice-btn.disabled-choice { border-color:var(--color-border); background-color:var(--color-bg); color:var(--color-disabled); cursor:default; }
    .choice-btn.full-width-choice { width:100%; }
    .media-section { display:grid; grid-template-columns:1fr 1fr; gap:1rem; margin-top:1rem; }
    .media-label { display:block; text-align:center; padding:1.5rem 1rem; border:2px dashed; border-radius:8px; cursor:pointer; transition:all .2s; font-weight:600; }
    .media-label:hover { filter:brightness(.95); }
    .media-label.active { border-style:solid; border-color:var(--color-success); background-color:var(--color-success-light); color:var(--color-success); }
    .media-label.mandatory { border-color:var(--color-danger); background-color:var(--color-danger-light); color:var(--color-danger); }
    .media-label.optional { border-color:var(--color-warning); background-color:var(--color-warning-light); color:#92400e; }
    .media-previews { display:flex; flex-wrap:wrap; gap:.5rem; margin-top:1rem; }
    .media-btn { position:relative; width:70px; height:70px; border-radius:8px; overflow:hidden; background-color:var(--color-border); }
    .media-btn img { width:100%; height:100%; object-fit:cover; }
    .remove-media-btn { position:absolute; top:2px; right:2px; width:22px; height:22px; border-radius:50%; background-color:var(--color-danger); color:white; border:2px solid white; cursor:pointer; font-size:1rem; font-weight:bold; line-height:1; padding:0; }
    .remove-media-btn:hover { background-color:#b91c1c; }
    .modal-overlay { position:fixed; top:0; left:0; right:0; bottom:0; background-color:rgba(0,0,0,0.5); z-index:100; }
    .modal-content { position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); background-color:rgba(255,255,255,0.98); padding:2rem; border-radius:12px; z-index:101; box-shadow:var(--shadow-md); width:90%; max-width:600px; max-height:90vh; overflow-y:auto; -webkit-overflow-scrolling:touch; }
    .success-modal { text-align:center; }
    .success-icon { font-size:3rem; color:var(--color-success); margin-bottom:1rem; }
    .warning-modal h3 { margin-top:0; color:var(--color-warning); }
    .warning-modal p { margin-bottom:1.5rem; }
    .confirmation-modal h3 { margin-top:0; color:var(--color-primary); border-bottom:1px solid var(--color-border); padding-bottom:0.75rem; }
    .confirmation-modal .summary-section { margin-bottom:1rem; padding:0.75rem; background-color:var(--color-bg); border-radius:6px; }
    .confirmation-modal .summary-section h4 { margin:0 0 0.5rem 0; font-size:0.9rem; color:var(--color-text-secondary); text-transform:uppercase; letter-spacing:0.05em; }
    .confirmation-modal .summary-section p { margin:0.25rem 0; font-size:0.9rem; }
    .confirmation-modal .summary-section strong { color:var(--color-text); }
    .modal-actions { display:flex; gap:1rem; justify-content:flex-end; margin-top:1.5rem; padding-top:1rem; border-top:1px solid var(--color-border); }
    .section-note { font-size:0.85rem; color:var(--color-text-secondary); font-style:italic; margin:-0.5rem 0 1rem 0; }
    .spinner-overlay { display:flex; flex-direction:column; align-items:center; justify-content:center; color:white; font-size:1.2rem; font-weight:600; }
    .spinner { border:5px solid #f3f3f3; border-top:5px solid var(--color-primary); border-radius:50%; width:50px; height:50px; animation:spin 1s linear infinite; margin-bottom:1rem; }
    @keyframes spin { 0% { transform:rotate(0deg); } 100% { transform:rotate(360deg); } }
    /* Photo upload styles */
    .photo-grid { display:grid; grid-template-columns:1fr 1fr; gap:1rem; margin-bottom:1rem; }
    .photo-item { }
    .photo-upload-label { display:flex; align-items:center; justify-content:center; min-height:120px; border:2px dashed; border-radius:8px; cursor:pointer; transition:all .2s; font-weight:600; text-align:center; padding:1rem; }
    .photo-upload-label:hover { filter:brightness(.95); }
    .photo-upload-label.mandatory { border-color:var(--color-danger); background-color:var(--color-danger-light); color:var(--color-danger); }
    .photo-upload-label.optional { border-color:var(--color-warning); background-color:var(--color-warning-light); color:#92400e; }
    .photo-upload-label.active { border-style:solid; border-color:var(--color-success); background-color:var(--color-success-light); color:var(--color-success); }
    .photo-preview-container { position:relative; }
    .photo-preview { width:100%; height:150px; object-fit:cover; border-radius:8px; border:2px solid var(--color-success); }
    .retake-btn { position:absolute; bottom:8px; right:8px; padding:0.5rem 1rem; background-color:rgba(0,0,0,0.7); color:white; border:none; border-radius:6px; cursor:pointer; font-weight:600; font-size:0.875rem; }
    .retake-btn:hover { background-color:rgba(0,0,0,0.85); }
    .additional-photos-preview { display:flex; flex-wrap:wrap; gap:0.75rem; margin-top:1rem; }
    .additional-photo-item { position:relative; width:80px; height:80px; border-radius:8px; overflow:hidden; }
    .additional-photo-item img { width:100%; height:100%; object-fit:cover; }
    .remove-photo-btn { position:absolute; top:4px; right:4px; width:24px; height:24px; border-radius:50%; background-color:var(--color-danger); color:white; border:2px solid white; cursor:pointer; font-size:1.1rem; font-weight:bold; line-height:1; padding:0; display:flex; align-items:center; justify-content:center; }
    .remove-photo-btn:hover { background-color:#b91c1c; }
    /* Damage documentation styles */
    .damage-list { margin:1rem 0; }
    .damage-item-card { display:flex; justify-content:space-between; align-items:center; padding:0.75rem; background-color:var(--color-bg); border-radius:8px; margin-bottom:0.5rem; border:1px solid var(--color-border); }
    .damage-info { display:flex; flex-direction:column; gap:0.25rem; flex:1; }
    .damage-location { font-size:0.875rem; color:var(--color-text-secondary); }
    .damage-photos { font-size:0.75rem; color:var(--color-primary); }
    .damage-actions { display:flex; gap:0.5rem; flex-shrink:0; }
    .damage-edit-btn { padding:0.5rem 1rem; border-radius:6px; border:1px solid var(--color-border); background:white; cursor:pointer; font-size:0.875rem; }
    .damage-edit-btn:hover { background-color:var(--color-bg); }
    .damage-remove-btn { padding:0.5rem 1rem; border-radius:6px; border:1px solid var(--color-danger); background:var(--color-danger-light); color:var(--color-danger); cursor:pointer; font-size:0.875rem; }
    .damage-remove-btn:hover { background-color:var(--color-danger); color:white; }
    .add-damage-btn { width:100%; padding:1rem; border:2px dashed var(--color-primary); border-radius:8px; background-color:var(--color-primary-light); color:var(--color-primary); font-weight:600; cursor:pointer; margin-top:1rem; }
    .add-damage-btn:hover { background-color:#dbeafe; }
    .warning-text { color:var(--color-warning); font-size:0.875rem; margin-top:0.5rem; font-style:italic; }
    /* Damage modal styles */
    .damage-modal { max-height:90vh; overflow-y:auto; }
    .damage-modal h3 { text-align:center; margin-bottom:1.5rem; }
    .damage-position-row { position:relative; padding-right:2.5rem; margin-bottom:0.5rem; }
    .damage-position-row .remove-position-btn { position:absolute; top:50%; right:0; transform:translateY(-50%); width:28px; height:28px; border-radius:50%; background-color:var(--color-danger-light); color:var(--color-danger); border:none; cursor:pointer; font-size:1.25rem; line-height:1; }
    .damage-position-row .remove-position-btn:hover { background-color:var(--color-danger); color:white; }
    .add-position-btn { width:100%; margin:0.5rem 0 1rem 0; font-size:0.875rem; padding:0.5rem; border:1px solid var(--color-border); border-radius:6px; background:var(--color-bg); cursor:pointer; }
    .add-position-btn:hover { background-color:#e5e7eb; }
    .damage-photo-previews { display:flex; flex-wrap:wrap; gap:0.75rem; margin-top:0.5rem; }
    .damage-photo-item { position:relative; width:80px; height:80px; border-radius:8px; overflow:hidden; }
    .damage-photo-item img { width:100%; height:100%; object-fit:cover; }
    .damage-photo-count { font-size:0.75rem; color:var(--color-text-secondary); }
    .summary-section-warning { background-color:var(--color-danger-light); padding:1rem; border-radius:8px; border:1px solid var(--color-danger); }
    .summary-section-warning h4 { color:var(--color-danger); margin:0 0 0.5rem 0; }
    /* Charge warning banner */
    .charge-warning-banner { background-color: var(--color-danger); color: white; font-weight: 700; font-size: 1.25rem; padding: 1rem; border-radius: 8px; margin-bottom: 1.5rem; text-align: center; }
    /* Duplicate warning modal styles */
    .duplicate-warning-modal h3 { color:var(--color-warning); }
    .duplicate-warning-modal .duplicate-info { background-color:var(--color-bg); padding:0.75rem; border-radius:6px; margin:1rem 0; }
    .duplicate-warning-modal .duplicate-info p { margin:0.25rem 0; font-size:0.9rem; }
    @media (max-width:480px) { .grid-2-col { grid-template-columns:1fr; } .grid-3-col { grid-template-columns:1fr; } .grid-4-col { grid-template-columns:repeat(2,1fr); } .grid-5-col { grid-template-columns:repeat(2,1fr); } .photo-grid { grid-template-columns:1fr; } .damage-item-card { flex-direction:column; align-items:flex-start; gap:0.5rem; } .damage-actions { width:100%; } .damage-actions button { flex:1; } }
  `}</style>
);
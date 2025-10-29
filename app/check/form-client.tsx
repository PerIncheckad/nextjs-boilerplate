'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { getVehicleInfo, VehicleInfo, ConsolidatedDamage } from '@/lib/damages';
import { notifyCheckin } from '@/lib/notify';
import { DAMAGE_OPTIONS } from '@/data/damage-options';

// =================================================================
// 1. DATA, TYPES & HELPERS
// =================================================================

const MABI_LOGO_URL = "https://ufioaijcmaujlvmveyra.supabase.co/storage/v1/object/public/MABI%20Syd%20logga/MABI%20Syd%20logga.png";
// keep background image reference but don't change UI behavior
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

const DAMAGE_TYPES = Object.keys(DAMAGE_OPTIONS).sort((a, b) => a.localeCompare(b, 'sv'));

type MediaFile = {
  file: File; type: 'image' | 'video'; preview?: string; thumbnail?: string;
};

type Uploads = {
  photo_urls: string[];
  video_urls: string[];
  folder: string;
};

type DamagePosition = {
  id: string;
  carPart: string;
  position: string;
};

type ExistingDamage = {
  db_id: number;
  id: string;
  fullText: string; 
  originalDamageDate: string | null; // YYYY-MM-DD
  isInventoried: boolean;
  status: 'not_selected' | 'documented' | 'resolved';
  userType?: string; 
  userPositions: DamagePosition[];
  userDescription?: string;
  resolvedComment?: string;
  undocumentable?: boolean;
  undocumentedComment?: string;
  media: MediaFile[];
  uploads: Uploads;
};

type NewDamage = {
  id: string; type: string; text: string; 
  positions: DamagePosition[];
  media: MediaFile[];
  uploads: Uploads;
};

type ConfirmDialogState = {
    isOpen: boolean;
    title?: string;
    text: string;
    confirmButtonVariant?: 'success' | 'danger' | 'primary';
    onConfirm: (comment?: string) => void;
    theme?: 'default' | 'warning';
    requiresComment?: boolean;
}

const hasPhoto = (files?: MediaFile[]) => Array.isArray(files) && files.some(f => f?.type === 'image');
const hasVideo = (files?: MediaFile[]) => Array.isArray(files) && files.some(f => f?.type === 'video');
const hasAnyMedia = (files?: MediaFile[]) => hasPhoto(files) || hasVideo(files);


function slugify(str: string): string {
    if (!str) return '';
    // preserve main behavior but ensure ascii output
    const replacements: Record<string, string> = {
        'å': 'a', 'ä': 'a', 'ö': 'o',
        'Å': 'A', 'Ä': 'A', 'Ö': 'O',
        ' ': '-'
    };
    
    let result = str.toString();
    // Replace Swedish characters and spaces
    for (const [char, replacement] of Object.entries(replacements)) {
        result = result.split(char).join(replacement);
    }
    
    return result.toLowerCase()
        .replace(/&/g, '-and-')
        .replace(/[^\w\-]+/g, '')
        .replace(/\-\-+/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/_+$/g, '');
}

const formatDate = (date: Date, format: 'YYYYMMDD' | 'YYYY-MM-DD' | 'HH.MM' | 'HH-MM') => {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');

    if (format === 'YYYYMMDD') return `${year}${month}${day}`;
    if (format === 'YYYY-MM-DD') return `${year}-${month}-${day}`;
    if (format === 'HH.MM') return `${hours}.${minutes}`;
    if (format === 'HH-MM') return `${hours}-${minutes}`;
    return '';
};


const createCommentFile = (content: string): File => {
    return new File([content], "kommentar.txt", { type: "text/plain" });
};

// Improved uploadOne: handles already existing resources, returns publicUrl or throws when unavailable
async function uploadOne(file: File, path: string): Promise<string> {
  const BUCKET = 'damage-photos';
  try {
    // try upload with upsert: false to detect already-existing files
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
    if (error && !/already exists/i.test(error.message || '')) {
      console.error('Storage upload error for', path, error);
      // continue to attempt to return public url even on upload error
    }
  } catch (e) {
    console.error('Unexpected upload error', e);
  }

  // Always try to fetch public url
  const { data, error: urlError } = supabase.storage.from(BUCKET).getPublicUrl(path);
  if (urlError) {
    console.error('Failed to get public url for', path, urlError);
    throw urlError;
  }
  if (!data?.publicUrl) {
    console.warn('Public url missing for', path);
    throw new Error('Public url missing');
  }
  return data.publicUrl;
}

const getFileType = (file: File) => file.type.startsWith('video') ? 'video' : 'image';

const createVideoThumbnail = (file: File): Promise<string> => new Promise(resolve => {
  const video = document.createElement('video');
  video.src = URL.createObjectURL(file);
  video.onloadeddata = () => { video.currentTime = 1; };
  video.onseeked = () => {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
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

const getFirstNameFromEmail = (email: string): string => {
    if (!email) return 'Okänd';
    const namePart = email.split('@')[0];
    const firstName = namePart.split('.')[0];
    return firstName.charAt(0).toUpperCase() + firstName.slice(1);
};
// =================================================================
// 2. MAIN COMPONENT
// =================================================================

export default function CheckInForm() {
  // State
  const [firstName, setFirstName] = useState('');
  const [regInput, setRegInput] = useState('');
  const [allRegistrations, setAllRegistrations] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [isFinalSaving, setIsFinalSaving] = useState(false);
  const [showFieldErrors, setShowFieldErrors] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>({ isOpen: false, text: '', onConfirm: () => {} });
  const [vehicleData, setVehicleData] = useState<VehicleInfo | null>(null);
  const [ort, setOrt] = useState('');
  const [station, setStation] = useState('');
  const [matarstallning, setMatarstallning] = useState('');
  const [drivmedelstyp, setDrivmedelstyp] = useState<'bensin_diesel' | 'elbil' | null>(null);
  const [tankniva, setTankniva] = useState<'återlämnades_fulltankad' | 'tankad_nu' | 'ej_upptankad' | null>(null);
  const [liters, setLiters] = useState('');
  const [bransletyp, setBransletyp] = useState<'Bensin' | 'Diesel' | null>(null);
  const [literpris, setLiterpris] = useState('');
  const [laddniva, setLaddniva] = useState('');
  const [antalLaddkablar, setAntalLaddkablar] = useState<0 | 1 | 2 | null>(null);
  const [hjultyp, setHjultyp] = useState<'Sommardäck' | 'Vinterdäck' | null>(null);
  
  // Rekond & Sanering State
  const [behoverRekond, setBehoverRekond] = useState(false);
  const [rekondUtvandig, setRekondUtvandig] = useState(false);
  const [rekondInvandig, setRekondInvandig] = useState(false);
  const [rekondText, setRekondText] = useState('');
  const [rekondMedia, setRekondMedia] = useState<MediaFile[]>([]);
  const [rekondFolder, setRekondFolder] = useState('');
  const [husdjurSanerad, setHusdjurSanerad] = useState(false);
  const [husdjurText, setHusdjurText] = useState('');
  const [husdjurMedia, setHusdjurMedia] = useState<MediaFile[]>([]);
  const [husdjurFolder, setHusdjurFolder] = useState('');
  const [rokningSanerad, setRokningSanerad] = useState(false);
  const [rokningText, setRokningText] = useState('');
  const [rokningMedia, setRokningMedia] = useState<MediaFile[]>([]);
  const [rokningFolder, setRokningFolder] = useState('');

  // Varningslampa State
  const [varningslampaLyser, setVarningslampaLyser] = useState(false);
  const [varningslampaBeskrivning, setVarningslampaBeskrivning] = useState('');
  
  // Går inte att hyra ut state (replaces uthyrningsstatus under varningslampa)
  const [garInteAttHyraUt, setGarInteAttHyraUt] = useState(false);
  const [garInteAttHyraUtKommentar, setGarInteAttHyraUtKommentar] = useState('');
  
  // Insynsskydd state
  const [insynsskyddSaknas, setInsynsskyddSaknas] = useState(false);
  
  // Unknown reg.nr state
  const [unknownRegNrConfirmed, setUnknownRegNrConfirmed] = useState(false);

  // Skador State
  const [existingDamages, setExistingDamages] = useState<ExistingDamage[]>([]);
  const [skadekontroll, setSkadekontroll] = useState<'inga_nya_skador' | 'nya_skador' | null>(null);
  const [newDamages, setNewDamages] = useState<NewDamage[]>([]);

  // Checklista State
  const [dekalDjurRokningOK, setDekalDjurRokningOK] = useState(false);
  const [isskrapaOK, setIsskrapaOK] = useState(false);
  const [pskivaOK, setPskivaOK] = useState(false);
  const [skyltRegplatOK, setSkyltRegplatOK] = useState(false);
  const [dekalGpsOK, setDekalGpsOK] = useState(false);
  const [washed, setWashed] = useState(false);
  const [spolarvatskaOK, setSpolarvatskaOK] = useState(false);
  const [adblueOK, setAdblueOK] = useState(false);
  const [vindrutaAvtorkadOK, setVindrutaAvtorkadOK] = useState(false);
  
  // Övrigt State
  const [preliminarAvslutNotering, setPreliminarAvslutNotering] = useState('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [initialUrlLoadHandled, setInitialUrlLoadHandled] = useState(false);
  const [bilenStarNuOrt, setBilenStarNuOrt] = useState('');
  const [bilenStarNuStation, setBilenStarNuStation] = useState('');
  const [bilenStarNuKommentar, setBilenStarNuKommentar] = useState('');


  // Derived State & Memos
  const normalizedReg = useMemo(() => regInput.toUpperCase().replace(/\s/g, ''), [regInput]);
  const availableStations = useMemo(() => STATIONER[ort] || [], [ort]);
  const availableStationsBilenStarNu = useMemo(() => STATIONER[bilenStarNuOrt] || [], [bilenStarNuOrt]);
  
  const otherChecklistItemsOK = useMemo(() => {
     const common = dekalDjurRokningOK && isskrapaOK && pskivaOK && skyltRegplatOK && dekalGpsOK && spolarvatskaOK && vindrutaAvtorkadOK;
     return drivmedelstyp === 'bensin_diesel' ? common && adblueOK : common;
  }, [dekalDjurRokningOK, isskrapaOK, pskivaOK, skyltRegplatOK, dekalGpsOK, spolarvatskaOK, vindrutaAvtorkadOK, adblueOK, drivmedelstyp]);

  const isChecklistComplete = useMemo(() => {
    return washed && otherChecklistItemsOK;
  }, [washed, otherChecklistItemsOK]);

  const unhandledLegacyDamages = useMemo(() => {
    return existingDamages.some(d => !d.isInventoried && d.status === 'not_selected');
  }, [existingDamages]);

  const formIsValidState = useMemo(() => {
    if (!regInput || !ort || !station || !matarstallning || !hjultyp || !drivmedelstyp || skadekontroll === null || !bilenStarNuOrt || !bilenStarNuStation) return false;
    if (drivmedelstyp === 'bensin_diesel' && (!tankniva || (tankniva === 'tankad_nu' && (!liters || !bransletyp || !literpris)))) return false;
    if (drivmedelstyp === 'elbil' && (!laddniva || antalLaddkablar === null)) return false;
    
    if (skadekontroll === 'nya_skador') {
        if (newDamages.length === 0) return false;
        for (const d of newDamages) {
            const positionsInvalid = d.positions.some(p => !p.carPart || ((DAMAGE_OPTIONS[d.type as keyof typeof DAMAGE_OPTIONS]?.[p.carPart as keyof typeof DAMAGE_OPTIONS[keyof typeof DAMAGE_OPTIONS]]?.length || 0) > 0 && !p.position));
            if (!d.type || !hasAnyMedia(d.media) || positionsInvalid) return false;
        }
    }
    
    if (existingDamages.filter(d => d.status === 'documented').some(d => {
      if (d.undocumentable) {
        // If undocumentable, must have comment
        return !d.undocumentedComment?.trim();
      }
      // Otherwise, must have type, media, and positions
      return !d.userType || !hasAnyMedia(d.media) || d.userPositions.some(p => !p.carPart || (DAMAGE_OPTIONS[d.userType as keyof typeof DAMAGE_OPTIONS]?.[p.carPart as keyof typeof DAMAGE_OPTIONS[keyof typeof DAMAGE_OPTIONS]]?.length > 0 && !p.position));
    })) return false;

    if (varningslampaLyser && !varningslampaBeskrivning.trim()) return false;
    if (garInteAttHyraUt && !garInteAttHyraUtKommentar.trim()) return false;
    if (behoverRekond && (!rekondUtvandig && !rekondInvandig || !hasPhoto(rekondMedia))) return false;
    
    if (unhandledLegacyDamages) return false;

    return isChecklistComplete;
  }, [
    regInput, ort, station, matarstallning, hjultyp, drivmedelstyp, tankniva, liters, bransletyp, literpris, laddniva, antalLaddkablar,
    skadekontroll, newDamages, existingDamages, isChecklistComplete, varningslampaLyser, varningslampaBeskrivning, garInteAttHyraUt, garInteAttHyraUtKommentar,
    behoverRekond, rekondUtvandig, rekondInvandig, rekondMedia, bilenStarNuOrt, bilenStarNuStation, unhandledLegacyDamages
  ]);

  const finalPayloadForUI = useMemo(() => ({
      regnr: normalizedReg,
      incheckare: firstName,
      timestamp: new Date().toISOString(),
      carModel: vehicleData?.model, 
      matarstallning, 
      hjultyp, 
      rekond: {
        behoverRekond,
        utvandig: rekondUtvandig,
        invandig: rekondInvandig,
        text: rekondText,
        folder: rekondFolder,
        hasMedia: hasAnyMedia(rekondMedia)
      },
      husdjur: {
        sanerad: husdjurSanerad,
        text: husdjurText,
        folder: husdjurFolder,
        hasMedia: hasAnyMedia(husdjurMedia)
      },
      rokning: {
        sanerad: rokningSanerad,
        text: rokningText,
        folder: rokningFolder,
        hasMedia: hasAnyMedia(rokningMedia)
      },
      varningslampa: {
        lyser: varningslampaLyser,
        beskrivning: varningslampaBeskrivning
      },
      uthyrningsstatus: {
        garInteAttHyraUt: garInteAttHyraUt,
        beskrivning: garInteAttHyraUtKommentar
      },
      insynsskydd: {
        saknas: insynsskyddSaknas
      },
      drivmedel: drivmedelstyp, 
      tankning: { tankniva, liters, bransletyp, literpris },
      laddning: { laddniva, antal_laddkablar: antalLaddkablar },
      ort,
      station,
      bilen_star_nu: { ort: bilenStarNuOrt, station: bilenStarNuStation, kommentar: bilenStarNuKommentar },
      nya_skador: newDamages,
      dokumenterade_skador: existingDamages.filter(d => d.status === 'documented'),
      åtgärdade_skador: existingDamages.filter(d => d.status === 'resolved'),
      washed: washed,
      otherChecklistItemsOK: otherChecklistItemsOK,
      notering: preliminarAvslutNotering,
      status: vehicleData?.status,
      unknownRegNr: unknownRegNrConfirmed
  }), [
    normalizedReg, firstName, vehicleData, matarstallning, hjultyp, 
    behoverRekond, rekondUtvandig, rekondInvandig, rekondText, rekondMedia, rekondFolder,
    husdjurSanerad, husdjurText, husdjurMedia, husdjurFolder,
    rokningSanerad, rokningText, rokningMedia, rokningFolder,
    varningslampaLyser, varningslampaBeskrivning, garInteAttHyraUt, garInteAttHyraUtKommentar, insynsskyddSaknas,
    drivmedelstyp, tankniva, liters, bransletyp, literpris, laddniva, antalLaddkablar,
    ort, station, bilenStarNuOrt, bilenStarNuStation, bilenStarNuKommentar, 
    newDamages, existingDamages, washed, otherChecklistItemsOK, preliminarAvslutNotering, unknownRegNrConfirmed
  ]);

  const fetchVehicleData = useCallback(async (reg: string) => {
    setLoading(true);
    setNotFound(false);
    setVehicleData(null);
    setExistingDamages([]);
    try {
      const normalized = reg.toUpperCase().replace(/\s/g, '');
      const info = await getVehicleInfo(normalized);
  
      if (info.status === 'NO_MATCH') {
        setConfirmDialog({
          isOpen: true,
          title: '⚠️ Reg.nr saknas i listan',
          text: 'Vill du fortsätta och skapa en ny post?',
          confirmButtonVariant: 'danger',
          theme: 'warning',
          onConfirm: () => {
            setUnknownRegNrConfirmed(true);
            setVehicleData(info);
          }
        });
        setLoading(false);
        return;
      }
      
      setVehicleData(info);
      
      if (info.existing_damages.length > 0) {
          setExistingDamages(info.existing_damages.map((d: ConsolidatedDamage) => ({ 
              db_id: d.id,
              id: Math.random().toString(36).substring(2, 15),
              fullText: d.text,
              originalDamageDate: d.damage_date,
              isInventoried: d.is_inventoried,
              status: 'not_selected',
              userPositions: [],
              media: [],
              uploads: { photo_urls: [], video_urls: [], folder: '' }
          })));
      }
  
      if (info.status === 'PARTIAL_MATCH_DAMAGE_ONLY' || info.status === 'NO_MATCH') {
          setNotFound(true);
      }
  
    } catch (error: any) {
      console.error("Fetch vehicle data error:", error);
      setNotFound(true);
      setVehicleData(null);
      setExistingDamages([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Effects
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setFirstName(getFirstNameFromEmail(user?.email || ''));
    };
    getUser();
  }, []);

  useEffect(() => {
    async function fetchAllRegistrations() {
      const { data, error } = await supabase.rpc('get_all_allowed_plates');
      if (error) console.error("Could not fetch registrations via RPC:", error);
      else if (data) setAllRegistrations(data.map((item: any) => item.regnr));
    }
    fetchAllRegistrations();
  }, []);

  useEffect(() => {
    if (regInput.length >= 2 && allRegistrations.length > 0) {
      const filteredSuggestions = allRegistrations
        .filter(r => r && r.toUpperCase().includes(regInput.toUpperCase()))
        .slice(0, 5);
      setSuggestions(filteredSuggestions);
    } else {
      setSuggestions([]);
    }
  }, [regInput, allRegistrations]);

  useEffect(() => {
    if (!initialUrlLoadHandled) {
      const params = new URLSearchParams(window.location.search);
      const regFromUrl = params.get('reg');
      if (regFromUrl) {
        const normalized = regFromUrl.toUpperCase().replace(/\s/g, '');
        setRegInput(normalized); 
        fetchVehicleData(normalized);
        setInitialUrlLoadHandled(true);
        return; 
      }
      setInitialUrlLoadHandled(true);
    }

    const normalizedReg = regInput.toUpperCase().replace(/\s/g, '');
    if (normalizedReg.length < 6) {
      setVehicleData(null);
      setExistingDamages([]);
      setNotFound(false);
      return;
    }

    const timer = setTimeout(() => {
      fetchVehicleData(normalizedReg);
    }, 300);

    return () => clearTimeout(timer);
  }, [regInput, fetchVehicleData, initialUrlLoadHandled]);


  // Handlers
  const handleShowErrors = () => {
    setShowFieldErrors(true);
    // Use double requestAnimationFrame to ensure DOM queries happen after React re-render and browser paint
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
    setRegInput(''); setVehicleData(null); setExistingDamages([]); setOrt('');
    setStation(''); setMatarstallning(''); setDrivmedelstyp(null); setTankniva(null);
    setLiters(''); setBransletyp(null); setLiterpris(''); setLaddniva(''); setAntalLaddkablar(null);
    setHjultyp(null); 
    setBehoverRekond(false); setRekondUtvandig(false); setRekondInvandig(false); setRekondText(''); setRekondMedia([]); setRekondFolder('');
    setHusdjurSanerad(false); setHusdjurText(''); setHusdjurMedia([]); setHusdjurFolder('');
    setRokningSanerad(false); setRokningText(''); setRokningMedia([]); setRokningFolder('');
    setVarningslampaLyser(false); setVarningslampaBeskrivning('');
    setGarInteAttHyraUt(false); setGarInteAttHyraUtKommentar('');
    setInsynsskyddSaknas(false);
    setDekalDjurRokningOK(false); setIsskrapaOK(false); setPskivaOK(false);
    setSkyltRegplatOK(false); setDekalGpsOK(false); setWashed(false);
    setSpolarvatskaOK(false); setAdblueOK(false); setVindrutaAvtorkadOK(false);
    setSkadekontroll(null);
    setNewDamages([]); setPreliminarAvslutNotering(''); setShowFieldErrors(false);
    setBilenStarNuOrt(''); setBilenStarNuStation(''); setBilenStarNuKommentar('');
    setUnknownRegNrConfirmed(false);
    window.history.pushState({}, '', window.location.pathname); 
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancel = () => {
    setConfirmDialog({
        isOpen: true,
        title: 'Avbryt incheckning',
        text: 'Är du säker? Alla ifyllda data kommer att raderas.',
        confirmButtonVariant: 'danger',
        onConfirm: resetForm
    });
  };

  const confirmAndSubmit = async () => {
    setShowConfirmModal(false);
    setIsFinalSaving(true);
    try {
        const now = new Date();
        const incheckare = firstName || 'Okand';
        const incheckningsdatum = formatDate(now, 'YYYYMMDD');
        const reg = normalizedReg;

        // --- Handle Inventoried Legacy Damages ---
        const legacyDamagesForUpload = finalPayloadForUI.dokumenterade_skador;
        for (const damage of legacyDamagesForUpload) {
            const skadedatum = (damage.originalDamageDate || 'unknown_date').replace(/-/g, '');
            const dateEventFolderName = `${reg}-${skadedatum}`;
            const eventFolderName = slugify(`${skadedatum} - ${damage.userType} - incheckad ${incheckningsdatum} - ${incheckare}`);
            const damagePath = `${reg}/${dateEventFolderName}/${eventFolderName}`;
            damage.uploads.folder = damagePath;

            let mediaIndex = 1;
            for (const media of damage.media) {
                const positionString = slugify(damage.userPositions.map(p => `${p.carPart}-${p.position}`).join('_'));
                const fileName = `${reg}-${skadedatum}-${slugify(damage.userType)}-${positionString}_${mediaIndex++}`;
                const ext = media.file.name.split('.').pop();
                const url = await uploadOne(media.file, `${damagePath}/${fileName}.${ext}`);
                if (media.type === 'image') damage.uploads.photo_urls.push(url);
                else damage.uploads.video_urls.push(url);
            }
            if (damage.userDescription) await uploadOne(createCommentFile(damage.userDescription), `${damagePath}/kommentar.txt`);
        }

        // --- Handle New Damages ---
        const newDamagesForUpload = finalPayloadForUI.nya_skador;
        for (const damage of newDamagesForUpload) {
            const dateEventFolderName = `${reg}-${incheckningsdatum}`;
            const positionString = slugify(damage.positions.map(p => `${p.carPart}-${p.position}`).join('_'));
            const eventFolderName = slugify(`${incheckningsdatum}-${damage.type}-${positionString}-${incheckare}`);
            const damagePath = `${reg}/${dateEventFolderName}/${eventFolderName}`;
            damage.uploads.folder = damagePath;

            let mediaIndex = 1;
            for (const media of damage.media) {
                const fileName = `${reg}-${incheckningsdatum}-${slugify(damage.type)}-${positionString}_${mediaIndex++}`;
                const ext = media.file.name.split('.').pop();
                const url = await uploadOne(media.file, `${damagePath}/${fileName}.${ext}`);
                if (media.type === 'image') damage.uploads.photo_urls.push(url);
                else damage.uploads.video_urls.push(url);
            }
            if (damage.text) await uploadOne(createCommentFile(damage.text), `${damagePath}/kommentar.txt`);
        }

        // Define temp folders for this submission
        let tempRekondFolder = '';
        let tempHusdjurFolder = '';
        let tempRokningFolder = '';

        const processSaneringEvent = async (
            isEnabled: boolean,
            type: 'REKOND' | 'HUSDJUR' | 'ROKNING',
            media: MediaFile[],
            text: string,
            setFolder: (folder: string) => void,
            rekondTypes?: { utvandig: boolean, invandig: boolean }
        ) => {
            if (!isEnabled || media.length === 0) return;
            const dateEventFolderName = `${reg}-${incheckningsdatum}`;
            let typeString = type;
            if (type === 'REKOND' && rekondTypes) {
                const types = [];
                if (rekondTypes.utvandig) types.push('UTVANDIG');
                if (rekondTypes.invandig) types.push('INVANDIG');
                if (types.length > 0) typeString = `REKOND-${types.join('-')}`;
            }

            const eventFolderName = slugify(`${typeString} - ${incheckare}`);
            const path = `${reg}/${dateEventFolderName}/${eventFolderName}`;
            setFolder(path);
            
            let mediaIndex = 1;
            for (const m of media) {
                const fileName = `${reg}-${incheckningsdatum}-kl-${formatDate(now, 'HH-MM')}_${slugify(type)}_${mediaIndex++}`;
                const ext = m.file.name.split('.').pop();
                await uploadOne(m.file, `${path}/${fileName}.${ext}`);
            }
            if (text) await uploadOne(createCommentFile(text), `${path}/kommentar.txt`);
        };
        
        await processSaneringEvent(behoverRekond, 'REKOND', rekondMedia, rekondText, (f) => tempRekondFolder = f, { utvandig: rekondUtvandig, invandig: rekondInvandig });
        await processSaneringEvent(husdjurSanerad, 'HUSDJUR', husdjurMedia, husdjurText, (f) => tempHusdjurFolder = f);
        await processSaneringEvent(rokningSanerad, 'ROKNING', rokningMedia, rokningText, (f) => tempRokningFolder = f);

        // --- Handle Resolved Damages ---
        const resolvedLegacyDamages = finalPayloadForUI.åtgärdade_skador;
        for (const damage of resolvedLegacyDamages) {
            const skadedatum = (damage.originalDamageDate || 'unknown_date').replace(/-/g, '');
            const dateEventFolderName = `${reg}-${skadedatum}`;
            const eventFolderName = slugify(`ÅTGÄRDAD - ${damage.fullText} - incheckad ${incheckningsdatum} - ${incheckare}`);
            const damagePath = `${reg}/${dateEventFolderName}/${eventFolderName}`;
            await uploadOne(createCommentFile(damage.resolvedComment!), `${damagePath}/kommentar.txt`);
        }
      
        const finalPayloadForNotification = {
            ...finalPayloadForUI,
            rekond: { ...finalPayloadForUI.rekond, folder: tempRekondFolder },
            husdjur: { ...finalPayloadForUI.husdjur, folder: tempHusdjurFolder },
            rokning: { ...finalPayloadForUI.rokning, folder: tempRokningFolder },
            dokumenterade_skador: legacyDamagesForUpload,
            nya_skador: newDamagesForUpload,
        };

        await notifyCheckin({ region: 'Syd', subjectBase: `${reg} - ${station}`, meta: finalPayloadForNotification });

        setShowSuccessModal(true);
        setTimeout(() => { setShowSuccessModal(false); resetForm(); }, 3000);
    } catch (error) {
        console.error("Final save failed:", error);
        alert("Något gick fel vid inskickningen. Vänligen försök igen. Detaljer finns i konsolen.");
    } finally {
        setIsFinalSaving(false);
    }
  };

  const handleExistingDamageAction = (id: string, action: 'document' | 'resolve', fullText: string) => {
    if (action === 'resolve') {
        setConfirmDialog({
            isOpen: true,
            title: `Åtgärdad: "${fullText}"`,
            text: 'Vänligen beskriv varför skadan markeras som åtgärdad/ej hittad. Denna kommentar sparas.',
            confirmButtonVariant: 'success',
            requiresComment: true,
            onConfirm: (comment) => {
                setExistingDamages(damages => damages.map(d => d.id !== id ? d : { ...d, status: d.status === 'resolved' ? 'not_selected' : 'resolved', resolvedComment: comment }));
            }
        });
    } else { // 'document'
        setExistingDamages(damages => damages.map(d => {
            if (d.id !== id) return d;
            const isBecomingDocumented = d.status !== 'documented';
            if (isBecomingDocumented && d.userPositions.length === 0) {
                return { ...d, status: 'documented', userPositions: [{ id: `pos-${Date.now()}`, carPart: '', position: '' }] };
            }
            return { ...d, status: d.status === 'documented' ? 'not_selected' : 'documented' };
        }));
    }
  };

  const handleRekondClick = () => {
    const isCurrentlyOn = behoverRekond;
    if (!isCurrentlyOn) {
      setConfirmDialog({
        isOpen: true,
        title: '⚠️ Behöver rekond',
        text: 'Detta kan medföra en avgift för hyrestagaren.',
        confirmButtonVariant: 'danger',
        theme: 'warning',
        onConfirm: () => {
          setBehoverRekond(true);
        }
      });
    } else {
      setBehoverRekond(false);
      setRekondInvandig(false);
      setRekondUtvandig(false);
      setRekondText('');
      setRekondMedia([]);
    }
  };
  
  const handleVarningslampaClick = () => {
    const isCurrentlyOn = varningslampaLyser;
    if (!isCurrentlyOn) {
      setConfirmDialog({
        isOpen: true,
        title: '⚠️ Varningslampa ej släckt',
        text: 'Detta kan medföra en avgift för hyrestagaren.',
        confirmButtonVariant: 'danger',
        theme: 'warning',
        onConfirm: () => {
          setVarningslampaLyser(true);
        }
      });
    } else {
      setVarningslampaLyser(false);
      setVarningslampaBeskrivning('');
    }
  };
  
  const handleGarInteAttHyraUtClick = () => {
    const isCurrentlyOn = garInteAttHyraUt;
    if (!isCurrentlyOn) {
      setConfirmDialog({
        isOpen: true,
        title: '⚠️ Går inte att hyra ut',
        text: 'Detta kan medföra en avgift för hyrestagaren.',
        confirmButtonVariant: 'danger',
        theme: 'warning',
        requiresComment: true,
        onConfirm: (comment) => {
          setGarInteAttHyraUt(true);
          setGarInteAttHyraUtKommentar(comment || '');
        }
      });
    } else {
      setGarInteAttHyraUt(false);
      setGarInteAttHyraUtKommentar('');
    }
  };
  
  const handleHusdjurSaneradClick = () => {
    const isCurrentlyOn = husdjurSanerad;
    if (!isCurrentlyOn) {
      setConfirmDialog({
        isOpen: true,
        title: '⚠️ Husdjur – sanerad',
        text: 'Detta kan medföra en avgift för hyrestagaren.',
        confirmButtonVariant: 'danger',
        theme: 'warning',
        onConfirm: () => {
          setHusdjurSanerad(true);
        }
      });
    } else {
      setHusdjurSanerad(false);
      setHusdjurText('');
      setHusdjurMedia([]);
    }
  };
  
  const handleRokningSaneradClick = () => {
    const isCurrentlyOn = rokningSanerad;
    if (!isCurrentlyOn) {
      setConfirmDialog({
        isOpen: true,
        title: '⚠️ Rökning – sanerad',
        text: 'Detta kan medföra en avgift för hyrestagaren.',
        confirmButtonVariant: 'danger',
        theme: 'warning',
        onConfirm: () => {
          setRokningSanerad(true);
        }
      });
    } else {
      setRokningSanerad(false);
      setRokningText('');
      setRokningMedia([]);
    }
  };
  
  const handleInsynsskyddSaknasClick = () => {
    const isCurrentlyOn = insynsskyddSaknas;
    if (!isCurrentlyOn) {
      setConfirmDialog({
        isOpen: true,
        title: '⚠️ Insynsskydd saknas',
        text: 'Detta kan medföra en avgift för hyrestagaren.',
        confirmButtonVariant: 'danger',
        theme: 'warning',
        onConfirm: () => {
          setInsynsskyddSaknas(true);
        }
      });
    } else {
      setInsynsskyddSaknas(false);
    }
  };

  const updateDamageField = (id: string, field: string, value: any, isExisting: boolean, positionId?: string) => {
    const updater = isExisting ? setExistingDamages : setNewDamages;
    updater((damages: any[]) => damages.map(d => {
        if (d.id !== id) return d;
        if (positionId && (field === 'carPart' || field === 'position')) {
            const positionsKey = isExisting ? 'userPositions' : 'positions';
            let updatedPositions = (d[positionsKey] as DamagePosition[]).map(p => p.id === positionId ? { ...p, [field]: value } : p);
            
            // If carPart is changed, reset position
            if (field === 'carPart') {
                updatedPositions = updatedPositions.map(p => p.id === positionId ? { ...p, position: '' } : p);
            }
            return { ...d, [positionsKey]: updatedPositions };
        }
        let fieldKey = field;
        if (isExisting) {
            if (field === 'description') fieldKey = 'userDescription';
            else if (field === 'type') fieldKey = 'userType';
        } else {
            if (field === 'description') fieldKey = 'text';
        }
        // If type is changed, reset positions
        if (fieldKey === 'type' || fieldKey === 'userType') {
            const positionsKey = isExisting ? 'userPositions' : 'positions';
            return { ...d, [fieldKey]: value, [positionsKey]: [{ id: `pos-${Date.now()}`, carPart: '', position: '' }] };
        }
        return { ...d, [fieldKey]: value };
    }));
  };

  const handleMediaUpdate = async (id: string, files: FileList, isExisting: boolean) => {
    const processed = await processFiles(files);
    const updater = isExisting ? setExistingDamages : setNewDamages;
    updater((damages: any[]) => damages.map(d => d.id === id ? { ...d, media: [...(d.media || []), ...processed] } : d));
  };
  
  const handleRekondMediaUpdate = async (files: FileList) => {
    const processed = await processFiles(files);
    setRekondMedia(prev => [...prev, ...processed]);
  };
  
  const handleHusdjurMediaUpdate = async (files: FileList) => {
    const processed = await processFiles(files);
    setHusdjurMedia(prev => [...prev, ...processed]);
  };
  
  const handleRokningMediaUpdate = async (files: FileList) => {
    const processed = await processFiles(files);
    setRokningMedia(prev => [...prev, ...processed]);
  };

  const handleMediaRemove = (id: string, index: number, isExisting: boolean) => {
    const updater = isExisting ? setExistingDamages : setNewDamages;
    updater((damages: any[]) => damages.map(d => {
      if (d.id !== id) return d;
      const newMedia = [...(d.media || [])];
      newMedia.splice(index, 1);
      return { ...d, media: newMedia };
    }));
  };
  
  const handleRekondMediaRemove = (index: number) => {
    setRekondMedia(prev => { const newMedia = [...prev]; newMedia.splice(index, 1); return newMedia; });
  };
  const handleHusdjurMediaRemove = (index: number) => {
    setHusdjurMedia(prev => { const newMedia = [...prev]; newMedia.splice(index, 1); return newMedia; });
  };
  const handleRokningMediaRemove = (index: number) => {
    setRokningMedia(prev => { const newMedia = [...prev]; newMedia.splice(index, 1); return newMedia; });
  };

  const addDamage = () => {
    setNewDamages(prev => [...prev, { id: `new_${Date.now()}`, type: '', text: '', positions: [{ id: `pos-${Date.now()}`, carPart: '', position: '' }], media: [], uploads: { photo_urls: [], video_urls: [], folder: '' } }]);
  };

  const removeDamage = (id: string) => {
    setConfirmDialog({ isOpen: true, title: 'Ta bort skada', text: 'Är du säker på att du vill ta bort denna nya skada?', confirmButtonVariant: 'danger', onConfirm: () => setNewDamages(prev => prev.filter(d => d.id !== id)) });
  };

  const addDamagePosition = (damageId: string, isExisting: boolean) => {
    const updater = isExisting ? setExistingDamages : setNewDamages;
    const positionsKey = isExisting ? 'userPositions' : 'positions';
    updater((prev => prev.map(d => {
        if (d.id !== damageId) return d;
        const newPosition: DamagePosition = { id: `pos-${Date.now()}`, carPart: '', position: '' };
        return { ...d, [positionsKey]: [...d[positionsKey], newPosition] };
    })) as any);
  };

  const removeDamagePosition = (damageId: string, positionId: string, isExisting: boolean) => {
      const updater = isExisting ? setExistingDamages : setNewDamages;
      const positionsKey = isExisting ? 'userPositions' : 'positions';
      updater((prev => prev.map(d => {
          if (d.id !== damageId) return d;
          if (d[positionsKey].length <= 1) return d;
          const updatedPositions = d[positionsKey].filter((p: DamagePosition) => p.id !== positionId);
          return { ...d, [positionsKey]: updatedPositions };
      })) as any);
  };
  
  const handleLaddningChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === '') { setLaddniva(''); return; }
    const numValue = parseInt(value, 10);
    setLaddniva(numValue > 100 ? '100' : value);
  };

  const activeStatusSections = [behoverRekond, husdjurSanerad, rokningSanerad, varningslampaLyser].filter(Boolean).length;

  return (
    <div className="checkin-form">
      <GlobalStyles backgroundUrl={BACKGROUND_IMAGE_URL} />
      {isFinalSaving && <SpinnerOverlay />}
      {showSuccessModal && <SuccessModal firstName={firstName} />}
      {showConfirmModal && <ConfirmModal payload={finalPayloadForUI} onConfirm={confirmAndSubmit} onCancel={() => setShowConfirmModal(false)} />}
      <ActionConfirmDialog state={confirmDialog} onClose={() => setConfirmDialog({ ...confirmDialog, isOpen: false })} />
      
      <div className="main-header">
        <img src={MABI_LOGO_URL} alt="MABI Logo" className="main-logo" />
        {firstName && <p className="user-info">Inloggad: {firstName}</p>}
      </div>

      <Card data-error={showFieldErrors && !regInput}>
        <SectionHeader title="Fordon" />
        <div style={{ position: 'relative' }}>
          <Field label="Registreringsnummer *">
            <input type="text" value={regInput} onChange={(e) => setRegInput(e.target.value)} onFocus={() => setShowSuggestions(true)} onBlur={() => setTimeout(() => setShowSuggestions(false), 150)} placeholder="ABC 123" className="reg-input" />
          </Field>
          {showSuggestions && suggestions.length > 0 && (
            <div className="suggestions-dropdown">{suggestions.map(s => <div key={s} className="suggestion-item" onMouseDown={() => { setRegInput(s); setShowSuggestions(false); }}>{s}</div>)}</div>
          )}
        </div>
        {loading && <p>Hämtar fordonsdata...</p>}
        {unknownRegNrConfirmed && vehicleData && <p className="info-text" style={{ marginTop: '0.5rem', padding: '0.75rem', backgroundColor: '#fffbeb', borderRadius: '6px', fontSize: '0.875rem' }}>Bekräftat: Detta reg.nr kommer att sparas som en ny post i systemet.</p>}
        {vehicleData && (
          <div className="info-box">
            <div className='info-grid'>
              <InfoRow label="Bilmodell" value={vehicleData.model || '---'} /><InfoRow label="Hjulförvaring" value={vehicleData.wheel_storage_location || '---'} /><InfoRow label="Saludatum" value={vehicleData.saludatum || '---'} />
            </div>
            {existingDamages.length > 0 && (
              <div className="damage-list-info">
                <span className="info-label">Befintliga skador ({existingDamages.length})</span>
                {existingDamages.map((d, i) => <div key={d.id} className="damage-list-item">{i + 1}. {d.fullText}</div>)}
              </div>
            )}
            {existingDamages.length === 0 && !loading && <div className="damage-list-info"><span className="info-label">Befintliga skador</span><div>- Inga kända skador</div></div>}
          </div>
        )}
      </Card>

      <Card data-error={showFieldErrors && (!ort || !station)}>
        <SectionHeader title="Plats för incheckning" />
        <div className="grid-2-col">
          <Field label="Ort *"><select value={ort} onChange={e => { setOrt(e.target.value); setStation(''); }}><option value="">Välj ort</option>{ORTER.map(o => <option key={o} value={o}>{o}</option>)}</select></Field>
          <Field label="Station *"><select value={station} onChange={e => setStation(e.target.value)} disabled={!ort}><option value="">Välj station</option>{availableStations.map(s => <option key={s} value={s}>{s}</option>)}</select></Field>
        </div>
      </Card>

      <Card data-error={showFieldErrors && (!matarstallning || !hjultyp || !drivmedelstyp || (drivmedelstyp === 'bensin_diesel' && !tankniva) || (tankniva === 'tankad_nu' && (!liters || !bransletyp || !literpris)) || (drivmedelstyp === 'elbil' && (!laddniva || antalLaddkablar === null)))}>
        <SectionHeader title="Fordonsstatus" />
        <SubSectionHeader title="Mätarställning" /><Field label="Mätarställning (km) *"><input type="number" value={matarstallning} onChange={e => setMatarstallning(e.target.value)} placeholder="12345" /></Field>
        <SubSectionHeader title="Däck som sitter på" /><Field label="Däcktyp *"><div className="grid-2-col"><ChoiceButton onClick={() => setHjultyp('Sommardäck')} isActive={hjultyp === 'Sommardäck'} isSet={hjultyp !== null}>Sommardäck</ChoiceButton><ChoiceButton onClick={() => setHjultyp('Vinterdäck')} isActive={hjultyp === 'Vinterdäck'} isSet={hjultyp !== null}>Vinterdäck</ChoiceButton></div></Field>
        <SubSectionHeader title="Tankning/Laddning" /><Field label="Drivmedelstyp *"><div className="grid-2-col"><ChoiceButton onClick={() => setDrivmedelstyp('bensin_diesel')} isActive={drivmedelstyp === 'bensin_diesel'} isSet={drivmedelstyp !== null}>Bensin/Diesel</ChoiceButton><ChoiceButton onClick={() => setDrivmedelstyp('elbil')} isActive={drivmedelstyp === 'elbil'} isSet={drivmedelstyp !== null}>Elbil</ChoiceButton></div></Field>
        {drivmedelstyp === 'bensin_diesel' && (<><Field label="Tankstatus *"><div className="grid-3-col">
          <ChoiceButton onClick={() => setTankniva('återlämnades_fulltankad')} isActive={tankniva === 'återlämnades_fulltankad'} isSet={tankniva !== null}>Återlämnades fulltankad</ChoiceButton>
          <ChoiceButton onClick={() => setTankniva('tankad_nu')} isActive={tankniva === 'tankad_nu'} isSet={tankniva !== null}>Tankad nu av MABI</ChoiceButton>
          <ChoiceButton onClick={() => setTankniva('ej_upptankad')} isActive={tankniva === 'ej_upptankad'} isSet={tankniva !== null} variant={tankniva === 'ej_upptankad' ? 'warning' : 'default'}>Ej upptankad</ChoiceButton>
        </div></Field>
        {tankniva === 'tankad_nu' && <div className="grid-3-col">
          <Field label="Antal liter *"><input type="number" value={liters} onChange={e => setLiters(e.target.value)} placeholder="50" /></Field>
          <Field label="Bränsletyp *"><div className="fuel-type-buttons"><ChoiceButton onClick={() => setBransletyp('Bensin')} isActive={bransletyp === 'Bensin'} isSet={bransletyp !== null}>Bensin</ChoiceButton><ChoiceButton onClick={() => setBransletyp('Diesel')} isActive={bransletyp === 'Diesel'} isSet={bransletyp !== null}>Diesel</ChoiceButton></div></Field>
          <Field label="Literpris *"><input type="number" value={literpris} onChange={e => setLiterpris(e.target.value)} placeholder="20.50" /></Field>
        </div>}</>)}
        {drivmedelstyp === 'elbil' && (<>
          <Field label="Laddningsnivå vid återlämning (%) *"><input type="number" value={laddniva} onChange={handleLaddningChange} placeholder="0-100" /></Field>
          <Field label="Antal laddkablar *"><div className="grid-3-col">
            <ChoiceButton onClick={() => setAntalLaddkablar(0)} isActive={antalLaddkablar === 0} isSet={antalLaddkablar !== null}>0</ChoiceButton>
            <ChoiceButton onClick={() => setAntalLaddkablar(1)} isActive={antalLaddkablar === 1} isSet={antalLaddkablar !== null}>1</ChoiceButton>
            <ChoiceButton onClick={() => setAntalLaddkablar(2)} isActive={antalLaddkablar === 2} isSet={antalLaddkablar !== null}>2</ChoiceButton>
          </div></Field>
        </>)}
      </Card>

      <Card data-error={showFieldErrors && (unhandledLegacyDamages || skadekontroll === null || (skadekontroll === 'nya_skador' && (newDamages.length === 0 || newDamages.some(d => { const positionsInvalid = d.positions.some(p => !p.carPart || ((DAMAGE_OPTIONS[d.type as keyof typeof DAMAGE_OPTIONS]?.[p.carPart as keyof typeof DAMAGE_OPTIONS[keyof typeof DAMAGE_OPTIONS]]?.length || 0) > 0 && !p.position)); return !d.type || !hasAnyMedia(d.media) || positionsInvalid; }))) || (existingDamages.filter(d => d.status === 'documented').some(d => !d.userType || !hasAnyMedia(d.media) || d.userPositions.some(p => !p.carPart))))}>
        <SectionHeader title="Skador" />
        <SubSectionHeader title="Befintliga skador att hantera" />
        {vehicleData && existingDamages.some(d => !d.isInventoried) 
            ? existingDamages.filter(d => !d.isInventoried).map((d, i) => <DamageItem key={d.id} damage={d} index={i + 1} isExisting={true} onUpdate={updateDamageField} onMediaUpdate={(files) => handleMediaUpdate(d.id, files, true)} onMediaRemove={(index) => handleMediaRemove(d.id, index, true)} onAction={handleExistingDamageAction} onAddPosition={() => addDamagePosition(d.id, true)} onRemovePosition={(posId) => removeDamagePosition(d.id, posId, true)} />)
            : <p>Inga ohanterade befintliga skador.</p>}
        <SubSectionHeader title="Nya skador" />
        <Field label="Har bilen några nya skador? *"><div className="grid-2-col">
            <ChoiceButton onClick={() => { setSkadekontroll('inga_nya_skador'); setNewDamages([]); }} isActive={skadekontroll === 'inga_nya_skador'} isSet={skadekontroll !== null}>Inga nya skador</ChoiceButton>
            <ChoiceButton onClick={() => { setSkadekontroll('nya_skador'); if (newDamages.length === 0) addDamage(); }} isActive={skadekontroll === 'nya_skador'} isSet={skadekontroll !== null}>Ja, det finns nya skador</ChoiceButton>
        </div></Field>
        {skadekontroll === 'nya_skador' && (<>{newDamages.map((d, i) => <DamageItem key={d.id} damage={d as any} index={i + 1} isExisting={false} onUpdate={updateDamageField} onMediaUpdate={(files) => handleMediaUpdate(d.id, files, false)} onMediaRemove={(index) => handleMediaRemove(d.id, index, false)} onRemove={removeDamage} onAddPosition={() => addDamagePosition(d.id, false)} onRemovePosition={(posId) => removeDamagePosition(d.id, posId, false)} />)}<Button onClick={addDamage} variant="secondary" style={{width: '100%', marginTop: '1rem'}}>+ Lägg till ytterligare en ny skada</Button></>)}
      </Card>

      <Card data-error={showFieldErrors && ((varningslampaLyser && !varningslampaBeskrivning.trim()) || (garInteAttHyraUt && !garInteAttHyraUtKommentar.trim()) || (behoverRekond && (!rekondUtvandig && !rekondInvandig || !hasPhoto(rekondMedia))))}>
        <SectionHeader title="Status & Sanering" />
        
        {/* 1. Går inte att hyra ut */}
        <div className="status-section-wrapper">
          <ChoiceButton onClick={handleGarInteAttHyraUtClick} isActive={garInteAttHyraUt} className="rekond-checkbox">Går inte att hyra ut</ChoiceButton>
          {garInteAttHyraUt && (<div className="damage-details">
            <div className="field" data-error={showFieldErrors && !garInteAttHyraUtKommentar.trim()}>
              <label>Kommentar (obligatorisk) *</label>
              <textarea value={garInteAttHyraUtKommentar} onChange={e => setGarInteAttHyraUtKommentar(e.target.value)} placeholder="Beskriv varför..." rows={2}></textarea>
            </div>
          </div>)}
        </div>
        {garInteAttHyraUt && <hr className="subsection-divider" />}
        
        {/* 2. Varningslampa ej släckt */}
        <div className="status-section-wrapper">
          <ChoiceButton onClick={handleVarningslampaClick} isActive={varningslampaLyser} className="warning-light-checkbox">Varningslampa ej släckt</ChoiceButton>
          {varningslampaLyser && (<div className="damage-details">
            <div className="field" data-error={showFieldErrors && !varningslampaBeskrivning.trim()}>
              <label>Specificera varningslampa *</label>
              <textarea value={varningslampaBeskrivning} onChange={e => setVarningslampaBeskrivning(e.target.value)} placeholder="Vilken eller vilka lampor?" rows={2}></textarea>
            </div>
          </div>)}
        </div>
        {varningslampaLyser && <hr className="subsection-divider" />}
        
        {/* 3. Behöver rekond */}
        <div className="status-section-wrapper">
          <ChoiceButton onClick={handleRekondClick} isActive={behoverRekond} className="rekond-checkbox">Behöver rekond</ChoiceButton>
          {behoverRekond && (<div className="damage-details">
            <Field label="Typ av rekond *"><div className="grid-2-col">
              <ChoiceButton onClick={() => setRekondUtvandig(!rekondUtvandig)} isActive={rekondUtvandig}>Utvändig</ChoiceButton>
              <ChoiceButton onClick={() => setRekondInvandig(!rekondInvandig)} isActive={rekondInvandig}>Invändig</ChoiceButton>
            </div></Field>
            <Field label="Kommentar (frivilligt)"><textarea value={rekondText} onChange={e => setRekondText(e.target.value)} placeholder="Beskriv vad som behövs..." rows={2}></textarea></Field>
            <div className="media-section">
              <MediaUpload id="rekond-photo" onUpload={handleRekondMediaUpdate} hasFile={hasPhoto(rekondMedia)} fileType="image" label="Foto *" />
              <MediaUpload id="rekond-video" onUpload={handleRekondMediaUpdate} hasFile={hasVideo(rekondMedia)} fileType="video" label="Video" isOptional={true} />
            </div>
            <div className="media-previews">{rekondMedia.map((m, i) => <MediaButton key={i} onRemove={() => handleRekondMediaRemove(i)}><img src={m.thumbnail || m.preview} alt="preview" /></MediaButton>)}</div>
          </div>)}
        </div>
        {behoverRekond && <hr className="subsection-divider" />}

        {/* 4. Husdjur – sanerad */}
        <div className="status-section-wrapper">
          <ChoiceButton onClick={handleHusdjurSaneradClick} isActive={husdjurSanerad} className="rekond-checkbox">Husdjur – sanerad</ChoiceButton>
          {husdjurSanerad && (<div className="damage-details">
            <Field label="Kommentar (frivilligt)"><textarea value={husdjurText} onChange={e => setHusdjurText(e.target.value)} placeholder="Beskriv sanering..." rows={2}></textarea></Field>
            <div className="media-section">
              <MediaUpload id="husdjur-photo" onUpload={handleHusdjurMediaUpdate} hasFile={hasPhoto(husdjurMedia)} fileType="image" label="Foto" isOptional={true} />
              <MediaUpload id="husdjur-video" onUpload={handleHusdjurMediaUpdate} hasFile={hasVideo(husdjurMedia)} fileType="video" label="Video" isOptional={true} />
            </div>
            <div className="media-previews">{husdjurMedia.map((m, i) => <MediaButton key={i} onRemove={() => handleHusdjurMediaRemove(i)}><img src={m.thumbnail || m.preview} alt="preview" /></MediaButton>)}</div>
          </div>)}
        </div>
        {husdjurSanerad && <hr className="subsection-divider" />}

        {/* 5. Rökning – sanerad */}
        <div className="status-section-wrapper">
          <ChoiceButton onClick={handleRokningSaneradClick} isActive={rokningSanerad} className="rekond-checkbox">Rökning – sanerad</ChoiceButton>
          {rokningSanerad && (<div className="damage-details">
            <Field label="Kommentar (frivilligt)"><textarea value={rokningText} onChange={e => setRokningText(e.target.value)} placeholder="Beskriv sanering..." rows={2}></textarea></Field>
            <div className="media-section">
              <MediaUpload id="rokning-photo" onUpload={handleRokningMediaUpdate} hasFile={hasPhoto(rokningMedia)} fileType="image" label="Foto" isOptional={true} />
              <MediaUpload id="rokning-video" onUpload={handleRokningMediaUpdate} hasFile={hasVideo(rokningMedia)} fileType="video" label="Video" isOptional={true} />
            </div>
             <div className="media-previews">{rokningMedia.map((m, i) => <MediaButton key={i} onRemove={() => handleRokningMediaRemove(i)}><img src={m.thumbnail || m.preview} alt="preview" /></MediaButton>)}</div>
          </div>)}
        </div>
        {rokningSanerad && <hr className="subsection-divider" />}
        
        {/* 6. Insynsskydd saknas */}
        <div className="status-section-wrapper">
          <ChoiceButton onClick={handleInsynsskyddSaknasClick} isActive={insynsskyddSaknas} className="rekond-checkbox">Insynsskydd saknas</ChoiceButton>
        </div>
      </Card>

      <Card data-error={showFieldErrors && !isChecklistComplete}>
        <SectionHeader title="Checklista" />
        <div className="grid-2-col">
          <ChoiceButton onClick={() => setWashed(!washed)} isActive={washed}>Tvättad</ChoiceButton>
          <ChoiceButton onClick={() => setDekalDjurRokningOK(!dekalDjurRokningOK)} isActive={dekalDjurRokningOK}>Dekal "Djur/rökning" finns</ChoiceButton>
          <ChoiceButton onClick={() => setIsskrapaOK(!isskrapaOK)} isActive={isskrapaOK}>Isskrapa finns</ChoiceButton>
          <ChoiceButton onClick={() => setPskivaOK(!pskivaOK)} isActive={pskivaOK}>P-skiva finns</ChoiceButton>
          <ChoiceButton onClick={() => setSkyltRegplatOK(!skyltRegplatOK)} isActive={skyltRegplatOK}>MABI-skylt reg.plåt finns</ChoiceButton>
          <ChoiceButton onClick={() => setDekalGpsOK(!dekalGpsOK)} isActive={dekalGpsOK}>Dekal GPS finns</ChoiceButton>
          <ChoiceButton onClick={() => setSpolarvatskaOK(!spolarvatskaOK)} isActive={spolarvatskaOK}>Spolarvätska OK</ChoiceButton>
          <ChoiceButton onClick={() => setVindrutaAvtorkadOK(!vindrutaAvtorkadOK)} isActive={vindrutaAvtorkadOK}>Insida vindruta avtorkad</ChoiceButton>
          {drivmedelstyp === 'bensin_diesel' && <ChoiceButton onClick={() => setAdblueOK(!adblueOK)} isActive={adblueOK}>AdBlue OK</ChoiceButton>}
        </div>
      </Card>

      <Card data-error={showFieldErrors && (!bilenStarNuOrt || !bilenStarNuStation)}>
        <SectionHeader title="Var är bilen nu?" />
        <div className="grid-2-col">
          <Field label="Ort *"><select value={bilenStarNuOrt} onChange={e => { setBilenStarNuOrt(e.target.value); setBilenStarNuStation(''); }}><option value="">Välj ort</option>{ORTER.map(o => <option key={o} value={o}>{o}</option>)}</select></Field>
          <Field label="Station *"><select value={bilenStarNuStation} onChange={e => setBilenStarNuStation(e.target.value)} disabled={!bilenStarNuOrt}><option value="">Välj station</option>{availableStationsBilenStarNu.map(s => <option key={s} value={s}>{s}</option>)}</select></Field>
        </div>
        <Field label="Parkeringsinfo (frivilligt)"><textarea value={bilenStarNuKommentar} onChange={e => setBilenStarNuKommentar(e.target.value)} placeholder="Ange parkering, nyckelnummer etc." rows={2}></textarea></Field>
      </Card>

      <Card><Field label="Övriga kommentarer (frivilligt)"><textarea value={preliminarAvslutNotering} onChange={e => setPreliminarAvslutNotering(e.target.value)} placeholder="Övrig info som inte passar in ovan..." rows={3}></textarea></Field></Card>

      <div className="form-actions">
        <Button onClick={handleCancel} variant="secondary">Avbryt</Button>
        <Button 
            onClick={formIsValidState ? () => setShowConfirmModal(true) : handleShowErrors} 
            disabled={isFinalSaving}
            variant={formIsValidState ? 'success' : 'primary'}
        >
            {isFinalSaving ? 'Skickar...' : (formIsValidState ? 'Slutför incheckning' : 'Visa saknad information')}
        </Button>
      </div>
    </div>
  );
}

// =================================================================
// 3. REUSABLE SUB-COMPONENTS & STYLES
// =================================================================

const Card: React.FC<React.PropsWithChildren<any>> = ({ children, ...props }) => <div className="card" {...props}>{children}</div>;
const SectionHeader: React.FC<{ title: string }> = ({ title }) => <div className="section-header"><h2>{title}</h2></div>;
const SubSectionHeader: React.FC<{ title: string }> = ({ title }) => <div className="sub-section-header"><h3>{title}</h3></div>;
const Field: React.FC<React.PropsWithChildren<{ label: string }>> = ({ label, children }) => <div className="field"><label>{label}</label>{children}</div>;
const InfoRow: React.FC<{ label: string, value: string }> = ({ label, value }) => <><span className="info-label">{label}</span><span>{value}</span></>;
const Button = React.forwardRef<HTMLButtonElement, React.PropsWithChildren<{ onClick?: () => void, variant?: string, disabled?: boolean, style?: object, className?: string }>>(({ onClick, variant = 'primary', disabled, children, ...props }, ref) => <button ref={ref} onClick={onClick} className={`btn ${variant} ${disabled ? 'disabled' : ''}`} disabled={disabled} {...props}>{children}</button>);
const SuccessModal: React.FC<{ firstName: string }> = ({ firstName }) => (<><div className="modal-overlay" /><div className="modal-content success-modal"><div className="success-icon"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{width: '3rem', height: '3rem'}}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15L15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></div><h3>Tack {firstName}!</h3><p>Din incheckning har skickats.</p></div></>);
const SpinnerOverlay = () => (<div className="modal-overlay spinner-overlay"><div className="spinner"></div><p>Skickar in...</p></div>);

const ConfirmModal: React.FC<{ payload: any; onConfirm: () => void; onCancel: () => void; }> = ({ payload, onConfirm, onCancel }) => {
    const renderDamageList = (damages: any[], title: string) => {
        if (!damages || damages.length === 0) return null;
        return (<div className="confirm-damage-section"><h4>{title}</h4><ul>{damages.map((d: any, index: number) => {
            let damageString = d.fullText || d.type || d.userType || 'Okänd skada';
            
            const positions = (d.positions || d.userPositions || [])
              .map((p: any) => {
                  if (p.carPart && p.position) return `${p.carPart} (${p.position})`;
                  if (p.carPart) return p.carPart;
                  return '';
              })
              .filter(Boolean)
              .join(', ');

            if (positions) { damageString += `: ${positions}`; }

            const comment = d.text || d.userDescription || (title.includes('Åtgärdade') ? d.resolvedComment : '');
            if (comment) { damageString += ` (${comment})`; }

            return <li key={d.id || index}>{damageString}</li>;
        })}</ul></div>);
    };
    const getTankningText = () => {
        if (payload.drivmedel === 'bensin_diesel') {
            if (payload.tankning.tankniva === 'tankad_nu') return <p>⛽ <strong>Tankning:</strong> {`Upptankad av MABI (${payload.tankning.liters}L ${payload.tankning.bransletyp} @ ${payload.tankning.literpris} kr/L)`}</p>;
            if (payload.tankning.tankniva === 'ej_upptankad') return <p>⛽ <strong>Tankning:</strong> <span style={{color: '#d97706', fontWeight: 'bold'}}>Ej upptankad</span></p>;
            return <p>⛽ <strong>Tankning:</strong> Återlämnades fulltankad</p>;
        }
        return null;
    };
    const showChargeWarning = payload.drivmedel === 'elbil' && parseInt(payload.laddning.laddniva, 10) < 95;
    const notRefueled = payload.drivmedel === 'bensin_diesel' && payload.tankning.tankniva === 'ej_upptankad';
    
    // Build warning chips
    const warningChips = [];
    if (payload.uthyrningsstatus?.garInteAttHyraUt) {
      warningChips.push({ title: 'Går inte att hyra ut', description: payload.uthyrningsstatus.beskrivning });
    }
    if (payload.varningslampa?.lyser) {
      warningChips.push({ title: 'Varningslampa ej släckt', description: payload.varningslampa.beskrivning });
    }
    if (payload.rekond?.behoverRekond) {
      warningChips.push({ title: 'Behöver rekond', description: null });
    }
    if (payload.insynsskydd?.saknas) {
      warningChips.push({ title: 'Insynsskydd saknas', description: null });
    }
    if (notRefueled) {
      warningChips.push({ title: 'Bilen är ej upptankad', description: null });
    }
    if (showChargeWarning) {
      warningChips.push({ title: 'Kolla bilens laddnivå!', description: null });
    }

    return (<><div className="modal-overlay" /><div className="modal-content confirm-modal">
        <div className="confirm-header">
            <h3 className="confirm-modal-title">Bekräfta incheckning</h3><p className="confirm-vehicle-info">{payload.regnr} - {payload.carModel || '---'}</p>
            {warningChips.length > 0 && (<div className="confirm-warnings-wrapper">
                {warningChips.map((chip, i) => (
                  <div key={i} className="warning-chip">
                    <div className="warning-chip-title">⚠️ {chip.title}</div>
                    {chip.description && <div className="warning-chip-description">{chip.description}</div>}
                  </div>
                ))}
            </div>)}
        </div>
        <div className="confirm-details">
            <div className="confirm-summary">
                <p>📍 <strong>Incheckad vid:</strong> {payload.ort} / {payload.station}</p>
                {payload.bilen_star_nu && <p>✅ <strong>Bilen står nu vid:</strong> {payload.bilen_star_nu.ort} / {payload.bilen_star_nu.station}</p>}
                {payload.bilen_star_nu?.kommentar && <p style={{paddingLeft: '1.5rem'}}><small><strong>Parkeringsinfo:</strong> {payload.bilen_star_nu.kommentar}</small></p>}
            </div>
            {renderDamageList(payload.nya_skador, '💥 Nya skador')}{renderDamageList(payload.dokumenterade_skador, '📋 Dokumenterade skador')}{renderDamageList(payload.åtgärdade_skador, '✅ Åtgärdade skador')}
            <div className="confirm-summary">
                <p>🛣️ <strong>Mätarställning:</strong> {payload.matarstallning} km</p>
                {getTankningText()}
                {payload.drivmedel === 'elbil' && (
                  <>
                    <p>⚡ <strong>Laddning:</strong> {payload.laddning.laddniva}%</p>
                    <p>🔌 <strong>Antal laddkablar:</strong> {payload.laddning.antal_laddkablar}</p>
                  </>
                )}
                <p>🛞 <strong>Hjul:</strong> {payload.hjultyp}</p>
                {payload.washed && <p><strong>✅ Tvättad</strong></p>}{payload.otherChecklistItemsOK && <p><strong>✅ Övriga kontroller OK!</strong></p>}
            </div>
        </div>
        <div className="modal-actions"><Button onClick={onCancel} variant="secondary">Avbryt</Button><Button onClick={onConfirm} variant="success">Bekräfta och skicka</Button></div>
    </div></>);
};

const DamageItem: React.FC<{
  damage: ExistingDamage | NewDamage; index: number; isExisting: boolean;
  onUpdate: (id: string, field: string, value: any, isExisting: boolean, positionId?: string) => void;
  onMediaUpdate: (files: FileList) => void; onMediaRemove: (index: number) => void;
  onAction?: (id: string, action: 'document' | 'resolve', fullText: string) => void; onRemove?: (id: string) => void;
  onAddPosition: (damageId: string) => void; onRemovePosition: (damageId: string, positionId: string) => void;
}> = ({ damage, index, isExisting, onUpdate, onMediaUpdate, onMediaRemove, onAction, onRemove, onAddPosition, onRemovePosition }) => {
  const isDocumented = isExisting && (damage as ExistingDamage).status === 'documented';
  const resolved = isExisting && (damage as ExistingDamage).status === 'resolved';
  
  const damageType = isExisting ? (damage as ExistingDamage).userType : (damage as NewDamage).type;
  const description = isExisting ? (damage as ExistingDamage).userDescription : (damage as NewDamage).text;
  const positions = isExisting ? (damage as ExistingDamage).userPositions : (damage as NewDamage).positions;
  const headerText = isExisting ? `${index}. ${(damage as ExistingDamage).fullText}` : `Ny skada #${index}`;
  const availablePlaceringar = damageType ? Object.keys(DAMAGE_OPTIONS[damageType as keyof typeof DAMAGE_OPTIONS] || {}).sort((a, b) => a.localeCompare(b, 'sv')) : [];

  return (<div className={`damage-item ${resolved ? 'resolved' : ''}`}>
      <div className="damage-item-header"><span>{headerText}</span>{!isExisting && onRemove && <Button onClick={() => onRemove(damage.id)} variant="danger">Ta bort</Button>}</div>
      {isExisting && onAction && (<div className="damage-item-actions">
        <Button onClick={() => onAction(damage.id, 'document', (damage as ExistingDamage).fullText)} variant={isDocumented ? 'success' : 'secondary'}>Dokumentera</Button>
        <Button onClick={() => onAction(damage.id, 'resolve', (damage as ExistingDamage).fullText)} variant={resolved ? 'warning' : 'secondary'}>Åtgärdad/Hittas ej</Button>
      </div>)}
      {(isDocumented || !isExisting) && !resolved && (<div className="damage-details">
        <Field label="Typ av skada *"><select value={damageType || ''} onChange={e => onUpdate(damage.id, 'type', e.target.value, isExisting)}><option value="">Välj typ</option>{DAMAGE_TYPES.map(type => <option key={type} value={type}>{type}</option>)}</select></Field>
        {positions && positions.map((pos, i) => {
            const rawPositioner = (damageType && pos.carPart && DAMAGE_OPTIONS[damageType as keyof typeof DAMAGE_OPTIONS]?.[pos.carPart as keyof typeof DAMAGE_OPTIONS[keyof typeof DAMAGE_OPTIONS]]) || [];
            const availablePositioner = rawPositioner.length > 0 ? [...rawPositioner].sort((a, b) => a.localeCompare(b, 'sv')) : [];
            const showPositionDropdown = availablePositioner.length > 0;

            return (
                <div key={pos.id} className="damage-position-row">
                    <div className={showPositionDropdown ? "grid-2-col" : ""}>
                        <Field label={i === 0 ? "Placering *" : ""}><select value={pos.carPart} onChange={e => onUpdate(damage.id, 'carPart', e.target.value, isExisting, pos.id)} disabled={!damageType}><option value="">Välj placering</option>{availablePlaceringar.map(p => <option key={p} value={p}>{p}</option>)}</select></Field>
                        {showPositionDropdown && <Field label={i === 0 ? "Position *" : ""}><select value={pos.position} onChange={e => onUpdate(damage.id, 'position', e.target.value, isExisting, pos.id)}><option value="">Välj position</option>{availablePositioner.map(p => <option key={p} value={p}>{p}</option>)}</select></Field>}
                    </div>
                    {positions.length > 1 && <button onClick={() => onRemovePosition(damage.id, pos.id)} className="remove-position-btn">×</button>}
                </div>
            );
        })}
        <Button onClick={() => onAddPosition(damage.id)} variant="secondary" className="add-position-btn">+ Lägg till position</Button>
        <Field label="Beskrivning (frivilligt)"><textarea rows={2} value={description || ''} onChange={e => onUpdate(damage.id, 'description', e.target.value, isExisting)} placeholder="Beskriv skadan..."></textarea></Field>
        {isExisting && (<div style={{marginBottom: '1rem'}}>
          <ChoiceButton 
            onClick={() => onUpdate(damage.id, 'undocumentable', !(damage as ExistingDamage).undocumentable, isExisting)} 
            isActive={(damage as ExistingDamage).undocumentable || false}
          >
            Kan ej dokumenteras
          </ChoiceButton>
        </div>)}
        {isExisting && (damage as ExistingDamage).undocumentable && (
          <Field label="Kommentar (obligatorisk) *">
            <textarea 
              rows={2} 
              value={(damage as ExistingDamage).undocumentedComment || ''} 
              onChange={e => onUpdate(damage.id, 'undocumentedComment', e.target.value, isExisting)} 
              placeholder="Förklara varför skadan inte kan dokumenteras..."
            ></textarea>
          </Field>
        )}
        {(!isExisting || !(damage as ExistingDamage).undocumentable) && (<><div className="media-section">
          <MediaUpload id={`photo-${damage.id}`} onUpload={onMediaUpdate} hasFile={hasPhoto(damage.media)} fileType="image" label="Foto *" isOptional={isExisting} />
          <MediaUpload id={`video-${damage.id}`} onUpload={onMediaUpdate} hasFile={hasVideo(damage.media)} fileType="video" label="Video" isOptional={true} />
        </div>
        <div className="media-previews">{damage.media?.map((m, i) => <MediaButton key={i} onRemove={() => onMediaRemove(i)}><img src={m.thumbnail || m.preview} alt="preview" /></MediaButton>)}</div></>)}
      </div>)}
    </div>);
};

const MediaUpload: React.FC<{ id: string, onUpload: (files: FileList) => void, hasFile: boolean, fileType: 'image' | 'video', label: string, isOptional?: boolean }> = ({ id, onUpload, hasFile, fileType, label, isOptional = false }) => {
    let className = 'media-label';
    if (hasFile) className += ' active';
    else if (isOptional) className += ' optional';
    else className += ' mandatory';
    const buttonText = hasFile ? `Lägg till ${fileType === 'image' ? 'fler foton' : 'fler videor'}` : label;
    return (<div className="media-upload">
        <label htmlFor={id} className={className}>{buttonText}</label>
        <input id={id} type="file" accept={`${fileType}/*`} capture="environment" onChange={e => e.target.files && onUpload(e.target.files)} style={{ display: 'none' }} multiple />
    </div>);
};

const MediaButton: React.FC<React.PropsWithChildren<{ onRemove?: () => void }>> = ({ children, onRemove }) => (<div className="media-btn">{children}{onRemove && <button onClick={onRemove} className="remove-media-btn">×</button>}</div>);
const ChoiceButton: React.FC<{onClick: () => void, isActive: boolean, children: React.ReactNode, className?: string, isSet?: boolean, variant?: 'default' | 'warning' | 'danger'}> = ({ onClick, isActive, children, className, isSet = false, variant = 'default' }) => {
    let btnClass = 'choice-btn';
    if (className) btnClass += ` ${className}`;
    if (isActive) btnClass += ` active ${variant}`;
    else if (isSet) btnClass += ' disabled-choice';
    return <button onClick={onClick} className={btnClass}>{children}</button>;
};

const ActionConfirmDialog: React.FC<{ state: ConfirmDialogState, onClose: () => void }> = ({ state, onClose }) => {
    const [comment, setComment] = useState('');
    const cancelButtonRef = React.useRef<HTMLButtonElement>(null);
    
    // ESC key handling
    React.useEffect(() => {
        if (!state.isOpen) return;
        
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };
        
        window.addEventListener('keydown', handleEsc);
        
        // Focus Cancel button initially
        setTimeout(() => cancelButtonRef.current?.focus(), 100);
        
        return () => window.removeEventListener('keydown', handleEsc);
    }, [state.isOpen, onClose]);
    
    if (!state.isOpen) return null;
    
    const handleConfirm = () => {
        if (state.requiresComment && !comment.trim()) { 
            alert('Kommentar är obligatoriskt.'); 
            return; 
        }
        state.onConfirm(comment);
        onClose();
        setComment('');
    };
    
    const themeClass = state.theme ? `theme-${state.theme}` : '';
    
    return (<><div className="modal-overlay" onClick={onClose} aria-hidden="true" /><div className={`modal-content confirm-modal ${themeClass}`} role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        {state.title && <h3 id="dialog-title">{state.title}</h3>}<p style={{textAlign: 'center', marginBottom: '1.5rem'}}>{state.text}</p>
        {state.requiresComment && (<div className="field" style={{marginBottom: '1.5rem'}}><textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Ange motivering här..." rows={3} aria-label="Kommentar"></textarea></div>)}
        <div className="modal-actions"><Button ref={cancelButtonRef} onClick={onClose} variant="secondary">Avbryt</Button><Button onClick={handleConfirm} variant={state.confirmButtonVariant || 'danger'} disabled={state.requiresComment && !comment.trim()}>Bekräfta</Button></div>
    </div></>);
};

const GlobalStyles: React.FC<{ backgroundUrl: string }> = ({ backgroundUrl }) => (<style jsx global>{`
    :root {
      --color-bg: #f8fafc; --color-card: #ffffff; --color-text: #1f2937; --color-text-secondary: #6b7280;
      --color-primary: #2563eb; --color-primary-light: #eff6ff; --color-success: #16a34a; --color-success-light: #f0fdf4;
      --color-danger: #dc2626; --color-danger-light: #fef2f2; --color-warning: #f59e0b; --color-warning-light: #fffbeb;
      --color-border: #e5e7eb; --color-border-focus: #3b82f6; --color-disabled: #a1a1aa; --color-disabled-light: #f4f4f5;
      --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05); --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
    }
    body { 
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; 
        background-color: var(--color-bg); 
        color: var(--color-text); 
        margin: 0; 
        padding: 0; 
    }
    body::before {
        content: "";
        position: fixed;
        top: 0; left: 0;
        width: 100vw; height: 100vh;
        background-image: url(${backgroundUrl});
        background-size: cover;
        background-position: center;
        opacity: 1;
        z-index: -1;
    }
    .checkin-form { max-width: 700px; margin: 0 auto; padding: 1rem; box-sizing: border-box; }
    .main-header { text-align: center; margin-bottom: 1.5rem; }
    .main-logo { max-width: 188px; height: auto; margin: 0 auto 1rem auto; display: block; }
    .user-info { font-weight: 500; color: var(--color-text-secondary); margin: 0; }
    .card { background-color: rgba(255, 255, 255, 0.92); padding: 1.5rem; border-radius: 12px; margin-bottom: 1.5rem; box-shadow: var(--shadow-md); border: 2px solid transparent; transition: border-color 0.3s; }
    .card[data-error="true"] { border: 2px solid var(--color-danger); }
    .field[data-error="true"] input, .field[data-error="true"] select, .field[data-error="true"] textarea { border: 2px solid var(--color-danger) !important; }
    .section-header { padding-bottom: 0.75rem; border-bottom: 1px solid var(--color-border); margin-bottom: 1.5rem; }
    .section-header h2 { font-size: 1.25rem; font-weight: 700; color: var(--color-text); text-transform: uppercase; letter-spacing: 0.05em; margin:0; }
    .sub-section-header { margin-top: 2rem; margin-bottom: 1rem; }
    .sub-section-header h3 { font-size: 1rem; font-weight: 600; color: var(--color-text); margin:0; }
    .field { margin-bottom: 1rem; }
    .field label { display: block; margin-bottom: 0.5rem; font-weight: 500; font-size: 0.875rem; }
    .field input, .field select, .field textarea { width: 100%; padding: 0.75rem; border: 1px solid var(--color-border); border-radius: 6px; font-size: 1rem; background-color: white; box-sizing: border-box; }
    .field input:focus, .field select:focus, .field textarea:focus { outline: 2px solid var(--color-border-focus); border-color: transparent; }
    .field select[disabled] { background-color: var(--color-disabled-light); cursor: not-allowed; }
    .reg-input { text-align: center; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; }
    .suggestions-dropdown { position: absolute; top: 100%; left: 0; right: 0; background-color: white; border: 1px solid var(--color-border); border-radius: 6px; z-index: 10; box-shadow: var(--shadow-md); }
    .suggestion-item { padding: 0.75rem; cursor: pointer; }
    .suggestion-item:hover { background-color: var(--color-primary-light); }
    .error-text { color: var(--color-danger); }
    .info-box { margin-top: 1rem; padding: 1rem; background-color: var(--color-primary-light); border-radius: 8px; }
    .info-grid { display: grid; grid-template-columns: auto 1fr; gap: 0.5rem 1rem; }
    .info-label { font-weight: 600; font-size: 0.875rem; color: #1e3a8a; }
    .info-grid > span { font-size: 0.875rem; align-self: center; }
    .damage-list-info { margin-top: 1rem; grid-column: 1 / -1; border-top: 1px solid #dbeafe; padding-top: 0.75rem; }
    .damage-list-info .info-label { display: block; margin-bottom: 0.25rem; }
    .damage-list-item { padding-left: 0.5rem; line-height: 1.4; font-size: 0.875rem;}
    .grid-2-col { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; }
    .grid-3-col { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem; }
    .fuel-type-buttons { display: flex; flex-wrap: wrap; gap: 1rem; }
    .fuel-type-buttons .choice-btn { flex-grow: 1; }
    .form-actions { margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid var(--color-border); display: flex; gap: 1rem; justify-content: flex-end; padding-bottom: 3rem; }
    .btn { padding: 0.75rem 1.5rem; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
    .btn.primary { background-color: var(--color-primary); color: white; }
    .btn.secondary { background-color: var(--color-border); color: var(--color-text); }
    .btn.success { background-color: var(--color-success); color: white; }
    .btn.danger { background-color: var(--color-danger); color: white; }
    .btn.warning { background-color: var(--color-warning); color: white; }
    .btn.disabled { background-color: var(--color-disabled-light); color: var(--color-disabled); cursor: not-allowed; }
    .btn:not(:disabled):hover { filter: brightness(1.1); }
    .choice-btn { display: flex; align-items: center; justify-content: center; width: 100%; padding: 0.85rem 1rem; border-radius: 8px; border: 2px solid var(--color-border); background-color: white; color: var(--color-text); font-weight: 600; font-size: 1rem; cursor: pointer; transition: all 0.2s; }
    .choice-btn:hover { filter: brightness(1.05); }
    .choice-btn.active.default { border-color: var(--color-success); background-color: var(--color-success-light); color: var(--color-success); }
    .choice-btn.active.warning { border-color: var(--color-warning); background-color: var(--color-warning-light); color: #b45309; }
    .choice-btn.active.danger { border-color: var(--color-danger); background-color: var(--color-danger-light); color: #991b1b; }
    .choice-btn.disabled-choice { border-color: var(--color-border); background-color: var(--color-bg); color: var(--color-disabled); cursor: default; }
    .rekond-checkbox.active { border-color: var(--color-danger) !important; background-color: var(--color-danger-light) !important; color: #9a3412 !important; }
    .warning-light-checkbox.active { border-color: var(--color-danger) !important; background-color: var(--color-danger-light) !important; color: #9a3412 !important; }
    .warning-highlight { background-color: #dc2626; color: white; font-weight: bold; padding: 0.5rem 0.75rem; border-radius: 6px; display: inline-block; margin-top: 0.5rem; }
    .status-section-wrapper { display: flex; flex-direction: column; margin-bottom: 1rem; }
    .subsection-divider { border: 0; height: 1px; background-color: var(--color-border); margin: 1.5rem 0; }
    .damage-item { border: 1px solid var(--color-border); border-radius: 8px; margin-bottom: 1rem; overflow: hidden; }
    .damage-item.resolved { opacity: 0.6; background-color: var(--color-warning-light); }
    .damage-item-header { display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 1rem; background-color: #f9fafb; font-weight: 600; flex-wrap: wrap; gap: 0.5rem; }
    .damage-item-actions { padding: 0 1rem 1rem 1rem; display: flex; gap: 0.5rem; flex-wrap: wrap; border-top: 1px solid var(--color-border); margin-top: 0.75rem; padding-top: 1rem; }
    .damage-details { padding: 1rem; border-top: 1px solid var(--color-border); }
    .damage-position-row { position: relative; padding-right: 2.5rem; }
    .add-position-btn { width: 100% !important; margin: 0.5rem 0 !important; font-size: 0.875rem !important; padding: 0.5rem !important; }
    .remove-position-btn { position: absolute; top: 50%; right: 0; transform: translateY(-50%); width: 28px; height: 28px; border-radius: 50%; background-color: var(--color-danger-light); color: var(--color-danger); border: none; font-size: 1.25rem; font-weight: bold; cursor: pointer; }
    .remove-position-btn:hover { background-color: var(--color-danger); color: white; }
    .media-section { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 1rem; }
    .media-label { display: block; text-align: center; padding: 1.5rem 1rem; border: 2px dashed; border-radius: 8px; cursor: pointer; transition: all 0.2s; font-weight: 600; }
    .media-label:hover { filter: brightness(0.95); }
    .media-label.active { border-style: solid; border-color: var(--color-success); background-color: var(--color-success-light); color: var(--color-success); }
    .media-label.mandatory { border-color: var(--color-danger); background-color: var(--color-danger-light); color: var(--color-danger); }
    .media-label.optional { border-color: var(--color-warning); background-color: var(--color-warning-light); color: #92400e; }
    .media-previews { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 1rem; }
    .media-btn { position: relative; width: 70px; height: 70px; border-radius: 8px; overflow: hidden; background-color: var(--color-border); }
    .media-btn img { width: 100%; height: 100%; object-fit: cover; }
    .remove-media-btn { position: absolute; top: 2px; right: 2px; width: 22px; height: 22px; border-radius: 50%; background-color: var(--color-danger); color: white; border: 2px solid white; cursor: pointer; font-size: 1rem; font-weight: bold; line-height: 1; padding: 0; }
    .remove-media-btn:hover { background-color: #b91c1c; }
    .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background-color: rgba(0,0,0,0.5); z-index: 100; }
    .modal-content { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background-color: rgba(255, 255, 255, 0.92); padding: 2rem; border-radius: 12px; z-index: 101; box-shadow: var(--shadow-md); width: 90%; max-width: 600px; }
    .success-modal { text-align: center; }
    .success-icon { font-size: 3rem; color: var(--color-success); margin-bottom: 1rem; }
    .confirm-modal { text-align: left; }
    .confirm-header { text-align: center; margin-bottom: 1.5rem; padding-bottom: 1.5rem; border-bottom: 1px solid var(--color-border); }
    .warning-chip { background-color: var(--color-warning-light); border: 1px solid #FDE68A; padding: 0.75rem; margin: 0.5rem 0; border-radius: 6px; text-align: center; }
    .warning-chip-title { font-weight: bold; color: #92400e; font-size: 0.95rem; }
    .warning-chip-description { color: #92400e; font-size: 0.85rem; margin-top: 0.25rem; }
    .confirm-modal-title { font-size: 1.5rem; font-weight: 700; margin: 0; }
    .confirm-vehicle-info { font-size: 1.25rem; font-weight: 600; margin: 0.5rem 0 1rem 0; }
    .confirm-warnings-wrapper { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; }
    .confirm-details { }
    .confirm-summary { margin-bottom: 1rem; padding-bottom: 1rem; border-bottom: 1px solid var(--color-border); }
    .confirm-summary:last-child { border-bottom: none; padding-bottom: 0; margin-bottom: 0; }
    .confirm-summary p { margin: 0.5rem 0; line-height: 1.5; }
    .modal-actions { display: flex; justify-content: flex-end; gap: 1rem; margin-top: 2rem; }
    .confirm-damage-section { margin-bottom: 1rem; padding-bottom: 1rem; border-bottom: 1px solid var(--color-border); }
    .confirm-damage-section h4 { margin: 0 0 0.5rem 0; font-size: 1.1rem; }
    .confirm-damage-section ul { margin: 0; padding-left: 1.5rem; }
    .confirm-damage-section li { margin-bottom: 0.25rem; }
    .charge-warning-banner { background-color: var(--color-danger); color: white; font-weight: 700; font-size: 1.25rem; padding: 1rem; border-radius: 8px; margin-bottom: 1.5rem; text-align: center; }
    .spinner-overlay { display: flex; flex-direction: column; align-items: center; justify-content: center; color: white; font-size: 1.2rem; font-weight: 600; }
    .spinner { border: 5px solid #f3f3f3; border-top: 5px solid var(--color-primary); border-radius: 50%; width: 50px; height: 50px; animation: spin 1s linear infinite; margin-bottom: 1rem; }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
`}</style>);

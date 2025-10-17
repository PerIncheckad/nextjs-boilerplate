'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { getVehicleInfo, VehicleInfo } from '@/lib/damages';
import { notifyCheckin } from '@/lib/notify';

const normalizeReg = (reg: string) => reg.toUpperCase().replace(/\s/g, '');

// =================================================================
// 1. DATA, TYPES & HELPERS
// =================================================================

const MABI_LOGO_URL = "/mabi-logo.png";

const ORTER = ['Malmö', 'Helsingborg', 'Ängelholm', 'Halmstad', 'Falkenberg', 'Trelleborg', 'Varberg', 'Lund'].sort();

const STATIONER: Record<string, string[]> = {
  'Malmö': ['Ford Malmö', 'Mechanum', 'Malmö Automera', 'Mercedes Malmö', 'Werksta St Bernstorp', 'Werksta Malmö Hamn', 'Hedbergs Malmö', 'Hedin Automotive Burlöv', 'Sturup'],
  'Helsingborg': ['HBSC Helsingborg', 'Ford Helsingborg', 'Transport Helsingborg', 'S. Jönsson', 'BMW Helsingborg', 'KIA Helsingborg', 'Euromaster Helsingborg', 'B/S Klippan', 'B/S Munka-Ljungby'],
  'Lund': ['Ford Lund', 'Hedin Lund', 'B/S Lund', 'P7 Revinge'],
  'Ängelholm': ['FORD Ängelholm', 'Mekonomen Ängelholm', 'Flyget Ängelholm'],
  'Falkenberg': ['Falkenberg'],
  'Halmstad': ['Flyget Halmstad', 'KIA Halmstad', 'FORD Halmstad'],
  'Trelleborg': ['Trelleborg'],
  'Varberg': ['Ford Varberg', 'Hedin Automotive Varberg', 'Sällstorp lack plåt', 'Finnveden plåt']
};

const DAMAGE_TYPES = [
  'Buckla', 'Däckskada', 'Däckskada sommarhjul', 'Däckskada vinterhjul', 'Fälgskada sommarhjul',
  'Fälgskada vinterhjul', 'Feltankning', 'Höjdledsskada', 'Intryck', 'Invändig skada',
  'Jack', 'Krockskada', 'Krossad ruta', 'Oaktsamhet', 'Punktering', 'Repa', 'Repor',
  'Saknas', 'Skrapad', 'Skrapad fälg', 'Spricka', 'Stenskott', 'Trasig', 'Övrigt'
].sort();

const CAR_PARTS: Record<string, string[]> = {
  'Annan del': [], 'Bagagelucka': ['Insida', 'Utsida'], 'Däck': ['Höger bak', 'Höger fram', 'Vänster bak', 'Vänster fram'],
  'Dörr insida': ['Höger bak', 'Höger fram', 'Vänster bak', 'Vänster fram'], 'Dörr utsida': ['Höger bak', 'Höger fram', 'Vänster bak', 'Vänster fram'],
  'Front läpp': ['Höger', 'Mitten', 'Vänster'], 'Fälg': ['Höger bak', 'Höger fram', 'Vänster bak', 'Vänster fram'],
  'Glas': ['Bak', 'Fram', 'Höger bak', 'Höger fram', 'Vänster bak', 'Vänster fram'], 'Grill': [], 'Motorhuv': ['Utsida'],
  'Skärm': ['Höger bak', 'Höger fram', 'Vänster bak', 'Vänster fram'], 'Stötfångare fram': ['Bak', 'Fram', 'Höger bak', 'Höger fram', 'Vänster bak', 'Vänster fram'],
  'Tak': [], 'Tröskel': ['Höger', 'Vänster'], 'Yttre backspegel': ['Höger', 'Vänster']
};

type MediaFile = {
  file: File; type: 'image' | 'video'; preview?: string; thumbnail?: string;
};

type Uploads = {
  photo_urls: string[];
  video_urls: string[];
  folder: string;
};

type ExistingDamage = {
  db_id: number;
  id: string;
  fullText: string; 
  shortText: string;
  status: 'not_selected' | 'documented' | 'resolved';
  userType?: string; userCarPart?: string; userPosition?: string; userDescription?: string;
  media: MediaFile[];
  uploads: Uploads;
};

type NewDamage = {
  id: string; type: string; carPart: string; position: string; text: string; 
  media: MediaFile[];
  uploads: Uploads;
};

type ConfirmDialogState = {
    isOpen: boolean;
    title?: string;
    text: string;
    confirmButtonVariant?: 'success' | 'danger' | 'primary';
    onConfirm: () => void;
    theme?: 'default' | 'warning';
}

const hasPhoto = (files?: MediaFile[]) => Array.isArray(files) && files.some(f => f?.type === 'image');
const hasVideo = (files?: MediaFile[]) => Array.isArray(files) && files.some(f => f?.type === 'video');

const sanitize = (s: string) => s.replace(/\s/g, '-');

function createFileName(regnr: string, damage: ExistingDamage | NewDamage, index: number): string {
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const time = `kl ${hours}.${minutes}`;

    const isExisting = 'fullText' in damage;
    
    const damageType = isExisting ? (damage as ExistingDamage).userType : (damage as NewDamage).type;
    const part = isExisting ? (damage as ExistingDamage).userCarPart : (damage as NewDamage).carPart;
    const pos = isExisting ? (damage as ExistingDamage).userPosition : (damage as NewDamage).position;

    const nameParts = [
        regnr,
        `${date}, ${time}`,
        damageType,
        part,
        pos
    ];
    
    return sanitize(nameParts.filter(Boolean).join(' - '));
}


async function uploadOne(file: File, reg: string, damageFolder: string, fileName: string): Promise<string> {
    const BUCKET = "damage-photos";
    const ext = file.name.split(".").pop() || "bin";
    const path = `${reg}/${damageFolder}/${fileName}.${ext}`;
    
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
    if (error) throw error;
    
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return data.publicUrl;
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

async function uploadAllForDamage(damage: ExistingDamage | NewDamage, reg: string): Promise<Uploads> {
    const damageFolder = createFileName(reg, damage, 0);
    if (!damage.media || damage.media.length === 0) return { photo_urls: [], video_urls: [], folder: damageFolder };
    
    const { photos, videos } = partitionMediaByType(damage.media);
    
    const photoUploadPromises = photos.map((p, i) => {
        const fileName = `${damageFolder}-${i + 1}`;
        return uploadOne(p, reg, damageFolder, fileName);
    });
    
    const videoUploadPromises = videos.map((v, i) => {
        const fileName = `${damageFolder}-${photos.length + i + 1}`;
        return uploadOne(v, reg, damageFolder, fileName);
    });

    const [photoUploads, videoUploads] = await Promise.all([
        Promise.all(photoUploadPromises),
        Promise.all(videoUploadPromises),
    ]);

    return { photo_urls: photoUploads, video_urls: videoUploads, folder: damageFolder };
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
  const [tankniva, setTankniva] = useState<'återlämnades_fulltankad' | 'tankad_nu' | null>(null);
  const [liters, setLiters] = useState('');
  const [bransletyp, setBransletyp] = useState<'Bensin' | 'Diesel' | null>(null);
  const [literpris, setLiterpris] = useState('');
  const [laddniva, setLaddniva] = useState('');
  const [hjultyp, setHjultyp] = useState<'Sommardäck' | 'Vinterdäck' | null>(null);
  const [behoverRekond, setBehoverRekond] = useState(false);
  const [varningslampaLyser, setVarningslampaLyser] = useState(false);
  const [varningslampaBeskrivning, setVarningslampaBeskrivning] = useState('');
  const [existingDamages, setExistingDamages] = useState<ExistingDamage[]>([]);
  const [insynsskyddOK, setInsynsskyddOK] = useState(false);
  const [dekalDjurRokningOK, setDekalDjurRokningOK] = useState(false);
  const [isskrapaOK, setIsskrapaOK] = useState(false);
  const [pskivaOK, setPskivaOK] = useState(false);
  const [skyltRegplatOK, setSkyltRegplatOK] = useState(false);
  const [dekalGpsOK, setDekalGpsOK] = useState(false);
  const [washed, setWashed] = useState(false);
  const [spolarvatskaOK, setSpolarvatskaOK] = useState(false);
  const [adblueOK, setAdblueOK] = useState(false);
  const [skadekontroll, setSkadekontroll] = useState<'inga_nya_skador' | 'nya_skador' | null>(null);
  const [newDamages, setNewDamages] = useState<NewDamage[]>([]);
  const [preliminarAvslutNotering, setPreliminarAvslutNotering] = useState('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [initialUrlLoadHandled, setInitialUrlLoadHandled] = useState(false);
  const [bilenStarNuOrt, setBilenStarNuOrt] = useState('');
  const [bilenStarNuStation, setBilenStarNuStation] = useState('');
  const [bilenStarNuKommentar, setBilenStarNuKommentar] = useState('');


  // Derived State & Memos
  const normalizedReg = useMemo(() => normalizeReg(regInput), [regInput]);
  const availableStations = useMemo(() => STATIONER[ort] || [], [ort]);
  const availableStationsBilenStarNu = useMemo(() => STATIONER[bilenStarNuOrt] || [], [bilenStarNuOrt]);
  
  const otherChecklistItemsOK = useMemo(() => {
     const common = insynsskyddOK && dekalDjurRokningOK && isskrapaOK && pskivaOK && skyltRegplatOK && dekalGpsOK && spolarvatskaOK;
     return drivmedelstyp === 'bensin_diesel' ? common && adblueOK : common;
  }, [insynsskyddOK, dekalDjurRokningOK, isskrapaOK, pskivaOK, skyltRegplatOK, dekalGpsOK, spolarvatskaOK, adblueOK, drivmedelstyp]);

  const isChecklistComplete = useMemo(() => {
    return washed && otherChecklistItemsOK;
  }, [washed, otherChecklistItemsOK]);

  const formIsValidState = useMemo(() => {
    if (!regInput || !ort || !station || !matarstallning || !hjultyp || !drivmedelstyp || skadekontroll === null || !bilenStarNuOrt || !bilenStarNuStation) return false;
    if (drivmedelstyp === 'bensin_diesel' && (!tankniva || (tankniva === 'tankad_nu' && (!liters || !bransletyp || !literpris)))) return false;
    if (drivmedelstyp === 'elbil' && !laddniva) return false;
    if (skadekontroll === 'nya_skador' && (newDamages.length === 0 || newDamages.some(d => !d.type || !d.carPart || !hasPhoto(d.media) || !hasVideo(d.media)))) return false;
    if (existingDamages.filter(d => d.status === 'documented').some(d => !d.userType || !d.userCarPart || !hasPhoto(d.media))) return false;
    if (varningslampaLyser && !varningslampaBeskrivning.trim()) return false;
    return isChecklistComplete;
  }, [regInput, ort, station, matarstallning, hjultyp, drivmedelstyp, tankniva, liters, bransletyp, literpris, laddniva, skadekontroll, newDamages, existingDamages, isChecklistComplete, varningslampaLyser, varningslampaBeskrivning, bilenStarNuOrt, bilenStarNuStation]);

  const finalPayloadForUI = useMemo(() => ({
      reg: normalizedReg, carModel: vehicleData?.model, matarstallning, hjultyp, rekond: behoverRekond, varningslampa: varningslampaLyser, varningslampaBeskrivning,
      drivmedel: drivmedelstyp, tankning: { tankniva, liters, bransletyp, literpris },
      laddning: { laddniva },
      ort,
      station,
      bilenStarNu: { ort: bilenStarNuOrt, station: bilenStarNuStation, kommentar: bilenStarNuKommentar },
      nya_skador: newDamages,
      dokumenterade_skador: existingDamages.filter(d => d.status === 'documented'),
      åtgärdade_skador: existingDamages.filter(d => d.status === 'resolved'),
      washed: washed,
      otherChecklistItemsOK: otherChecklistItemsOK,
  }), [normalizedReg, vehicleData, matarstallning, hjultyp, behoverRekond, varningslampaLyser, varningslampaBeskrivning, drivmedelstyp, tankniva, liters, bransletyp, literpris, laddniva, ort, station, bilenStarNuOrt, bilenStarNuStation, bilenStarNuKommentar, newDamages, existingDamages, washed, otherChecklistItemsOK]);

  // Datahämtningsfunktion med utökad felhantering
  const fetchVehicleData = useCallback(async (reg: string) => {
    setLoading(true);
    setNotFound(false);
    setVehicleData(null);
    setExistingDamages([]);
    try {
      const normalized = normalizeReg(reg);
      const info = await getVehicleInfo(normalized);
  
      if (info.status === 'NO_MATCH') {
        const proceed = window.confirm(
          '⚠️ Är du säker på att du skrivit in korrekt reg.nr?'
        );
        if (!proceed) {
          setRegInput('');
          setLoading(false);
          return;
        }
      }
  
      setVehicleData(info);
      
      if (info.existing_damages.length > 0) {
          setExistingDamages(info.existing_damages.map(d => ({ 
              db_id: d.id,
              id: Math.random().toString(36).substring(2, 15),
              fullText: d.text,
              shortText: d.text,
              status: 'not_selected',
              media: [],
              uploads: { photo_urls: [], video_urls: [], folder: '' }
          })));
      }
  
      if (info.status === 'PARTIAL_MATCH_DAMAGE_ONLY' || info.status === 'NO_MATCH') {
          setNotFound(true);
      }
  
    } catch (error: any) {
      console.error("Fetch vehicle data error:", error);
      if (error.message.includes('fetch failed') || error.message.includes('NetworkError')) {
        console.error("Network-related error. Check Supabase connection and RLS policies.");
      } else if (error.message.includes('JSON')) {
        console.error("Possible RLS policy issue. The server returned data that couldn't be parsed, often an empty response due to permissions.");
      }
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
      if (error) {
        console.error("Could not fetch registrations via RPC:", error);
      } else if (data) {
        setAllRegistrations(data.map((item: any) => item.regnr));
      }
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
        const normalized = normalizeReg(regFromUrl);
        setRegInput(normalized); 
        fetchVehicleData(normalized);
        setInitialUrlLoadHandled(true);
        return; 
      }
      setInitialUrlLoadHandled(true);
    }

    const normalized = normalizeReg(regInput);

    if (normalized.length < 6) {
      setVehicleData(null);
      setExistingDamages([]);
      setNotFound(false);
      return;
    }

    const timer = setTimeout(() => {
      fetchVehicleData(normalized);
    }, 300);

    return () => clearTimeout(timer);
  }, [regInput, fetchVehicleData, initialUrlLoadHandled]);


  // Handlers
  const handleShowErrors = () => {
    setShowFieldErrors(true);
    const firstError = document.querySelector('.card[data-error="true"], .field[data-error="true"]');
    if (firstError) firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const resetForm = () => {
    setRegInput(''); setVehicleData(null); setExistingDamages([]); setOrt('');
    setStation(''); setMatarstallning(''); setDrivmedelstyp(null); setTankniva(null);
    setLiters(''); setBransletyp(null); setLiterpris(''); setLaddniva('');
    setHjultyp(null); setBehoverRekond(false); setVarningslampaLyser(false); setVarningslampaBeskrivning('');
    setInsynsskyddOK(false);
    setDekalDjurRokningOK(false); setIsskrapaOK(false); setPskivaOK(false);
    setSkyltRegplatOK(false); setDekalGpsOK(false); setWashed(false);
    setSpolarvatskaOK(false); setAdblueOK(false); setSkadekontroll(null);
    setNewDamages([]); setPreliminarAvslutNotering(''); setShowFieldErrors(false);
    setBilenStarNuOrt(''); setBilenStarNuStation(''); setBilenStarNuKommentar('');
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
        const documentedForUpload = existingDamages.filter(d => d.status === 'documented');
        const newForUpload = skadekontroll === 'nya_skador' ? newDamages : [];
        
        const documentedUploadResults = await Promise.all(
            documentedForUpload.map(d => uploadAllForDamage(d, normalizedReg))
        );
        const newUploadResults = await Promise.all(
            newForUpload.map(d => uploadAllForDamage(d, normalizedReg))
        );

        const updatedExistingDamages = existingDamages.map(d => {
            const index = documentedForUpload.findIndex(up => up.id === d.id);
            if (index > -1) {
                return { ...d, uploads: documentedUploadResults[index] };
            }
            return d;
        });
        setExistingDamages(updatedExistingDamages);

        const updatedNewDamages = newDamages.map((d, i) => {
            return { ...d, uploads: newUploadResults[i] };
        });
        setNewDamages(updatedNewDamages);

        const resolvedDamages = updatedExistingDamages.filter(d => d.status === 'resolved');

        const submissionPayload = {
            regnr: normalizedReg,
            status: vehicleData?.status,
            carModel: vehicleData?.model,
            ort,
            station,
            matarstallning,
            drivmedel: drivmedelstyp,
            tankning: { tankniva, liters, bransletyp, literpris },
            laddning: { laddniva },
            hjultyp,
            rekond: behoverRekond,
            varningslampa: varningslampaLyser,
            varningslampa_beskrivning: varningslampaBeskrivning,
            bilen_star_nu: { ort: bilenStarNuOrt, station: bilenStarNuStation, kommentar: bilenStarNuKommentar },
            notering: preliminarAvslutNotering,
            incheckare: firstName,
            timestamp: new Date().toISOString(),
            dokumenterade_skador: updatedExistingDamages
                .filter(d => d.status === 'documented')
                .map(({ media, ...rest }) => rest),
            nya_skador: updatedNewDamages
                .map(({ media, ...rest }) => rest),
            åtgärdade_skador: resolvedDamages
                .map(({ media, ...rest }) => rest),
        };
      
        await notifyCheckin({
            region: 'Syd',
            subjectBase: `${normalizedReg} - ${ort} / ${station}`,
            htmlBody: '',
            target: 'station',
            meta: submissionPayload
        });

        setShowSuccessModal(true);
        setTimeout(() => { setShowSuccessModal(false); resetForm(); }, 3000);
    } catch (error) {
        console.error("Final save failed:", error);
        alert("Något gick fel vid inskickningen. Vänligen försök igen. Detaljer finns i konsolen.");
    } finally {
        setIsFinalSaving(false);
    }
  };

  const handleExistingDamageAction = (id: string, action: 'document' | 'resolve', shortText: string) => {
    if (action === 'resolve') {
        setConfirmDialog({
            isOpen: true,
            text: `Är du säker på att du vill markera skadan "${shortText}" som åtgärdad/hittas ej?`,
            confirmButtonVariant: 'success',
            onConfirm: () => {
                setExistingDamages(damages => damages.map(d => {
                    if (d.id !== id) return d;
                    return d.status === 'resolved' ? { ...d, status: 'not_selected' } : { ...d, status: 'resolved' };
                }));
            }
        });
    } else {
        setExistingDamages(damages => damages.map(d => d.id === id ? { ...d, status: d.status === 'documented' ? 'not_selected' : 'documented' } : d));
    }
  };

  const handleRekondClick = () => {
    if (!behoverRekond) {
        setConfirmDialog({
            isOpen: true,
            title: 'Bekräfta rekond',
            text: 'Är du säker på att bilen behöver rekond? En extra avgift kan tillkomma.',
            confirmButtonVariant: 'danger',
            onConfirm: () => setBehoverRekond(true),
            theme: 'warning'
        });
    } else {
        setBehoverRekond(false);
    }
  };
  
  const handleVarningslampaClick = () => {
    if (!varningslampaLyser) {
        setConfirmDialog({
            isOpen: true,
            title: 'Bekräfta Varningslampa',
            text: 'Är du säker på att en varningslampa lyser? Detta är en allvarlig indikation.',
            confirmButtonVariant: 'danger',
            onConfirm: () => setVarningslampaLyser(true),
            theme: 'warning'
        });
    } else {
        setVarningslampaLyser(false);
        setVarningslampaBeskrivning('');
    }
  };

  const updateDamageField = (id: string, field: string, value: any, isExisting: boolean) => {
    const updater = isExisting ? setExistingDamages : setNewDamages;
    updater((damages: any[]) => damages.map(d => d.id === id ? { ...d, [field]: value } : d));
  };

  const handleMediaUpdate = async (id: string, files: FileList, isExisting: boolean) => {
    const processed = await processFiles(files);
    const updater = isExisting ? setExistingDamages : setNewDamages;
    updater((damages: any[]) => damages.map(d => d.id === id ? { ...d, media: [...(d.media || []), ...processed] } : d));
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

  const addDamage = () => {
    setNewDamages(prev => [...prev, { 
        id: `new_${Date.now()}`, type: '', carPart: '', position: '', text: '', 
        media: [], uploads: { photo_urls: [], video_urls: [], folder: '' } 
    }]);
  };

  const removeDamage = (id: string) => {
    setConfirmDialog({
        isOpen: true,
        title: 'Ta bort skada',
        text: 'Är du säker på att du vill ta bort denna nya skada?',
        confirmButtonVariant: 'danger',
        onConfirm: () => setNewDamages(prev => prev.filter(d => d.id !== id))
    });
  };
  
  const handleLaddningChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === '') {
        setLaddniva('');
        return;
    }
    const numValue = parseInt(value, 10);
    if (numValue > 100) {
        setLaddniva('100');
    } else {
        setLaddniva(value);
    }
  };

  return (
    <div className="checkin-form">
      <GlobalStyles />
      {isFinalSaving && <SpinnerOverlay />}
      {showSuccessModal && <SuccessModal firstName={firstName} />}
      {showConfirmModal && <ConfirmModal payload={finalPayloadForUI} onConfirm={confirmAndSubmit} onCancel={() => setShowConfirmModal(false)} />}
      <ActionConfirmDialog
        state={confirmDialog}
        onClose={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
      />
      
      <div className="main-header">
        <img src={MABI_LOGO_URL} alt="MABI Logo" className="main-logo" />
        {firstName && <p className="user-info">Inloggad: {firstName}</p>}
      </div>

      <Card data-error={showFieldErrors && !regInput}>
        <SectionHeader title="Fordon" />
        <div style={{ position: 'relative' }}>
          <Field label="Registreringsnummer *">
            <input 
              type="text" 
              value={regInput} 
              onChange={(e) => setRegInput(e.target.value.toUpperCase())}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              placeholder="ABC 123" 
              autoComplete="off" 
              className="reg-input" 
            />
          </Field>
          {showSuggestions && suggestions.length > 0 && (
            <div className="suggestions-dropdown">
              {suggestions.map(s => 
                <div 
                  key={s} 
                  className="suggestion-item"
                  onMouseDown={() => {
                    setRegInput(s);
                    setShowSuggestions(false);
                  }}
                >
                  {s}
                </div>
              )}
            </div>
          )}
        </div>
        {loading && <p>Hämtar fordonsdata...</p>}
        {notFound && !loading && <p className="error-text">Registreringsnumret saknas i masterlistan. Kontrollera stavning eller fortsätt för att skapa en ny post.</p>}
        {vehicleData && (
          <div className="info-box">
            <div className='info-grid'>
              <InfoRow label="Bilmodell" value={vehicleData.model || '---'} />
              <InfoRow label="Hjulförvaring" value={vehicleData.wheel_storage_location || '---'} />
              <InfoRow label="Saludatum" value={vehicleData.saludatum || '---'} />
            </div>
            {existingDamages.length > 0 && (
              <div className="damage-list-info">
                <span className="info-label">Befintliga skador ({existingDamages.length})</span>
                {existingDamages.map(d => <div key={d.id} className="damage-list-item">- {d.shortText}</div>)}
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

      <Card data-error={showFieldErrors && (!matarstallning || !hjultyp || !drivmedelstyp || (drivmedelstyp === 'bensin_diesel' && !tankniva) || (tankniva === 'tankad_nu' && (!liters || !bransletyp || !literpris)) || (drivmedelstyp === 'elbil' && !laddniva))}>
        <SectionHeader title="Fordonsstatus" />
        <SubSectionHeader title="Mätarställning" />
        <Field label="Mätarställning (km) *"><input type="number" value={matarstallning} onChange={e => setMatarstallning(e.target.value)} placeholder="12345" /></Field>
        <SubSectionHeader title="Däck som sitter på" />
        <Field label="Däcktyp *"><div className="grid-2-col"><ChoiceButton onClick={() => setHjultyp('Sommardäck')} isActive={hjultyp === 'Sommardäck'} isSet={hjultyp !== null}>Sommardäck</ChoiceButton><ChoiceButton onClick={() => setHjultyp('Vinterdäck')} isActive={hjultyp === 'Vinterdäck'} isSet={hjultyp !== null}>Vinterdäck</ChoiceButton></div></Field>
        <SubSectionHeader title="Tankning/Laddning" />
        <Field label="Drivmedelstyp *"><div className="grid-2-col"><ChoiceButton onClick={() => setDrivmedelstyp('bensin_diesel')} isActive={drivmedelstyp === 'bensin_diesel'} isSet={drivmedelstyp !== null}>Bensin/Diesel</ChoiceButton><ChoiceButton onClick={() => setDrivmedelstyp('elbil')} isActive={drivmedelstyp === 'elbil'} isSet={drivmedelstyp !== null}>Elbil</ChoiceButton></div></Field>
        {drivmedelstyp === 'bensin_diesel' && (<>
            <Field label="Tankstatus *"><div className="grid-2-col">
                <ChoiceButton onClick={() => setTankniva('återlämnades_fulltankad')} isActive={tankniva === 'återlämnades_fulltankad'} isSet={tankniva !== null}>Återlämnades fulltankad</ChoiceButton>
                <ChoiceButton onClick={() => setTankniva('tankad_nu')} isActive={tankniva === 'tankad_nu'} isSet={tankniva !== null}>Tankad nu av MABI</ChoiceButton>
            </div></Field>
            {tankniva === 'tankad_nu' && <div className="grid-3-col">
                <Field label="Antal liter *"><input type="number" value={liters} onChange={e => setLiters(e.target.value)} placeholder="50" /></Field>
                <Field label="Bränsletyp *"><div className="fuel-type-buttons">
                    <ChoiceButton onClick={() => setBransletyp('Bensin')} isActive={bransletyp === 'Bensin'} isSet={bransletyp !== null}>Bensin</ChoiceButton>
                    <ChoiceButton onClick={() => setBransletyp('Diesel')} isActive={bransletyp === 'Diesel'} isSet={bransletyp !== null}>Diesel</ChoiceButton>
                </div></Field>
                <Field label="Literpris *"><input type="number" value={literpris} onChange={e => setLiterpris(e.target.value)} placeholder="20.50" /></Field>
            </div>}
        </>)}
        {drivmedelstyp === 'elbil' && (<Field label="Laddningsnivå vid återlämning (%) *"><input type="number" value={laddniva} onChange={handleLaddningChange} placeholder="0-100" /></Field>)}
      </Card>

      <Card data-error={showFieldErrors && (skadekontroll === null || (skadekontroll === 'nya_skador' && (newDamages.length === 0 || newDamages.some(d => !d.type || !d.carPart || !hasPhoto(d.media) || !hasVideo(d.media)))) || (existingDamages.filter(d => d.status === 'documented').some(d => !d.userType || !d.userCarPart || !hasPhoto(d.media))))}>
        <SectionHeader title="Skador" />
        <SubSectionHeader title="Befintliga skador" />
        {vehicleData && existingDamages.length > 0 ? existingDamages.map(d => <DamageItem key={d.id} damage={d} isExisting={true} onUpdate={updateDamageField} onMediaUpdate={handleMediaUpdate} onMediaRemove={handleMediaRemove} onAction={handleExistingDamageAction} />) : <p>Inga kända skador.</p>}
        <SubSectionHeader title="Nya skador" />
        <Field label="Har bilen några nya skador? *"><div className="grid-2-col">
            <ChoiceButton onClick={() => { setSkadekontroll('inga_nya_skador'); setNewDamages([]); }} isActive={skadekontroll === 'inga_nya_skador'} isSet={skadekontroll !== null}>Inga nya skador</ChoiceButton>
            <ChoiceButton onClick={() => { setSkadekontroll('nya_skador'); if (newDamages.length === 0) addDamage(); }} isActive={skadekontroll === 'nya_skador'} isSet={skadekontroll !== null}>Ja, nya skador finns</ChoiceButton>
        </div></Field>
        {skadekontroll === 'nya_skador' && (<>{newDamages.map(d => <DamageItem key={d.id} damage={d} isExisting={false} onUpdate={updateDamageField} onMediaUpdate={handleMediaUpdate} onMediaRemove={handleMediaRemove} onRemove={removeDamage} />)}<Button onClick={addDamage} variant="secondary" style={{marginTop: '1rem'}}>Lägg till ytterligare en skada</Button></>)}
      </Card>

      <Card data-error={showFieldErrors && !isChecklistComplete || (varningslampaLyser && !varningslampaBeskrivning.trim())}>
        <SectionHeader title="Checklista & Status" />
        <div className="special-buttons-wrapper">
            <div className="special-button-item">
                <ChoiceButton onClick={handleRekondClick} isActive={behoverRekond} className="rekond-checkbox">Behöver rekond</ChoiceButton>
            </div>
            <div className="special-button-item">
                <ChoiceButton onClick={handleVarningslampaClick} isActive={varningslampaLyser} className="warning-light-checkbox">Varningslampa lyser</ChoiceButton>
                {varningslampaLyser && (
                    <div className="field" style={{marginTop: '1rem'}} data-error={showFieldErrors && !varningslampaBeskrivning.trim()}>
                        <label>Specificera varningslampa *</label>
                        <textarea 
                            value={varningslampaBeskrivning} 
                            onChange={e => setVarningslampaBeskrivning(e.target.value)} 
                            placeholder="Vilken eller vilka lampor?" 
                            rows={2}
                        ></textarea>
                    </div>
                )}
            </div>
        </div>
        <SubSectionHeader title="Allt måste vara OK för att slutföra" />
        <div className="grid-2-col">
          <ChoiceButton onClick={() => setWashed(!washed)} isActive={washed}>Tvättad</ChoiceButton>
          <ChoiceButton onClick={() => setInsynsskyddOK(!insynsskyddOK)} isActive={insynsskyddOK}>Insynsskydd finns</ChoiceButton>
          <ChoiceButton onClick={() => setDekalDjurRokningOK(!dekalDjurRokningOK)} isActive={dekalDjurRokningOK}>Dekal "Djur/rökning" finns</ChoiceButton>
          <ChoiceButton onClick={() => setIsskrapaOK(!isskrapaOK)} isActive={isskrapaOK}>Isskrapa finns</ChoiceButton>
          <ChoiceButton onClick={() => setPskivaOK(!pskivaOK)} isActive={pskivaOK}>P-skiva finns</ChoiceButton>
          <ChoiceButton onClick={() => setSkyltRegplatOK(!skyltRegplatOK)} isActive={skyltRegplatOK}>MABI-skylt reg.plåt finns</ChoiceButton>
          <ChoiceButton onClick={() => setDekalGpsOK(!dekalGpsOK)} isActive={dekalGpsOK}>Dekal GPS finns</ChoiceButton>
          <ChoiceButton onClick={() => setSpolarvatskaOK(!spolarvatskaOK)} isActive={spolarvatskaOK}>Spolarvätska OK</ChoiceButton>
          {drivmedelstyp === 'bensin_diesel' && <ChoiceButton onClick={() => setAdblueOK(!adblueOK)} isActive={adblueOK}>AdBlue OK (endast diesel)</ChoiceButton>}
        </div>
      </Card>

      <Card data-error={showFieldErrors && (!bilenStarNuOrt || !bilenStarNuStation)}>
        <SectionHeader title="Var är bilen nu?" />
        <div className="grid-2-col">
          <Field label="Ort *"><select value={bilenStarNuOrt} onChange={e => { setBilenStarNuOrt(e.target.value); setBilenStarNuStation(''); }}><option value="">Välj ort</option>{ORTER.map(o => <option key={o} value={o}>{o}</option>)}</select></Field>
          <Field label="Station *"><select value={bilenStarNuStation} onChange={e => setBilenStarNuStation(e.target.value)} disabled={!bilenStarNuOrt}><option value="">Välj station</option>{availableStationsBilenStarNu.map(s => <option key={s} value={s}>{s}</option>)}</select></Field>
        </div>
        <Field label="Parkeringsinfo (frivilligt)">
            <textarea value={bilenStarNuKommentar} onChange={e => setBilenStarNuKommentar(e.target.value)} placeholder="Ange parkering, nyckelnummer etc." rows={2}></textarea>
        </Field>
      </Card>

      <Card>
        <Field label="Övriga kommentarer (frivilligt)">
          <textarea value={preliminarAvslutNotering} onChange={e => setPreliminarAvslutNotering(e.target.value)} placeholder="Övrig info som inte passar någon annanstans..." rows={4}></textarea>
        </Field>
      </Card>

      <div className="form-actions">
        <Button onClick={handleCancel} variant="secondary">Avbryt</Button>
        <Button onClick={formIsValidState ? () => setShowConfirmModal(true) : handleShowErrors} disabled={isFinalSaving || !regInput} variant={formIsValidState ? 'success' : 'disabled'}>
          {!formIsValidState ? 'Visa saknad information' : 'Slutför incheckning'}
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

const Button: React.FC<React.PropsWithChildren<{ onClick?: () => void, variant?: string, disabled?: boolean, style?: object, className?: string }>> = ({ onClick, variant = 'primary', disabled, children, style, className }) => (
  <button onClick={onClick} className={`btn ${variant} ${className || ''}`} disabled={disabled} style={style}>{children}</button>
);

const SuccessModal: React.FC<{ firstName: string }> = ({ firstName }) => (
  <>
    <div className="modal-overlay" />
    <div className="modal-content success-modal">
      <div className="success-icon">✓</div>
      <h3>Tack {firstName}!</h3>
      <p>Incheckningen har skickats.</p>
    </div>
  </>
);

const SpinnerOverlay = () => (
    <div className="modal-overlay spinner-overlay">
        <div className="spinner"></div>
        <p>Skickar in...</p>
    </div>
);

const ConfirmModal: React.FC<{ payload: any; onConfirm: () => void; onCancel: () => void; }> = ({ payload, onConfirm, onCancel }) => {
    const renderDamageList = (damages: any[], title: string) => {
        if (!damages || damages.length === 0) return null;
        
        return (
            <div className="confirm-damage-section">
                <h4>{title}</h4>
                <ul>
                    {damages.map((d: any) => {
                        const type = d.type || d.userType;
                        const carPart = d.carPart || d.userCarPart;
                        const position = d.position || d.userPosition;
                        const text = d.text || d.userDescription || d.fullText;
                        
                        let damageString = [type, carPart, position].filter(Boolean).join(' - ');
                        if (!damageString) damageString = text;
                        else if (text && damageString !== text) damageString += ` (${text})`;

                        return <li key={d.id}>{damageString}</li>;
                    })}
                </ul>
            </div>
        );
    };

    const getTankningText = () => {
        if (payload.drivmedel === 'bensin_diesel') {
            const tankText = payload.tankning.tankniva === 'tankad_nu'
                ? `Upptankad av MABI (${payload.tankning.liters}L ${payload.tankning.bransletyp} @ ${payload.tankning.literpris} kr/L)`
                : 'Återlämnades fulltankad';
            return <p>⛽ <strong>Tankning:</strong> {tankText}</p>;
        }
        if (payload.drivmedel === 'elbil') {
            return <p>⚡ <strong>Laddning:</strong> {payload.laddning.laddniva}%</p>;
        }
        return null;
    };
    
    const showChargeWarning = payload.drivmedel === 'elbil' && parseInt(payload.laddning.laddniva, 10) < 95;

    return (
        <>
            <div className="modal-overlay" />
            <div className="modal-content confirm-modal">
                {showChargeWarning && (
                    <div className="charge-warning-banner">
                        Säkerställ att bilen omedelbart sätts på laddning!
                    </div>
                )}
                <div className="confirm-header">
                    <h3 className="confirm-modal-title">Bekräfta incheckning</h3>
                    <p className="confirm-vehicle-info">{payload.reg} - {payload.carModel || '---'}</p>
                    <div className="confirm-warnings-wrapper">
                        {payload.varningslampa && (
                            <p className="warning-highlight">Varningslampa lyser: {payload.varningslampaBeskrivning || 'Ej specificerat'}</p>
                        )}
                        {payload.rekond && (
                            <p className="warning-highlight rekond-highlight">Behöver rekond!</p>
                        )}
                    </div>
                </div>
                
                <div className="confirm-details">
                    <div className="confirm-summary">
                        <p>📍 <strong>Incheckad vid:</strong> {payload.ort} / {payload.station}</p>
                         {payload.bilenStarNu && <p>✅ <strong>Bilen står nu vid:</strong> {payload.bilenStarNu.ort} / {payload.bilenStarNu.station}</p>}
                         {payload.bilenStarNu?.kommentar && <p style={{paddingLeft: '1.5rem'}}><small><strong>Parkeringsinfo:</strong> {payload.bilenStarNu.kommentar}</small></p>}
                    </div>
                    
                    {renderDamageList(payload.nya_skador, '💥 Nya skador')}
                    {renderDamageList(payload.dokumenterade_skador, '📋 Dokumenterade skador')}
                    {renderDamageList(payload.åtgärdade_skador, '✅ Åtgärdade skador')}
                    
                    <div className="confirm-summary">
                        <p>🛣️ <strong>Mätarställning:</strong> {payload.matarstallning} km</p>
                        {getTankningText()}
                        <p>🛞 <strong>Hjul:</strong> {payload.hjultyp}</p>
                        {payload.washed && <p><strong>✅ Tvättad</strong></p>}
                        {payload.otherChecklistItemsOK && <p><strong>✅ Övriga kontroller OK!</strong></p>}
                    </div>
                </div>

                <div className="modal-actions">
                    <Button onClick={onCancel} variant="secondary">Avbryt</Button>
                    <Button onClick={onConfirm} variant="success">Bekräfta och skicka</Button>
                </div>
            </div>
        </>
    );
};


const DamageItem: React.FC<{
  damage: ExistingDamage | NewDamage; isExisting: boolean;
  onUpdate: (id: string, field: string, value: any, isExisting: boolean) => void;
  onMediaUpdate: (id: string, files: FileList, isExisting: boolean) => void;
  onMediaRemove: (id: string, index: number, isExisting: boolean) => void;
  onAction?: (id: string, action: 'document' | 'resolve', shortText: string) => void;
  onRemove?: (id: string) => void;
}> = ({ damage, isExisting, onUpdate, onMediaUpdate, onMediaRemove, onAction, onRemove }) => {
  const isDocumented = isExisting && (damage as ExistingDamage).status === 'documented';
  const resolved = isExisting && (damage as ExistingDamage).status === 'resolved';

  const commonProps = {
    type: isExisting ? (damage as ExistingDamage).userType : (damage as NewDamage).type,
    carPart: isExisting ? (damage as ExistingDamage).userCarPart : (damage as NewDamage).carPart,
    position: isExisting ? (damage as ExistingDamage).userPosition : (damage as NewDamage).position,
    description: isExisting ? (damage as ExistingDamage).userDescription : (damage as NewDamage).text,
  };

  const fieldKey = (f: string) => isExisting ? `user${f.charAt(0).toUpperCase() + f.slice(1)}` : f;

  return (
    <div className={`damage-item ${resolved ? 'resolved' : ''}`}>
      <div className="damage-item-header">
        <span>{isExisting ? (damage as ExistingDamage).shortText : 'Ny skada'}</span>
        {isExisting && onAction && (
          <div className="damage-item-actions">
            <Button onClick={() => onAction(damage.id, 'document', (damage as ExistingDamage).shortText)} variant={isDocumented ? 'success' : 'secondary'}>Dokumentera</Button>
            <Button onClick={() => onAction(damage.id, 'resolve', (damage as ExistingDamage).shortText)} variant={resolved ? 'warning' : 'secondary'}>Åtgärdad/Hittas ej</Button>
          </div>
        )}
        {!isExisting && onRemove && <Button onClick={() => onRemove(damage.id)} variant="danger">Ta bort</Button>}
      </div>
      {(isDocumented || !isExisting) && !resolved && (
        <div className="damage-details">
          <div className="grid-3-col">
            <Field label="Typ av skada *"><select value={commonProps.type || ''} onChange={e => onUpdate(damage.id, fieldKey('type'), e.target.value, isExisting)}><option value="">Välj typ</option>{DAMAGE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></Field>
            <Field label="Placering *"><select value={commonProps.carPart || ''} onChange={e => onUpdate(damage.id, fieldKey('carPart'), e.target.value, isExisting)}><option value="">Välj del</option>{Object.keys(CAR_PARTS).map(p => <option key={p} value={p}>{p}</option>)}</select></Field>
            <Field label="Position"><select value={commonProps.position || ''} onChange={e => onUpdate(damage.id, fieldKey('position'), e.target.value, isExisting)} disabled={!CAR_PARTS[commonProps.carPart || ''] || CAR_PARTS[commonProps.carPart || ''].length === 0}><option value="">Välj position</option>{(CAR_PARTS[commonProps.carPart || ''] || []).map(pos => <option key={pos} value={pos}>{pos}</option>)}</select></Field>
          </div>
          <Field label="Beskrivning (frivilligt)"><textarea value={commonProps.description || ''} onChange={e => onUpdate(damage.id, isExisting ? 'userDescription' : 'text', e.target.value, isExisting)} placeholder="Frivillig beskrivning av skadan" rows={2}></textarea></Field>
          <div className="media-section">
            <MediaUpload id={`photo-${damage.id}`} onUpload={files => onMediaUpdate(damage.id, files, isExisting)} hasFile={hasPhoto(damage.media)} fileType="image" label="Foto *" />
            <MediaUpload id={`video-${damage.id}`} onUpload={files => onMediaUpdate(damage.id, files, isExisting)} hasFile={hasVideo(damage.media)} fileType="video" label={isExisting ? "Video (frivilligt)" : "Video *"} isOptional={isExisting} />
          </div>
          <div className="media-previews">
            {damage.media?.map((m, i) => <MediaButton key={i} onRemove={() => onMediaRemove(damage.id, i, isExisting)}><img src={m.thumbnail || m.preview} alt="preview" /></MediaButton>)}
          </div>
        </div>
      )}
    </div>
  );
};

const MediaUpload: React.FC<{ id: string, onUpload: (files: FileList) => void, hasFile: boolean, fileType: 'image' | 'video', label: string, isOptional?: boolean }> = ({ id, onUpload, hasFile, fileType, label, isOptional }) => {
    let className = 'media-label';
    if (hasFile) {
        className += ' active';
    } else if (isOptional) {
        className += ' optional';
    } else {
        className += ' mandatory';
    }

    const buttonText = hasFile
        ? `Lägg till ${fileType === 'image' ? 'fler foton' : 'fler videor'}`
        : label;

    return (
      <div className="media-upload">
        <label htmlFor={id} className={className}>{buttonText}</label>
        <input id={id} type="file" accept={`${fileType}/*`} capture="environment" onChange={e => e.target.files && onUpload(e.target.files)} style={{ display: 'none' }} multiple />
      </div>
    );
};

const MediaButton: React.FC<React.PropsWithChildren<{ onRemove?: () => void }>> = ({ children, onRemove }) => (
  <div className="media-btn">
    {children}
    {onRemove && <button onClick={onRemove} className="remove-media-btn">×</button>}
  </div>
);

const ChoiceButton: React.FC<{onClick: () => void, isActive: boolean, children: React.ReactNode, className?: string, isSet?: boolean}> = ({ onClick, isActive, children, className, isSet }) => (
    <button onClick={onClick} className={`choice-btn ${isActive ? 'active' : ''} ${isSet && !isActive ? 'disabled-choice' : ''} ${className || ''}`}>{children}</button>
);

const ActionConfirmDialog: React.FC<{ state: ConfirmDialogState, onClose: () => void }> = ({ state, onClose }) => {
    if (!state.isOpen) return null;

    const handleConfirm = () => {
        state.onConfirm();
        onClose();
    };

    const themeClass = state.theme ? `theme-${state.theme}` : '';

    return (
        <>
            <div className="modal-overlay" onClick={onClose} />
            <div className={`modal-content confirm-modal ${themeClass}`}>
                {state.title === 'Bekräfta rekond' && <h3><strong>Bekräfta rekond ⚠️</strong></h3>}
                {state.title === 'Bekräfta Varningslampa' && <h3><strong>Bekräfta Varningslampa ⚠️</strong></h3>}
                {state.title && !['Bekräfta rekond', 'Bekräfta Varningslampa'].includes(state.title) && <h3>{state.title}</h3>}
                <p style={{textAlign: 'center', marginBottom: '1.5rem'}}>{state.text}</p>
                <div className="modal-actions">
                    <Button onClick={onClose} variant="secondary">Avbryt</Button>
                    <Button onClick={handleConfirm} variant={state.confirmButtonVariant || 'danger'}>Bekräfta</Button>
                </div>
            </div>
        </>
    );
};

const GlobalStyles = () => (
    <style jsx global>{`
        :root {
          --color-bg: #f8fafc; --color-card: #ffffff; --color-text: #1f2937; --color-text-secondary: #6b7280;
          --color-primary: #2563eb; --color-primary-light: #eff6ff; --color-success: #16a34a; --color-success-light: #f0fdf4;
          --color-danger: #dc2626; --color-danger-light: #fef2f2; --color-warning: #f59e0b; --color-warning-light: #fffbeb;
          --color-border: #e5e7eb; --color-border-focus: #3b82f6; --color-disabled: #a1a1aa; --color-disabled-light: #f4f4f5;
          --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05); --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
        }
        body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; background-color: var(--color-bg); color: var(--color-text); margin: 0; padding: 0; }
        .checkin-form { max-width: 700px; margin: 0 auto; padding: 1rem; box-sizing: border-box; }
        .main-header { text-align: center; margin-bottom: 1.5rem; }
        .main-logo { max-width: 150px; height: auto; margin: 0 auto 1rem auto; display: block; }
        .user-info { font-weight: 500; color: var(--color-text-secondary); margin: 0; }
        .card { background-color: var(--color-card); padding: 1.5rem; border-radius: 12px; margin-bottom: 1.5rem; box-shadow: var(--shadow-md); border: 2px solid transparent; transition: border 0.2s; }
        .card[data-error="true"] { border: 2px solid var(--color-danger); }
        .field[data-error="true"] textarea { border: 2px solid var(--color-danger) !important; }
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
        .suggestions-dropdown { position: absolute; top: 100%; left: 0; right: 0; background-color: white; border: 1px solid var(--color-border); border-radius: 6px; z-index: 10; box-shadow: var(--shadow-md); max-height: 200px; overflow-y: auto; }
        .suggestion-item { padding: 0.75rem; cursor: pointer; }
        .suggestion-item:hover { background-color: var(--color-primary-light); }
        .error-text { color: var(--color-danger); }
        .info-box { margin-top: 1rem; padding: 1rem; background-color: var(--color-primary-light); border-radius: 8px; }
        .info-grid { display: grid; grid-template-columns: auto 1fr; gap: 0.5rem 1rem; }
        .info-label { font-weight: 600; font-size: 0.875rem; color: #1e3a8a; }
        .info-grid > span { font-size: 0.875rem; align-self: center; }
        .damage-list-info { margin-top: 1rem; grid-column: 1 / -1; border-top: 1px solid #dbeafe; padding-top: 0.75rem; }
        .damage-list-info .info-label { display: block; margin-bottom: 0.25rem; }
        .damage-list-item { padding-left: 1rem; line-height: 1.4; font-size: 0.875rem;}
        .grid-2-col { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; }
        .grid-3-col { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; margin-top: 1rem; }
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
        .choice-btn { display: flex; align-items: center; justify-content: center; width: 100%; padding: 0.85rem 1rem; border-radius: 8px; border: 2px solid var(--color-border); background-color: var(--color-card); cursor: pointer; transition: all 0.2s; text-align: center; font-weight: 500; }
        .choice-btn:hover { filter: brightness(1.05); }
        .choice-btn.active { border-color: var(--color-success); background-color: var(--color-success-light); color: var(--color-success); }
        .choice-btn.disabled-choice { border-color: var(--color-border); background-color: var(--color-bg); color: var(--color-disabled); cursor: default; }
        .rekond-checkbox { border-color: var(--color-warning) !important; background-color: var(--color-warning-light) !important; color: #92400e !important; }
        .rekond-checkbox.active { border-color: var(--color-danger) !important; background-color: var(--color-danger) !important; color: white !important; }
        .warning-light-checkbox { border-color: var(--color-warning) !important; background-color: var(--color-warning-light) !important; color: #92400e !important; }
        .warning-light-checkbox.active { border-color: var(--color-danger) !important; background-color: var(--color-danger) !important; color: white !important; }
        .warning-highlight { background-color: #dc2626; color: white; font-weight: bold; padding: 0.5rem 0.75rem; border-radius: 6px; display: inline-block; margin-top: 0.5rem; }
        .special-buttons-wrapper { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem; align-items: start; }
        .special-button-item { display: flex; flex-direction: column; }
        .damage-item { border: 1px solid var(--color-border); border-radius: 8px; margin-bottom: 1rem; overflow: hidden; }
        .damage-item.resolved { opacity: 0.6; background-color: var(--color-warning-light); }
        .damage-item-header { display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 1rem; background-color: #f9fafb; font-weight: 600; flex-wrap: wrap; gap: 0.5rem; }
        .damage-item-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
        .damage-details { padding: 1rem; border-top: 1px solid var(--color-border); }
        .media-section { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 1rem; }
        .media-label { display: block; text-align: center; padding: 1.5rem 1rem; border: 2px dashed; border-radius: 8px; cursor: pointer; transition: all 0.2s; font-weight: 600; }
        .media-label:hover { filter: brightness(0.95); }
        .media-label.active { border-style: solid; border-color: var(--color-success); background-color: var(--color-success-light); color: var(--color-success); }
        .media-label.mandatory { border-color: var(--color-danger); background-color: var(--color-danger-light); color: var(--color-danger); }
        .media-label.optional { border-color: var(--color-warning); background-color: var(--color-warning-light); color: #92400e; }
        .media-previews { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 1rem; }
        .media-btn { position: relative; width: 70px; height: 70px; border-radius: 8px; overflow: hidden; background-color: var(--color-border); }
        .media-btn img { width: 100%; height: 100%; object-fit: cover; }
        .remove-media-btn { position: absolute; top: 2px; right: 2px; width: 22px; height: 22px; border-radius: 50%; background-color: var(--color-danger); color: white; border: 2px solid white; display: flex; align-items: center; justify-content: center; font-size: 1rem; line-height: 1; cursor: pointer; }
        .remove-media-btn:hover { background-color: #b91c1c; }
        .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background-color: rgba(0,0,0,0.5); z-index: 100; }
        .modal-content { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background-color: white; padding: 2rem; border-radius: 12px; z-index: 101; box-shadow: var(--shadow-md); max-width: 90vw; max-height: 90vh; overflow-y: auto; width: 600px; }
        .modal-content.success-modal { text-align: center; }
        .modal-content.theme-warning { background-color: var(--color-warning-light); border: 1px solid var(--color-warning); text-align: center; }
        .success-icon { width: 60px; height: 60px; border-radius: 50%; background-color: var(--color-success); color: white; display: flex; align-items: center; justify-content: center; font-size: 2rem; margin: 0 auto 1rem; }
        .confirm-modal { text-align: left; }
        .confirm-header { text-align: center; margin-bottom: 1.5rem; padding-bottom: 1.5rem; border-bottom: 1px solid var(--color-border); }
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
    `}</style>
)

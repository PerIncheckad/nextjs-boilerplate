'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchDamageCard, normalizeReg } from '@/lib/damages';
import { notifyCheckin } from '@/lib/notify';


// =================================================================
// 1. DATA, TYPES & HELPERS (från originalfilen)
// =================================================================

const ORT_TILL_REGION: Record<string, 'NORR' | 'MITT' | 'SYD'> = {
  Varberg: 'NORR', Falkenberg: 'NORR', Halmstad: 'NORR',
  Helsingborg: 'MITT', Ängelholm: 'MITT', Lund: 'SYD',
  Sturup: 'SYD', Malmö: 'SYD', Trelleborg: 'SYD',
};

const ORTER = ['Malmö', 'Helsingborg', 'Ängelholm', 'Halmstad', 'Falkenberg', 'Trelleborg', 'Varberg', 'Lund'].sort();

const STATIONER: Record<string, string[]> = {
  'Malmö': ['Ford Malmö', 'Mechanum', 'Malmö Automera', 'Mercedes Malmö', 'Werksta St Bernstorp', 'Werksta Malmö Hamn', 'Hedbergs Malmö', 'Hedin Automotive Burlöv', 'Sturup'],
  'Helsingborg': ['HBSC Helsingborg', 'Ford Helsingborg', 'Transport Helsingborg', 'S. Jönsson', 'BMW Helsingborg', 'KIA Helsingborg', 'Euromaster Helsingborg', 'B/S Klippan', 'B/S Munka-Ljungby', 'B/S Helsingborg', 'Werksta Helsingborg', 'Båstad'],
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

type CarData = {
  regnr: string; brand_model: string | null; damage_text: string | null; damage_location: string | null;
  damage_notes: string | null; wheelstorage: string | null; saludatum: string | null;
};

type MediaFile = {
  file: File; type: 'image' | 'video'; preview?: string; thumbnail?: string;
};

type ExistingDamage = {
  id: string; skadetyp: string; plats: string; notering: string; fullText: string; shortText: string;
  status: 'not_selected' | 'documented' | 'resolved';
  userType?: string; userCarPart?: string; userPosition?: string; userDescription?: string;
  media?: MediaFile[];
};

type NewDamage = {
  id: string; type: string; carPart: string; position: string; text: string; media: MediaFile[];
};

const hasPhoto = (files?: MediaFile[]) => Array.isArray(files) && files.some(f => f?.type === 'image');
const hasVideo = (files?: MediaFile[]) => Array.isArray(files) && files.some((f: any) => f?.kind === 'video' || f?.mime?.startsWith?.('video'));

function slugify(s: string) {
  if (!s) return '';
  return s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "");
}

async function uploadOne(file: File, reg: string, damageId: string): Promise<string> {
    const BUCKET = "damage-photos";
    const ext = file.name.split(".").pop() || "bin";
    const path = `${slugify(reg)}/${slugify(damageId)}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
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

async function uploadAllForDamage(damage: { id: string; media?: MediaFile[] }, reg: string): Promise<{ photo_urls: string[]; video_urls: string[] }> {
    if (!damage.media) return { photo_urls: [], video_urls: [] };
    const { photos, videos } = partitionMediaByType(damage.media);
    const photo_urls = await Promise.all(photos.map(f => uploadOne(f, reg, damage.id)));
    const video_urls = await Promise.all(videos.map(f => uploadOne(f, reg, damage.id)));
    return { photo_urls, video_urls };
}

const getRelevantCarParts = (damageType: string): string[] => {
  if (!damageType) return Object.keys(CAR_PARTS).sort();
  const lowerType = damageType.toLowerCase();
  if (lowerType.includes('däckskada') || lowerType.includes('punktering')) return ['Däck'];
  if (lowerType.includes('fälgskada')) return ['Fälg'];
  if (lowerType.includes('ruta') || lowerType.includes('stenskott')) return ['Glas', 'Motorhuv', 'Tak'].sort();
  if (lowerType.includes('krock')) return ['Stötfångare fram', 'Skärm', 'Dörr utsida', 'Bagagelucka', 'Motorhuv'].sort();
  if (lowerType.includes('höjdled')) return ['Tak', 'Motorhuv', 'Bagagelucka'].sort();
  return Object.keys(CAR_PARTS).sort();
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
    const ctx = canvas.getContext('2d');
    if (!ctx) return resolve('');
    video.addEventListener('loadedmetadata', () => {
      video.currentTime = 0.5;
    });
    video.addEventListener('seeked', () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      URL.revokeObjectURL(video.src);
      resolve(dataUrl);
    });
    video.addEventListener('error', () => {
      URL.revokeObjectURL(video.src);
      resolve('');
    });
    video.src = URL.createObjectURL(file);
  });
};

const processFiles = async (files: File[]): Promise<MediaFile[]> => {
  return Promise.all(Array.from(files).map(async file => {
    const type = getFileType(file);
    const mediaFile: MediaFile = { file, type };
    if (type === 'image') {
      mediaFile.preview = URL.createObjectURL(file);
    } else if (type === 'video') {
      mediaFile.thumbnail = await createVideoThumbnail(file).catch(() => undefined);
    }
    return mediaFile;
  }));
};

const createCombinedDamageText = (skadetyp: string, plats: string, notering: string): string => {
    const parts = [skadetyp?.trim(), plats?.trim(), notering?.trim() ? `(${notering.trim()})` : '']
        .filter(p => p && p !== skadetyp?.trim() || parts.length === 0)
        .filter(Boolean);
    return parts.length > 0 ? parts.join(' - ') : 'Okänd skada';
};

const getColumnValue = (row: any, primaryKey: string, alternativeKeys: string[] = []): string | null => {
    if (row && row[primaryKey] != null && row[primaryKey] !== '') return String(row[primaryKey]).trim();
    for (const altKey of alternativeKeys) {
        if (row && row[altKey] != null && row[altKey] !== '') return String(row[altKey]).trim();
    }
    return null;
};


// =================================================================
// HUVUDKOMPONENT
// =================================================================

export default function CheckInForm() {
  const [firstName, setFirstName] = useState('');
  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const email = user?.email || '';
        const raw = (email.split('@')[0] || '').split('.')[0] || '';
        setFirstName(raw ? raw[0].toUpperCase() + raw.slice(1).toLowerCase() : 'du');
      } catch { setFirstName('du'); }
    })();
  }, []);

  const [viewWheelStorage, setViewWheelStorage] = useState<string>('---');
  const [viewSaludatum, setViewSaludatum] = useState<string | null>(null);
  const [damages, setDamages] = useState<string[]>([]);
  const [loadingDamage, setLoadingDamage] = useState(false);

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

  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [damageToFix, setDamageToFix] = useState<string | null>(null);
  const [showFinalConfirmation, setShowFinalConfirmation] = useState(false);
  const [showFieldErrors, setShowFieldErrors] = useState(false);

  const [ort, setOrt] = useState('');
  const [station, setStation] = useState('');
  const [carModel, setCarModel] = useState<string>('');

  const [matarstallning, setMatarstallning] = useState('');
  const [drivmedelstyp, setDrivmedelstyp] = useState<'bensin_diesel' | 'elbil' | null>(null);
  const [tankniva, setTankniva] = useState<'återlämnades_fulltankad' | 'tankad_nu' | null>(null);
  const [liters, setLiters] = useState('');
  const [bransletyp, setBransletyp] = useState<'Bensin' | 'Diesel' | null>(null);
  const [literpris, setLiterpris] = useState('');
  const [laddniva, setLaddniva] = useState('');
  const [antalLaddkablar, setAntalLaddkablar] = useState<'0' | '1' | '2' | null>(null);
  const [hjultyp, setHjultyp] = useState<'Sommardäck' | 'Vinterdäck' | null>(null);
  const [behoverRekond, setBehoverRekond] = useState(false);

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

  const isChecklistComplete = insynsskyddOK && dekalDjurRokningOK && isskrapaOK && pskivaOK && skyltRegplatOK && dekalGpsOK && washed && spolarvatskaOK && (drivmedelstyp !== 'bensin_diesel' || adblueOK);

  const [skadekontroll, setSkadekontroll] = useState<'ej_skadekontrollerad' | 'nya_skador' | 'inga_nya_skador' | null>(null);
  const [newDamages, setNewDamages] = useState<NewDamage[]>([]);
  const [preliminarAvslutNotering, setPreliminarAvslutNotering] = useState('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const normalizedReg = useMemo(() => normalizeReg(regInput), [regInput]);

  useEffect(() => {
    async function fetchAllRegistrations() {
      try {
        const [viewResult, carResult] = await Promise.all([
          supabase.from('mabi_damage_view').select('regnr').order('regnr'),
          supabase.from('car_data').select('regnr').order('regnr'),
        ]);
        const allRegs = new Set<string>();
        if (!viewResult.error) viewResult.data?.forEach((item: any) => item.regnr && allRegs.add(String(item.regnr).toUpperCase()));
        if (!carResult.error) carResult.data?.forEach((item: any) => item.regnr && allRegs.add(String(item.regnr).toUpperCase()));
        setAllRegistrations(Array.from(allRegs).sort());
      } catch (err) { console.warn('Could not fetch registrations:', err); }
    }
    fetchAllRegistrations();
  }, []);

  const suggestions = useMemo(() => {
    if (!regInput.trim() || regInput.trim().length < 2) return [];
    const input = regInput.toUpperCase();
    return allRegistrations.filter(reg => reg.includes(input)).slice(0, 5);
  }, [regInput, allRegistrations]);

  useEffect(() => {
    if (!normalizedReg || normalizedReg.length < 6) {
      setCarData([]); setExistingDamages([]); setNotFound(false); setCarModel('');
      return;
    }
    let cancelled = false;
    const fetchCarData = async () => {
      setLoading(true); setNotFound(false);
      try {
        const view = await fetchDamageCard(normalizedReg);
        if (cancelled) return;

        if (view) {
            setCarModel(view.brand_model || 'Okänd modell');
            setViewWheelStorage(view.wheelstorage || 'Ingen info');
            const parsedDamages = (view.skador || []).map((text, index) => ({
                id: `mabi-${index}`, skadetyp: '', plats: '', notering: '', fullText: text,
                shortText: text.substring(0, 50), status: 'not_selected' as const,
            }));
            setExistingDamages(parsedDamages);
        } else {
            setNotFound(true);
            setCarModel('');
            setViewWheelStorage('---');
            setExistingDamages([]);
        }
      } catch (err) {
        if (!cancelled) { console.error('Fetch error:', err); setNotFound(true); setCarData([]); setExistingDamages([]); }
      }
      if (!cancelled) setLoading(false);
    };
    const timeout = setTimeout(fetchCarData, 300);
    return () => { cancelled = true; clearTimeout(timeout); };
  }, [normalizedReg]);

  const availableStations = ort ? STATIONER[ort] || [] : [];
  
  const isFormValid = () => {
    if (!regInput || !ort || !station || !matarstallning || !drivmedelstyp || !hjultyp || skadekontroll === null || skadekontroll === 'ej_skadekontrollerad') return false;
    if (drivmedelstyp === 'bensin_diesel' && !tankniva) return false;
    if (tankniva === 'tankad_nu' && (!liters || !bransletyp || !literpris)) return false;
    if (drivmedelstyp === 'elbil' && (!laddniva || !antalLaddkablar)) return false;
    if (skadekontroll === 'nya_skador' && (newDamages.length === 0 || newDamages.some(d => !d.type || !d.carPart || !hasPhoto(d.media) || !hasVideo(d.media)))) return false;
    const documentedDamages = existingDamages.filter(d => d.status === 'documented');
    if (documentedDamages.some(d => !d.userType || !d.userCarPart || !hasPhoto(d.media))) return false;
    return isChecklistComplete;
  };
  const formIsValidState = isFormValid();

  const handleShowErrors = () => {
    setShowFieldErrors(true);
    setTimeout(() => {
      const firstError = document.querySelector('[data-error="true"]');
      if (firstError) firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  const resetForm = () => {
    setRegInput(''); setCarData([]); setExistingDamages([]); setDamages([]); setCarModel('');
    setShowSuggestions(false); setShowConfirmDialog(false); setDamageToFix(null);
    setShowFinalConfirmation(false); setShowFieldErrors(false); setNotFound(false);
    setOrt(''); setStation('');
    setMatarstallning(''); setDrivmedelstyp(null); setTankniva(null); setLiters('');
    setBransletyp(null); setLiterpris(''); setLaddniva('');
    setAntalLaddkablar(null); setHjultyp(null); setBehoverRekond(false);
    setSkadekontroll(null); setNewDamages([]); setPreliminarAvslutNotering('');
    setShowSuccessModal(false); setInsynsskyddOK(false); setDekalDjurRokningOK(false);
    setIsskrapaOK(false); setPskivaOK(false); setSkyltRegplatOK(false);
    setDekalGpsOK(false); setWashed(false); setSpolarvatskaOK(false); setAdblueOK(false);
  };

  const handleCancel = () => { if (window.confirm('Är du säker? Alla ifyllda data kommer att raderas.')) resetForm(); };

  const handleSubmitFinal = async () => {
    if (isFinalSaving || !formIsValidState) return handleShowErrors();
    setIsFinalSaving(true);
    try {
      await confirmFinalSave();
      setShowSuccessModal(true);
      setTimeout(() => { setShowSuccessModal(false); resetForm(); }, 3000);
    } catch (e) {
      console.error('Final save failed:', e);
      alert(`Något gick fel vid sparandet: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIsFinalSaving(false);
    }
  };

  const confirmFinalSave = async () => {
    const dbRegion = ORT_TILL_REGION[ort as keyof typeof ORT_TILL_REGION] ?? 'SYD';
    const { data: checkin, error: checkinError } = await supabase.from('checkins').insert({
        regnr: normalizedReg, region: dbRegion, city: ort, station, status: 'checked_in',
        notes: preliminarAvslutNotering.trim() || null, odometer_km: Number.isFinite(parseInt(matarstallning)) ? parseInt(matarstallning) : null,
        fuel_full: tankniva === 'återlämnades_fulltankad' ? true : null, washer_ok: spolarvatskaOK,
        adblue_ok: drivmedelstyp === 'bensin_diesel' ? adblueOK : null, privacy_cover_ok: insynsskyddOK,
        rekond_behov: behovRekond, has_new_damages: skadekontroll === 'nya_skador', completed_at: new Date().toISOString(),
    }).select().single();
    if (checkinError) throw checkinError;

    const allDamagesToSave = [
        ...existingDamages.filter(d => d.status === 'documented'),
        ...newDamages
    ];

    for (const damage of allDamagesToSave) {
        const isExisting = 'fullText' in damage;
        const { photo_urls, video_urls } = await uploadAllForDamage({ id: damage.id, media: damage.media || [] }, normalizedReg);
        await supabase.from('checkin_damages').insert({
            checkin_id: checkin.id,
            type: isExisting ? 'existing' : 'new',
            damage_type_from_card: isExisting ? damage.fullText : null,
            damage_type: isExisting ? damage.userType : damage.type,
            car_part: isExisting ? damage.userCarPart : damage.carPart,
            position: isExisting ? damage.userPosition : damage.position,
            description: isExisting ? damage.userDescription : damage.text,
            photo_urls, video_urls
        });
    }

    await notifyCheckin({
        regnr: normalizedReg, region: dbRegion, station, time: new Date().toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }),
        hasNewDamages: skadekontroll === 'nya_skador', needsRecond: behovRekond,
    });
  };

  const handleRegInputChange = (value: string) => {
    const upperValue = value.toUpperCase();
    setRegInput(upperValue);
    setShowSuggestions(upperValue.length >= 2);
  };

  const selectSuggestion = (suggestion: string) => {
    setRegInput(suggestion);
    setShowSuggestions(false);
  };

  const handleExistingDamageAction = (id: string, action: 'document' | 'resolve') => {
    setExistingDamages(prev => prev.map(d => d.id === id ? { ...d, status: d.status === action ? 'not_selected' : action } : d));
  };

  const updateDamageField = (id: string, field: string, value: any, isExisting: boolean) => {
    const updater = isExisting ? setExistingDamages : setNewDamages;
    updater((prev: any[]) => prev.map(d => {
        if (d.id === id) {
            const updatedDamage = { ...d, [field]: value };
            const typeField = isExisting ? 'userType' : 'type';
            const carPartField = isExisting ? 'userCarPart' : 'carPart';
            const positionField = isExisting ? 'userPosition' : 'position';

            if (field === typeField) { updatedDamage[carPartField] = ''; updatedDamage[positionField] = ''; }
            if (field === carPartField) { updatedDamage[positionField] = ''; }
            return updatedDamage;
        }
        return d;
    }));
  };

  const updateDamageMedia = async (id: string, files: FileList | null, isExisting: boolean) => {
    if (!files || files.length === 0) return;
    const newMediaFiles = await processFiles(Array.from(files));
    const updater = isExisting ? setExistingDamages : setNewDamages;
    updater((prev: any[]) => prev.map(d => d.id === id ? { ...d, media: [...(d.media || []), ...newMediaFiles] } : d));
  };

  const removeDamageMedia = (damageId: string, mediaIndex: number, isExisting: boolean) => {
    const updater = isExisting ? setExistingDamages : setNewDamages;
    updater((prev: any[]) => prev.map(d => {
        if (d.id === damageId) {
            const newMedia = [...d.media];
            const removedMedia = newMedia.splice(mediaIndex, 1)[0];
            if (removedMedia.preview) URL.revokeObjectURL(removedMedia.preview);
            if (removedMedia.thumbnail) URL.revokeObjectURL(removedMedia.thumbnail);
            return { ...d, media: newMedia };
        }
        return d;
    }));
  };

  const addDamage = () => setNewDamages(prev => [...prev, { id: `new-${Date.now()}`, type: '', carPart: '', position: '', text: '', media: [] }]);
  const removeDamage = (id: string) => setNewDamages(prev => prev.filter(d => d.id !== id));

  return (
    <div className="checkin-form">
      <GlobalStyles />
      {showSuccessModal && <SuccessModal />}
        <Card data-error={showFieldErrors && !regInput}>
          <SectionHeader title="Fordon" />
          <div style={{position: 'relative'}}>
            <Field label="Registreringsnummer *">
              <input type="text" value={regInput} onChange={(e) => handleRegInputChange(e.target.value)} placeholder="ABC 123" autoComplete="off" className="reg-input" onFocus={() => setShowSuggestions(true)} onBlur={() => setTimeout(() => setShowSuggestions(false), 150)} />
            </Field>
            {showSuggestions && suggestions.length > 0 && (
              <div className="suggestions-dropdown">
                {suggestions.map(s => <div key={s} onMouseDown={() => selectSuggestion(s)} className="suggestion-item">{s}</div>)}
              </div>
            )}
          </div>
          {loading && <p>Hämtar fordonsdata...</p>}
          {notFound && <p className="error-text">Inget fordon hittades med det registreringsnumret.</p>}
          {carModel && (
            <div className="info-box">
              <InfoRow label="Bilmodell:" value={carModel} />
              <InfoRow label="Hjulförvaring:" value={viewWheelStorage} />
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

        <Card data-error={showFieldErrors && (!matarstallning || !hjultyp || !drivmedelstyp || (drivmedelstyp === 'bensin_diesel' && !tankniva) || (tankniva === 'tankad_nu' && (!liters || !bransletyp || !literpris)) || (drivmedelstyp === 'elbil' && (!laddniva || !antalLaddkablar)))}>
          <SectionHeader title="Fordonsstatus" />
          <SubSectionHeader title="Mätarställning" />
          <Field label="Mätarställning (km) *"><input type="number" value={matarstallning} onChange={e => setMatarstallning(e.target.value)} placeholder="12345" /></Field>
          <SubSectionHeader title="Däck som sitter på" />
          <Field label="Däcktyp *"><select value={hjultyp || ''} onChange={e => setHjultyp(e.target.value as any)}><option value="">Välj däcktyp</option><option value="Sommardäck">Sommardäck</option><option value="Vinterdäck">Vinterdäck</option></select></Field>
          <SubSectionHeader title="Tankning/Laddning" />
          <Field label="Drivmedelstyp *"><RadioGroup><Radio label="Bensin/Diesel" name="drivmedel" checked={drivmedelstyp === 'bensin_diesel'} onChange={() => setDrivmedelstyp('bensin_diesel')} /><Radio label="Elbil" name="drivmedel" checked={drivmedelstyp === 'elbil'} onChange={() => setDrivmedelstyp('elbil')} /></RadioGroup></Field>
          {drivmedelstyp === 'bensin_diesel' && (<><Field label="Tankstatus *"><select value={tankniva || ''} onChange={e => setTankniva(e.target.value as any)}><option value="">Välj tankstatus</option><option value="återlämnades_fulltankad">Återlämnades fulltankad</option><option value="tankad_nu">Tankad nu</option></select></Field>{tankniva === 'tankad_nu' && (<div className="grid-3-col"><Field label="Antal liter *"><input type="number" value={liters} onChange={e => setLiters(e.target.value)} placeholder="0.0" /></Field><Field label="Bränsle *"><select value={bransletyp || ''} onChange={e => setBransletyp(e.target.value as any)}><option value="">Välj</option><option value="Bensin">Bensin</option><option value="Diesel">Diesel</option></select></Field><Field label="Literpris *"><input type="number" value={literpris} onChange={e => setLiterpris(e.target.value)} placeholder="0.00" /></Field></div>)}</>)}
          {drivmedelstyp === 'elbil' && (<><Field label="Laddningsnivå vid återlämning (%) *"><input type="number" value={laddniva} onChange={e => setLaddniva(e.target.value)} placeholder="0-100" /></Field><Field label="Antal laddkablar *"><select value={antalLaddkablar || ''} onChange={e => setAntalLaddkablar(e.target.value as any)}><option value="">Välj antal</option><option value="0">0</option><option value="1">1</option><option value="2">2</option></select></Field></>)}
        </Card>

        <Card data-error={showFieldErrors && (skadekontroll === null || skadekontroll === 'ej_skadekontrollerad' || (skadekontroll === 'nya_skador' && (newDamages.length === 0 || newDamages.some(d => !d.type || !d.carPart || !hasPhoto(d.media) || !hasVideo(d.media)))) || (existingDamages.filter(d=>d.status === 'documented').some(d => !d.userType || !d.userCarPart || !hasPhoto(d.media))))}>
            <SectionHeader title="Skador" />
            <SubSectionHeader title="Befintliga skador från skadekort" />
            {existingDamages.length > 0 ? existingDamages.map(d => <DamageItem key={d.id} damage={d} isExisting={true} onUpdate={(id, field, val) => updateDamageField(id, field, val, true)} onMediaUpdate={(id, files) => updateDamageMedia(id, files, true)} onMediaRemove={(id, index) => removeDamageMedia(id, index, true)} onAction={handleExistingDamageAction} />) : <p>Inga befintliga skador registrerade på skadekortet.</p>}
            <SubSectionHeader title="Skadekontroll" />
            <Field label="Har bilen några nya skador? *"><RadioGroup>
                <Radio label="Inga nya skador" name="skadekontroll" checked={skadekontroll === 'inga_nya_skador'} onChange={() => setSkadekontroll('inga_nya_skador')} />
                <Radio label="Nya skador finns" name="skadekontroll" checked={skadekontroll === 'nya_skador'} onChange={() => setSkadekontroll('nya_skador')} />
            </RadioGroup></Field>
            {skadekontroll === 'nya_skador' && (<>{newDamages.map(d => <DamageItem key={d.id} damage={d} isExisting={false} onUpdate={(id, field, val) => updateDamageField(id, field, val, false)} onMediaUpdate={(id, files) => updateDamageMedia(id, files, false)} onMediaRemove={(id, index) => removeDamageMedia(id, index, false)} onRemove={removeDamage} />)}<Button onClick={addDamage} variant="primary" style={{ marginTop: '1rem' }}>+ Lägg till ny skada</Button></>)}
        </Card>

        <Card data-error={showFieldErrors && !isChecklistComplete}>
            <SectionHeader title="Checklista" />
            <div className="rekond-box"><Checkbox label="⚠️ Behöver rekond" checked={behoverRekond} onChange={e => { if (e.target.checked && !confirm('Är du säker på att bilen behöver rekond? (extra avgift kan tillkomma)')) return; setBehoverRekond(e.target.checked); }} className="rekond-checkbox" /></div>
            <SubSectionHeader title="Allt måste vara OK för att slutföra" />
            <div className="grid-2-col">
                <Checkbox label="✓ Insynsskydd" checked={insynsskyddOK} onChange={e => setInsynsskyddOK(e.target.checked)} />
                <Checkbox label="✓ Dekal djur/rökning" checked={dekalDjurRokningOK} onChange={e => setDekalDjurRokningOK(e.target.checked)} />
                <Checkbox label="✓ Isskrapa" checked={isskrapaOK} onChange={e => setIsskrapaOK(e.target.checked)} />
                <Checkbox label="✓ P-skiva" checked={pskivaOK} onChange={e => setPskivaOK(e.target.checked)} />
                <Checkbox label="✓ Skylt reg.plåt" checked={skyltRegplatOK} onChange={e => setSkyltRegplatOK(e.target.checked)} />
                <Checkbox label="✓ Dekal GPS" checked={dekalGpsOK} onChange={e => setDekalGpsOK(e.target.checked)} />
                <Checkbox label="✓ Spolarvätska" checked={spolarvatskaOK} onChange={e => setSpolarvatskaOK(e.target.checked)} />
                {drivmedelstyp === 'bensin_diesel' && <Checkbox label="✓ AdBlue" checked={adblueOK} onChange={e => setAdblueOK(e.target.checked)} />}
                <Checkbox label="✓ Bilen tvättad" checked={washed} onChange={e => setWashed(e.target.checked)} />
            </div>
        </Card>

        <Card><Field label="Kommentarer (frivilligt)"><textarea value={preliminarAvslutNotering} onChange={e => setPreliminarAvslutNotering(e.target.value)} placeholder="Övrig info..." rows={4}></textarea></Field></Card>

        <div className="form-actions">
            <Button onClick={handleCancel} variant="secondary">Avbryt</Button>
            <Button onClick={formIsValidState ? handleSubmitFinal : handleShowErrors} disabled={isFinalSaving || !regInput} variant={formIsValidState ? 'success' : 'disabled'}>{!formIsValidState ? 'Visa saknad information' : (isFinalSaving ? 'Skickar in...' : 'Slutför incheckning')}</Button>
        </div>
    </div>
  );
}

// =================================================================
// 4. ÅTERANVÄNDBARA KOMPONENTER (Struktur & Styling)
// =================================================================

const Card: React.FC<React.PropsWithChildren<any>> = ({ children, ...props }) => (<div className="card" {...props}>{children}</div>);
const SectionHeader: React.FC<{ title: string }> = ({ title }) => (<div className="section-header"><h2>{title}</h2></div>);
const SubSectionHeader: React.FC<{ title: string }> = ({ title }) => (<div className="sub-section-header"><h3>{title}</h3></div>);
const Field: React.FC<React.PropsWithChildren<{ label?: string }>> = ({ label, children }) => (<div className="field">{label && <label>{label}</label>}{children}</div>);
const InfoRow: React.FC<{ label: string, value: string }> = ({ label, value }) => (<div className="info-row"><span>{label}</span><span>{value}</span></div>);
const RadioGroup: React.FC<React.PropsWithChildren<{}>> = ({ children }) => <div className="radio-group">{children}</div>;
const Radio: React.FC<any> = ({ label, ...props }) => (<label className="radio-label"><input type="radio" {...props} />{label}</label>);
const Checkbox: React.FC<any> = ({ label, className, ...props }) => {
    return (
        <label className={`checkbox-label ${className || ''}`}>
            <input type="checkbox" {...props} />
            {label}
        </label>
    );
};
const Button: React.FC<React.PropsWithChildren<any>> = ({ children, onClick, variant = 'primary', style, ...props }) => {
    const variantClasses: Record<string, string> = {
        primary: 'btn-primary', secondary: 'btn-secondary', success: 'btn-success',
        danger: 'btn-danger', warning: 'btn-warning', disabled: 'btn-disabled',
    };
    return (<>
        <button onClick={onClick} className={`btn ${variantClasses[variant]}`} style={style} {...props}>{children}</button>
        <style jsx>{`
          .btn { padding: 0.75rem 1.5rem; border: none; border-radius: 8px; font-size: 1rem; font-weight: 600; cursor: pointer; transition: all 0.2s; }
          .btn-primary { background-color: var(--color-primary); color: white; }
          .btn-secondary { background-color: var(--color-text-secondary); color: white; }
          .btn-success { background-color: var(--color-success); color: white; }
          .btn-danger { background-color: var(--color-danger); color: white; }
          .btn-warning { background-color: var(--color-warning); color: var(--color-text); }
          .btn-disabled { background-color: var(--color-disabled-light); color: var(--color-disabled); cursor: not-allowed; }
          .btn:hover:not(.btn-disabled) { filter: brightness(1.1); }
        `}</style>
    </>);
};

const SuccessModal = () => (
    <div className="modal-overlay">
        <div className="modal-content">
            <h2 className="modal-title">✓ Incheckning slutförd!</h2>
            <p>Formuläret kommer nu att återställas.</p>
        </div>
        <style jsx>{`
          .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background-color: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 100; }
          .modal-content { background-color: white; padding: 2.5rem; border-radius: 12px; text-align: center; box-shadow: var(--shadow-md); }
          .modal-title { color: var(--color-success); font-size: 1.5rem; margin-top:0; }
        `}</style>
    </div>
);

const DamageItem: React.FC<{damage: ExistingDamage | NewDamage, isExisting: boolean, onUpdate: (id: string, field: string, value: string) => void, onMediaUpdate: (id: string, files: FileList | null) => void, onMediaRemove: (id: string, index: number) => void, onRemove?: (id: string) => void, onAction?: (id: string, action: 'document' | 'resolve') => void}> = ({ damage, isExisting, onUpdate, onMediaUpdate, onMediaRemove, onRemove, onAction }) => {
    const isDocumented = isExisting && (damage as ExistingDamage).status === 'documented';
    const statusClass = isExisting ? `damage-item--${(damage as ExistingDamage).status}` : 'damage-item--new';
    
    const handleMediaUpdate = (files: FileList | null) => onMediaUpdate(damage.id, files);
    const handleMediaRemove = (index: number) => onMediaRemove(damage.id, index);

    const typeValue = isExisting ? (damage as ExistingDamage).userType : (damage as NewDamage).type;
    const carPartValue = isExisting ? (damage as ExistingDamage).userCarPart : (damage as NewDamage).carPart;
    const positionValue = isExisting ? (damage as ExistingDamage).userPosition : (damage as NewDamage).position;
    const descriptionValue = isExisting ? (damage as ExistingDamage).userDescription : (damage as NewDamage).text;
    
    const typeField = isExisting ? 'userType' : 'type';
    const carPartField = isExisting ? 'userCarPart' : 'carPart';
    const positionField = isExisting ? 'userPosition' : 'position';
    const descriptionField = isExisting ? 'userDescription' : 'text';

    return (<div className={`damage-item ${statusClass}`}>
        <div className="damage-item-header">
          <h4>{isExisting ? (damage as ExistingDamage).fullText : 'Ny skada'}</h4>
          {!isExisting && onRemove && <Button onClick={() => onRemove(damage.id)} variant="danger" style={{padding: '0.25rem 0.5rem', fontSize: '0.75rem'}}>Ta bort</Button>}
        </div>
        {isExisting && onAction && (
          <div className="damage-item-actions">
            <Button onClick={() => onAction(damage.id, 'document')} variant={isDocumented ? 'success' : 'secondary'} style={{flex: 1}}>Dokumentera</Button>
            <Button onClick={() => onAction(damage.id, 'resolve')} variant={(damage as ExistingDamage).status === 'resolved' ? 'warning' : 'secondary'} style={{flex: 1}}>Åtgärdad/Hittas ej</Button>
          </div>
        )}
        {(isDocumented || !isExisting) && (
          <div className="damage-item-details">
            <div className="grid-2-col">
              <Field label="Typ av skada *"><select value={typeValue} onChange={(e) => onUpdate(damage.id, typeField, e.target.value)}><option value="">Välj typ</option>{DAMAGE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></Field>
              <Field label="Placering *"><select value={carPartValue} onChange={(e) => onUpdate(damage.id, carPartField, e.target.value)}><option value="">Välj placering</option>{getRelevantCarParts(typeValue || '').map(p => <option key={p} value={p}>{p}</option>)}</select></Field>
            </div>
            {carPartValue && CAR_PARTS[carPartValue]?.length > 0 &&
                <Field label="Position"><select value={positionValue} onChange={(e) => onUpdate(damage.id, positionField, e.target.value)}><option value="">Välj position</option>{CAR_PARTS[carPartValue].map(p => <option key={p} value={p}>{p}</option>)}</select></Field>
            }
            <Field label="Beskrivning (frivilligt)"><textarea value={descriptionValue} onChange={(e) => onUpdate(damage.id, descriptionField, e.target.value)} placeholder="Mer detaljer om skadan..." rows={3}></textarea></Field>
            <MediaUpload onMediaUpdate={handleMediaUpdate} onMediaRemove={handleMediaRemove} media={damage.media || []} videoRequired={!isExisting} photoRequired={true} />
          </div>
        )}
        <style jsx>{`
            .damage-item { padding: 1rem; margin-bottom: 1rem; border: 1px solid var(--color-border); border-radius: 8px; transition: background-color 0.3s; }
            .damage-item--not_selected { background-color: var(--color-card); }
            .damage-item--documented { background-color: var(--color-success-light); }
            .damage-item--resolved { background-color: var(--color-warning-light); }
            .damage-item--new { background-color: var(--color-danger-light); border-color: var(--color-danger); }
            .damage-item-header { display: flex; justify-content: space-between; align-items: center; }
            .damage-item-header h4 { font-weight: 600; margin: 0; }
            .damage-item-actions { display: flex; gap: 0.5rem; margin: 1rem 0; }
            .damage-item-details { margin-top: 1rem; border-top: 1px solid var(--color-border); padding-top: 1rem; }
        `}</style>
    </div>);
};

const MediaUpload: React.FC<{onMediaUpdate: (files: FileList | null) => void, onMediaRemove: (index: number) => void, media: MediaFile[], videoRequired: boolean, photoRequired: boolean}> = ({ onMediaUpdate, onMediaRemove, media, videoRequired, photoRequired }) => {
    const hasImage = hasPhoto(media);
    const hasVideoFile = hasVideo(media);
    const photoInputId = `photo-${React.useId()}`;
    const videoInputId = `video-${React.useId()}`;

    return (
        <div>
            <div className="grid-2-col" style={{gap: '0.5rem', marginTop: '1rem'}}>
                <MediaButton htmlFor={photoInputId} hasFile={hasImage} required={photoRequired}>📷 Ta foto *</MediaButton>
                <MediaButton htmlFor={videoInputId} hasFile={hasVideoFile} required={videoRequired}>🎥 Spela in video{videoRequired ? ' *' : ''}</MediaButton>
                <input type="file" accept="image/*" multiple capture="environment" id={photoInputId} onChange={e => onMediaUpdate(e.target.files)} style={{ display: 'none' }} />
                <input type="file" accept="video/*" capture="environment" id={videoInputId} onChange={e => onMediaUpdate(e.target.files)} style={{ display: 'none' }} />
            </div>
            {media.length > 0 && (
                <div className="media-preview-grid">
                    {media.map((m, i) => (
                        <div key={i} className="media-preview-item">
                            <img src={m.preview || m.thumbnail} alt="media" />
                            <button onClick={() => onMediaRemove(i)} className="media-remove-btn">×</button>
                        </div>
                    ))}
                </div>
            )}
            <style jsx>{`
                .media-preview-grid { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 1rem; }
                .media-preview-item { position: relative; }
                .media-preview-item img { width: 60px; height: 60px; object-fit: cover; border-radius: 6px; background-color: var(--color-disabled-light); }
                .media-remove-btn { position: absolute; top: -5px; right: -5px; width: 20px; height: 20px; border-radius: 50%; background-color: var(--color-danger); color: white; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; line-height: 20px; }
            `}</style>
        </div>
    );
};

const MediaButton: React.FC<React.PropsWithChildren<any>> = ({ htmlFor, hasFile, required, children }) => {
    const baseStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', width: '100%', padding: '0.75rem', borderRadius: '6px', fontSize: '0.875rem', textAlign: 'center', cursor: 'pointer', transition: 'background-color 0.2s', border: '1px dashed' };
    const color = hasFile ? 'var(--color-success)' : (required ? 'var(--color-danger)' : 'var(--color-text-secondary)');
    const bgColor = hasFile ? 'var(--color-success-light)' : (required ? 'var(--color-danger-light)' : 'transparent');
    const borderColor = hasFile ? 'var(--color-success)' : (required ? 'var(--color-danger)' : 'var(--color-border)');
    const fontWeight = hasFile ? 500 : 600;

    return <label htmlFor={htmlFor} style={{ ...baseStyle, color, backgroundColor: bgColor, borderColor, fontWeight }}>{children}</label>;
};

const GlobalStyles = () => (
    <style jsx global>{`
        :root {
          --color-bg: #f8fafc; --color-card: #ffffff; --color-text: #1f2937; --color-text-secondary: #6b7280;
          --color-primary: #2563eb; --color-primary-light: #eff6ff; --color-success: #16a34a; --color-success-light: #f0fdf4;
          --color-danger: #dc2626; --color-danger-light: #fef2f2; --color-warning: #f59e0b; --color-warning-light: #fefce8;
          --color-border: #e5e7eb; --color-border-focus: #3b82f6; --color-disabled: #a1a1aa; --color-disabled-light: #f4f4f5;
          --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05); --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
        }
        body { 
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; 
            background-color: var(--color-bg); 
            color: var(--color-text); /* FIX: Sätter en mörk grundfärg för text */
            margin: 0; 
        }
        .checkin-form { max-width: 700px; margin: 0 auto; padding: 1rem; box-sizing: border-box; }
        .card { background-color: var(--color-card); padding: 1.5rem; border-radius: 12px; margin-bottom: 1.5rem; box-shadow: var(--shadow-md); border: 2px solid transparent; transition: border 0.2s; }
        .card[data-error="true"] { border: 2px solid var(--color-danger); }
        .section-header { padding-bottom: 0.75rem; border-bottom: 1px solid var(--color-border); margin-bottom: 1.5rem; }
        .section-header h2 { font-size: 1.25rem; font-weight: 700; color: var(--color-text); text-transform: uppercase; letter-spacing: 0.05em; margin:0; }
        .sub-section-header { margin-top: 2rem; margin-bottom: 1rem; }
        .sub-section-header h3 { font-size: 1rem; font-weight: 600; color: var(--color-text); margin:0; }
        .field { margin-bottom: 1rem; }
        .field label { display: block; margin-bottom: 0.5rem; font-weight: 500; font-size: 0.875rem; }
        .field input, .field select, .field textarea { width: 100%; padding: 0.75rem; border: 1px solid var(--color-border); border-radius: 6px; font-size: 1rem; background-color: white; box-sizing: border-box; color: var(--color-text); }
        .field input:focus, .field select:focus, .field textarea:focus { outline: 2px solid var(--color-border-focus); border-color: transparent; }
        .field select[disabled] { background-color: var(--color-disabled-light); cursor: not-allowed; }
        .reg-input { text-align: center; font-weight: 600; letter-spacing: 2px; }
        .suggestions-dropdown { position: absolute; top: 100%; left: 0; right: 0; background-color: white; border: 1px solid var(--color-border); border-radius: 6px; z-index: 10; box-shadow: var(--shadow-md); }
        .suggestion-item { padding: 0.75rem; cursor: pointer; }
        .suggestion-item:hover { background-color: var(--color-primary-light); }
        .error-text { color: var(--color-danger); }
        .info-box { margin-top: 1rem; padding: 1rem; background-color: var(--color-primary-light); border-radius: 8px; }
        .info-row { display: flex; justify-content: space-between; font-size: 0.875rem; padding: 0.25rem 0; }
        .info-row span:first-child { font-weight: 600; }
        .grid-2-col { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; }
        .grid-3-col { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; margin-top: 1rem; }
        .radio-group { display: flex; gap: 1.5rem; align-items: center; }
        .radio-label { display: flex; align-items: center; gap: 0.5rem; cursor: pointer; }

        /* FIX: Korrekt styling för custom checkboxes */
        .checkbox-label {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            font-size: 1rem;
            padding: 0.75rem;
            border-radius: 8px;
            border: 1px solid var(--color-border);
            cursor: pointer;
            transition: all 0.2s;
            background-color: var(--color-card);
        }
        .checkbox-label:hover {
            background-color: var(--color-primary-light);
            border-color: var(--color-primary);
        }
        .checkbox-label input[type="checkbox"] {
            display: none; /* Dölj den fula original-checkboxen */
        }
        .checkbox-label .checkbox-custom {
            width: 24px;
            height: 24px;
            border: 2px solid var(--color-border);
            border-radius: 6px;
            display: inline-block;
            position: relative;
            background-color: var(--color-bg);
            transition: all 0.2s;
        }
        .checkbox-label input[type="checkbox"]:checked + .checkbox-custom {
            background-color: var(--color-success);
            border-color: var(--color-success);
        }
        .checkbox-label input[type="checkbox"]:checked + .checkbox-custom::after {
            content: '✔';
            font-size: 18px;
            color: white;
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
        }
        .rekond-box { padding: 1rem; background-color: var(--color-danger-light); border-radius: 8px; border: 1px solid var(--color-danger); margin-bottom: 1.5rem; }
        .rekond-checkbox { border-color: transparent; background-color: transparent; }
        .rekond-checkbox:hover { background-color: rgba(220, 38, 38, 0.1); }
        .rekond-checkbox .checkbox-custom { border-color: var(--color-danger); }
        .rekond-checkbox span { font-weight: bold; color: var(--color-danger); }
        .form-actions { margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid var(--color-border); display: flex; gap: 1rem; justify-content: flex-end; padding-bottom: 3rem; }
    `}</style>
)

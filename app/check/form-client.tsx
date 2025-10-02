'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchDamageCard, normalizeReg } from '@/lib/damages';
import { notifyCheckin } from '@/lib/notify';


// =================================================================
// 1. DATA, TYPES & HELPERS
// =================================================================

const MABI_LOGO_URL = "https://axmjqmsqjsbigajgrjqc.supabase.co/storage/v1/object/public/assets/mabi_logo.png";

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
    const [photoUploads, videoUploads] = await Promise.all([
        Promise.all(photos.map(p => uploadOne(p, reg, damage.id))),
        Promise.all(videos.map(v => uploadOne(v, reg, damage.id))),
    ]);
    return { photo_urls: photoUploads, video_urls: videoUploads };
}

function getRelevantCarParts(damageType: string): string[] {
    const lowerCaseDamage = damageType.toLowerCase();
    if (lowerCaseDamage.includes('fälg')) return ['Fälg'];
    if (lowerCaseDamage.includes('däck')) return ['Däck'];
    if (lowerCaseDamage.includes('ruta')) return ['Glas'];
    return Object.keys(CAR_PARTS);
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
// =================================================================
// 2. MAIN COMPONENT
// =================================================================

export default function CheckInForm() {
  // State
  const [firstName, setFirstName] = useState('');
  const [viewWheelStorage, setViewWheelStorage] = useState(false);
  const [regInput, setRegInput] = useState('');
  const [allRegistrations, setAllRegistrations] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [isFinalSaving, setIsFinalSaving] = useState(false);
  const [showFieldErrors, setShowFieldErrors] = useState(false);

  const [ort, setOrt] = useState('');
  const [station, setStation] = useState('');
  const [carModel, setCarModel] = useState<string | null>(null);
  const [matarstallning, setMatarstallning] = useState('');
  const [drivmedelstyp, setDrivmedelstyp] = useState<'bensin_diesel' | 'elbil' | null>(null);
  const [tankniva, setTankniva] = useState<'återlämnades_fulltankad' | 'tankad_nu' | null>(null);
  const [liters, setLiters] = useState('');
  const [bransletyp, setBransletyp] = useState<'Bensin' | 'Diesel' | null>(null);
  const [literpris, setLiterpris] = useState('');
  const [laddniva, setLaddniva] = useState('');
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

  const [skadekontroll, setSkadekontroll] = useState<'inga_nya_skador' | 'nya_skador' | null>(null);
  const [newDamages, setNewDamages] = useState<NewDamage[]>([]);
  const [preliminarAvslutNotering, setPreliminarAvslutNotering] = useState('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  // Derived State & Memos
  const normalizedReg = useMemo(() => normalizeReg(regInput), [regInput]);
  const availableStations = useMemo(() => STATIONER[ort] || [], [ort]);
  const suggestions = useMemo(() => {
    if (regInput.length < 2) return [];
    return allRegistrations.filter(r => r.toUpperCase().includes(regInput.toUpperCase())).slice(0, 5);
  }, [regInput, allRegistrations]);

  const isChecklistComplete = useMemo(() => {
    const commonChecks = insynsskyddOK && dekalDjurRokningOK && isskrapaOK && pskivaOK && skyltRegplatOK && dekalGpsOK && washed && spolarvatskaOK;
    return drivmedelstyp === 'bensin_diesel' ? commonChecks && adblueOK : commonChecks;
  }, [insynsskyddOK, dekalDjurRokningOK, isskrapaOK, pskivaOK, skyltRegplatOK, dekalGpsOK, washed, spolarvatskaOK, adblueOK, drivmedelstyp]);

  const formIsValidState = useMemo(() => {
    if (!regInput || !ort || !station || !matarstallning || !hjultyp || !drivmedelstyp || skadekontroll === null) return false;
    if (drivmedelstyp === 'bensin_diesel' && (!tankniva || (tankniva === 'tankad_nu' && (!liters || !bransletyp || !literpris)))) return false;
    if (drivmedelstyp === 'elbil' && !laddniva) return false;
    if (skadekontroll === 'nya_skador' && (newDamages.length === 0 || newDamages.some(d => !d.type || !d.carPart || !hasPhoto(d.media) || !hasVideo(d.media)))) return false;
    if (existingDamages.filter(d => d.status === 'documented').some(d => !d.userType || !d.userCarPart || !hasPhoto(d.media))) return false;
    return isChecklistComplete;
  }, [regInput, ort, station, matarstallning, hjultyp, drivmedelstyp, tankniva, liters, bransletyp, literpris, laddniva, skadekontroll, newDamages, existingDamages, isChecklistComplete]);

  const finalPayload = useMemo(() => ({
      reg: normalizedReg, carModel, ort, station, matarstallning,
      drivmedel: drivmedelstyp, tankning: { tankniva, liters, bransletyp, literpris },
      laddning: { laddniva }, hjultyp, rekond: behoverRekond,
      notering: preliminarAvslutNotering, incheckare: firstName,
      region: ORT_Till_REGION[ort] || 'Okänd',
      nya_skador: newDamages,
      dokumenterade_skador: existingDamages.filter(d => d.status === 'documented'),
      åtgärdade_skador: existingDamages.filter(d => d.status === 'resolved'),
  }), [normalizedReg, carModel, ort, station, matarstallning, drivmedelstyp, tankniva, liters, bransletyp, literpris, laddniva, hjultyp, behoverRekond, preliminarAvslutNotering, firstName, newDamages, existingDamages]);


  // Effects
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setFirstName(user?.user_metadata?.first_name || user?.email || 'Okänd');
    };
    getUser();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reg = params.get('reg');
    if (reg) { setRegInput(reg.toUpperCase()); }
  }, []);

  useEffect(() => {
    async function fetchAllRegistrations() {
      const { data, error } = await supabase.from('regnr').select('reg');
      if (error) console.error("Could not fetch registrations", error);
      else setAllRegistrations(data.map(item => item.reg));
    }
    fetchAllRegistrations();
  }, []);

  useEffect(() => {
    if (normalizedReg.length < 6) {
      setCarModel(null); setExistingDamages([]); setNotFound(false); return;
    }
    const fetch = async () => {
      setLoading(true); setNotFound(false);
      try {
        const data = await fetchDamageCard(normalizedReg);
        if (data) {
          setCarModel(data.carModel);
          setExistingDamages(data.damages.map(d => ({ ...d, id: Math.random().toString(), status: 'not_selected' })));
          setViewWheelStorage(data.viewWheelStorage);
        } else {
          setNotFound(true); setCarModel(null); setExistingDamages([]);
        }
      } catch (error) {
        console.error(error); setNotFound(true);
      } finally {
        setLoading(false);
      }
    };
    const timer = setTimeout(fetch, 300);
    return () => clearTimeout(timer);
  }, [normalizedReg]);

  // Handlers
  const handleShowErrors = () => {
    setShowFieldErrors(true);
    const firstError = document.querySelector('.card[data-error="true"]');
    if (firstError) firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const resetForm = () => {
    setRegInput(''); setCarModel(null); setExistingDamages([]); setOrt('');
    setStation(''); setMatarstallning(''); setDrivmedelstyp(null); setTankniva(null);
    setLiters(''); setBransletyp(null); setLiterpris(''); setLaddniva('');
    setHjultyp(null); setBehoverRekond(false); setInsynsskyddOK(false);
    setDekalDjurRokningOK(false); setIsskrapaOK(false); setPskivaOK(false);
    setSkyltRegplatOK(false); setDekalGpsOK(false); setWashed(false);
    setSpolarvatskaOK(false); setAdblueOK(false); setSkadekontroll(null);
    setNewDamages([]); setPreliminarAvslutNotering(''); setShowFieldErrors(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancel = () => {
    if (window.confirm("Är du säker? Alla ifyllda data kommer att raderas.")) resetForm();
  };

  const handleSubmitFinal = async () => {
    if (!formIsValidState) { handleShowErrors(); return; }
    
    const summary = `
      Fordon: ${finalPayload.reg} (${finalPayload.carModel})
      Plats: ${finalPayload.ort} - ${finalPayload.station}
      Mätarställning: ${finalPayload.matarstallning} km
      Hjul: ${finalPayload.hjultyp}
      Drivmedel: ${finalPayload.drivmedel}
      ${finalPayload.drivmedel === 'bensin_diesel' ? `Tankning: ${finalPayload.tankning.tankniva}${finalPayload.tankning.tankniva === 'tankad_nu' ? ` (${finalPayload.tankning.liters}L ${finalPayload.tankning.bransletyp} @ ${finalPayload.tankning.literpris} kr/L)` : ''}` : ''}
      ${finalPayload.drivmedel === 'elbil' ? `Laddning: ${finalPayload.laddning.laddniva}%` : ''}
      Nya skador: ${finalPayload.nya_skador.length > 0 ? finalPayload.nya_skador.map(d => d.type).join(', ') : 'Inga'}
      Dokumenterade skador: ${finalPayload.dokumenterade_skador.length > 0 ? finalPayload.dokumenterade_skador.map(d => d.shortText).join(', ') : 'Inga'}
      Åtgärdade skador: ${finalPayload.åtgärdade_skador.length > 0 ? finalPayload.åtgärdade_skador.map(d => d.shortText).join(', ') : 'Inga'}
    `;

    if (!window.confirm(`Vänligen bekräfta incheckning:\n\n${summary}`)) return;

    setIsFinalSaving(true);
    try {
      const documentedExisting = await Promise.all(
        existingDamages.filter(d => d.status === 'documented').map(async d => ({
          ...d, uploads: await uploadAllForDamage(d, normalizedReg)
        }))
      );

      const createdNew = await Promise.all(
        newDamages.map(async d => ({
          ...d, uploads: await uploadAllForDamage(d, normalizedReg)
        }))
      );
      
      const submissionPayload = {
        ...finalPayload,
        nya_skador: createdNew,
        dokumenterade_skador: documentedExisting,
      };

      await notifyCheckin(submissionPayload);

      setShowSuccessModal(true);
      setTimeout(() => { setShowSuccessModal(false); resetForm(); }, 3000);
    } catch (error) {
      console.error("Final save failed:", error);
      alert("Något gick fel vid inskickningen. Vänligen försök igen.");
    } finally {
      setIsFinalSaving(false);
    }
  };

  const handleRegInputChange = (value: string) => {
    setRegInput(value.toUpperCase());
    setShowSuggestions(value.length >= 2);
  };

  const selectSuggestion = (reg: string) => {
    setRegInput(reg); setShowSuggestions(false);
  };

  const handleExistingDamageAction = (id: string, action: 'document' | 'resolve') => {
    setExistingDamages(damages => damages.map(d => {
      if (d.id !== id) return d;
      if (action === 'resolve') {
        if (d.status === 'resolved') return { ...d, status: 'not_selected' };
        if (confirm(`Är du säker på att du vill markera skadan "${d.shortText}" som åtgärdad/hittas ej?`)) {
          return { ...d, status: 'resolved' };
        }
        return d;
      }
      if (action === 'document') {
        return { ...d, status: d.status === 'documented' ? 'not_selected' : 'documented' };
      }
      return d;
    }));
  };

  const updateDamageField = (id: string, field: string, value: any, isExisting: boolean) => {
    const updater = isExisting ? setExistingDamages : setNewDamages;
    updater((damages: any[]) => damages.map(d => d.id === id ? { ...d, [field]: value } : d));
  };

  const updateDamageMedia = async (id: string, files: FileList, isExisting: boolean) => {
    const processed = await processFiles(files);
    const updater = isExisting ? setExistingDamages : setNewDamages;
    updater((damages: any[]) => damages.map(d => d.id === id ? { ...d, media: [...(d.media || []), ...processed] } : d));
  };

  const removeDamageMedia = (id: string, index: number, isExisting: boolean) => {
    const updater = isExisting ? setExistingDamages : setNewDamages;
    updater((damages: any[]) => damages.map(d => {
      if (d.id !== id) return d;
      const newMedia = [...(d.media || [])];
      newMedia.splice(index, 1);
      return { ...d, media: newMedia };
    }));
  };

  const addDamage = () => {
    setNewDamages(prev => [...prev, { id: `new_${Date.now()}`, type: '', carPart: '', position: '', text: '', media: [] }]);
  };

  const removeDamage = (id: string) => {
    if (confirm("Är du säker på att du vill ta bort denna nya skada?")) {
      setNewDamages(prev => prev.filter(d => d.id !== id));
    }
  };

  return (
    <div className="checkin-form">
      <GlobalStyles />
      {showSuccessModal && <SuccessModal firstName={firstName} />}
      
      <div className="main-header">
        <img src={MABI_LOGO_URL} alt="MABI Logo" className="main-logo" />
        {firstName && <p className="user-info">Inloggad: {firstName}</p>}
      </div>

      <Card data-error={showFieldErrors && !regInput}>
        <SectionHeader title="Fordon" />
        <div style={{ position: 'relative' }}>
          <Field label="Registreringsnummer *">
            <input type="text" value={regInput} onChange={(e) => handleRegInputChange(e.target.value)} placeholder="ABC 123" autoComplete="off" className="reg-input" onFocus={() => setShowSuggestions(regInput.length >= 2)} onBlur={() => setTimeout(() => setShowSuggestions(false), 150)} />
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
            <InfoRow label="Hjulförvaring:" value={viewWheelStorage ? 'Ja' : 'Nej'} />
            {existingDamages.length > 0 && (
              <div className="damage-list-info">
                <span className="damage-list-label">Befintliga skador:</span>
                {existingDamages.map(d => <div key={d.id} className="damage-list-item">- {d.shortText}</div>)}
              </div>
            )}
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
        <Field label="Däcktyp *"><div className="grid-2-col"><ChoiceButton onClick={() => setHjultyp('Sommardäck')} isActive={hjultyp === 'Sommardäck'}>Sommardäck</ChoiceButton><ChoiceButton onClick={() => setHjultyp('Vinterdäck')} isActive={hjultyp === 'Vinterdäck'}>Vinterdäck</ChoiceButton></div></Field>
        <SubSectionHeader title="Tankning/Laddning" />
        <Field label="Drivmedelstyp *"><div className="grid-2-col"><ChoiceButton onClick={() => setDrivmedelstyp('bensin_diesel')} isActive={drivmedelstyp === 'bensin_diesel'}>Bensin/Diesel</ChoiceButton><ChoiceButton onClick={() => setDrivmedelstyp('elbil')} isActive={drivmedelstyp === 'elbil'}>Elbil</ChoiceButton></div></Field>
        {drivmedelstyp === 'bensin_diesel' && (<><Field label="Tankstatus *"><select value={tankniva || ''} onChange={e => setTankniva(e.target.value as any)}><option value="">Välj tankstatus</option><option value="återlämnades_fulltankad">Återlämnades fulltankad</option><option value="tankad_nu">Tankad nu</option></select></Field>{tankniva === 'tankad_nu' && (<div className="grid-3-col"><Field label="Antal liter *"><input type="number" value={liters} onChange={e => setLiters(e.target.value)} placeholder="0.0" /></Field><Field label="Bränsle *"><div className="grid-2-col"><ChoiceButton onClick={() => setBransletyp('Bensin')} isActive={bransletyp === 'Bensin'}>Bensin</ChoiceButton><ChoiceButton onClick={() => setBransletyp('Diesel')} isActive={bransletyp === 'Diesel'}>Diesel</ChoiceButton></div></Field><Field label="Literpris *"><input type="number" value={literpris} onChange={e => setLiterpris(e.target.value)} placeholder="0.00" /></Field></div>)}</>)}
        {drivmedelstyp === 'elbil' && (<><Field label="Laddningsnivå vid återlämning (%) *"><input type="number" value={laddniva} onChange={e => setLaddniva(e.target.value)} placeholder="0-100" /></Field></>)}
      </Card>

      <Card data-error={showFieldErrors && (skadekontroll === null || (skadekontroll === 'nya_skador' && (newDamages.length === 0 || newDamages.some(d => !d.type || !d.carPart || !hasPhoto(d.media) || !hasVideo(d.media)))) || (existingDamages.filter(d => d.status === 'documented').some(d => !d.userType || !d.userCarPart || !hasPhoto(d.media))))}>
        <SectionHeader title="Skador" />
        <SubSectionHeader title="Befintliga skador från skadekort" />
        {existingDamages.length > 0 ? existingDamages.map(d => <DamageItem key={d.id} damage={d} isExisting={true} onUpdate={updateDamageField} onMediaUpdate={updateDamageMedia} onMediaRemove={removeDamageMedia} onAction={handleExistingDamageAction} />) : <p>Inga befintliga skador registrerade på skadekortet.</p>}
        <SubSectionHeader title="Skadekontroll" />
        <Field label="Har bilen några nya skador? *"><div className="grid-2-col"><ChoiceButton onClick={() => setSkadekontroll('inga_nya_skador')} isActive={skadekontroll === 'inga_nya_skador'}>Inga nya skador</ChoiceButton><ChoiceButton onClick={() => setSkadekontroll('nya_skador')} isActive={skadekontroll === 'nya_skador'}>Nya skador finns</ChoiceButton></div></Field>
        {skadekontroll === 'nya_skador' && (<>{newDamages.map(d => <DamageItem key={d.id} damage={d} isExisting={false} onUpdate={updateDamageField} onMediaUpdate={updateDamageMedia} onMediaRemove={removeDamageMedia} onRemove={removeDamage} />)}<Button onClick={addDamage} variant="primary" style={{ marginTop: '1rem' }}>+ Lägg till ny skada</Button></>)}
      </Card>

      <Card data-error={showFieldErrors && !isChecklistComplete}>
        <SectionHeader title="Checklista" />
        <ChoiceButton onClick={() => { if (!behoverRekond && !confirm('Är du säker på att bilen behöver rekond? (extra avgift kan tillkomma)')) return; setBehoverRekond(!behoverRekond); }} isActive={behoverRekond} className="rekond-checkbox">⚠️ Behöver rekond</ChoiceButton>
        <SubSectionHeader title="Allt måste vara OK för att slutföra" />
        <div className="grid-2-col">
          <ChoiceButton onClick={() => setInsynsskyddOK(!insynsskyddOK)} isActive={insynsskyddOK}>Insynsskydd OK</ChoiceButton>
          <ChoiceButton onClick={() => setDekalDjurRokningOK(!dekalDjurRokningOK)} isActive={dekalDjurRokningOK}>Dekal Djur/Rökning OK</ChoiceButton>
          <ChoiceButton onClick={() => setIsskrapaOK(!isskrapaOK)} isActive={isskrapaOK}>Isskrapa OK</ChoiceButton>
          <ChoiceButton onClick={() => setPskivaOK(!pskivaOK)} isActive={pskivaOK}>P-skiva OK</ChoiceButton>
          <ChoiceButton onClick={() => setSkyltRegplatOK(!skyltRegplatOK)} isActive={skyltRegplatOK}>Skylt Reg.plåt OK</ChoiceButton>
          <ChoiceButton onClick={() => setDekalGpsOK(!dekalGpsOK)} isActive={dekalGpsOK}>Dekal GPS OK</ChoiceButton>
          <ChoiceButton onClick={() => setSpolarvatskaOK(!spolarvatskaOK)} isActive={spolarvatskaOK}>Spolarvätska OK</ChoiceButton>
          {drivmedelstyp === 'bensin_diesel' && <ChoiceButton onClick={() => setAdblueOK(!adblueOK)} isActive={adblueOK}>AdBlue OK</ChoiceButton>}
          <ChoiceButton onClick={() => setWashed(!washed)} isActive={washed}>Bilen tvättad</ChoiceButton>
        </div>
      </Card>

      <Card>
        <Field label="Kommentarer (frivilligt)">
          <textarea value={preliminarAvslutNotering} onChange={e => setPreliminarAvslutNotering(e.target.value)} placeholder="Övrig info..." rows={4}></textarea>
        </Field>
      </Card>

      <div className="form-actions">
        <Button onClick={handleCancel} variant="secondary">Avbryt</Button>
        <Button onClick={formIsValidState ? handleSubmitFinal : handleShowErrors} disabled={isFinalSaving || !regInput} variant={formIsValidState ? 'success' : 'disabled'}>
          {!formIsValidState ? 'Visa saknad information' : (isFinalSaving ? 'Skickar in...' : 'Slutför incheckning')}
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
const InfoRow: React.FC<{ label: string, value: string }> = ({ label, value }) => <div className="info-row"><span>{label}</span><span>{value}</span></div>;

const Button: React.FC<React.PropsWithChildren<{ onClick?: () => void, variant?: string, disabled?: boolean, style?: object }>> = ({ onClick, variant = 'primary', disabled, children, style }) => (
  <button onClick={onClick} className={`btn ${variant}`} disabled={disabled} style={style}>{children}</button>
);

const SuccessModal: React.FC<{ firstName: string }> = ({ firstName }) => (
  <>
    <div className="modal-overlay" />
    <div className="modal-content">
      <div className="success-icon">✓</div>
      <h3>Tack {firstName}!</h3>
      <p>Incheckningen har skickats.</p>
    </div>
  </>
);

const DamageItem: React.FC<{
  damage: ExistingDamage | NewDamage; isExisting: boolean;
  onUpdate: (id: string, field: string, value: any, isExisting: boolean) => void;
  onMediaUpdate: (id: string, files: FileList, isExisting: boolean) => void;
  onMediaRemove: (id: string, index: number, isExisting: boolean) => void;
  onAction?: (id: string, action: 'document' | 'resolve') => void;
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
            <Button onClick={() => onAction(damage.id, 'document')} variant={isDocumented ? 'success' : 'secondary'} style={{ flex: 1 }}>Dokumentera</Button>
            <Button onClick={() => onAction(damage.id, 'resolve')} variant={resolved ? 'warning' : 'secondary'} style={{ flex: 1 }}>Åtgärdad/Hittas ej</Button>
          </div>
        )}
        {!isExisting && onRemove && <Button onClick={() => onRemove(damage.id)} variant="danger">Ta bort</Button>}
      </div>
      {(isDocumented || !isExisting) && !resolved && (
        <div className="damage-details">
          <div className="grid-3-col">
            <Field label="Typ av skada *"><select value={commonProps.type || ''} onChange={e => onUpdate(damage.id, fieldKey('type'), e.target.value, isExisting)}><option value="">Välj typ</option>{DAMAGE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></Field>
            <Field label="Placering *"><select value={commonProps.carPart || ''} onChange={e => onUpdate(damage.id, fieldKey('carPart'), e.target.value, isExisting)}><option value="">Välj del</option>{getRelevantCarParts(commonProps.type || '').map(p => <option key={p} value={p}>{p}</option>)}</select></Field>
            <Field label="Position"><select value={commonProps.position || ''} onChange={e => onUpdate(damage.id, fieldKey('position'), e.target.value, isExisting)} disabled={!CAR_PARTS[commonProps.carPart] || CAR_PARTS[commonProps.carPart].length === 0}><option value="">Välj pos.</option>{(CAR_PARTS[commonProps.carPart] || []).map(p => <option key={p} value={p}>{p}</option>)}</select></Field>
          </div>
          <Field label="Beskrivning (frivilligt)"><textarea value={commonProps.description || ''} onChange={e => onUpdate(damage.id, isExisting ? 'userDescription' : 'text', e.target.value, isExisting)} placeholder="Mer detaljer om skadan..." rows={3}></textarea></Field>
          <div className="media-section">
            <MediaUpload id={`photo-${damage.id}`} onUpload={files => onMediaUpdate(damage.id, files, isExisting)} required={true} label="Foto *" />
            <MediaUpload id={`video-${damage.id}`} onUpload={files => onMediaUpdate(damage.id, files, isExisting)} required={!isExisting} label={isExisting ? "Video (frivilligt)" : "Video *"} />
          </div>
          <div className="media-previews">
            {damage.media?.map((m, i) => <MediaButton key={i} hasFile={true} onRemove={() => onMediaRemove(damage.id, i, isExisting)}><img src={m.thumbnail || m.preview} alt="preview" /></MediaButton>)}
          </div>
        </div>
      )}
    </div>
  );
};

const MediaUpload: React.FC<{ id: string, onUpload: (files: FileList) => void, required: boolean, label: string }> = ({ id, onUpload, required, label }) => (
  <div className="media-upload">
    <label htmlFor={id} className="media-label">{label}</label>
    <input id={id} type="file" accept="image/*,video/*" capture="environment" onChange={e => e.target.files && onUpload(e.target.files)} style={{ display: 'none' }} multiple />
  </div>
);

const MediaButton: React.FC<React.PropsWithChildren<{ onRemove?: () => void, hasFile: boolean }>> = ({ children, onRemove, hasFile }) => (
  <div className={`media-btn ${hasFile ? 'has-file' : ''}`}>
    {children}
    {onRemove && <button onClick={onRemove} className="remove-media-btn">×</button>}
  </div>
);

const ChoiceButton: React.FC<{onClick: () => void, isActive: boolean, children: React.ReactNode, className?: string}> = ({ onClick, isActive, children, className }) => (
    <button onClick={onClick} className={`choice-btn ${isActive ? 'active' : ''} ${className || ''}`}>{children}</button>
);

const GlobalStyles = () => (
    <style jsx global>{`
        :root {
          --color-bg: #f8fafc; --color-card: #ffffff; --color-text: #1f2937; --color-text-secondary: #6b7280;
          --color-primary: #2563eb; --color-primary-light: #eff6ff; --color-success: #16a34a; --color-success-light: #f0fdf4;
          --color-danger: #dc2626; --color-danger-light: #fef2f2; --color-warning: #f59e0b; --color-warning-light: #fefce8;
          --color-border: #e5e7eb; --color-border-focus: #3b82f6; --color-disabled: #a1a1aa; --color-disabled-light: #f4f4f5;
          --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05); --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
        }
        body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; background-color: var(--color-bg); color: var(--color-text); margin: 0; }
        .checkin-form { max-width: 700px; margin: 0 auto; padding: 1rem; box-sizing: border-box; }
        .main-header { text-align: center; margin-bottom: 1.5rem; }
        .main-logo { max-width: 150px; height: auto; margin-bottom: 1rem; }
        .user-info { font-weight: 500; color: var(--color-text-secondary); margin: 0; }
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
        .damage-list-info { margin-top: 0.75rem; }
        .damage-list-label { font-weight: 600; display: block; margin-bottom: 0.25rem; }
        .damage-list-item { padding-left: 1rem; line-height: 1.4; font-size: 0.875rem;}
        .grid-2-col { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; }
        .grid-3-col { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; margin-top: 1rem; }
        .form-actions { margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid var(--color-border); display: flex; gap: 1rem; justify-content: flex-end; padding-bottom: 3rem; }
        .btn { padding: 0.75rem 1.5rem; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
        .btn.primary { background-color: var(--color-primary); color: white; }
        .btn.secondary { background-color: var(--color-border); color: var(--color-text); }
        .btn.success { background-color: var(--color-success); color: white; }
        .btn.danger { background-color: var(--color-danger); color: white; }
        .btn.warning { background-color: var(--color-warning); color: white; }
        .btn.disabled { background-color: var(--color-disabled-light); color: var(--color-disabled); cursor: not-allowed; }
        .btn:not(:disabled):hover { filter: brightness(1.1); }
        .choice-btn { display: flex; align-items: center; justify-content: center; width: 100%; padding: 0.85rem 1rem; border-radius: 8px; border: 2px solid var(--color-danger); background-color: var(--color-danger-light); color: var(--color-danger); font-size: 0.9rem; font-weight: 600; text-align: center; cursor: pointer; transition: all 0.2s ease; }
        .choice-btn:hover { filter: brightness(1.05); }
        .choice-btn.active { border-color: var(--color-success); background-color: var(--color-success-light); color: var(--color-success); }
        .rekond-checkbox { margin-bottom: 1.5rem; border-color: var(--color-danger) !important; background-color: var(--color-danger-light) !important; color: var(--color-danger) !important; }
        .rekond-checkbox.active { border-color: var(--color-danger) !important; background-color: var(--color-danger) !important; color: white !important; }
        .damage-item { border: 1px solid var(--color-border); border-radius: 8px; margin-bottom: 1rem; overflow: hidden; }
        .damage-item.resolved { opacity: 0.6; background-color: var(--color-warning-light); }
        .damage-item-header { display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 1rem; background-color: #f9fafb; font-weight: 600; }
        .damage-item-actions { display: flex; gap: 0.5rem; }
        .damage-details { padding: 1rem; border-top: 1px solid var(--color-border); }
        .media-section { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 1rem; }
        .media-label { display: block; text-align: center; padding: 1.5rem 1rem; border: 2px dashed var(--color-border); border-radius: 8px; cursor: pointer; transition: all 0.2s; }
        .media-label:hover { border-color: var(--color-primary); background-color: var(--color-primary-light); }
        .media-previews { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 1rem; }
        .media-btn { position: relative; width: 70px; height: 70px; border-radius: 8px; overflow: hidden; background-color: var(--color-border); }
        .media-btn img { width: 100%; height: 100%; object-fit: cover; }
        .remove-media-btn { position: absolute; top: 2px; right: 2px; width: 20px; height: 20px; border-radius: 50%; background-color: rgba(0,0,0,0.6); color: white; border: none; display: flex; align-items: center; justify-content: center; font-size: 14px; cursor: pointer; line-height: 20px; }
        .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background-color: rgba(0,0,0,0.5); z-index: 100; }
        .modal-content { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background-color: white; padding: 2rem 3rem; border-radius: 12px; text-align: center; z-index: 101; box-shadow: var(--shadow-md); }
        .success-icon { width: 60px; height: 60px; border-radius: 50%; background-color: var(--color-success); color: white; display: flex; align-items: center; justify-content: center; font-size: 2rem; margin: 0 auto 1rem; }
    `}</style>
)

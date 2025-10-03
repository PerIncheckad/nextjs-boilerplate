'use client';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Autocomplete } from '@mui/material';
import TextField from '@mui/material/TextField';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { fetchDamageCard, normalizeReg } from '@/lib/damages';
import { STATIONS } from '@/lib/stations';

type MediaFile = {
    file: File;
    type: 'image' | 'video';
    preview?: string; // for images
    thumbnail?: string; // for videos
};

type ExistingDamage = {
    id: string;
    text: string;
    status: 'unseen' | 'documented' | 'resolved';
    userText?: string;
    media?: MediaFile[];
};

type NewDamage = {
    id: string;
    type: string;
    carPart: string;
    position: string;
    text: string;
    media: MediaFile[];
};

type ConfirmDialogState = {
    isOpen: boolean;
    text: string;
    title?: string;
    onConfirm: () => void;
    confirmText?: string;
    confirmVariant?: 'primary' | 'secondary' | 'danger' | 'success';
    theme?: 'default' | 'warning' | 'danger'; // För att styra stilen på dialogen
};

const hasPhoto = (files?: MediaFile[]) => Array.isArray(files) && files.some(f => f?.type === 'image');
const hasVideo = (files?: MediaFile[]) => Array.isArray(files) && files.some(f => f?.type === 'video');

function slugify(s: string) {
    if (!s) return '';
    return s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "");
}

async function uploadOne(file: File, reg: string, damageId: string): Promise<string> {
    const supabase = createClientComponentClient();
    const timestamp = Math.floor(Date.now() / 1000);
    const fileExt = file.name.split('.').pop() || 'tmp';
    const filePath = `${reg}/${damageId}_${timestamp}.${fileExt}`;

    const { error } = await supabase.storage.from('damage-media').upload(filePath, file);
    if (error) throw error;

    const { data } = supabase.storage.from('damage-media').getPublicUrl(filePath);
    return data.publicUrl;
}

function partitionMediaByType(files: MediaFile[]) {
    return files.reduce((acc, file) => {
        if (file.type === 'image') acc.images.push(file);
        else acc.videos.push(file);
        return acc;
    }, { images: [] as MediaFile[], videos: [] as MediaFile[] });
}

async function uploadAllForDamage(damage: { id: string; media?: MediaFile[] }, reg: string): Promise<{ photo_urls: string[]; video_urls: string[] }> {
    if (!damage.media || damage.media.length === 0) {
        return { photo_urls: [], video_urls: [] };
    }

    const { images, videos } = partitionMediaByType(damage.media);

    const uploadPromises = [
        ...images.map(f => uploadOne(f.file, reg, slugify(damage.id))),
        ...videos.map(f => uploadOne(f.file, reg, slugify(damage.id)))
    ];

    const results = await Promise.all(uploadPromises);
    const photo_urls = results.slice(0, images.length);
    const video_urls = results.slice(images.length);

    return { photo_urls, video_urls };
}

function getRelevantCarParts(damageType: string): string[] {
    const map: Record<string, string[]> = {
        "Inredning": ["Stol", "Dörrsida", "Handskfack", "Innertak", "Lastutrymme", "Matta", "Annat"],
        "Exteriör": ["Stötfångare", "Dörr", "Skärm", "Motorhuv", "Tröskel", "Tak", "Backspegel", "Grill", "List", "Annat"],
        "Glas": ["Vindruta", "Sidoruta", "Bakruta", "Annat"],
        "Däck/Fälg": ["Däck", "Fälg", "Hjulsida", "Annat"],
    };
    return map[damageType] || [];
}

const getFileType = (file: File) => file.type.startsWith('video') ? 'video' : 'image';

const createVideoThumbnail = (file: File): Promise<string> => new Promise(resolve => {
    const video = document.createElement('video');
    video.src = URL.createObjectURL(file);
    video.onloadeddata = () => { video.currentTime = 1; };
    video.onseeked = () => {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg'));
        URL.revokeObjectURL(video.src);
    };
    video.onerror = () => { resolve(''); URL.revokeObjectURL(video.src); };
});

const processFiles = async (files: FileList): Promise<MediaFile[]> => {
    const processedFiles: MediaFile[] = [];
    for (const file of Array.from(files)) {
        const type = getFileType(file);
        if (type === 'image') {
            processedFiles.push({ file, type, preview: URL.createObjectURL(file) });
        } else {
            const thumbnail = await createVideoThumbnail(file);
            processedFiles.push({ file, type, thumbnail });
        }
    }
    return processedFiles;
};

const getFirstNameFromEmail = (email: string): string => {
    if (!email) return '';
    const namePart = email.split('@')[0];
    const names = namePart.split('.');
    if (names.length > 0) {
        const firstName = names[0];
        return firstName.charAt(0).toUpperCase() + firstName.slice(1);
    }
    return '';
};

export default function CheckInForm() {
    const router = useRouter();
    const supabase = createClientComponentClient();

    const [allRegistrations, setAllRegistrations] = useState<string[]>([]);
    const [regnr, setRegnr] = useState('');
    const [carData, setCarData] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showSuccess, setShowSuccess] = useState(false);
    const [firstName, setFirstName] = useState('');

    // Form state
    const [ort, setOrt] = useState('');
    const [station, setStation] = useState('');
    const [matarstallning, setMatarstallning] = useState('');
    const [drivmedel, setDrivmedel] = useState('');
    const [tankstatus, setTankstatus] = useState('');
    const [tankadLiter, setTankadLiter] = useState('');
    const [literpris, setLiterpris] = useState('');
    const [bransletyp, setBransletyp] = useState('');
    const [laddstatus, setLaddstatus] = useState('');
    const [dack, setDack] = useState('');
    const [behoverRekond, setBehoverRekond] = useState(false);
    const [isTvattad, setIsTvattad] = useState(false);
    const [isInsynsskyddOk, setIsInsynsskyddOk] = useState(false);
    const [isDekalOk, setIsDekalOk] = useState(false);
    const [isIsskrapaOk, setIsIsskrapaOk] = useState(false);

    const [existingDamages, setExistingDamages] = useState<ExistingDamage[]>([]);
    const [newDamages, setNewDamages] = useState<NewDamage[]>([]);

    const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>({ isOpen: false, text: '', onConfirm: () => {} });
    const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);
    const [formErrors, setFormErrors] = useState<string[]>([]);

    const startAtRef = useRef<string | null>(null);

    useEffect(() => {
        getUser();
        fetchAllRegistrations();
        startAtRef.current = new Date().toISOString();
    }, []);

    const getUser = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        setFirstName(getFirstNameFromEmail(user?.email || ''));
    };

    async function fetchAllRegistrations() {
        const { data, error } = await supabase.rpc('get_all_allowed_plates');
        if (data) setAllRegistrations(data);
        if (error) console.error("Error fetching registrations:", error);
    }

    const handleRegnrSubmit = async (value: string | null) => {
        const finalReg = normalizeReg(value || '');
        if (finalReg.length < 6) {
            setError('Ange ett giltigt registreringsnummer (minst 6 tecken).');
            return;
        }
        setRegnr(finalReg);
        setIsLoading(true);
        setError(null);
        setCarData(null);
        setExistingDamages([]);

        try {
            const data = await fetchDamageCard(finalReg);
            if (data) {
                setCarData(data);
                setExistingDamages(data.skador.map((text, i) => ({ id: `existing_${i}`, text, status: 'unseen' })));
            } else {
                setError(`Kunde inte hitta bilen med registreringsnummer ${finalReg}.`);
            }
        } catch (e: any) {
            setError(`Ett fel uppstod: ${e.message}`);
        } finally {
            setIsLoading(false);
        }
    };
    
    const validationRules = [
        { field: 'Ort', value: ort },
        { field: 'Station', value: station },
        { field: 'Mätarställning', value: matarstallning },
        { field: 'Drivmedelstyp', value: drivmedel },
        { field: 'Däck', value: dack },
    ];
    
    if (drivmedel === 'Bensin/Diesel') {
        validationRules.push({ field: 'Tankstatus', value: tankstatus });
        if (tankstatus === 'Tanka nu') {
            validationRules.push({ field: 'Antal liter', value: tankadLiter });
            validationRules.push({ field: 'Literpris', value: literpris });
            validationRules.push({ field: 'Bränsletyp', value: bransletyp });
        }
    } else if (drivmedel === 'Elbil') {
        validationRules.push({ field: 'Laddstatus', value: laddstatus });
    }

    newDamages.forEach((d, i) => {
        validationRules.push({ field: `Ny skada #${i+1}: Typ`, value: d.type });
        validationRules.push({ field: `Ny skada #${i+1}: Bildel`, value: d.carPart });
        validationRules.push({ field: `Ny skada #${i+1}: Position`, value: d.position });
        validationRules.push({ field: `Ny skada #${i+1}: Foto`, value: hasPhoto(d.media) ? 'true' : '' });
        validationRules.push({ field: `Ny skada #${i+1}: Video`, value: hasVideo(d.media) ? 'true' : '' });
    });

    const isFormComplete = useMemo(() => {
        const hasUnresolved = existingDamages.some(d => d.status === 'unseen');
        const checklistOk = isTvattad && isInsynsskyddOk && isDekalOk && isIsskrapaOk;
        const baseFieldsValid = validationRules.every(rule => !!rule.value);
        return !hasUnresolved && checklistOk && baseFieldsValid;
    }, [existingDamages, isTvattad, isInsynsskyddOk, isDekalOk, isIsskrapaOk, validationRules]);
    
    const handleShowErrors = () => {
        const errors: string[] = [];
        if (existingDamages.some(d => d.status === 'unseen')) {
            errors.push('Alla befintliga skador måste hanteras (antingen "Dokumentera" eller "Åtgärdad/hittar ej").');
        }
        if (!isTvattad) errors.push('Bilen måste vara markerad som "Tvättad".');
        if (!isInsynsskyddOk) errors.push('"Insynsskydd finns" måste vara markerat.');
        if (!isDekalOk) errors.push('"Dekal Djur/rökning finns" måste vara markerat.');
        if (!isIsskrapaOk) errors.push('"Isskrapa finns" måste vara markerat.');

        validationRules.forEach(rule => {
            if (!rule.value) {
                errors.push(`Fältet "${rule.field}" måste vara ifyllt.`);
            }
        });
        setFormErrors(errors);
    };

    const resetForm = () => {
        setRegnr('');
        setCarData(null);
        setError(null);
        setIsLoading(false);
        setOrt('');
        setStation('');
        setMatarstallning('');
        setDrivmedel('');
        setTankstatus('');
        setTankadLiter('');
        setLiterpris('');
        setBransletyp('');
        setLaddstatus('');
        setDack('');
        setBehoverRekond(false);
        setIsTvattad(false);
        setIsInsynsskyddOk(false);
        setIsDekalOk(false);
        setIsIsskrapaOk(false);
        setExistingDamages([]);
        setNewDamages([]);
        setShowConfirmSubmit(false);
        setFormErrors([]);
        startAtRef.current = new Date().toISOString();
    };

    const handleCancel = () => {
        setConfirmDialog({
            isOpen: true,
            title: 'Avbryt incheckning',
            text: 'Är du säker? Alla ifyllda uppgifter kommer att raderas.',
            confirmText: 'Ja, avbryt',
            confirmVariant: 'danger',
            theme: 'danger',
            onConfirm: () => {
                resetForm();
                router.push('/');
            }
        });
    };
    
    const confirmAndSubmit = async () => {
        setIsSubmitting(true);
        const endAt = new Date().toISOString();

        try {
            const allUploadedMedia = await Promise.all([
                ...existingDamages.filter(d => d.status === 'documented').map(d => uploadAllForDamage(d, regnr)),
                ...newDamages.map(d => uploadAllForDamage(d, regnr))
            ]);

            const [documentedDamagesMedia, newDamagesMedia] = [
                allUploadedMedia.slice(0, existingDamages.filter(d => d.status === 'documented').length),
                allUploadedMedia.slice(existingDamages.filter(d => d.status === 'documented').length)
            ];

            const checkinData = {
                regnr,
                car_model: carData.carModel,
                station_city: ort,
                station_name: station,
                mileage: parseInt(matarstallning, 10),
                fuel_type: drivmedel,
                fuel_status: tankstatus,
                fuel_liters_added: tankadLiter ? parseInt(tankadLiter, 10) : null,
                fuel_price_per_liter: literpris ? parseFloat(literpris) : null,
                fuel_added_type: bransletyp,
                charge_status: laddstatus,
                tire_type: dack,
                needs_recond: behoverRekond,
                is_washed: isTvattad,
                has_privacy_cover: isInsynsskyddOk,
                has_animal_decal: isDekalOk,
                has_ice_scraper: isIsskrapaOk,
                start_at: startAtRef.current,
                end_at: endAt,
            };

            const { data: checkinResult, error: checkinError } = await supabase
                .from('checkins')
                .insert(checkinData)
                .select('id')
                .single();

            if (checkinError) throw checkinError;
            const checkinId = checkinResult.id;

            const damagePromises = [];

            // Befintliga, dokumenterade skador
            existingDamages.forEach((damage, index) => {
                if (damage.status === 'documented') {
                    damagePromises.push(
                        supabase.from('checkin_damages').insert({
                            checkin_id: checkinId,
                            is_existing: true,
                            original_text: damage.text,
                            user_notes: damage.userText,
                        }).select('id').single()
                        .then(res => {
                            if (res.error) throw res.error;
                            const media = documentedDamagesMedia[existingDamages.filter(d => d.status === 'documented').findIndex(d => d.id === damage.id)];
                            const photoInserts = (media.photo_urls || []).map(url => ({ damage_id: res.data.id, url, type: 'image' }));
                            const videoInserts = (media.video_urls || []).map(url => ({ damage_id: res.data.id, url, type: 'video' }));
                            return supabase.from('checkin_damage_photos').insert([...photoInserts, ...videoInserts]);
                        })
                    );
                }
            });

            // Nya skador
            newDamages.forEach((damage, index) => {
                damagePromises.push(
                    supabase.from('checkin_damages').insert({
                        checkin_id: checkinId,
                        is_existing: false,
                        damage_type: damage.type,
                        car_part: damage.carPart,
                        position: damage.position,
                        user_notes: damage.text,
                    }).select('id').single()
                    .then(res => {
                        if (res.error) throw res.error;
                        const media = newDamagesMedia[index];
                        const photoInserts = (media.photo_urls || []).map(url => ({ damage_id: res.data.id, url, type: 'image' }));
                        const videoInserts = (media.video_urls || []).map(url => ({ damage_id: res.data.id, url, type: 'video' }));
                        return supabase.from('checkin_damage_photos').insert([...photoInserts, ...videoInserts]);
                    })
                );
            });

            await Promise.all(damagePromises);
            
            // Send notification email
            const regionMap: { [key: string]: 'Norr' | 'Mitt' | 'Syd' } = {
                'Ängelholm': 'Syd', 'Falkenberg': 'Syd', 'Halmstad': 'Syd', 'Helsingborg': 'Syd',
                'Lund': 'Syd', 'Malmö': 'Syd', 'Trelleborg': 'Syd', 'Varberg': 'Syd',
            };

            const emailPayload = {
                regnr,
                station: `${ort} / ${station}`,
                time: new Date().toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }),
                hasNewDamages: newDamages.length > 0,
                needsRecond: behoverRekond,
                region: regionMap[ort] || 'Syd',
            };

            await fetch('/api/notify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(emailPayload),
            });


            setShowSuccess(true);
        } catch (e: any) {
            setError(`Ett allvarligt fel uppstod vid sparandet: ${e.message}`);
        } finally {
            setIsSubmitting(false);
            setShowConfirmSubmit(false);
        }
    };

    const handleExistingDamageAction = (id: string, action: 'document' | 'resolve', shortText: string) => {
        if (action === 'document') {
            setExistingDamages(prev => prev.map(d => d.id === id ? { ...d, status: 'documented' } : d));
        } else {
            setConfirmDialog({
                isOpen: true,
                title: 'Bekräfta åtgärd',
                text: `Är du säker på att du vill markera skadan "${shortText}" som åtgärdad eller ej hittad?`,
                confirmText: 'Ja, bekräfta',
                confirmVariant: 'success',
                onConfirm: () => {
                    setExistingDamages(prev => prev.map(d => d.id === id ? { ...d, status: 'resolved' } : d));
                }
            });
        }
    };

    const handleRekondClick = () => {
        setConfirmDialog({
            isOpen: true,
            title: 'Bekräfta rekond',
            text: 'Är du säker på att bilen behöver rekond? En extra avgift kan tillkomma.',
            confirmText: 'Bekräfta',
            confirmVariant: 'danger',
            theme: 'warning',
            onConfirm: () => setBehoverRekond(true)
        });
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
            if (d.id === id) {
                const newMedia = [...d.media];
                const removed = newMedia.splice(index, 1)[0];
                if (removed.preview) URL.revokeObjectURL(removed.preview);
                if (removed.thumbnail) URL.revokeObjectURL(removed.thumbnail);
                return { ...d, media: newMedia };
            }
            return d;
        }));
    };

    const addDamage = () => {
        setNewDamages(prev => [...prev, { id: `new_${Date.now()}`, type: '', carPart: '', position: '', text: '', media: [] }]);
    };

    const removeDamage = (id: string) => {
        setConfirmDialog({
            isOpen: true,
            title: 'Ta bort ny skada',
            text: 'Är du säker på att du vill ta bort den här nya skadan?',
            confirmText: 'Ja, ta bort',
            confirmVariant: 'danger',
            theme: 'danger',
            onConfirm: () => setNewDamages(prev => prev.filter(d => d.id !== id))
        });
    };

    if (showSuccess) {
        return <SuccessModal firstName={firstName} />;
    }

    if (!regnr || !carData) {
        return (
            <main className="container">
                <GlobalStyles />
                <div className="regnr-entry">
                    <h1>MABI Check-in</h1>
                    <p>Börja med att ange bilens registreringsnummer.</p>
                    <Autocomplete
                        freeSolo
                        options={allRegistrations}
                        onInputChange={(_, newValue) => setRegnr(newValue)}
                        onChange={(_, newValue) => handleRegnrSubmit(newValue)}
                        renderInput={(params) => (
                            <TextField
                                {...params}
                                label="Registreringsnummer"
                                variant="outlined"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        handleRegnrSubmit(regnr);
                                    }
                                }}
                            />
                        )}
                        className="regnr-autocomplete"
                    />
                    <Button onClick={() => handleRegnrSubmit(regnr)} disabled={isLoading}>
                        {isLoading ? 'Laddar...' : 'Hämta bildata'}
                    </Button>
                    {error && <p className="error-message">{error}</p>}
                </div>
            </main>
        );
    }
    
    const availableStations = STATIONS[ort] || [];
    
    return (
        <main className="container">
            <GlobalStyles />
            {isSubmitting && <SpinnerOverlay />}
            <ActionConfirmDialog state={confirmDialog} onClose={() => setConfirmDialog({ ...confirmDialog, isOpen: false })} />
            {showConfirmSubmit && (
                <ConfirmModal
                    payload={{
                        regnr, carModel: carData.carModel, ort, station,
                        matarstallning, drivmedel, tankstatus, tankadLiter, literpris, bransletyp,
                        laddstatus, dack, behoverRekond, isTvattad, isInsynsskyddOk, isDekalOk, isIsskrapaOk,
                        newDamages,
                    }}
                    onConfirm={confirmAndSubmit}
                    onCancel={() => setShowConfirmSubmit(false)}
                />
            )}

            <header className="page-header">
                <h1>Incheckning av {regnr}</h1>
                <p>{carData.carModel}</p>
            </header>

            {/* Form sections */}
            <Card>
                <SectionHeader title="Plats & Tid" />
                <Field label="Ort *">
                    <select value={ort} onChange={e => { setOrt(e.target.value); setStation(''); }}>
                        <option value="">Välj ort...</option>
                        {Object.keys(STATIONS).map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                </Field>
                {ort && (
                    <Field label="Station *">
                        <select value={station} onChange={e => setStation(e.target.value)}>
                            <option value="">Välj station...</option>
                            {availableStations.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                        </select>
                    </Field>
                )}
            </Card>

            <Card>
                <SectionHeader title="Status vid återlämning" />
                <Field label="Mätarställning (km) *">
                    <input type="number" value={matarstallning} onChange={e => setMatarstallning(e.target.value)} placeholder="Ange mätarställning" />
                </Field>

                <SubSectionHeader title="Tankning/Laddning" />
                <Field label="Drivmedelstyp *">
                    <div className="choice-group">
                        <ChoiceButton onClick={() => setDrivmedel('Bensin/Diesel')} isActive={drivmedel === 'Bensin/Diesel'} isSet={!!drivmedel}>Bensin/Diesel</ChoiceButton>
                        <ChoiceButton onClick={() => setDrivmedel('Elbil')} isActive={drivmedel === 'Elbil'} isSet={!!drivmedel}>Elbil</ChoiceButton>
                    </div>
                </Field>

                {drivmedel === 'Bensin/Diesel' && (
                    <>
                        <Field label="Tankstatus *">
                            <div className="choice-group">
                                <ChoiceButton onClick={() => setTankstatus('Återlämnades fulltankad')} isActive={tankstatus === 'Återlämnades fulltankad'} isSet={!!tankstatus}>Återlämnades fulltankad</ChoiceButton>
                                <ChoiceButton onClick={() => setTankstatus('Tanka nu')} isActive={tankstatus === 'Tanka nu'} isSet={!!tankstatus}>Tankad nu av MABI</ChoiceButton>
                            </div>
                        </Field>
                        {tankstatus === 'Tanka nu' && (
                            <div className="tankning-details">
                                <Field label="Antal liter *">
                                    <input type="number" value={tankadLiter} onChange={e => setTankadLiter(e.target.value)} placeholder="t.ex. 50" />
                                </Field>
                                <Field label="Bränsletyp *">
                                    <div className="choice-group fuel-type-buttons">
                                        <ChoiceButton onClick={() => setBransletyp('Bensin')} isActive={bransletyp === 'Bensin'} className="fuel-btn" isSet={!!bransletyp}>Bensin</ChoiceButton>
                                        <ChoiceButton onClick={() => setBransletyp('Diesel')} isActive={bransletyp === 'Diesel'} className="fuel-btn" isSet={!!bransletyp}>Diesel</ChoiceButton>
                                    </div>
                                </Field>
                                <Field label="Literpris *">
                                    <input type="number" step="0.01" value={literpris} onChange={e => setLiterpris(e.target.value)} placeholder="t.ex. 20.50" />
                                </Field>
                            </div>
                        )}
                    </>
                )}

                {drivmedel === 'Elbil' && (
                    <Field label="Laddstatus *">
                        <div className="choice-group">
                            <ChoiceButton onClick={() => setLaddstatus('Fulladdad')} isActive={laddstatus === 'Fulladdad'} isSet={!!laddstatus}>Återlämnades fulladdad (80-100%)</ChoiceButton>
                            <ChoiceButton onClick={() => setLaddstatus('Laddas nu')} isActive={laddstatus === 'Laddas nu'} isSet={!!laddstatus}>Laddas nu av MABI</ChoiceButton>
                        </div>
                    </Field>
                )}
                
                <SubSectionHeader title="Hjul" />
                <Field label="Däck *">
                    <div className="choice-group">
                        <ChoiceButton onClick={() => setDack('Sommardäck')} isActive={dack === 'Sommardäck'} isSet={!!dack}>Sommardäck</ChoiceButton>
                        <ChoiceButton onClick={() => setDack('Vinterdäck')} isActive={dack === 'Vinterdäck'} isSet={!!dack}>Vinterdäck</ChoiceButton>
                    </div>
                </Field>
                {carData.hjulförvaring && <p className="info-text">Information från systemet: {carData.hjulförvaring}</p>}
            </Card>

            <Card>
                <SectionHeader title="Skador" />
                <SubSectionHeader title="Befintliga skador" />
                {existingDamages.length > 0 ? (
                    <div className="damage-list">
                        {existingDamages.map(d => (
                            <DamageItem
                                key={d.id}
                                damage={d}
                                isExisting={true}
                                onAction={handleExistingDamageAction}
                                onUpdateField={updateDamageField}
                                onUpdateMedia={updateDamageMedia}
                                onRemoveMedia={removeDamageMedia}
                            />
                        ))}
                    </div>
                ) : <p>Inga befintliga skador registrerade på denna bil.</p>}

                <SubSectionHeader title="Nya skador" />
                <div className="damage-list">
                    {newDamages.map(d => (
                        <DamageItem
                            key={d.id}
                            damage={d}
                            isExisting={false}
                            onRemove={removeDamage}
                            onUpdateField={updateDamageField}
                            onUpdateMedia={updateDamageMedia}
                            onRemoveMedia={removeDamageMedia}
                        />
                    ))}
                </div>
                <Button onClick={addDamage} variant="secondary">Lägg till ny skada</Button>
            </Card>

            <Card>
                <SectionHeader title="Rekonditionering" />
                <Button onClick={handleRekondClick} variant={behoverRekond ? 'success' : 'warning'}>
                    {behoverRekond ? '✓ Behov av rekond bekräftat' : 'Behöver rekond'}
                </Button>
            </Card>

            <Card>
                <SectionHeader title="Slutlig checklista" />
                <p>Allt måste vara OK för att slutföra.</p>
                <div className="checklist">
                    <ChoiceButton onClick={() => setIsTvattad(!isTvattad)} isActive={isTvattad}>Tvättad</ChoiceButton>
                    <ChoiceButton onClick={() => setIsInsynsskyddOk(!isInsynsskyddOk)} isActive={isInsynsskyddOk}>Insynsskydd finns</ChoiceButton>
                    <ChoiceButton onClick={() => setIsDekalOk(!isDekalOk)} isActive={isDekalOk}>Dekal "Djur/rökning" finns</ChoiceButton>
                    <ChoiceButton onClick={() => setIsIsskrapaOk(!isIsskrapaOk)} isActive={isIsskrapaOk}>Isskrapa finns</ChoiceButton>
                </div>
            </Card>

            <div className="form-actions">
                <Button onClick={handleCancel} variant="secondary">Avbryt</Button>
                <Button onClick={() => isFormComplete ? setShowConfirmSubmit(true) : handleShowErrors()} disabled={isSubmitting}>
                    {isSubmitting ? 'Sparar...' : 'Slutför incheckning'}
                </Button>
            </div>
            
            {formErrors.length > 0 && (
                <div className="error-summary">
                    <h4>Incheckningen kan inte slutföras:</h4>
                    <ul>
                        {formErrors.map((err, i) => <li key={i}>{err}</li>)}
                    </ul>
                    <Button onClick={() => setFormErrors([])} variant="secondary">Stäng</Button>
                </div>
            )}

        </main>
    );
}

const Card: React.FC<React.PropsWithChildren<any>> = ({ children, ...props }) => <div className="card" {...props}>{children}</div>;
const SectionHeader: React.FC<{ title: string }> = ({ title }) => <div className="section-header"><h2>{title}</h2></div>;
const SubSectionHeader: React.FC<{ title: string }> = ({ title }) => <div className="sub-section-header"><h3>{title}</h3></div>;
const Field: React.FC<React.PropsWithChildren<{ label: string }>> = ({ label, children }) => <div className="field"><label>{label}</label>{children}</div>;
const InfoRow: React.FC<{ label: string; value: string | number | null | undefined }> = ({ label, value }) => <div className="info-row"><span className="info-label">{label}:</span><span>{value || '–'}</span></div>;

const Button: React.FC<React.PropsWithChildren<{ onClick?: () => void, variant?: string, disabled?: boolean, style?: object, className?: string }>> = ({ onClick, variant = 'primary', disabled, children, style, className }) => (
    <button onClick={onClick} className={`btn ${variant} ${className || ''}`} disabled={disabled} style={style}>{children}</button>
);

const SuccessModal: React.FC<{ firstName: string }> = ({ firstName }) => (
    <main className="container">
        <GlobalStyles />
        <div className="success-modal">
            <h2>Tack, {firstName}!</h2>
            <p>Incheckningen är slutförd och har sparats.</p>
            <p>Du kan nu stänga detta fönster eller starta en ny incheckning.</p>
            <Button onClick={() => window.location.reload()}>Ny incheckning</Button>
        </div>
    </main>
);

const SpinnerOverlay = () => (
    <div className="spinner-overlay">
        <div className="spinner"></div>
        <p>Sparar data, laddar upp media...</p>
    </div>
);

const ConfirmModal: React.FC<{ payload: any; onConfirm: () => void; onCancel: () => void; }> = ({ payload, onConfirm, onCancel }) => {
    const renderDamageList = (damages: NewDamage[], isNew: boolean) => {
        if (!damages || damages.length === 0) return null;
        return (
            <>
                <SubSectionHeader title={isNew ? 'Nya skador' : 'Dokumenterade skador'} />
                <ul className="summary-list">
                    {damages.map(d => <li key={d.id}>{d.type} - {d.carPart} - {d.position}</li>)}
                </ul>
            </>
        );
    };

    const getTankningText = () => {
        if (payload.drivmedel === 'Elbil') {
            return payload.laddstatus === 'Fulladdad' ? 'Fulladdad' : 'Laddas nu';
        }
        if (payload.tankstatus === 'Återlämnades fulltankad') return 'Fulltankad';
        return `Upptankad av MABI (${payload.tankadLiter}L ${payload.bransletyp} @ ${payload.literpris} kr/L)`;
    };

    const newDamagesList = payload.newDamages || [];

    return (
        <div className="confirm-dialog-overlay">
            <div className="confirm-dialog wide">
                <h3 className="confirm-dialog-title large-title">Bekräfta incheckning</h3>
                
                <InfoRow label="Fordon" value={`${payload.regnr} (${payload.carModel})`} />
                <InfoRow label="Plats" value={`${payload.ort} / ${payload.station}`} />
                
                {newDamagesList.length > 0 && (
                    <div className="summary-section">
                        <InfoRow label="💥 Nya skador" value={newDamagesList.map((d:NewDamage) => `${d.type} - ${d.carPart}`).join(', ')} />
                    </div>
                )}
                {payload.behoverRekond && (
                     <div className="summary-section">
                        <InfoRow label="⚠️ Behöver rekond" value="Ja" />
                    </div>
                )}

                <div className="summary-grid">
                    <InfoRow label="Mätarställning" value={`${payload.matarstallning} km`} />
                    <InfoRow label="Tankning" value={getTankningText()} />
                    <InfoRow label="Hjul" value={payload.dack} />
                    <InfoRow label="Tvättad" value="✓ Ja" />
                    <InfoRow label="Övriga kontroller" value="✓ OK" />
                </div>

                <div className="confirm-dialog-actions">
                    <Button onClick={onCancel} variant="secondary">Avbryt</Button>
                    <Button onClick={onConfirm} variant="success">Bekräfta och skicka</Button>
                </div>
            </div>
        </div>
    );
};


const DamageItem: React.FC<{
    damage: ExistingDamage | NewDamage;
    isExisting: boolean;
    onAction?: (id: string, action: 'document' | 'resolve', text: string) => void;
    onRemove?: (id: string) => void;
    onUpdateField: (id: string, field: string, value: any, isExisting: boolean) => void;
    onUpdateMedia: (id: string, files: FileList, isExisting: boolean) => void;
    onRemoveMedia: (id: string, index: number, isExisting: boolean) => void;
}> = ({ damage, isExisting, onAction, onRemove, onUpdateField, onUpdateMedia, onRemoveMedia }) => {

    const damageText = (damage as ExistingDamage).text;
    const shortText = damageText?.length > 40 ? `${damageText.substring(0, 40)}...` : damageText;
    const status = (damage as ExistingDamage).status;

    const fieldKey = (f: string) => isExisting ? `user${f.charAt(0).toUpperCase() + f.slice(1)}` : f;
    const textValue = isExisting ? (damage as ExistingDamage).userText : (damage as NewDamage).text;

    if (isExisting && status === 'resolved') {
        return (
            <div className="damage-item resolved">
                <p><s>{damageText}</s> (Åtgärdad/hittas ej)</p>
            </div>
        );
    }
    
    const damageType = (damage as NewDamage).type;
    const carPart = (damage as NewDamage).carPart;
    const relevantParts = getRelevantCarParts(damageType);
    
    return (
        <div className={`damage-item ${status === 'documented' ? 'documented' : ''}`}>
            {isExisting && <p className="damage-text-original">"{damageText}"</p>}

            {!isExisting && (
                <div className="damage-selectors">
                    <select value={damageType} onChange={(e) => onUpdateField(damage.id, 'type', e.target.value, false)}>
                        <option value="">Välj typ...</option>
                        <option>Inredning</option>
                        <option>Exteriör</option>
                        <option>Glas</option>
                        <option>Däck/Fälg</option>
                    </select>
                    {damageType && (
                        <select value={carPart} onChange={(e) => onUpdateField(damage.id, 'carPart', e.target.value, false)}>
                            <option value="">Välj bildel...</option>
                            {relevantParts.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                    )}
                    {carPart && (
                         <select value={(damage as NewDamage).position} onChange={(e) => onUpdateField(damage.id, 'position', e.target.value, false)}>
                            <option value="">Välj position...</option>
                            <option>Vänster fram</option>
                            <option>Höger fram</option>
                            <option>Vänster bak</option>
                            <option>Höger bak</option>
                             <option>Mitten</option>
                             <option>Utsida</option>
                             <option>Insida</option>
                        </select>
                    )}
                </div>
            )}
            
            <textarea
                value={textValue || ''}
                onChange={(e) => onUpdateField(damage.id, fieldKey('Text'), e.target.value, isExisting)}
                placeholder={isExisting ? 'Mer detaljer om skadan... (frivilligt)' : 'Beskriv den nya skadan här...'}
            />

            <div className="media-uploads">
                <MediaUpload id={`${damage.id}-photo`} onUpload={(files) => onUpdateMedia(damage.id, files, isExisting)} hasFile={hasPhoto(damage.media)} fileType="image" label="Foto" />
                <MediaUpload id={`${damage.id}-video`} onUpload={(files) => onUpdateMedia(damage.id, files, isExisting)} hasFile={hasVideo(damage.media)} fileType="video" label="Video" isOptional />
            </div>

            {damage.media && damage.media.length > 0 && (
                <div className="media-preview-list">
                    {damage.media.map((media, index) => (
                        <MediaButton key={index} onRemove={() => onRemoveMedia(damage.id, index, isExisting)}>
                            {media.type === 'image' ?
                                <img src={media.preview} alt="Förhandsvisning" className="media-preview-thumb" /> :
                                <img src={media.thumbnail} alt="Videominiatyr" className="media-preview-thumb" />
                            }
                        </MediaButton>
                    ))}
                </div>
            )}

            <div className="damage-item-actions">
                {isExisting ? (
                    <>
                        <Button onClick={() => onAction!(damage.id, 'resolve', shortText)} variant="secondary" disabled={status === 'documented'}>Åtgärdad/hittar ej</Button>
                        <Button onClick={() => onAction!(damage.id, 'document', shortText)} variant={status === 'documented' ? 'success' : 'primary'}>
                            {status === 'documented' ? '✓ Dokumenterad' : 'Dokumentera'}
                        </Button>
                    </>
                ) : (
                    <Button onClick={() => onRemove!(damage.id)} variant="danger">Ta bort</Button>
                )}
            </div>
        </div>
    );
};

const MediaUpload: React.FC<{ id: string, onUpload: (files: FileList) => void, hasFile: boolean, fileType: 'image' | 'video', label: string, isOptional?: boolean }> = ({ id, onUpload, hasFile, fileType, label, isOptional }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const variant = hasFile ? 'success' : (isOptional ? 'warning' : 'primary');
    const symbol = fileType === 'image' ? '📷' : '📹';
    const text = `${label}${isOptional ? ' (frivilligt)' : ' *'}`;

    return (
        <>
            <input
                type="file"
                id={id}
                ref={fileInputRef}
                multiple
                accept={fileType === 'image' ? 'image/*' : 'video/*'}
                onChange={(e) => e.target.files && onUpload(e.target.files)}
                style={{ display: 'none' }}
            />
            <Button onClick={() => fileInputRef.current?.click()} variant={variant}>
                {hasFile ? `✓ ${symbol}` : `${symbol} ${text}`}
            </Button>
        </>
    );
};

const MediaButton: React.FC<React.PropsWithChildren<{ onRemove?: () => void }>> = ({ children, onRemove }) => (
    <div className="media-preview-btn">
        {children}
        <button onClick={onRemove} className="remove-media-btn">×</button>
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
    
    const themeClass = `theme-${state.theme || 'default'}`;

    return (
        <div className="confirm-dialog-overlay">
            <div className={`confirm-dialog ${themeClass}`}>
                {state.title && (
                    <h3 className="confirm-dialog-title">
                        {state.title === 'Bekräfta rekond' ? <strong>Bekräfta rekond ⚠️</strong> : state.title}
                    </h3>
                )}
                <p>{state.text}</p>
                <div className="confirm-dialog-actions">
                    <Button onClick={onClose} variant="secondary">Avbryt</Button>
                    <Button onClick={handleConfirm} variant={state.confirmVariant || 'primary'}>{state.confirmText || 'Bekräfta'}</Button>
                </div>
            </div>
        </div>
    );
};

const GlobalStyles = () => (
    <style jsx global>{`
        :root {
            --primary-color: #4a90e2; /* Blue */
            --success-color: #4CAF50; /* Green */
            --danger-color: #f44336; /* Red */
            --warning-color: #f5a623; /* Orange */
            --secondary-color: #6c757d; /* Gray */
            --light-gray: #f8f9fa;
            --border-color: #dee2e6;
            --text-color: #212529;
            --text-light: #6c757d;
            --card-bg: #ffffff;
            --body-bg: #f4f7f6;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            background-color: var(--body-bg);
            color: var(--text-color);
            margin: 0;
            padding: 0;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
        }
        .regnr-entry {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 80vh;
            text-align: center;
        }
        .regnr-entry h1 {
            font-size: 2rem;
            margin-bottom: 0.5rem;
        }
        .regnr-entry p {
            margin-bottom: 1.5rem;
            color: var(--text-light);
        }
        .regnr-autocomplete {
            width: 100%;
            max-width: 300px;
            margin-bottom: 1rem;
        }
        .page-header {
            text-align: center;
            margin-bottom: 2rem;
        }
        .page-header h1 {
            font-size: 2rem;
            margin: 0;
        }
        .page-header p {
            color: var(--text-light);
            margin: 0;
        }
        .card {
            background: var(--card-bg);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 24px;
            margin-bottom: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        }
        .section-header {
            border-bottom: 1px solid var(--border-color);
            margin-bottom: 20px;
            padding-bottom: 10px;
        }
        .section-header h2 {
            font-size: 1.5rem;
            margin: 0;
        }
        .sub-section-header {
            margin-top: 24px;
            margin-bottom: 12px;
        }
        .sub-section-header h3 {
            font-size: 1.1rem;
            font-weight: 600;
            color: var(--text-light);
            margin: 0;
        }
        .field {
            margin-bottom: 20px;
        }
        .field label {
            display: block;
            font-weight: 600;
            margin-bottom: 8px;
        }
        .field input, .field select, .field textarea {
            width: 100%;
            padding: 10px;
            border: 1px solid var(--border-color);
            border-radius: 4px;
            font-size: 1rem;
        }
        .field textarea {
            min-height: 80px;
            resize: vertical;
        }
        .btn {
            padding: 10px 16px;
            border: none;
            border-radius: 4px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
        }
        .btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        .btn.primary { background-color: var(--primary-color); color: white; }
        .btn.primary:hover:not(:disabled) { background-color: #3a80d2; }
        .btn.secondary { background-color: transparent; color: var(--secondary-color); border: 1px solid var(--border-color); }
        .btn.secondary:hover:not(:disabled) { background-color: var(--light-gray); }
        .btn.success { background-color: var(--success-color); color: white; }
        .btn.success:hover:not(:disabled) { background-color: #45a049; }
        .btn.danger { background-color: var(--danger-color); color: white; }
        .btn.danger:hover:not(:disabled) { background-color: #d32f2f; }
        .btn.warning { background-color: var(--warning-color); color: white; }
        .btn.warning:hover:not(:disabled) { background-color: #e59613; }

        .choice-group {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
        }
        .fuel-type-buttons {
            flex-wrap: wrap;
        }
        .choice-btn {
            flex-grow: 1;
            padding: 12px;
            border: 1px solid var(--border-color);
            border-radius: 4px;
            background: transparent;
            cursor: pointer;
            font-size: 1rem;
            text-align: center;
        }
        .choice-btn.active {
            background-color: var(--success-color);
            color: white;
            border-color: var(--success-color);
        }
        .choice-btn.disabled-choice {
            background-color: #f1f1f1;
            color: #aaa;
            cursor: not-allowed;
        }
        .fuel-btn {
            flex-basis: calc(50% - 5px);
        }
        .fuel-btn.active {
            background-color: var(--danger-color);
            border-color: var(--danger-color);
            color: white;
        }
        .tankning-details {
            border-left: 3px solid var(--border-color);
            padding-left: 20px;
            margin-top: 20px;
            margin-left: 10px;
        }
        .info-text {
            font-size: 0.9rem;
            color: var(--text-light);
            margin-top: 10px;
        }
        .damage-list {
            display: flex;
            flex-direction: column;
            gap: 16px;
        }
        .damage-item {
            border: 1px solid var(--border-color);
            border-radius: 4px;
            padding: 16px;
        }
        .damage-item.resolved {
            background-color: var(--light-gray);
            color: var(--text-light);
        }
        .damage-item.documented {
            border-left: 4px solid var(--success-color);
        }
        .damage-text-original {
            font-style: italic;
            color: var(--text-light);
            border-left: 3px solid #eee;
            padding-left: 10px;
        }
        .damage-selectors {
            display: flex;
            gap: 10px;
            margin-bottom: 10px;
            flex-wrap: wrap;
        }
        .damage-selectors select {
            flex: 1;
            min-width: 150px;
        }
        .media-uploads {
            display: flex;
            gap: 10px;
            margin: 10px 0;
            flex-wrap: wrap;
        }
        .media-preview-list {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
            margin-top: 10px;
        }
        .media-preview-btn {
            position: relative;
        }
        .media-preview-thumb {
            width: 80px;
            height: 80px;
            object-fit: cover;
            border-radius: 4px;
        }
        .remove-media-btn {
            position: absolute;
            top: -5px;
            right: -5px;
            background: #333;
            color: white;
            border: none;
            border-radius: 50%;
            width: 20px;
            height: 20px;
            font-size: 14px;
            line-height: 20px;
            text-align: center;
            cursor: pointer;
        }
        .damage-item-actions {
            display: flex;
            justify-content: flex-end;
            gap: 10px;
            margin-top: 16px;
            flex-wrap: wrap;
        }
        .checklist {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 10px;
        }
        .form-actions {
            display: flex;
            justify-content: space-between;
            margin-top: 2rem;
            padding-top: 1rem;
            border-top: 1px solid var(--border-color);
        }
        .error-summary {
            background-color: #ffebee;
            border: 1px solid var(--danger-color);
            color: #c62828;
            border-radius: 4px;
            padding: 16px;
            margin-top: 20px;
        }
        .error-summary h4 { margin: 0 0 10px 0; }
        .error-summary ul { margin: 0; padding-left: 20px; }
        .error-summary button { margin-top: 10px; }
        
        .confirm-dialog-overlay {
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
        }
        .confirm-dialog {
            background: white;
            padding: 24px;
            border-radius: 8px;
            width: 90%;
            max-width: 500px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.3);
        }
        .confirm-dialog.wide { max-width: 650px; }
        .confirm-dialog.theme-warning {
            background-color: #fffaf0;
            border: 1px solid var(--warning-color);
        }
        .confirm-dialog.theme-danger {
            background-color: #ffebee;
            border: 1px solid var(--danger-color);
        }
        .confirm-dialog-title {
            font-size: 1.25rem;
            font-weight: 600;
            margin: 0 0 10px 0;
        }
        .confirm-dialog-title.large-title {
            font-size: 1.75rem;
            font-weight: 700;
            text-align: center;
            margin-bottom: 24px;
        }
        .confirm-dialog p { margin: 0 0 20px 0; }
        .confirm-dialog-actions {
            display: flex;
            justify-content: flex-end;
            gap: 10px;
        }
        .summary-section {
            margin: 16px 0;
        }
        .summary-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px 16px;
            margin: 20px 0;
            padding-top: 16px;
            border-top: 1px solid var(--border-color);
        }
        .info-row {
            display: flex;
            flex-direction: column;
        }
        .info-label {
            font-size: 0.8rem;
            color: var(--text-light);
            font-weight: 600;
            margin-bottom: 2px;
        }
        .summary-list {
            margin: 0;
            padding-left: 20px;
        }

        .success-modal {
            text-align: center;
            padding: 40px;
        }
        .spinner-overlay {
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(255,255,255,0.8);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            z-index: 2000;
        }
        .spinner {
            border: 4px solid rgba(0,0,0,0.1);
            width: 36px;
            height: 36px;
            border-radius: 50%;
            border-left-color: var(--primary-color);
            animation: spin 1s ease infinite;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    `}</style>
);

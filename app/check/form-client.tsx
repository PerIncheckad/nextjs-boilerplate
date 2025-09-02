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
  wheelstorage: string | null;
  saludatum: string | null;
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

function normalizeReg(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Kontrollera om datum är inom X dagar från idag
const isDateWithinDays = (dateStr: string | null, days: number): boolean => {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  const today = new Date();
  const diffTime = date.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays <= days && diffDays >= 0;
};

export default function CheckInForm() {
  // Registreringsnummer och bildata
  const [regInput, setRegInput] = useState('');
  const [carData, setCarData] = useState<CarData[]>([]);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  // Formulärfält
  const [ort, setOrt] = useState('');
  const [station, setStation] = useState('');
  const [annanPlats, setAnnanPlats] = useState(false);
  const [annanPlatsText, setAnnanPlatsText] = useState('');
  
  const [matarstallning, setMatarstallning] = useState('');
  
  // Energi-logik med drivmedelstyp
  const [drivmedelstyp, setDrivmedelstyp] = useState<'bensin_diesel' | 'elbil' | null>(null);
  
  // För bensin/diesel
  const [tankniva, setTankniva] = useState<'fulltankad' | 'tankas_senare' | 'pafylld_nu' | null>(null);
  const [liters, setLiters] = useState('');
  const [bransletyp, setBransletyp] = useState<'Bensin' | 'Diesel' | null>(null);
  
  // För elbil
  const [laddniva, setLaddniva] = useState('');

  // Befintliga fält
  const [spolarvatska, setSpolarvatska] = useState<boolean | null>(null);
  const [insynsskydd, setInsynsskydd] = useState<boolean | null>(null);
  const [antalLaddkablar, setAntalLaddkablar] = useState<'0' | '1' | '2' | null>(null);
  const [hjultyp, setHjultyp] = useState<'Sommarthjul' | 'Vinterthjul' | null>(null);
  const [adblue, setAdblue] = useState<boolean | null>(null);

  // Rengöringsfält
  const [tvatt, setTvatt] = useState<'behover_tvattas' | 'behover_grovtvattas' | 'behover_inte_tvattas' | null>(null);
  const [inre, setInre] = useState<'behover_rengoras_inuti' | 'ren_inuti' | null>(null);

  // Skadehantering
  const [skadekontroll, setSkadekontroll] = useState<'ej_skadekontrollerad' | 'nya_skador' | 'inga_nya_skador' | null>(null);
  const [newDamages, setNewDamages] = useState<{id: string; text: string; files: File[]}[]>([]);
  
  // Uthyrningsstatus och prel. avslut notering
  const [uthyrningsstatus, setUthyrningsstatus] = useState<'redo_for_uthyrning' | 'ledig_tankad' | 'ledig_otankad' | 'klar_otankad' | null>(null);
  const [preliminarAvslutNotering, setPreliminarAvslutNotering] = useState('');

  // Modal state
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const normalizedReg = useMemo(() => normalizeReg(regInput), [regInput]);

  // Hämta bildata
  useEffect(() => {
    if (!normalizedReg || normalizedReg.length < 3) {
      setCarData([]);
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
        } else if (data && data.length > 0) {
          // Filtrera bort rader med NULL wheelstorage eller saludatum om möjligt
          const validData = data.filter(row => row.wheelstorage !== null && row.saludatum !== null);
          const useData = validData.length > 0 ? validData : data;
          
          setCarData(useData);
          setNotFound(false);
        } else {
          setCarData([]);
          setNotFound(true);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Fetch error:', err);
          setNotFound(true);
          setCarData([]);
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
  const damages = carData
    .map(item => item.damage_text)
    .filter(Boolean)
    .filter((damage, index, arr) => arr.indexOf(damage) === index);

  const availableStations = ort ? STATIONER[ort] || [] : [];

  // Validering
  const canSave = () => {
    if (!regInput.trim()) return false;
    if (!matarstallning.trim()) return false;
    
    // Antingen ort+station ELLER annan plats
    const hasLocation = annanPlats ? 
      annanPlatsText.trim().length > 0 : 
      (ort && station);
      
    if (!hasLocation) return false;
    
    // Energi-validering
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
    
    // Befintliga obligatoriska fält
    if (spolarvatska === null) return false;
    if (insynsskydd === null) return false;
    if (antalLaddkablar === null) return false;
    if (hjultyp === null) return false;
    if (adblue === null) return false;
    
    // Rengöringsfält
    if (tvatt === null) return false;
    if (inre === null) return false;
    
    // Skadekontroll-validering
    if (skadekontroll === null) return false;
    
    // Om "nya skador" är valt, måste alla skador ha text ifylld
    if (skadekontroll === 'nya_skador') {
      if (newDamages.length === 0) return false;
      if (newDamages.some(damage => !damage.text.trim())) return false;
    }
    
    // Uthyrningsstatus är obligatorisk
    if (uthyrningsstatus === null) return false;
    
    return true;
  };

  // Rensa formulär
  const resetForm = () => {
    setRegInput('');
    setCarData([]);
    setNotFound(false);
    setOrt('');
    setStation('');
    setAnnanPlats(false);
    setAnnanPlatsText('');
    setMatarstallning('');
    
    // Rensa energi-fält
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
    
    // Rensa rengöringsfält
    setTvatt(null);
    setInre(null);
    
    // Rensa skadekontroll-fält
    setSkadekontroll(null);
    setNewDamages([]);
    
    // Rensa uthyrningsstatus
    setUthyrningsstatus(null);
    setPreliminarAvslutNotering('');
    
    setShowSuccessModal(false);
  };

  // Hantera spara-klick
  const handleSave = () => {
    console.log('Sparar incheckning...');
    setShowSuccessModal(true);
  };

  // Skadehantering
  const addDamage = () => {
    setNewDamages(prev => [...prev, {
      id: Math.random().toString(36).slice(2),
      text: '',
      files: []
    }]);
  };

  const removeDamage = (id: string) => {
    setNewDamages(prev => prev.filter(d => d.id !== id));
  };

  const updateDamageText = (id: string, text: string) => {
    setNewDamages(prev => prev.map(d => d.id === id ? {...d, text} : d));
  };

  const updateDamageFiles = (id: string, files: FileList | null) => {
    if (!files) return;
    setNewDamages(prev => prev.map(d => 
      d.id === id ? {...d, files: [...d.files, ...Array.from(files)]} : d
    ));
  };

  // Ta bort enskild bild
  const removeDamageImage = (damageId: string, imageIndex: number) => {
    setNewDamages(prev => prev.map(d => {
      if (d.id === damageId) {
        const newFiles = d.files.filter((_, index) => index !== imageIndex);
        return { ...d, files: newFiles };
      }
      return d;
    }));
  };

  // Sektionsrubrik-komponent för bättre visuell struktur
  const SectionHeader = ({ icon, title, color }: { icon: string; title: string; color: string }) => (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '16px 20px',
      marginBottom: '20px',
      backgroundColor: color,
      borderRadius: '8px',
      border: '1px solid #e5e7eb'
    }}>
      <span style={{ fontSize: '24px' }}>{icon}</span>
      <h2 style={{ 
        fontSize: '20px', 
        fontWeight: '600', 
        margin: 0,
        color: '#1f2937'
      }}>
        {title}
      </h2>
    </div>
  );

  return (
    <div style={{ 
      minHeight: '100vh',
      backgroundColor: '#f8fafc',
      color: '#171717'
    }}>
      <div style={{
        maxWidth: '600px',
        margin: '0 auto',
        padding: '20px',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}>
        {/* Header med MABI-logga */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'flex-start',
          marginBottom: '8px' 
        }}>
          <div>
            <h1 style={{ fontSize: '28px', margin: 0, color: '#1f2937' }}>Ny incheckning</h1>
            <p style={{ color: '#666', margin: '4px 0 24px 0' }}>Inloggad: <strong>Bob</strong></p>
          </div>
          <div style={{
            width: '120px',
            height: '60px',
            backgroundColor: '#2563eb',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: '18px',
            fontWeight: 'bold',
            border: '2px solid #1e40af'
          }}>
            MABI
            <div style={{ 
              fontSize: '10px', 
              backgroundColor: '#dc2626', 
              color: 'white',
              padding: '2px 4px',
              borderRadius: '2px',
              marginLeft: '4px',
              transform: 'rotate(-15deg)'
            }}>
              ⚡
            </div>
          </div>
        </div>

        {/* Registreringsnummer - egen sektion */}
        <div style={{ 
          backgroundColor: '#ffffff',
          padding: '24px',
          borderRadius: '12px',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
        }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '16px' }}>
            🚗 Registreringsnummer *
          </label>
          <input
            type="text"
            value={regInput}
            onChange={(e) => setRegInput(e.target.value.toUpperCase())}
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

          {loading && <p style={{ color: '#2563eb', fontSize: '14px', marginTop: '8px' }}>🔍 Söker...</p>}
          
          {notFound && normalizedReg && (
            <p style={{ color: '#dc2626', fontSize: '14px', marginTop: '8px', fontWeight: '500' }}>❌ Okänt reg.nr</p>
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
                <span style={{ fontWeight: '600', color: '#1e40af', minWidth: '130px' }}>Bilmodell:</span> 
                <span style={{ fontWeight: '500' }}>{carModel || '—'}</span>
              </div>
              <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center' }}>
                <span style={{ fontWeight: '600', color: '#1e40af', minWidth: '130px' }}>Hjulförvaring:</span> 
                <span style={{ fontWeight: '500' }}>{wheelStorage || '—'}</span>
              </div>
              <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center' }}>
                <span style={{ fontWeight: '600', color: '#1e40af', minWidth: '130px' }}>Saludatum:</span> 
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
                <span style={{ fontWeight: '600', color: '#1e40af', minWidth: '130px' }}>Befintliga skador:</span>
                <div style={{ flex: 1 }}>
                  {damages.length === 0 ? (
                    <span style={{ fontWeight: '500' }}> —</span>
                  ) : (
                    <ul style={{ margin: '0', paddingLeft: '20px' }}>
                      {damages.map((damage, i) => (
                        <li key={i} style={{ marginBottom: '4px' }}>{damage}</li>
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
          <SectionHeader icon="📍" title="Plats för incheckning" color="#fef3c7" />
        
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
              color: '#2563eb',
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

        {/* Fordonsstatus */}
        <div style={{ 
          backgroundColor: '#ffffff',
          padding: '24px',
          borderRadius: '12px',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
        }}>
          <SectionHeader icon="🔧" title="Fordonsstatus" color="#e0e7ff" />
        
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

          {/* Tankad/Laddad sektion */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
              Tankad/Laddad *
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
                  backgroundColor: drivmedelstyp === 'bensin_diesel' ? '#2563eb' : '#ffffff',
                  color: drivmedelstyp === 'bensin_diesel' ? '#ffffff' : '#000',
                  cursor: 'pointer'
                }}
              >
                ⛽ Bensin/Diesel
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
                  backgroundColor: drivmedelstyp === 'elbil' ? '#2563eb' : '#ffffff',
                  color: drivmedelstyp === 'elbil' ? '#ffffff' : '#000',
                  cursor: 'pointer'
                }}
              >
                🔋 Elbil
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
                    ✅ Fulltankad
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
                    ⏳ Ej fulltankad - tankas senare
                  </button>
                  <button
                    type="button"
                    onClick={() => setTankniva('pafylld_nu')}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      backgroundColor: tankniva === 'pafylld_nu' ? '#2563eb' : '#ffffff',
                      color: tankniva === 'pafylld_nu' ? '#ffffff' : '#000',
                      cursor: 'pointer'
                    }}
                  >
                    ⛽ Ej fulltankad - påfylld nu
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
                          backgroundColor: bransletyp === 'Bensin' ? '#2563eb' : '#ffffff',
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
                          backgroundColor: bransletyp === 'Diesel' ? '#2563eb' : '#ffffff',
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

          {/* Övriga fordonsstatus-fält */}
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
                    backgroundColor: antalLaddkablar === '0' ? '#2563eb' : '#ffffff',
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
                    backgroundColor: antalLaddkablar === '1' ? '#2563eb' : '#ffffff',
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
                    backgroundColor: antalLaddkablar === '2' ? '#2563eb' : '#ffffff',
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
                ☀️ Sommarthjul
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
                ❄️ Vinterthjul
              </button>
            </div>
          </div>
        </div>

        {/* Rengöringssektioner */}
        <div style={{ 
          backgroundColor: '#ffffff',
          padding: '24px',
          borderRadius: '12px',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
        }}>
          <SectionHeader icon="🧽" title="Rengöring" color="#f0fdf4" />

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
                🚿 Behöver tvättas
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
                🧽 Behöver grovtvättas
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
                ✨ Behöver inte tvättas
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
                🧹 Behöver rengöras inuti
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
                ✨ Ren inuti
              </button>
            </div>
          </div>
        </div>

        {/* Skadehantering */}
        <div style={{ 
          backgroundColor: '#ffffff',
          padding: '24px',
          borderRadius: '12px',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
        }}>
          <SectionHeader icon="🔍" title="Skador" color="#fef2f2" />

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
                ❓ Ej skadekontrollerad
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
                ⚠️ Nya skador
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
                ✅ Inga nya skador
              </button>
            </div>
          </div>

          {/* Visa skade-fält bara om "nya_skador" är valt */}
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
                      📝 Text (obligatorisk)
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

                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
                      📷 Lägg till bild
                    </label>
                    
                    <div style={{ position: 'relative', display: 'inline-block', width: '100%' }}>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={(e) => updateDamageFiles(damage.id, e.target.files)}
                        style={{ display: 'none' }}
                        id={`file-input-${damage.id}`}
                      />
                      <label
                        htmlFor={`file-input-${damage.id}`}
                        style={{
                          display: 'block',
                          width: '100%',
                          padding: '12px',
                          border: '2px dashed #d1d5db',
                          borderRadius: '6px',
                          fontSize: '16px',
                          backgroundColor: '#ffffff',
                          textAlign: 'center',
                          cursor: 'pointer',
                          color: '#4b5563'
                        }}
                      >
                        📷 Lägg till bild
                      </label>
                    </div>

                    {damage.files.length > 0 && (
                      <div style={{ 
                        marginTop: '12px',
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
                        gap: '8px'
                      }}>
                        {damage.files.map((file, index) => (
                          <div key={index} style={{ position: 'relative' }}>
                            <img
                              src={URL.createObjectURL(file)}
                              alt={`Skadebild ${index + 1}`}
                              style={{
                                width: '100px',
                                height: '100px',
                                objectFit: 'cover',
                                borderRadius: '6px',
                                border: '1px solid #d1d5db'
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => removeDamageImage(damage.id, index)}
                              style={{
                                position: 'absolute',
                                top: '-6px',
                                right: '-6px',
                                width: '20px',
                                height: '20px',
                                borderRadius: '50%',
                                backgroundColor: '#dc2626',
                                color: '#ffffff',
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: '12px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 'bold'
                              }}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

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
                    🗑️ Ta bort skada
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={addDamage}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#2563eb',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                  fontSize: '16px',
                  marginBottom: '16px'
                }}
              >
                {newDamages.length === 0 ? '➕ Lägg till skada' : '➕ Lägg till ytterligare skada'}
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
          <SectionHeader icon="🚗" title="Uthyrningsstatus" color="#ecfdf5" />

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
                ✅ Redo för uthyrning
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
                🟢 Ledig tankad
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
                🟡 Ledig otankad
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
                🔵 Klar otankad
              </button>
            </div>
          </div>

          {/* Prel. avslut notering */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
              📋 Prel. avslut notering
            </label>
            <textarea
              value={preliminarAvslutNotering}
              onChange={(e) => setPreliminarAvslutNotering(e.target.value)}
              placeholder="Preliminära kommentarer för avslut..."
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
            {canSave() ? '💾 Spara incheckning' : '⏳ Fyll i alla obligatoriska fält'}
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
            
            <p<p style={{
              fontSize: '16px',
              color: '#6b7280',
              marginBottom: '24px'
            }}>
              Incheckning sparad för {regInput}
            </p>
            
            <button
              onClick={resetForm}
              style={{
                backgroundColor: '#2563eb',
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
              🚗 Starta ny incheckning
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

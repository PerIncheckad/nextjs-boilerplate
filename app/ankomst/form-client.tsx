'use client';

import React, { useEffect, useMemo, useState, useCallback, useRef, Fragment } from 'react';
import { supabase } from '@/lib/supabase';

// =================================================================
// 1. DATA & HELPERS
// =================================================================

const MABI_LOGO_URL = "https://ufioaijcmaujlvmveyra.supabase.co/storage/v1/object/public/MABI%20Syd%20logga/MABI%20Syd%20logga%202.png";
const BACKGROUND_IMAGE_URL = "https://ufioaijcmaujlvmveyra.supabase.co/storage/v1/object/public/Svart%20bakgrund%20MB%20grill/MB%20front%20grill%20logo.jpg";

const ORTER = ['Malmö', 'Helsingborg', 'Ängelholm', 'Halmstad', 'Falkenberg', 'Trelleborg', 'Varberg', 'Lund'].sort();

const STATIONER: Record<string, string[]> = {
  'Falkenberg': ['Falkenberg'],
  'Halmstad': ['BVH (Hedin multi)', 'Flyget Halmstad', 'FORD Halmstad', 'KIA Halmstad', 'MB Halmstad'],
  'Helsingborg': ['B/S Klippan', 'BMW Helsingborg', 'Euromaster Helsingborg', 'FORD Helsingborg', 'HBSC Helsingborg', 'KIA Helsingborg', 'MB Helsingborg', 'S. Jönsson', 'Transport Helsingborg'],
  'Lund': ['B/S Lund', 'FORD Lund', 'Hedin Lund', 'P7 Revinge'],
  'Malmö': ['FORD Malmö', 'Hedbergs Malmö', 'Hedin Automotive Burlöv', 'Malmö Automera', 'MB Malmö', 'Mechanum', 'Sturup', 'Werksta Malmö Hamn', 'Werksta St Bernstorp'],
  'Trelleborg': ['Trelleborg'],
  'Varberg': ['Autoklinik (Sällstorp)', 'Finnveden plåt', 'FORD Varberg', 'MB Varberg', 'Varberg multi (Hedin)'],
  'Ängelholm': ['Flyget Ängelholm', 'FORD Ängelholm', 'Mekonomen Ängelholm']
};

const capitalizeFirstLetter = (str: string): string => {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

const getFirstNameFromEmail = (email: string): string => {
  const namePart = email.split('@')[0];
  const firstName = namePart.split('.')[0];
  return capitalizeFirstLetter(firstName);
};

const getFullNameFromEmail = (email: string): string => {
  const namePart = email.split('@')[0];
  const parts = namePart.split('.');
  if (parts.length >= 2) {
      const firstName = capitalizeFirstLetter(parts[0]);
      const lastName = capitalizeFirstLetter(parts[1]);
      return `${firstName} ${lastName}`;
  }
  return capitalizeFirstLetter(namePart);
};

// Determine drivmedelstyp from known bränsletyp
const inferDrivmedelstyp = (bransletyp: string | null | undefined): 'bensin_diesel' | 'elbil' | null => {
  if (!bransletyp) return null;
  const lower = bransletyp.toLowerCase();
  // Check bensin/diesel/gas FIRST — 'diesel' contains 'el' so must be matched before electric check
  if (lower.includes('bensin') || lower.includes('diesel') || lower.includes('gas')) return 'bensin_diesel';
  if (lower.includes('el') || lower.includes('electric') || lower.includes('bev') || lower.includes('phev')) return 'elbil';
  return null;
};

// Infer specific bränsletyp (Bensin or Diesel) from known value
const inferBransletyp = (bransletyp: string | null | undefined): 'Bensin' | 'Diesel' | null => {
  if (!bransletyp) return null;
  const lower = bransletyp.toLowerCase();
  if (lower.includes('diesel')) return 'Diesel';
  if (lower.includes('bensin')) return 'Bensin';
  return null;
};

// =================================================================
// 2. COMPONENT
// =================================================================

export default function ArrivalForm() {
  // --- Auth state ---
  const [firstName, setFirstName] = useState('');
  const [fullName, setFullName] = useState('');
  const [userEmail, setUserEmail] = useState('');

  // --- Form state ---
  const [regInput, setRegInput] = useState('');
  const [allRegistrations, setAllRegistrations] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [showUnknownRegHelper, setShowUnknownRegHelper] = useState(false);

  // Vehicle info from lookup
  const [vehicleModel, setVehicleModel] = useState<string | null>(null);
  const [vehicleRegConfirmed, setVehicleRegConfirmed] = useState(false);
  const [knownBransletyp, setKnownBransletyp] = useState<string | null>(null);

  // Location
  const [ort, setOrt] = useState('');
  const [station, setStation] = useState('');

  // Odometer
  const [matarstallning, setMatarstallning] = useState('');

  // Fuel/charge
  const [drivmedelstyp, setDrivmedelstyp] = useState<'bensin_diesel' | 'elbil' | null>(null);
  const [detailedBransletyp, setDetailedBransletyp] = useState<string | null>(null);
  const [tankniva, setTankniva] = useState<'återlämnades_fulltankad' | 'tankad_nu' | 'ej_upptankad' | null>(null);
  const [liters, setLiters] = useState('');
  const [bransletyp, setBransletyp] = useState<'Bensin' | 'Diesel' | null>(null);
  const [literpris, setLiterpris] = useState('');
  const [laddniva, setLaddniva] = useState('');
  const [notes, setNotes] = useState('');

  // UI state
  const [showFieldErrors, setShowFieldErrors] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [confirmDialogText, setConfirmDialogText] = useState('');
  const [confirmDialogOnConfirm, setConfirmDialogOnConfirm] = useState<(() => void) | null>(null);
  const [confirmDialogOnCancel, setConfirmDialogOnCancel] = useState<(() => void) | null>(null);

  // Derived
  const availableStations = useMemo(() => STATIONER[ort] || [], [ort]);

  // --- Validation ---
  const isFormValid = useMemo(() => {
    const normalizedReg = regInput.toUpperCase().replace(/\s/g, '');
    if (!normalizedReg || !vehicleRegConfirmed) return false;
    if (!ort || !station) return false;
    if (!matarstallning) return false;
    if (!drivmedelstyp) return false;
    if (drivmedelstyp === 'bensin_diesel') {
      if (!tankniva) return false;
      if (tankniva === 'tankad_nu' && (!liters || !bransletyp || !literpris)) return false;
    }
    if (drivmedelstyp === 'elbil') {
      if (!laddniva) return false;
    }
    return true;
  }, [regInput, vehicleRegConfirmed, ort, station, matarstallning, drivmedelstyp, tankniva, liters, bransletyp, literpris, laddniva]);

  // --- Build payload ---
  const buildPayload = useCallback(() => {
    const normalizedReg = regInput.toUpperCase().replace(/\s/g, '');
    // Determine the fuel_type to save to vehicles.bransletyp
    const effectiveBransletyp = knownBransletyp || detailedBransletyp;
    return {
      regnr: normalizedReg,
      current_city: ort,
      current_station: station,
      odometer_km: matarstallning,
      fuel_level: drivmedelstyp === 'elbil' ? 'elbil' : tankniva,
      fuel_type: effectiveBransletyp || (drivmedelstyp === 'elbil' ? 'El' : bransletyp),
      fuel_liters: tankniva === 'tankad_nu' ? liters : null,
      fuel_price_per_liter: tankniva === 'tankad_nu' ? literpris : null,
      charge_level: drivmedelstyp === 'elbil' ? laddniva : null,
      notes: notes.trim() || null,
      checker_email: userEmail,
      checker_name: fullName,
      car_model: vehicleModel || '---',
    };
  }, [regInput, ort, station, matarstallning, drivmedelstyp, tankniva, liters, bransletyp, literpris, laddniva, notes, userEmail, fullName, vehicleModel, knownBransletyp, detailedBransletyp]);

  // --- Vehicle lookup ---
  const fetchVehicleData = useCallback(async (reg: string) => {
    setLoading(true);
    setVehicleModel(null);
    setVehicleRegConfirmed(false);
    setKnownBransletyp(null);
    setShowUnknownRegHelper(false);
    try {
      const normalized = reg.toUpperCase().replace(/\s/g, '');
      const response = await fetch(`/api/vehicle-info?reg=${encodeURIComponent(normalized)}`);
      if (!response.ok) throw new Error('Failed to fetch vehicle info');
      const info = await response.json();

      const regExistsInAllowedPlates = allRegistrations.some(
        r => r.toUpperCase().replace(/\s/g, '') === normalized
      );

      if ((info.status === 'NO_MATCH' || info.status === 'PARTIAL_MATCH_DAMAGE_ONLY') && !regExistsInAllowedPlates) {
        // Show warning modal
        setConfirmDialogText('⚠️ Okänt reg.nr. Vänligen dubbelkolla innan du fortsätter.');
        setConfirmDialogOnConfirm(() => () => {
          setShowUnknownRegHelper(true);
          setVehicleRegConfirmed(true);
          setVehicleModel(info.model || null);
          applyKnownBransletyp(info.bransletyp);
          setConfirmDialogOpen(false);
        });
        setConfirmDialogOnCancel(() => () => {
          setRegInput('');
          setConfirmDialogOpen(false);
        });
        setConfirmDialogOpen(true);
        setLoading(false);
        return;
      }

      setVehicleRegConfirmed(true);
      setVehicleModel(info.model || null);
      applyKnownBransletyp(info.bransletyp);
    } catch (error: any) {
      console.error('Fetch vehicle data error:', error);
      setVehicleRegConfirmed(false);
      setVehicleModel(null);
    } finally {
      setLoading(false);
    }
  }, [allRegistrations]);

  const applyKnownBransletyp = (bt: string | null | undefined) => {
    if (!bt) {
      setKnownBransletyp(null);
      return;
    }
    setKnownBransletyp(bt);
    const inferred = inferDrivmedelstyp(bt);
    if (inferred) {
      setDrivmedelstyp(inferred);
      if (inferred === 'bensin_diesel') {
        const specificType = inferBransletyp(bt);
        if (specificType) setBransletyp(specificType);
      }
    }
  };

  // Handle user selecting from 5-option bränsletyp picker
  const selectDetailedBransletyp = (type: string) => {
    setDetailedBransletyp(type);
    // Reset downstream state
    setTankniva(null);
    setLiters('');
    setLiterpris('');
    setLaddniva('');
    if (type === '100% el') {
      setDrivmedelstyp('elbil');
      setBransletyp(null);
    } else if (type === 'Diesel' || type === 'Hybrid (diesel)') {
      setDrivmedelstyp('bensin_diesel');
      setBransletyp('Diesel');
    } else {
      // Bensin or Hybrid (bensin)
      setDrivmedelstyp('bensin_diesel');
      setBransletyp('Bensin');
    }
  };

  // --- Effects ---

  // Get user info
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const email = user?.email || '';
      setFirstName(getFirstNameFromEmail(email));
      setFullName(getFullNameFromEmail(email));
      setUserEmail(email);
    };
    getUser();
  }, []);

  // Load all registrations for autocomplete
  useEffect(() => {
    async function fetchAllRegistrations() {
      const { data, error } = await supabase.rpc('get_all_allowed_plates').range(0, 4999);
      if (error) console.error('Could not fetch registrations via RPC:', error);
      else if (data) setAllRegistrations(data.map((item: any) => item.regnr));
    }
    fetchAllRegistrations();
  }, []);

  // Autocomplete filtering
  useEffect(() => {
    if (regInput.length >= 2 && allRegistrations.length > 0) {
      const normalized = regInput.toUpperCase().replace(/\s/g, '');
      const filtered = allRegistrations
        .filter(r => r.toUpperCase().replace(/\s/g, '').includes(normalized))
        .slice(0, 10);
      setSuggestions(filtered);
    } else {
      setSuggestions([]);
    }
  }, [regInput, allRegistrations]);

  // Trigger vehicle lookup on valid input
  useEffect(() => {
    const normalized = regInput.toUpperCase().replace(/\s/g, '');
    if (normalized.length >= 6) {
      fetchVehicleData(normalized);
    } else {
      setVehicleModel(null);
      setVehicleRegConfirmed(false);
      setKnownBransletyp(null);
    }
  }, [regInput, fetchVehicleData]);

  // --- Form submission ---
  const handleSubmit = () => {
    if (!isFormValid) {
      setShowFieldErrors(true);
      return;
    }
    setShowConfirmModal(true);
  };

  const handleConfirm = async () => {
    setShowConfirmModal(false);
    setIsSaving(true);
    try {
      const payload = buildPayload();
      const res = await fetch('/api/notify-arrival', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error || 'Något gick fel.');
      }
      setShowSuccessModal(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setTimeout(() => {
        setShowSuccessModal(false);
        resetForm();
      }, 3000);
    } catch (error: any) {
      console.error('Save failed:', error);
      alert(error.message || 'Något gick fel vid registreringen.');
    } finally {
      setIsSaving(false);
    }
  };

  const resetForm = () => {
    setRegInput('');
    setVehicleModel(null);
    setVehicleRegConfirmed(false);
    setKnownBransletyp(null);
    setShowUnknownRegHelper(false);
    setOrt('');
    setStation('');
    setMatarstallning('');
    setDrivmedelstyp(null);
    setDetailedBransletyp(null);
    setTankniva(null);
    setLiters('');
    setBransletyp(null);
    setLiterpris('');
    setLaddniva('');
    setNotes('');
    setShowFieldErrors(false);
  };

  // --- Tank status display text ---
  const getTankningDisplayText = () => {
    if (drivmedelstyp === 'elbil') {
      return `Laddningsnivå: ${laddniva}%`;
    }
    if (tankniva === 'återlämnades_fulltankad') return 'Återlämnades fulltankad';
    if (tankniva === 'tankad_nu') return `Tankad nu av MABI (${liters}L ${bransletyp} @ ${literpris} kr/L)`;
    if (tankniva === 'ej_upptankad') return 'Ej upptankad';
    return '---';
  };

  // =================================================================
  // 3. RENDER
  // =================================================================

  return (
    <Fragment>
      <GlobalStyles backgroundUrl={BACKGROUND_IMAGE_URL} />

      {/* Saving overlay */}
      {isSaving && (
        <Fragment>
          <div className="modal-overlay" />
          <div className="modal-content" style={{ textAlign: 'center' }}>
            <div className="spinner-overlay">
              <div className="spinner" />
              <p>Registrerar ankomst...</p>
            </div>
          </div>
        </Fragment>
      )}

      {/* Success modal */}
      {showSuccessModal && (
        <Fragment>
          <div className="modal-overlay" />
          <div className="modal-content success-modal">
            <div className="success-icon">✅</div>
            <h2>Ankomst registrerad!</h2>
            <p>Mejl skickat till biluthyrarna.</p>
          </div>
        </Fragment>
      )}

      {/* Confirm dialog (unknown reg) */}
      {confirmDialogOpen && (
        <Fragment>
          <div className="modal-overlay" onClick={() => confirmDialogOnCancel && confirmDialogOnCancel()} />
          <div className="modal-content confirm-modal">
            <h3 style={{ textAlign: 'center' }}>⚠️ Reg.nr saknas!</h3>
            <p style={{ textAlign: 'center', marginBottom: '1.5rem' }}>{confirmDialogText}</p>
            <div className="modal-actions">
              <Button onClick={() => confirmDialogOnCancel && confirmDialogOnCancel()} variant="secondary">Avbryt</Button>
              <Button onClick={() => confirmDialogOnConfirm && confirmDialogOnConfirm()} variant="danger">Fortsätt ändå</Button>
            </div>
          </div>
        </Fragment>
      )}

      {/* Confirmation modal */}
      {showConfirmModal && (
        <Fragment>
          <div className="modal-overlay" onClick={() => setShowConfirmModal(false)} />
          <div className="modal-content confirm-modal">
            <div className="confirm-header">
              <h3 className="confirm-modal-title" style={{ textAlign: 'center' }}>Bekräfta ankomst</h3>
              <p className="confirm-vehicle-info">{regInput.toUpperCase().replace(/\s/g, '')} - {vehicleModel || '---'}</p>
              {drivmedelstyp === 'bensin_diesel' && tankniva === 'ej_upptankad' && (
                <p className="warning-highlight">Bilen är ej upptankad</p>
              )}
            </div>
            <div className="confirm-details">
              <div className="confirm-summary">
                <p>📍 <strong>Plats:</strong> {ort} / {station}</p>
                <p>🛣️ <strong>Mätarställning:</strong> {matarstallning} km</p>
                <p>{drivmedelstyp === 'elbil' ? '⚡' : '⛽'} <strong>{drivmedelstyp === 'elbil' ? 'Laddning' : 'Tankning'}:</strong> {getTankningDisplayText()}</p>
                {notes.trim() && <p>📝 <strong>Kommentar:</strong> {notes.trim()}</p>}
              </div>
            </div>
            <div className="modal-actions">
              <Button onClick={() => setShowConfirmModal(false)} variant="secondary">Avbryt</Button>
              <Button onClick={handleConfirm} variant="success">Bekräfta och skicka</Button>
            </div>
          </div>
        </Fragment>
      )}

      {/* Main form */}
      <div className="checkin-form">
        <div className="main-header">
          <img src={MABI_LOGO_URL} alt="MABI Logo" className="main-logo" />
          <h1 className="page-title">ANKOMSTREGISTRERING</h1>
          {fullName && <p className="user-info">Inloggad: {fullName}</p>}
        </div>

        {/* REG.NR */}
        <Card data-error={showFieldErrors && !vehicleRegConfirmed}>
          <SectionHeader title="Fordon" />
          <div style={{ position: 'relative' }}>
            <Field label="Registreringsnummer *">
              <input
                type="text"
                value={regInput}
                onChange={(e) => setRegInput(e.target.value)}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                placeholder="ABC 123"
                className="reg-input"
              />
            </Field>
            {showSuggestions && suggestions.length > 0 && (
              <div className="suggestions-dropdown">
                {suggestions.map(s => (
                  <div key={s} className="suggestion-item" onMouseDown={() => { setRegInput(s); setShowSuggestions(false); }}>{s}</div>
                ))}
              </div>
            )}
          </div>
          {loading && <p>Hämtar fordonsdata...</p>}
          {showUnknownRegHelper && <p className="error-text">Reg.nr saknas i Bilkontroll-listan.</p>}
          {vehicleRegConfirmed && vehicleModel && (
            <div className="info-box">
              <div className="info-grid">
                <InfoRow label="Bilmodell" value={vehicleModel || '---'} />
              </div>
            </div>
          )}
        </Card>

        {/* PLATS */}
        <Card data-error={showFieldErrors && (!ort || !station)}>
          <SectionHeader title="Var är bilen?" />
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

        {/* MÄTARSTÄLLNING + TANKNING */}
        <Card data-error={showFieldErrors && (!matarstallning || !drivmedelstyp || (drivmedelstyp === 'bensin_diesel' && !tankniva) || (tankniva === 'tankad_nu' && (!liters || !bransletyp || !literpris)) || (drivmedelstyp === 'elbil' && !laddniva))}>
          <SectionHeader title="Fordonsstatus" />

          <SubSectionHeader title="Mätarställning" />
          <Field label="Mätarställning (km) *">
            <input type="number" value={matarstallning} onChange={e => setMatarstallning(e.target.value)} placeholder="12345" />
          </Field>

          <SubSectionHeader title={
            drivmedelstyp === 'elbil' ? 'Laddstatus' :
            drivmedelstyp === 'bensin_diesel' ? 'Tankstatus' :
            'Tankning/Laddning'
          } />
          {/* Show 5-option bränsletyp selector only if not auto-detected */}
          {!knownBransletyp && !detailedBransletyp && (
            <Field label="Vilken drivmedelstyp? *">
              <div className="grid-fuel-5">
                <ChoiceButton onClick={() => selectDetailedBransletyp('Bensin')} isActive={false} isSet={false}>Bensin</ChoiceButton>
                <ChoiceButton onClick={() => selectDetailedBransletyp('Diesel')} isActive={false} isSet={false}>Diesel</ChoiceButton>
                <ChoiceButton onClick={() => selectDetailedBransletyp('Hybrid (bensin)')} isActive={false} isSet={false}>Hybrid (bensin)</ChoiceButton>
                <ChoiceButton onClick={() => selectDetailedBransletyp('Hybrid (diesel)')} isActive={false} isSet={false}>Hybrid (diesel)</ChoiceButton>
                <ChoiceButton onClick={() => selectDetailedBransletyp('100% el')} isActive={false} isSet={false}>100% el</ChoiceButton>
              </div>
            </Field>
          )}
          {/* Show selected type with option to change */}
          {!knownBransletyp && detailedBransletyp && (
            <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1rem' }}>
              Drivmedel: <strong>{detailedBransletyp}</strong>{' '}
              <button type="button" onClick={() => { setDetailedBransletyp(null); setDrivmedelstyp(null); setTankniva(null); setLiters(''); setBransletyp(null); setLiterpris(''); setLaddniva(''); }} style={{ background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', textDecoration: 'underline', fontSize: '0.875rem' }}>Ändra</button>
            </p>
          )}

          {/* Bensin/Diesel fuel status */}
          {drivmedelstyp === 'bensin_diesel' && (
            <Fragment>
              <Field label="Tankstatus *">
                <div className="grid-3-col">
                  <ChoiceButton onClick={() => setTankniva('återlämnades_fulltankad')} isActive={tankniva === 'återlämnades_fulltankad'} isSet={tankniva !== null}>Återlämnades fulltankad</ChoiceButton>
                  <ChoiceButton onClick={() => setTankniva('tankad_nu')} isActive={tankniva === 'tankad_nu'} isSet={tankniva !== null}>Tankad nu av MABI</ChoiceButton>
                  <ChoiceButton onClick={() => setTankniva('ej_upptankad')} isActive={tankniva === 'ej_upptankad'} isSet={tankniva !== null} variant={tankniva === 'ej_upptankad' ? 'warning' : 'default'}>Ej upptankad</ChoiceButton>
                </div>
              </Field>
              {tankniva === 'tankad_nu' && (
                <div className="grid-3-col">
                  <Field label="Antal liter *">
                    <input type="number" value={liters} onChange={e => setLiters(e.target.value)} placeholder="50" />
                  </Field>
                  {/* Show bränsletyp selector only if not known from DB or user selection */}
                  {!inferBransletyp(knownBransletyp) && !detailedBransletyp && (
                    <Field label="Bränsletyp *">
                      <div className="fuel-type-buttons">
                        <ChoiceButton onClick={() => setBransletyp('Bensin')} isActive={bransletyp === 'Bensin'} isSet={bransletyp !== null}>Bensin</ChoiceButton>
                        <ChoiceButton onClick={() => setBransletyp('Diesel')} isActive={bransletyp === 'Diesel'} isSet={bransletyp !== null}>Diesel</ChoiceButton>
                      </div>
                    </Field>
                  )}
                  <Field label="Literpris *">
                    <input type="number" value={literpris} onChange={e => setLiterpris(e.target.value)} placeholder="20.50" />
                  </Field>
                </div>
              )}
            </Fragment>
          )}

          {/* Elbil charge level */}
          {drivmedelstyp === 'elbil' && (
            <Field label="Laddningsnivå vid återlämning (%) *">
              <input
                type="number"
                value={laddniva}
                onChange={e => {
                  const val = e.target.value;
                  if (val === '' || (parseInt(val, 10) >= 0 && parseInt(val, 10) <= 100)) {
                    setLaddniva(val);
                  }
                }}
                placeholder="0-100"
              />
            </Field>
          )}
        </Card>

        {/* KOMMENTAR */}
        <Card>
          <SectionHeader title="Kommentar" />
          <Field label="Övrig kommentar (frivilligt)">
            <textarea
              rows={3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="T.ex. nycklar i handskfacket, behöver laddas omgående..."
            />
          </Field>
        </Card>

        {/* SUBMIT BUTTON */}
        <div className="form-actions">
          <Button onClick={handleSubmit} variant={isFormValid ? 'success' : 'primary'} disabled={isSaving}>
            {isSaving ? 'Skickar...' : 'Registrera ankomst'}
          </Button>
        </div>
      </div>

      {/* Footer */}
      <div className="copyright-footer">
        © {new Date().getFullYear()} Albarone AB
      </div>
    </Fragment>
  );
}

// =================================================================
// 4. SUB-COMPONENTS (matching /check design)
// =================================================================

const Card: React.FC<React.PropsWithChildren<any>> = ({ children, ...props }) => <div className="card" {...props}>{children}</div>;
const SectionHeader: React.FC<{ title: string }> = ({ title }) => <div className="section-header"><h2>{title}</h2></div>;
const SubSectionHeader: React.FC<{ title: string }> = ({ title }) => <div className="sub-section-header"><h3>{title}</h3></div>;
const Field: React.FC<React.PropsWithChildren<{ label: string }>> = ({ label, children }) => <div className="field"><label>{label}</label>{children}</div>;
const InfoRow: React.FC<{ label: string, value: string }> = ({ label, value }) => <Fragment><span className="info-label">{label}</span><span>{value}</span></Fragment>;
const Button: React.FC<React.PropsWithChildren<{ onClick?: () => void, type?: 'button' | 'submit' | 'reset', variant?: string, disabled?: boolean }>> = ({ onClick, type = 'button', variant = 'primary', disabled, children }) => <button type={type} onClick={onClick} className={`btn ${variant} ${disabled ? 'disabled' : ''}`} disabled={disabled}>{children}</button>;
const ChoiceButton: React.FC<{ onClick: () => void, isActive: boolean, children: React.ReactNode, isSet?: boolean, variant?: 'default' | 'warning' | 'danger' }> = ({ onClick, isActive, children, isSet, variant = 'default' }) => {
  let btnClass = 'choice-btn';
  if (isActive) btnClass += ` active ${variant}`;
  else if (isSet) btnClass += ' disabled-choice';
  return <button type="button" onClick={onClick} className={btnClass}>{children}</button>;
};

// =================================================================
// 5. STYLES (same as /check)
// =================================================================

const GlobalStyles: React.FC<{ backgroundUrl: string }> = ({ backgroundUrl }) => (<style jsx global>{`
    :root {
      --color-bg: #f8fafc; --color-card: #ffffff; --color-text: #1f2937; --color-text-secondary: #6b7280;
      --color-primary: #2563eb; --color-primary-light: #eff6ff; --color-success: #16a34a; --color-success-light: #f0fdf4;
      --color-danger: #dc2626; --color-danger-light: #fef2f2; --color-warning: #f59e0b; --color-warning-light: #fffbeb;
      --color-border: #e5e7eb; --color-border-focus: #3b82f6; --color-disabled: #a1a1aa; --color-disabled-light: #f4f4f5;
      --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05); --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
    }
    body::before {
        content: '';
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background-image: url('${backgroundUrl}');
        background-size: cover;
        background-position: center;
        background-repeat: no-repeat;
        z-index: -1;
        pointer-events: none;
    }
    body {
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        background-color: var(--color-bg);
        color: var(--color-text);
        margin: 0; padding: 0;
    }
    .checkin-form { max-width: 700px; margin: 0 auto; padding: 1rem; box-sizing: border-box; }
    .main-header { text-align: center; margin-bottom: 1.5rem; }
    .main-logo { max-width: 188px; height: auto; margin: 0 auto 1rem auto; display: block; }
    .user-info { font-weight: 500; color: var(--color-text-secondary); margin: 0; }
    .page-title { font-size: 1.25rem; font-weight: 700; color: var(--color-text); text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 0.5rem 0; }
    .card { background-color: rgba(255, 255, 255, 0.92); padding: 1.5rem; border-radius: 12px; margin-bottom: 1.5rem; box-shadow: var(--shadow-md); border: 2px solid transparent; transition: border-color 0.2s; }
    .card[data-error="true"] { border: 2px solid var(--color-danger); }
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
    .grid-2-col { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; }
    .grid-3-col { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.75rem; }
    .grid-fuel-5 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.75rem; }
    .fuel-type-buttons { display: flex; flex-wrap: wrap; gap: 1rem; }
    .fuel-type-buttons .choice-btn { flex-grow: 1; }
    .form-actions { margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid var(--color-border); display: flex; gap: 1rem; justify-content: flex-end; padding-bottom: 120px; }
    .copyright-footer { position: fixed; bottom: 0; left: 0; right: 0; text-align: center; padding: 1rem 0; background-color: rgba(255, 255, 255, 0.95); border-top: 1px solid var(--color-border); color: var(--color-text-secondary); font-size: 0.875rem; z-index: 100; box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.05); }
    @media (max-width: 480px) {
      .copyright-footer { padding: 8px 0; font-size: 0.75rem; }
      .form-actions { padding-bottom: 100px; }
    }
    .btn { padding: 0.75rem 1.5rem; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
    .btn.primary { background-color: var(--color-primary); color: white; }
    .btn.secondary { background-color: var(--color-border); color: var(--color-text); }
    .btn.success { background-color: var(--color-success); color: white; }
    .btn.danger { background-color: var(--color-danger); color: white; }
    .btn.warning { background-color: var(--color-warning); color: white; }
    .btn.disabled { background-color: var(--color-disabled-light); color: var(--color-disabled); cursor: not-allowed; }
    .btn:not(:disabled):hover { filter: brightness(1.1); }
    .choice-btn { display: flex; align-items: center; justify-content: center; width: 100%; min-width: 0; padding: 0.85rem 1rem; border-radius: 8px; border: 2px solid var(--color-border); background-color: white; color: var(--color-text); font-weight: 500; cursor: pointer; transition: all 0.2s; text-align: center; }
    .choice-btn:hover { filter: brightness(1.05); }
    .choice-btn.active.default { border-color: var(--color-success); background-color: var(--color-success-light); color: var(--color-success); }
    .choice-btn.active.warning { border-color: var(--color-warning); background-color: var(--color-warning-light); color: #b45309; }
    .choice-btn.active.danger { border-color: var(--color-danger); background-color: var(--color-danger-light); color: #991b1b; }
    .choice-btn.disabled-choice { border-color: var(--color-border); background-color: var(--color-bg); color: var(--color-disabled); cursor: default; }
    .warning-highlight { background-color: #dc2626; color: white; font-weight: bold; padding: 0.5rem 0.75rem; border-radius: 6px; display: inline-block; margin-top: 0.5rem; }
    .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background-color: rgba(0,0,0,0.5); z-index: 100; }
    .modal-content {
      position: fixed;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      background-color: rgba(255, 255, 255, 0.92);
      padding: 2rem; border-radius: 12px;
      z-index: 101; box-shadow: var(--shadow-md);
      width: 90%; max-width: 500px;
      display: flex; flex-direction: column;
      max-height: calc(100dvh - 32px);
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
    }
    .success-modal { text-align: center; }
    .success-icon { font-size: 3rem; color: var(--color-success); margin-bottom: 1rem; }
    .confirm-modal { text-align: left; }
    .confirm-header { text-align: center; margin-bottom: 1.5rem; padding-bottom: 1.5rem; border-bottom: 1px solid var(--color-border); }
    .confirm-modal-title { font-size: 1.5rem; font-weight: 700; margin: 0; }
    .confirm-vehicle-info { font-size: 1.25rem; font-weight: 600; margin: 0.5rem 0 1rem 0; }
    .confirm-details { flex: 1 1 auto; }
    .confirm-summary { margin-bottom: 1rem; padding-bottom: 1rem; border-bottom: 1px solid var(--color-border); }
    .confirm-summary:last-child { border-bottom: none; padding-bottom: 0; margin-bottom: 0; }
    .confirm-summary p { margin: 0.5rem 0; line-height: 1.5; }
    .modal-actions { display: flex; justify-content: flex-end; gap: 1rem; padding-top: 1rem; }
    .spinner-overlay { display: flex; flex-direction: column; align-items: center; justify-content: center; color: white; font-size: 1.2rem; font-weight: 600; }
    .spinner { border: 5px solid #f3f3f3; border-top: 5px solid var(--color-primary); border-radius: 50%; width: 50px; height: 50px; animation: spin 1s linear infinite; margin-bottom: 1rem; }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    .grid-3-col .choice-btn { min-height: 48px; }
    @media (max-width: 480px) {
      .grid-3-col { grid-template-columns: 1fr; }
      .grid-fuel-5 { grid-template-columns: 1fr 1fr; }
    }
`}</style>);

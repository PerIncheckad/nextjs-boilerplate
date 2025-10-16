'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { getVehicleInfo, VehicleInfo } from '@/lib/damages';
import { notifyCheckin } from '@/lib/notify';

type FormValues = {
  regnr: string;
  status: 'FULL_MATCH' | 'PARTIAL_MATCH' | 'NO_MATCH' | 'NOT_CHECKED';
  carModel?: string;
  ort: string;
  station: string;
  matarstallning: string;
  drivmedel?: 'bensin' | 'diesel' | 'elbil' | 'hybrid' | 'laddhybrid';
  tankning?: {
    tankniva: string | null;
    liters?: string;
    bransletyp: string | null;
    literpris?: string;
  };
  laddning?: {
    laddniva: string | null;
  };
  hjultyp?: 'Sommardäck' | 'Vinterdäck' | 'Helårsdäck';
  rekond: boolean;
  varningslampa: boolean; // Ny fält för varningslampa
  notering: string;
  incheckare: string;
  timestamp: string;
  dokumenterade_skador: DokumenteradSkada[];
  nya_skador: NySkada[];
  åtgärdade_skador: ÅtgärdadSkada[];
  currentLocation: 'same' | 'different'; // Ny fält för nuvarande plats
  currentOrt?: string;           // Ny fält för alternativ ort
  currentStation?: string;       // Ny fält för alternativ station
  currentLocationNote?: string;  // Ny fält för platskommentar
};

interface BasSkada {
  id: string;
  status: string;
  uploads: {
    photo_urls: string[];
    video_urls: string[];
    folder: string;
  };
}

interface DokumenteradSkada extends BasSkada {
  fullText: string;
  shortText: string;
  userType: string;
  userCarPart: string;
  userPosition: string;
}

interface NySkada extends BasSkada {
  fullText: string;
  shortText: string;
  type: string;
  carPart: string;
  position: string;
  comment: string;
  needsReport: 'yes' | 'no' | ''; // Nytt fält för skadeanmälan
}

interface ÅtgärdadSkada extends BasSkada {
  fullText: string;
  shortText: string;
}

type Region = 'Norr' | 'Mitt' | 'Syd';

export default function FormClient() {
  // State för formulärvärden
  const [values, setValues] = useState<FormValues>({
    regnr: '',
    status: 'NOT_CHECKED',
    ort: '',
    station: '',
    matarstallning: '',
    rekond: false,
    varningslampa: false, // Initiera som false
    notering: '',
    incheckare: '',
    timestamp: new Date().toISOString(),
    dokumenterade_skador: [],
    nya_skador: [],
    åtgärdade_skador: [],
    currentLocation: 'same', // Standard är "samma som ovan"
  });

  // State för att hantera varje steg i processen
  const [step, setStep] = useState(1);
  const [regSearchTouched, setRegSearchTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUploader, setShowUploader] = useState(false);
  const [activeSkada, setActiveSkada] = useState<string | null>(null);

  // Lista över orter baserat på vald region
  const [selectedRegion, setSelectedRegion] = useState<Region>('Syd');
  const [availableOrter, setAvailableOrter] = useState<string[]>([]);
  const [availableStationer, setAvailableStationer] = useState<string[]>([]);
  const [showNyaSkador, setShowNyaSkador] = useState('not_chosen');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [savedVehicleInfo, setSavedVehicleInfo] = useState<VehicleInfo | null>(null);

  // Ladda orter baserat på vald region
  useEffect(() => {
    async function fetchOrter() {
      try {
        const { data: orter, error } = await supabase
          .from('orter')
          .select('name')
          .eq('region', selectedRegion)
          .order('name');

        if (error) throw error;
        setAvailableOrter(orter.map(o => o.name));
      } catch (err) {
        console.error('Error fetching orter:', err);
      }
    }

    fetchOrter();
  }, [selectedRegion]);

  // Ladda stationer baserat på vald ort
  useEffect(() => {
    async function fetchStationer() {
      if (!values.ort) {
        setAvailableStationer([]);
        return;
      }

      try {
        const { data: stationer, error } = await supabase
          .from('stationer')
          .select('name')
          .eq('ort', values.ort)
          .order('name');

        if (error) throw error;
        setAvailableStationer(stationer.map(s => s.name));
      } catch (err) {
        console.error('Error fetching stationer:', err);
      }
    }

    fetchStationer();
  }, [values.ort]);

  // Ladda stationer för den alternativa platsen
  useEffect(() => {
    async function fetchCurrentStationer() {
      if (!values.currentOrt) {
        return;
      }

      try {
        const { data: stationer, error } = await supabase
          .from('stationer')
          .select('name')
          .eq('ort', values.currentOrt)
          .order('name');

        if (error) throw error;
        // Implementera logik för att uppdatera dropdown för alternativ plats
      } catch (err) {
        console.error('Error fetching stationer for current location:', err);
      }
    }

    if (values.currentLocation === 'different') {
      fetchCurrentStationer();
    }
  }, [values.currentOrt, values.currentLocation]);

  // Hantera sökning av registreringsnummer
  const handleRegSearch = async () => {
    if (!values.regnr) return;

    setLoading(true);
    setError(null);

    try {
      const info = await getVehicleInfo(values.regnr);
      setSavedVehicleInfo(info);

      if (info) {
        setValues(prev => ({
          ...prev,
          status: 'FULL_MATCH',
          carModel: `${info.brand || ''} ${info.model || ''}`.trim(),
        }));
      } else {
        setValues(prev => ({
          ...prev,
          status: 'NO_MATCH',
          carModel: undefined
        }));
      }
    } catch (err) {
      setError('Kunde inte söka på registreringsnummer. Försök igen.');
      console.error(err);
    } finally {
      setLoading(false);
      setRegSearchTouched(true);
    }
  };

  // Validera aktuellt steg
  const validateStep = () => {
    if (step === 1) {
      return !!values.regnr && regSearchTouched;
    } else if (step === 2) {
      return (
        !!values.ort &&
        !!values.station &&
        !!values.matarstallning &&
        !!values.drivmedel
      );
    } else if (step === 3) {
      return !!values.incheckare && showNyaSkador !== 'not_chosen';
    }
    return true;
  };

  // Lägg till en ny skada
  const addNySkada = () => {
    const id = `ny_${Date.now().toString(36)}${Math.random().toString(36).substr(2, 5)}`;
    const newSkada: NySkada = {
      id,
      fullText: '',
      shortText: '',
      type: '',
      carPart: '',
      position: '',
      comment: '',
      status: 'new',
      uploads: { photo_urls: [], video_urls: [], folder: '' },
      needsReport: '', // Initialt tomt, måste väljas
    };
    
    setValues(prev => ({
      ...prev,
      nya_skador: [...prev.nya_skador, newSkada]
    }));
  };

  // Uppdatera en skada
  const updateSkada = (id: string, field: string, value: string) => {
    setValues(prev => {
      const updatedSkador = prev.nya_skador.map(skada => {
        if (skada.id === id) {
          return { ...skada, [field]: value };
        }
        return skada;
      });
      
      return { ...prev, nya_skador: updatedSkador };
    });
  };

  // Uppdatera skadeanmälan status
  const updateSkadeanmalan = (id: string, needsReport: 'yes' | 'no') => {
    setValues(prev => {
      const updatedSkador = prev.nya_skador.map(skada => {
        if (skada.id === id) {
          return { ...skada, needsReport };
        }
        return skada;
      });
      
      return { ...prev, nya_skador: updatedSkador };
    });
  };

  // Uppdatera en befintlig skada
  const updateDokumenteradSkada = (id: string, field: string, value: string) => {
    setValues(prev => {
      const updatedSkador = prev.dokumenterade_skador.map(skada => {
        if (skada.id === id) {
          return { ...skada, [field]: value };
        }
        return skada;
      });
      
      return { ...prev, dokumenterade_skador: updatedSkador };
    });
  };

  // Skicka formuläret
  const handleSubmit = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);

    try {
      // Validera att alla nya skador har en skadeanmälan status
      const invalidSkador = values.nya_skador.filter(skada => skada.needsReport === '');
      if (invalidSkador.length > 0) {
        throw new Error("Alla nya skador måste ha valt om skadeanmälan behövs eller inte.");
      }

      // Förbered data för incheckningsnotifiering
      await notifyCheckin({
        region: selectedRegion,
        subjectBase: `${values.regnr} - ${values.ort} / ${values.station}`,
        htmlBody: '',
        target: 'station',
        meta: values,
      });

      setSuccess(true);
      // Återställ formulär efter framgångsrik inlämning
      setValues({
        regnr: '',
        status: 'NOT_CHECKED',
        ort: '',
        station: '',
        matarstallning: '',
        rekond: false,
        varningslampa: false,
        notering: '',
        incheckare: '',
        timestamp: new Date().toISOString(),
        dokumenterade_skador: [],
        nya_skador: [],
        åtgärdade_skador: [],
        currentLocation: 'same',
      });
      setStep(1);
      setRegSearchTouched(false);
      setSavedVehicleInfo(null);
      setShowNyaSkador('not_chosen');
      
    } catch (err: any) {
      console.error('Submission error:', err);
      setError(`Ett fel uppstod: ${err.message || 'Okänt fel'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Hantera filuppladdningar
  const handleFilesUploaded = useCallback((skadaId: string, uploadData: { 
    photo_urls: string[], 
    video_urls: string[], 
    folder: string 
  }) => {
    setValues(prev => {
      // Uppdatera uploads för rätt skada
      const updatedDokumenterade = prev.dokumenterade_skador.map(skada => {
        if (skada.id === skadaId) {
          return { ...skada, uploads: uploadData };
        }
        return skada;
      });

      const updatedNya = prev.nya_skador.map(skada => {
        if (skada.id === skadaId) {
          return { ...skada, uploads: uploadData };
        }
        return skada;
      });

      return {
        ...prev,
        dokumenterade_skador: updatedDokumenterade,
        nya_skador: updatedNya,
      };
    });
  }, []);

  // Validera om nästa steg är möjligt
  const canProceed = useMemo(() => validateStep(), [step, values, regSearchTouched, showNyaSkador]);

  // Funktioner för att navigera mellan stegen
  const nextStep = () => {
    if (canProceed) setStep(prev => prev + 1);
  };

  const prevStep = () => {
    setStep(prev => Math.max(1, prev - 1));
  };

  // Hantera val av befintlig skada för att dokumentera
  const selectSkadaToDocument = (skada: any) => {
    const newSkada: DokumenteradSkada = {
      id: `dok_${Date.now().toString(36)}${Math.random().toString(36).substr(2, 5)}`,
      fullText: skada.fullText,
      shortText: skada.shortText,
      status: 'documented',
      userType: '',
      userCarPart: '',
      userPosition: '',
      uploads: { photo_urls: [], video_urls: [], folder: '' }
    };
    
    setValues(prev => ({
      ...prev,
      dokumenterade_skador: [...prev.dokumenterade_skador, newSkada]
    }));
  };

  // Steg 1: Registreringsnummer och bilmodell
  const renderStep1 = () => (
    <div className="form-step">
      <h2>Steg 1: Identifiera bilen</h2>
      
      <div className="form-group">
        <label htmlFor="regnr">Registreringsnummer:</label>
        <div className="search-group">
          <input
            id="regnr"
            type="text"
            value={values.regnr}
            onChange={e => setValues({ ...values, regnr: e.target.value.toUpperCase() })}
            placeholder="ABC123"
            maxLength={7}
            className="form-control"
            disabled={loading}
          />
          <button 
            onClick={handleRegSearch}
            disabled={!values.regnr || loading}
            className="search-button"
          >
            {loading ? 'Söker...' : 'Sök'}
          </button>
        </div>
        
        {values.status === 'NO_MATCH' && (
          <div className="alert alert-warning">
            Hittade ingen bil med detta registreringsnummer.
          </div>
        )}

        {values.status === 'FULL_MATCH' && (
          <div className="alert alert-success">
            <p><strong>Bil hittad:</strong> {values.carModel}</p>
          </div>
        )}

        {error && <div className="alert alert-danger">{error}</div>}
      </div>

      <div className="form-buttons">
        <button 
          onClick={nextStep}
          disabled={!canProceed || loading}
          className="btn-primary"
        >
          Nästa
        </button>
      </div>
    </div>
  );

  // Steg 2: Plats och incheckningsinformation
  const renderStep2 = () => (
    <div className="form-step">
      <h2>Steg 2: Plats och fordonsinformation</h2>
      
      <div className="form-group">
        <label htmlFor="region-select">Region:</label>
        <select 
          id="region-select"
          value={selectedRegion}
          onChange={(e) => setSelectedRegion(e.target.value as Region)}
          className="form-control"
        >
          <option value="Norr">Norr</option>
          <option value="Mitt">Mitt</option>
          <option value="Syd">Syd</option>
        </select>
      </div>

      <div className="form-group">
        <label htmlFor="ort-select">Ort:</label>
        <select 
          id="ort-select"
          value={values.ort}
          onChange={(e) => setValues({ ...values, ort: e.target.value, station: '' })}
          className="form-control"
        >
          <option value="">Välj ort</option>
          {availableOrter.map(ort => (
            <option key={ort} value={ort}>{ort}</option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label htmlFor="station-select">Station:</label>
        <select 
          id="station-select"
          value={values.station}
          onChange={(e) => setValues({ ...values, station: e.target.value })}
          className="form-control"
          disabled={!values.ort}
        >
          <option value="">Välj station</option>
          {availableStationer.map(station => (
            <option key={station} value={station}>{station}</option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label htmlFor="matarstallning">Mätarställning (km):</label>
        <input
          id="matarstallning"
          type="number"
          value={values.matarstallning}
          onChange={e => setValues({ ...values, matarstallning: e.target.value })}
          placeholder="Kilometer"
          className="form-control"
          min="0"
        />
      </div>

      <div className="form-group">
        <label>Drivmedel:</label>
        <div className="radio-group">
          {(['bensin', 'diesel', 'elbil', 'hybrid', 'laddhybrid'] as const).map(fuel => (
            <label key={fuel} className="radio-label">
              <input
                type="radio"
                name="drivmedel"
                value={fuel}
                checked={values.drivmedel === fuel}
                onChange={() => setValues({ ...values, drivmedel: fuel })}
              />
              {fuel.charAt(0).toUpperCase() + fuel.slice(1)}
            </label>
          ))}
        </div>
      </div>

      {(values.drivmedel === 'bensin' || values.drivmedel === 'diesel' || 
        values.drivmedel === 'hybrid' || values.drivmedel === 'laddhybrid') && (
        <div className="form-group">
          <label htmlFor="tankniva">Tanknivå:</label>
          <select
            id="tankniva"
            value={values.tankning?.tankniva || ''}
            onChange={e => setValues({
              ...values,
              tankning: { ...values.tankning, tankniva: e.target.value || null }
            })}
            className="form-control"
          >
            <option value="">Välj tanknivå</option>
            <option value="1/8">1/8</option>
            <option value="1/4">1/4</option>
            <option value="3/8">3/8</option>
            <option value="1/2">1/2</option>
            <option value="5/8">5/8</option>
            <option value="3/4">3/4</option>
            <option value="7/8">7/8</option>
            <option value="full">Full</option>
          </select>
        </div>
      )}

      {(values.drivmedel === 'elbil' || values.drivmedel === 'laddhybrid') && (
        <div className="form-group">
          <label htmlFor="laddniva">Laddnivå (%):</label>
          <input
            id="laddniva"
            type="number"
            min="0"
            max="100"
            value={values.laddning?.laddniva || ''}
            onChange={e => setValues({
              ...values,
              laddning: { laddniva: e.target.value || null }
            })}
            placeholder="Ange procent"
            className="form-control"
          />
        </div>
      )}

      <div className="form-group">
        <label htmlFor="hjultyp">Däcktyp:</label>
        <select
          id="hjultyp"
          value={values.hjultyp || ''}
          onChange={e => setValues({ ...values, hjultyp: e.target.value as any })}
          className="form-control"
        >
          <option value="">Välj däcktyp</option>
          <option value="Sommardäck">Sommardäck</option>
          <option value="Vinterdäck">Vinterdäck</option>
          <option value="Helårsdäck">Helårsdäck</option>
        </select>
      </div>

      <div className="form-buttons">
        <button onClick={prevStep} className="btn-secondary">Tillbaka</button>
        <button 
          onClick={nextStep}
          disabled={!canProceed}
          className="btn-primary"
        >
          Nästa
        </button>
      </div>
    </div>
  );

  // Steg 3: Skador och noteringar
  const renderStep3 = () => (
    <div className="form-step">
      <h2>Steg 3: Skador och noteringar</h2>
      
      {/* Checkboxes för rekond och varningslampa */}
      <div className="checkbox-group">
        <label className={`checkbox-button ${values.rekond ? 'active' : ''}`}>
          <input
            type="checkbox"
            checked={values.rekond}
            onChange={e => setValues({ ...values, rekond: e.target.checked })}
          />
          <span className="checkbox-label">Behöver rekond</span>
        </label>
        
        <label className={`checkbox-button ${values.varningslampa ? 'active' : ''}`}>
          <input
            type="checkbox"
            checked={values.varningslampa}
            onChange={e => setValues({ ...values, varningslampa: e.target.checked })}
          />
          <span className="checkbox-label">Varningslampa lyser</span>
        </label>
      </div>

      {/* Befintliga skador */}
      <div className="form-section">
        <h3>Befintliga skador</h3>
        {values.dokumenterade_skador.map(skada => (
          <div key={skada.id} className="skada-item">
            <div className="skada-header">
              <strong>{skada.fullText}</strong>
              <button 
                className="remove-button" 
                onClick={() => {
                  setValues({
                    ...values,
                    dokumenterade_skador: values.dokumenterade_skador.filter(s => s.id !== skada.id)
                  });
                }}
              >
                Ta bort
              </button>
            </div>
            
            <div className="skada-details">
              <div className="form-group">
                <label htmlFor={`skada-${skada.id}-type`}>Skadetyp:</label>
                <select
                  id={`skada-${skada.id}-type`}
                  value={skada.userType}
                  onChange={e => updateDokumenteradSkada(skada.id, 'userType', e.target.value)}
                  className="form-control"
                >
                  <option value="">Välj skadetyp</option>
                  <option value="Bucklor">Bucklor</option>
                  <option value="Repor">Repor</option>
                  <option value="Fälgskada sommarhjul">Fälgskada sommarhjul</option>
                  <option value="Fälgskada vinterhjul">Fälgskada vinterhjul</option>
                  <option value="Däckskada sommarhjul">Däckskada sommarhjul</option>
                  <option value="Däckskada vinterhjul">Däckskada vinterhjul</option>
                  <option value="Vindruteskada">Vindruteskada</option>
                  <option value="Glasskada">Glasskada (ej vindruta)</option>
                  <option value="Plastskada">Plastskada</option>
                  <option value="Annat">Annat</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor={`skada-${skada.id}-part`}>Bildel:</label>
                <select
                  id={`skada-${skada.id}-part`}
                  value={skada.userCarPart}
                  onChange={e => updateDokumenteradSkada(skada.id, 'userCarPart', e.target.value)}
                  className="form-control"
                >
                  <option value="">Välj bildel</option>
                  <option value="Dörr utsida">Dörr utsida</option>
                  <option value="Dörr insida">Dörr insida</option>
                  <option value="Motorhuv">Motorhuv</option>
                  <option value="Bagagelucka">Bagagelucka</option>
                  <option value="Framskärm">Framskärm</option>
                  <option value="Bakskärm">Bakskärm</option>
                  <option value="Tak">Tak</option>
                  <option value="Tröskel">Tröskel</option>
                  <option value="Stötfångare fram">Stötfångare fram</option>
                  <option value="Stötfångare bak">Stötfångare bak</option>
                  <option value="Vindruta">Vindruta</option>
                  <option value="Annat">Annat</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor={`skada-${skada.id}-position`}>Position:</label>
                <select
                  id={`skada-${skada.id}-position`}
                  value={skada.userPosition}
                  onChange={e => updateDokumenteradSkada(skada.id, 'userPosition', e.target.value)}
                  className="form-control"
                >
                  <option value="">Välj position</option>
                  <option value="Vänster fram">Vänster fram</option>
                  <option value="Höger fram">Höger fram</option>
                  <option value="Vänster bak">Vänster bak</option>
                  <option value="Höger bak">Höger bak</option>
                  <option value="Fram">Fram</option>
                  <option value="Bak">Bak</option>
                  <option value="Utsida">Utsida</option>
                  <option value="Insida">Insida</option>
                </select>
              </div>
              
              <button 
                className="upload-button" 
                onClick={() => {
                  setActiveSkada(skada.id);
                  setShowUploader(true);
                }}
              >
                {skada.uploads.photo_urls.length > 0 || skada.uploads.video_urls.length > 0 
                  ? 'Ändra bilder/video' 
                  : 'Lägg till bilder/video'}
              </button>
              
              {(skada.uploads.photo_urls.length > 0 || skada.uploads.video_urls.length > 0) && (
                <div className="uploads-summary">
                  <span>
                    {skada.uploads.photo_urls.length > 0 && `${skada.uploads.photo_urls.length} bilder`}
                    {skada.uploads.photo_urls.length > 0 && skada.uploads.video_urls.length > 0 && ' och '}
                    {skada.uploads.video_urls.length > 0 && `${skada.uploads.video_urls.length} videor`}
                    {' tillagda'}
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Val av nya skador */}
      <div className="form-section">
        <h3>Finns det nya skador?</h3>
        <div className="radio-group">
          <label className="radio-label">
            <input
              type="radio"
              name="nya_skador_val"
              value="yes"
              checked={showNyaSkador === 'yes'}
              onChange={() => setShowNyaSkador('yes')}
            />
            Ja, nya skador
          </label>
          <label className="radio-label">
            <input
              type="radio"
              name="nya_skador_val"
              value="no"
              checked={showNyaSkador === 'no'}
              onChange={() => {
                setShowNyaSkador('no');
                setValues({...values, nya_skador: []});
              }}
            />
            Inga nya skador
          </label>
        </div>
      </div>

      {/* Lista över nya skador */}
      {showNyaSkador === 'yes' && (
        <div className="form-section">
          <div className="section-header">
            <h3>Nya skador</h3>
            <button 
              className="add-button" 
              onClick={addNySkada}
            >
              + Lägg till skada
            </button>
          </div>
          
          {values.nya_skador.map(skada => (
            <div key={skada.id} className="skada-item">
              <div className="skada-header">
                <strong>{skada.type && skada.carPart && skada.position 
                  ? `${skada.type} - ${skada.carPart} - ${skada.position}` 
                  : 'Ny skada'}
                </strong>
                <button 
                  className="remove-button" 
                  onClick={() => {
                    setValues({
                      ...values,
                      nya_skador: values.nya_skador.filter(s => s.id !== skada.id)
                    });
                  }}
                >
                  Ta bort
                </button>
              </div>
              
              <div className="skada-details">
                <div className="form-group">
                  <label htmlFor={`skada-${skada.id}-type`}>Skadetyp:</label>
                  <select
                    id={`skada-${skada.id}-type`}
                    value={skada.type}
                    onChange={e => updateSkada(skada.id, 'type', e.target.value)}
                    className="form-control"
                  >
                    <option value="">Välj skadetyp</option>
                    <option value="Bucklor">Bucklor</option>
                    <option value="Repor">Repor</option>
                    <option value="Fälgskada sommarhjul">Fälgskada sommarhjul</option>
                    <option value="Fälgskada vinterhjul">Fälgskada vinterhjul</option>
                    <option value="Däckskada sommarhjul">Däckskada sommarhjul</option>
                    <option value="Däckskada vinterhjul">Däckskada vinterhjul</option>
                    <option value="Vindruteskada">Vindruteskada</option>
                    <option value="Glasskada">Glasskada (ej vindruta)</option>
                    <option value="Plastskada">Plastskada</option>
                    <option value="Annat">Annat</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor={`skada-${skada.id}-part`}>Bildel:</label>
                  <select
                    id={`skada-${skada.id}-part`}
                    value={skada.carPart}
                    onChange={e => updateSkada(skada.id, 'carPart', e.target.value)}
                    className="form-control"
                  >
                    <option value="">Välj bildel</option>
                    <option value="Dörr utsida">Dörr utsida</option>
                    <option value="Dörr insida">Dörr insida</option>
                    <option value="Motorhuv">Motorhuv</option>
                    <option value="Bagagelucka">Bagagelucka</option>
                    <option value="Framskärm">Framskärm</option>
                    <option value="Bakskärm">Bakskärm</option>
                    <option value="Tak">Tak</option>
                    <option value="Tröskel">Tröskel</option>
                    <option value="Stötfångare fram">Stötfångare fram</option>
                    <option value="Stötfångare bak">Stötfångare bak</option>
                    <option value="Vindruta">Vindruta</option>
                    <option value="Annat">Annat</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor={`skada-${skada.id}-position`}>Position:</label>
                  <select
                    id={`skada-${skada.id}-position`}
                    value={skada.position}
                    onChange={e => updateSkada(skada.id, 'position', e.target.value)}
                    className="form-control"
                  >
                    <option value="">Välj position</option>
                    <option value="Vänster fram">Vänster fram</option>
                    <option value="Höger fram">Höger fram</option>
                    <option value="Vänster bak">Vänster bak</option>
                    <option value="Höger bak">Höger bak</option>
                    <option value="Fram">Fram</option>
                    <option value="Bak">Bak</option>
                    <option value="Utsida">Utsida</option>
                    <option value="Insida">Insida</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor={`skada-${skada.id}-comment`}>Kommentar:</label>
                  <textarea
                    id={`skada-${skada.id}-comment`}
                    value={skada.comment}
                    onChange={e => updateSkada(skada.id, 'comment', e.target.value)}
                    className="form-control"
                    placeholder="Beskriv skadan..."
                    rows={2}
                  />
                </div>
                
                {/* Knappar för skadeanmälan */}
                <div className="form-group">
                  <label>Behövs skadeanmälan?</label>
                  <div className="radio-group">
                    <label className={`radio-button ${skada.needsReport === 'yes' ? 'active' : ''}`}>
                      <input
                        type="radio"
                        name={`skadeanmalan-${skada.id}`}
                        checked={skada.needsReport === 'yes'}
                        onChange={() => updateSkadeanmalan(skada.id, 'yes')}
                      />
                      Skadeanmälan behövs
                    </label>
                    
                    <label className={`radio-button ${skada.needsReport === 'no' ? 'active' : ''}`}>
                      <input
                        type="radio"
                        name={`skadeanmalan-${skada.id}`}
                        checked={skada.needsReport === 'no'}
                        onChange={() => updateSkadeanmalan(skada.id, 'no')}
                      />
                      Skadeanmälan behövs inte
                    </label>
                  </div>
                </div>
                
                <button 
                  className="upload-button" 
                  onClick={() => {
                    setActiveSkada(skada.id);
                    setShowUploader(true);
                  }}
                >
                  {skada.uploads.photo_urls.length > 0 || skada.uploads.video_urls.length > 0 
                    ? 'Ändra bilder/video' 
                    : 'Lägg till bilder/video'}
                </button>
                
                {(skada.uploads.photo_urls.length > 0 || skada.uploads.video_urls.length > 0) && (
                  <div className="uploads-summary">
                    <span>
                      {skada.uploads.photo_urls.length > 0 && `${skada.uploads.photo_urls.length} bilder`}
                      {skada.uploads.photo_urls.length > 0 && skada.uploads.video_urls.length > 0 && ' och '}
                      {skada.uploads.video_urls.length > 0 && `${skada.uploads.video_urls.length} videor`}
                      {' tillagda'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
          
          {values.nya_skador.length === 0 && showNyaSkador === 'yes' && (
            <div className="empty-list">
              <p>Klicka på "Lägg till skada" för att dokumentera en ny skada.</p>
            </div>
          )}
        </div>
      )}

      {/* Sektion för bilens nuvarande position */}
      <div className="form-section">
        <h3>Var är bilen nu?</h3>
        <div className="radio-group">
          <label className="radio-label">
            <input
              type="radio"
              name="currentLocation"
              value="same"
              checked={values.currentLocation === 'same'}
              onChange={() => setValues({
                ...values, 
                currentLocation: 'same',
                currentOrt: undefined,
                currentStation: undefined,
                currentLocationNote: undefined
              })}
            />
            Samma som ovan
          </label>
          <label className="radio-label">
            <input
              type="radio"
              name="currentLocation"
              value="different"
              checked={values.currentLocation === 'different'}
              onChange={() => setValues({...values, currentLocation: 'different'})}
            />
            Annan plats
          </label>
        </div>
        
        {values.currentLocation === 'different' && (
          <div className="form-subsection">
            <div className="form-group">
              <label htmlFor="current-ort-select">Ort:</label>
              <select 
                id="current-ort-select"
                value={values.currentOrt || ''}
                onChange={(e) => setValues({ 
                  ...values, 
                  currentOrt: e.target.value,
                  currentStation: '' 
                })}
                className="form-control"
              >
                <option value="">Välj ort</option>
                {availableOrter.map(ort => (
                  <option key={ort} value={ort}>{ort}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="current-station-select">Station:</label>
              <select 
                id="current-station-select"
                value={values.currentStation || ''}
                onChange={(e) => setValues({ ...values, currentStation: e.target.value })}
                className="form-control"
                disabled={!values.currentOrt}
              >
                <option value="">Välj station</option>
                {/* Här skulle vi behöva fylla i stationer baserat på vald ort */}
                {availableStationer.map(station => (
                  <option key={station} value={station}>{station}</option>
                ))}
              </select>
            </div>
            
            <div className="form-group">
              <label htmlFor="current-location-note">Kommentar (frivillig):</label>
              <textarea
                id="current-location-note"
                value={values.currentLocationNote || ''}
                onChange={(e) => setValues({ ...values, currentLocationNote: e.target.value })}
                className="form-control"
                placeholder="Ytterligare information om bilens placering..."
                rows={2}
              />
            </div>
          </div>
        )}
      </div>

      {/* Noteringar och incheckare */}
      <div className="form-section">
        <div className="form-group">
          <label htmlFor="notering">Allmän kommentar (frivillig):</label>
          <textarea
            id="notering"
            value={values.notering}
            onChange={e => setValues({ ...values, notering: e.target.value })}
            className="form-control"
            placeholder="Övriga noteringar..."
            rows={3}
          />
        </div>

        <div className="form-group">
          <label htmlFor="incheckare">Ditt namn:</label>
          <input
            id="incheckare"
            type="text"
            value={values.incheckare}
            onChange={e => setValues({ ...values, incheckare: e.target.value })}
            className="form-control"
            placeholder="Ange ditt namn"
          />
        </div>
      </div>

      <div className="form-buttons">
        <button onClick={prevStep} className="btn-secondary">Tillbaka</button>
        <button 
          onClick={handleSubmit}
          disabled={!canProceed || isSubmitting}
          className="btn-primary"
        >
          {isSubmitting ? 'Skickar...' : 'Skicka incheckning'}
        </button>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}
    </div>
  );

  // Success state efter incheckning
  const renderSuccess = () => (
    <div className="success-container">
      <div className="success-message">
        <h2>Incheckning skickad!</h2>
        <p>
          Incheckningen för {values.regnr} har skickats till stationen och registrerats i systemet.
        </p>
        <button onClick={() => setSuccess(false)} className="btn-primary">
          Gör en ny incheckning
        </button>
      </div>
    </div>
  );

  // Huvudrendering
  return (
    <div className="form-container">
      {success ? (
        renderSuccess()
      ) : (
        <>
          <div className="form-progress">
            <div className={`progress-step ${step >= 1 ? 'active' : ''}`}>
              <div className="step-number">1</div>
              <div className="step-text">Identifiera</div>
            </div>
            <div className="progress-connector" />
            <div className={`progress-step ${step >= 2 ? 'active' : ''}`}>
              <div className="step-number">2</div>
              <div className="step-text">Plats</div>
            </div>
            <div className="progress-connector" />
            <div className={`progress-step ${step >= 3 ? 'active' : ''}`}>
              <div className="step-number">3</div>
              <div className="step-text">Skador</div>
            </div>
          </div>
          
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
        </>
      )}
      
      {/* Här skulle vi lägga till uppladdningskomponenten */}
      {showUploader && activeSkada && (
        <div className="uploader-modal">
          <div className="uploader-content">
            <h3>Ladda upp bilder och video</h3>
            
            {/* MediaUploader-komponenten skulle gå här */}
            
            <div className="uploader-buttons">
              <button 
                onClick={() => setShowUploader(false)} 
                className="btn-secondary"
              >
                Stäng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

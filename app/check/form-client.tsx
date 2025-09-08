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

type MabiDamageData = {
  regnr: string;
  brand_model: string | null;
  'Skadetyp': string | null;
  'Skadans plats på fordonet': string | null;
  'Intern notering': string | null;
  'Skadeanmälan': string | null;
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
  const diffTime = today.getTime() - date.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays <= days;
};

export default function FormClient() {
  // State variabler
  const [regInput, setRegInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [carData, setCarData] = useState<CarData | null>(null);
  const [mabiDamages, setMabiDamages] = useState<MabiDamageData[]>([]);
  const [usingMabiData, setUsingMabiData] = useState(false);
  
  // Autocomplete
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  
  // Formulärdata
  const [ort, setOrt] = useState('');
  const [station, setStation] = useState('');
  const [annanPlats, setAnnanPlats] = useState('');
  const [usingAnnanPlats, setUsingAnnanPlats] = useState(false);
  const [vehicleCondition, setVehicleCondition] = useState('');
  const [fuelLevel, setFuelLevel] = useState('');
  const [fuelAdded, setFuelAdded] = useState('');
  const [fuelType, setFuelType] = useState('');
  const [engineCheck, setEngineCheck] = useState('');
  const [exteriorCondition, setExteriorCondition] = useState('');
  const [interiorCondition, setInteriorCondition] = useState('');
  const [tireCondition, setTireCondition] = useState('');
  const [damageNotes, setDamageNotes] = useState('');
  const [returnedBy, setReturnedBy] = useState('');
  const [contactInfo, setContactInfo] = useState('');
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [images, setImages] = useState<File[]>([]);
  const [videos, setVideos] = useState<File[]>([]);
  
  // Dialog states
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showFinalConfirmation, setShowFinalConfirmation] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [damageToFix, setDamageToFix] = useState<number | null>(null);
  const [fixedDamages, setFixedDamages] = useState<Set<number>>(new Set());
  const [showFieldErrors, setShowFieldErrors] = useState(false);

  // Smart search för registreringsnummer
  const searchCarData = async (regnr: string) => {
    if (!regnr || regnr.length < 3) return;
    
    setLoading(true);
    setNotFound(false);
    setCarData(null);
    setMabiDamages([]);
    setUsingMabiData(false);

    try {
      // Försök MABI först
      const { data: mabiData, error: mabiError } = await supabase
        .from('mabi_damage_data')
        .select('*')
        .eq('regnr', regnr);

      if (!mabiError && mabiData && mabiData.length > 0) {
        setMabiDamages(mabiData);
        setUsingMabiData(true);
        setCarData({
          regnr: mabiData[0].regnr,
          brand_model: mabiData[0].brand_model,
          damage_text: null,
          wheelstorage: mabiData[0].wheelstorage,
          saludatum: mabiData[0].saludatum
        });
      } else {
        // Fallback till car_data
        const { data: carDataResult, error: carError } = await supabase
          .from('car_data')
          .select('*')
          .eq('regnr', regnr)
          .single();

        if (!carError && carDataResult) {
          setCarData(carDataResult);
          setUsingMabiData(false);
        } else {
          setNotFound(true);
        }
      }
    } catch (error) {
      console.error('Search error:', error);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  };

  // Autocomplete suggestions
  const loadSuggestions = async (query: string) => {
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }

    try {
      const { data: mabiSuggestions } = await supabase
        .from('mabi_damage_data')
        .select('regnr')
        .ilike('regnr', `${query}%`)
        .limit(5);

      const { data: carSuggestions } = await supabase
        .from('car_data')
        .select('regnr')
        .ilike('regnr', `${query}%`)
        .limit(5);

      const allSuggestions = [
        ...(mabiSuggestions || []).map(item => item.regnr),
        ...(carSuggestions || []).map(item => item.regnr)
      ];

      const uniqueSuggestions = [...new Set(allSuggestions)];
      setSuggestions(uniqueSuggestions.slice(0, 5));
    } catch (error) {
      console.error('Suggestions error:', error);
    }
  };

  const handleRegInputChange = (value: string) => {
    const normalizedValue = normalizeReg(value);
    setRegInput(normalizedValue);
    loadSuggestions(normalizedValue);
    setShowSuggestions(normalizedValue.length > 0);

    if (normalizedValue.length >= 3) {
      searchCarData(normalizedValue);
    } else {
      setCarData(null);
      setMabiDamages([]);
      setNotFound(false);
    }
  };

  const selectSuggestion = (suggestion: string) => {
    setRegInput(suggestion);
    setShowSuggestions(false);
    searchCarData(suggestion);
  };

  // Validering
  const isRegComplete = () => regInput.length >= 3 && carData !== null;
  const isLocationComplete = () => usingAnnanPlats ? annanPlats.trim() !== '' : ort !== '' && station !== '';
  const isConditionComplete = () => vehicleCondition !== '' && fuelLevel !== '' && engineCheck !== '' && exteriorCondition !== '' && interiorCondition !== '' && tireCondition !== '';
  const isFuelInfoComplete = () => fuelLevel !== 'partial' || (fuelAdded !== '' && fuelType !== '');
  const hasRequiredMedia = () => images.length > 0 && videos.length > 0;
  const isContactComplete = () => returnedBy.trim() !== '';

  const canSave = () => {
    return isRegComplete() && 
           isLocationComplete() && 
           isConditionComplete() && 
           isFuelInfoComplete() &&
           hasRequiredMedia() &&
           isContactComplete();
  };

  // Media hantering
  const handleAddImage = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files) {
        setImages(prev => [...prev, ...Array.from(files)]);
      }
    };
    input.click();
  };

  const handleAddVideo = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*';
    input.multiple = true;
    input.onchange = (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files) {
        setVideos(prev => [...prev, ...Array.from(files)]);
      }
    };
    input.click();
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const removeVideo = (index: number) => {
    setVideos(prev => prev.filter((_, i) => i !== index));
  };

  // Skadehantering
  const requestFixDamage = (index: number) => {
    setDamageToFix(index);
    setShowConfirmDialog(true);
  };

  const confirmFixDamage = () => {
    if (damageToFix !== null) {
      setFixedDamages(prev => new Set([...prev, damageToFix]));
    }
    setShowConfirmDialog(false);
    setDamageToFix(null);
  };

  const cancelFixDamage = () => {
    setShowConfirmDialog(false);
    setDamageToFix(null);
  };

  // Spara funktionalitet
  const handleSave = () => {
    if (!canSave()) {
      setShowFieldErrors(true);
      return;
    }
    setShowFinalConfirmation(true);
  };

  const confirmSave = () => {
    setShowFinalConfirmation(false);
    setShowSuccessModal(true);
  };

  const resetForm = () => {
    setRegInput('');
    setCarData(null);
    setMabiDamages([]);
    setUsingMabiData(false);
    setOrt('');
    setStation('');
    setAnnanPlats('');
    setUsingAnnanPlats(false);
    setVehicleCondition('');
    setFuelLevel('');
    setFuelAdded('');
    setFuelType('');
    setEngineCheck('');
    setExteriorCondition('');
    setInteriorCondition('');
    setTireCondition('');
    setDamageNotes('');
    setReturnedBy('');
    setContactInfo('');
    setAdditionalNotes('');
    setImages([]);
    setVideos([]);
    setFixedDamages(new Set());
    setShowFieldErrors(false);
    setShowSuccessModal(false);
    setNotFound(false);
  };

  // Component för sektionshuvud
  const SectionHeader = ({ title, isComplete }: { title: string; isComplete: boolean }) => (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
      <h2 style={{ fontSize: '20px', fontWeight: '600', margin: 0, color: '#1f2937' }}>{title}</h2>
      <div style={{
        marginLeft: '12px',
        width: '24px',
        height: '24px',
        borderRadius: '50%',
        backgroundColor: isComplete ? '#10b981' : '#e5e7eb',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#ffffff',
        fontSize: '14px',
        fontWeight: '600'
      }}>
        {isComplete ? '✓' : '!'}
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', padding: '16px' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        
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

        {/* Registreringsnummer med visuell feedback */}
        <div style={{ 
          backgroundColor: '#ffffff',
          padding: '24px',
          borderRadius: '12px',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          position: 'relative',
          border: showFieldErrors && !isRegComplete() ? '2px solid #dc2626' : '2px solid transparent'
        }}>
          <SectionHeader title="Fordon" isComplete={isRegComplete()} />
          
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '16px' }}>
            Registreringsnummer *
          </label>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              value={regInput}
              onChange={(e) => handleRegInputChange(e.target.value)}
              onFocus={() => setShowSuggestions(regInput.length > 0 && suggestions.length > 0)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              placeholder="Skriv reg.nr"
              spellCheck={false}
              autoComplete="off"
              style={{
                width: '100%',
                padding: '14px',
                border: showFieldErrors && !isRegComplete() ? '2px solid #dc2626' : '2px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '18px',
                fontWeight: '600',
                backgroundColor: showFieldErrors && !isRegComplete() ? '#fef2f2' : '#ffffff',
                textAlign: 'center',
                letterSpacing: '2px'
              }}
            />
            
            {/* Autocomplete-förslag */}
            {showSuggestions && suggestions.length > 0 && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                backgroundColor: '#ffffff',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                zIndex: 10,
                maxHeight: '200px',
                overflowY: 'auto'
              }}>
                {suggestions.map((suggestion, index) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => selectSuggestion(suggestion)}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: 'none',
                      backgroundColor: '#ffffff',
                      textAlign: 'left',
                      fontSize: '16px',
                      fontWeight: '500',
                      cursor: 'pointer',
                      borderBottom: index === suggestions.length - 1 ? 'none' : '1px solid #f3f4f6'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#f8fafc';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '#ffffff';
                    }}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
          </div>

          {loading && <p style={{ color: '#2563eb', fontSize: '14px', marginTop: '8px' }}>🔍 Söker...</p>}
          
          {notFound && normalizeReg(regInput).length >= 3 && (
            <div style={{ marginTop: '12px', padding: '12px', backgroundColor: '#fef2f2', borderRadius: '6px', border: '1px solid #fecaca' }}>
              <p style={{ color: '#991b1b', fontSize: '14px', margin: 0, fontWeight: '600' }}>
                ⚠️ Okänt registreringsnummer: {regInput}
              </p>
            </div>
          )}

          {/* Bildata från MABI eller car_data */}
          {carData && (
            <div style={{ marginTop: '16px', padding: '16px', backgroundColor: '#f0f9ff', borderRadius: '8px', border: '1px solid #bae6fd' }}>
              <div style={{ marginBottom: '8px' }}>
                <strong style={{ color: '#1e40af' }}>
                  {usingMabiData ? '🔥 MABI Data' : '📋 Car Data'}
                </strong>
              </div>
              
              {carData.brand_model && (
                <p style={{ margin: '4px 0', fontSize: '14px' }}>
                  <strong>Bilmodell:</strong> {carData.brand_model}
                </p>
              )}
              
              {carData.wheelstorage && (
                <p style={{ margin: '4px 0', fontSize: '14px' }}>
                  <strong>Hjulförvaring:</strong> {carData.wheelstorage}
                </p>
              )}

              {/* Visa befintliga skador */}
              {usingMabiData && mabiDamages.length > 0 ? (
                <div style={{ marginTop: '12px' }}>
                  <strong style={{ fontSize: '14px', color: '#dc2626' }}>Befintliga skador ({mabiDamages.length}):</strong>
                  <div style={{ marginTop: '8px' }}>
                    {mabiDamages.map((damage, index) => (
                      <div key={index} style={{
                        marginBottom: '12px',
                        padding: '12px',
                        backgroundColor: fixedDamages.has(index) ? '#d1fae5' : '#fef2f2',
                        borderRadius: '6px',
                        border: fixedDamages.has(index) ? '1px solid #a7f3d0' : '1px solid #fecaca'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div style={{ flex: 1 }}>
                            {damage['Skadetyp'] && (
                              <p style={{ margin: '0 0 4px 0', fontSize: '13px' }}>
                                <strong>Typ:</strong> {damage['Skadetyp']}
                              </p>
                            )}
                            {damage['Skadans plats på fordonet'] && (
                              <p style={{ margin: '0 0 4px 0', fontSize: '13px' }}>
                                <strong>Plats:</strong> {damage['Skadans plats på fordonet']}
                              </p>
                            )}
                            {damage['Intern notering'] && (
                              <p style={{ margin: '0 0 4px 0', fontSize: '13px' }}>
                                <strong>Notering:</strong> {damage['Intern notering']}
                              </p>
                            )}
                            {damage['Skadeanmälan'] && (
                              <p style={{ margin: '0', fontSize: '13px' }}>
                                <strong>Anmälan:</strong> {damage['Skadeanmälan']}
                              </p>
                            )}
                          </div>
                          
                          {!fixedDamages.has(index) && (
                            <button
                              onClick={() => requestFixDamage(index)}
                              style={{
                                marginLeft: '12px',
                                backgroundColor: '#10b981',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '4px',
                                padding: '6px 12px',
                                fontSize: '12px',
                                fontWeight: '500',
                                cursor: 'pointer'
                              }}
                            >
                              Åtgärdat
                            </button>
                          )}
                          
                          {fixedDamages.has(index) && (
                            <span style={{
                              marginLeft: '12px',
                              color: '#065f46',
                              fontSize: '12px',
                              fontWeight: '600'
                            }}>
                              ✅ Åtgärdat
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : carData.damage_text && (
                <div style={{ marginTop: '12px' }}>
                  <strong style={{ fontSize: '14px', color: '#dc2626' }}>Befintliga skador:</strong>
                  <p style={{ margin: '4px 0', fontSize: '13px', color: '#374151' }}>
                    {carData.damage_text}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Plats för incheckning */}
        <div style={{
          backgroundColor: '#ffffff',
          padding: '24px',
          borderRadius: '12px',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          border: showFieldErrors && !isLocationComplete() ? '2px solid #dc2626' : '2px solid transparent'
        }}>
          <SectionHeader title="Plats för incheckning" isComplete={isLocationComplete()} />
          
          <div style={{ marginBottom: '16px' }}>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              fontSize: '16px',
              fontWeight: '500',
              cursor: 'pointer'
            }}>
              <input
                type="checkbox"
                checked={usingAnnanPlats}
                onChange={(e) => {
                  setUsingAnnanPlats(e.target.checked);
                  if (e.target.checked) {
                    setOrt('');
                    setStation('');
                  } else {
                    setAnnanPlats('');
                  }
                }}
                style={{ marginRight: '8px', transform: 'scale(1.2)' }}
              />
              Annan plats (fritext)
            </label>
          </div>

          {usingAnnanPlats ? (
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '16px' }}>
                Ange plats *
              </label>
              <input
                type="text"
                value={annanPlats}
                onChange={(e) => setAnnanPlats(e.target.value)}
                placeholder="Beskriv platsen..."
                style={{
                  width: '100%',
                  padding: '12px',
                  border: showFieldErrors && annanPlats.trim() === '' ? '2px solid #dc2626' : '2px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '16px',
                  backgroundColor: showFieldErrors && annanPlats.trim() === '' ? '#fef2f2' : '#ffffff'
                }}
              />
            </div>
          ) : (
            <>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '16px' }}>
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
                    border: showFieldErrors && ort === '' ? '2px solid #dc2626' : '2px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '16px',
                    backgroundColor: showFieldErrors && ort === '' ? '#fef2f2' : '#ffffff'
                  }}
                >
                  <option value="">Välj ort</option>
                  {ORTER.map(o => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </div>

              {ort && (
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '16px' }}>
                    Station/Depå *
                  </label>
                  <select
                    value={station}
                    onChange={(e) => setStation(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: showFieldErrors && station === '' ? '2px solid #dc2626' : '2px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '16px',
                      backgroundColor: showFieldErrors && station === '' ? '#fef2f2' : '#ffffff'
                    }}
                  >
                    <option value="">Välj station</option>
                    {STATIONER[ort]?.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}
        </div>

        {/* Fordonsstatus */}
        <div style={{
          backgroundColor: '#ffffff',
          padding: '24px',
          borderRadius: '12px',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          border: showFieldErrors && !isConditionComplete() ? '2px solid #dc2626' : '2px solid transparent'
        }}>
          <SectionHeader title="Fordonsstatus" isComplete={isConditionComplete() && isFuelInfoComplete()} />
          
          {/* Allmänt skick */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '16px' }}>
              Allmänt skick *
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {['Utmärkt', 'Bra', 'Acceptabelt', 'Dåligt'].map(option => (
                <button
                  key={option}
                  onClick={() => setVehicleCondition(option)}
                  style={{
                    padding: '10px 16px',
                    border: vehicleCondition === option ? '2px solid #1d4ed8' : '2px solid #e5e7eb',
                    borderRadius: '8px',
                    backgroundColor: vehicleCondition === option ? '#eef2ff' : '#ffffff',
                    color: vehicleCondition === option ? '#1d4ed8' : '#374151',
                    fontWeight: '500',
                    cursor: 'pointer'
                  }}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          {/* Bränslestatus */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '16px' }}>
              Bränslestatus *
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {[
                { value: 'full', label: 'Fulltankad' },
                { value: 'partial', label: 'Ej fulltankad' }
              ].map(option => (
                <button
                  key={option.value}
                  onClick={() => {
                    setFuelLevel(option.value);
                    if (option.value === 'full') {
                      setFuelAdded('');
                      setFuelType('');
                    }
                  }}
                  style={{
                    padding: '10px 16px',
                    border: fuelLevel === option.value ? '2px solid #1d4ed8' : '2px solid #e5e7eb',
                    borderRadius: '8px',
                    backgroundColor: fuelLevel === option.value ? '#eef2ff' : '#ffffff',
                    color: fuelLevel === option.value ? '#1d4ed8' : '#374151',
                    fontWeight: '500',
                    cursor: 'pointer'
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Följdfrågor för "Ej fulltankad" */}
          {fuelLevel === 'partial' && (
            <div style={{ marginBottom: '20px', padding: '16px', backgroundColor: '#fef2f2', borderRadius: '8px', border: '1px solid #fecaca' }}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '16px' }}>
                  Antal liter påfyllda *
                </label>
                <input
                  type="text"
                  value={fuelAdded}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '' || /^\d+([,.]?\d*)?$/.test(value)) {
                      setFuelAdded(value);
                    }
                  }}
                  placeholder="t.ex. 25,5"
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: showFieldErrors && fuelAdded === '' ? '2px solid #dc2626' : '2px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '16px',
                    backgroundColor: showFieldErrors && fuelAdded === '' ? '#fef2f2' : '#ffffff'
                  }}
                />
              </div>
              
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '16px' }}>
                  Bränsletyp *
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {['Bensin', 'Diesel'].map(type => (
                    <button
                      key={type}
                      onClick={() => setFuelType(type)}
                      style={{
                        padding: '10px 16px',
                        border: fuelType === type ? '2px solid #1d4ed8' : '2px solid #e5e7eb',
                        borderRadius: '8px',
                        backgroundColor: fuelType === type ? '#eef2ff' : '#ffffff',
                        color: fuelType === type ? '#1d4ed8' : '#374151',
                        fontWeight: '500',
                        cursor: 'pointer'
                      }}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Motorcheck */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '16px' }}>
              Motorcheck *
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {['OK', 'Varningslampa'].map(option => (
                <button
                  key={option}
                  onClick={() => setEngineCheck(option)}
                  style={{
                    padding: '10px 16px',
                    border: engineCheck === option ? '2px solid #1d4ed8' : '2px solid #e5e7eb',
                    borderRadius: '8px',
                    backgroundColor: engineCheck === option ? '#eef2ff' : '#ffffff',
                    color: engineCheck === option ? '#1d4ed8' : '#374151',
                    fontWeight: '500',
                    cursor: 'pointer'
                  }}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          {/* Exteriör */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '16px' }}>
              Exteriör *
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {['Perfekt', 'Mindre repor', 'Bucklor', 'Behöver reparation'].map(option => (
                <button
                  key={option}
                  onClick={() => setExteriorCondition(option)}
                  style={{
                    padding: '10px 16px',
                    border: exteriorCondition === option ? '2px solid #1d4ed8' : '2px solid #e5e7eb',
                    borderRadius: '8px',
                    backgroundColor: exteriorCondition === option ? '#eef2ff' : '#ffffff',
                    color: exteriorCondition === option ? '#1d4ed8' : '#374151',
                    fontWeight: '500',
                    cursor: 'pointer'
                  }}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          {/* Interiör */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '16px' }}>
              Interiör *
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {['Rent', 'Lätt nedsmutsat', 'Smutsigt', 'Behöver djuprengöring'].map(option => (
                <button
                  key={option}
                  onClick={() => setInteriorCondition(option)}
                  style={{
                    padding: '10px 16px',
                    border: interiorCondition === option ? '2px solid #1d4ed8' : '2px solid #e5e7eb',
                    borderRadius: '8px',
                    backgroundColor: interiorCondition === option ? '#eef2ff' : '#ffffff',
                    color: interiorCondition === option ? '#1d4ed8' : '#374151',
                    fontWeight: '500',
                    cursor: 'pointer'
                  }}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          {/* Däck */}
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '16px' }}>
              Däckstatus *
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {['Bra', 'Acceptabel', 'Slitna', 'Behöver bytas'].map(option => (
                <button
                  key={option}
                  onClick={() => setTireCondition(option)}
                  style={{
                    padding: '10px 16px',
                    border: tireCondition === option ? '2px solid #1d4ed8' : '2px solid #e5e7eb',
                    borderRadius: '8px',
                    backgroundColor: tireCondition === option ? '#eef2ff' : '#ffffff',
                    color: tireCondition === option ? '#1d4ed8' : '#374151',
                    fontWeight: '500',
                    cursor: 'pointer'
                  }}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Media sektion */}
        <div style={{
          backgroundColor: '#ffffff',
          padding: '24px',
          borderRadius: '12px',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          border: showFieldErrors && !hasRequiredMedia() ? '2px solid #dc2626' : '2px solid transparent'
        }}>
          <SectionHeader title="Dokumentation" isComplete={hasRequiredMedia()} />
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
            <button
              onClick={handleAddImage}
              style={{
                padding: '16px',
                border: '2px dashed #d1d5db',
                borderRadius: '8px',
                backgroundColor: '#f9fafb',
                color: '#374151',
                fontSize: '16px',
                fontWeight: '500',
                cursor: 'pointer',
                textAlign: 'center'
              }}
            >
              📷 Lägg till bild
            </button>
            
            <button
              onClick={handleAddVideo}
              style={{
                padding: '16px',
                border: '2px dashed #d1d5db',
                borderRadius: '8px',
                backgroundColor: '#f9fafb',
                color: '#374151',
                fontSize: '16px',
                fontWeight: '500',
                cursor: 'pointer',
                textAlign: 'center'
              }}
            >
              🎥 Lägg till video
            </button>
          </div>

          {/* Bilder */}
          {images.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <h4 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>
                Bilder ({images.length})
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '8px' }}>
                {images.map((image, index) => (
                  <div key={index} style={{ position: 'relative' }}>
                    <div style={{
                      width: '120px',
                      height: '80px',
                      backgroundColor: '#f3f4f6',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px',
                      color: '#6b7280',
                      textAlign: 'center',
                      padding: '4px'
                    }}>
                      📷 {image.name?.substring(0, 15) || 'Bild'}...
                    </div>
                    <button
                      onClick={() => removeImage(index)}
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
                        fontSize: '12px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Videos */}
          {videos.length > 0 && (
            <div>
              <h4 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>
                Videos ({videos.length})
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '8px' }}>
                {videos.map((video, index) => (
                  <div key={index} style={{ position: 'relative' }}>
                    <div style={{
                      width: '120px',
                      height: '80px',
                      backgroundColor: '#f3f4f6',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px',
                      color: '#6b7280',
                      textAlign: 'center',
                      padding: '4px'
                    }}>
                      🎥 {video.name?.substring(0, 15) || 'Video'}...
                    </div>
                    <button
                      onClick={() => removeVideo(index)}
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
                        fontSize: '12px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Övriga anteckningar */}
        <div style={{
          backgroundColor: '#ffffff',
          padding: '24px',
          borderRadius: '12px',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
        }}>
          <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '16px', color: '#1f2937' }}>
            Övriga anteckningar
          </h2>
          
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '16px' }}>
              Skadeanmärkningar (fritext)
            </label>
            <textarea
              value={damageNotes}
              onChange={(e) => setDamageNotes(e.target.value)}
              placeholder="Beskriv eventuella ytterligare skador eller anmärkningar..."
              rows={4}
              style={{
                width: '100%',
                padding: '12px',
                border: '2px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '16px',
                resize: 'vertical',
                minHeight: '100px'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '16px' }}>
              Övriga kommentarer
            </label>
            <textarea
              value={additionalNotes}
              onChange={(e) => setAdditionalNotes(e.target.value)}
              placeholder="Ytterligare information..."
              rows={3}
              style={{
                width: '100%',
                padding: '12px',
                border: '2px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '16px',
                resize: 'vertical',
                minHeight: '80px'
              }}
            />
          </div>
        </div>

        {/* Kontaktinformation */}
        <div style={{
          backgroundColor: '#ffffff',
          padding: '24px',
          borderRadius: '12px',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          border: showFieldErrors && !isContactComplete() ? '2px solid #dc2626' : '2px solid transparent'
        }}>
          <SectionHeader title="Returinformation" isComplete={isContactComplete()} />
          
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '16px' }}>
              Bil returnerad av *
            </label>
            <input
              type="text"
              value={returnedBy}
              onChange={(e) => setReturnedBy(e.target.value)}
              placeholder="Namn på person som lämnar tillbaka bilen"
              style={{
                width: '100%',
                padding: '12px',
                border: showFieldErrors && returnedBy.trim() === '' ? '2px solid #dc2626' : '2px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '16px',
                backgroundColor: showFieldErrors && returnedBy.trim() === '' ? '#fef2f2' : '#ffffff'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '16px' }}>
              Kontaktuppgifter (valfritt)
            </label>
            <input
              type="text"
              value={contactInfo}
              onChange={(e) => setContactInfo(e.target.value)}
              placeholder="Telefonnummer eller e-post"
              style={{
                width: '100%',
                padding: '12px',
                border: '2px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '16px'
              }}
            />
          </div>
        </div>

        {/* Felmeddelande */}
        {showFieldErrors && !canSave() && (
          <div style={{
            marginBottom: '20px',
            padding: '16px',
            backgroundColor: '#fef2f2',
            borderRadius: '8px',
            border: '1px solid #fecaca'
          }}>
            <p style={{ color: '#991b1b', fontSize: '16px', margin: 0, fontWeight: '600' }}>
              ⚠️ Vänligen fyll i alla obligatoriska fält som är markerade med *
            </p>
            <ul style={{ color: '#991b1b', fontSize: '14px', marginTop: '8px', marginBottom: 0 }}>
              {!isRegComplete() && <li>Registreringsnummer måste vara giltigt</li>}
              {!isLocationComplete() && <li>Plats för incheckning måste väljas</li>}
              {!isConditionComplete() && <li>Alla fordonsstatus-fält måste fyllas i</li>}
              {!isFuelInfoComplete() && <li>Bränsleinformation måste kompletteras</li>}
              {!hasRequiredMedia() && <li>Både bild och video krävs</li>}
              {!isContactComplete() && <li>Returinformation måste fyllas i</li>}
            </ul>
          </div>
        )}

        {/* Spara-knapp */}
        <div style={{ marginBottom: '32px' }}>
          <button
            onClick={handleSave}
            style={{
              width: '100%',
              backgroundColor: canSave() ? '#10b981' : '#9ca3af',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              padding: '16px',
              fontSize: '18px',
              fontWeight: '600',
              cursor: canSave() ? 'pointer' : 'not-allowed',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}
            disabled={!canSave()}
          >
            {canSave() ? '✅ Spara incheckning' : '⏳ Fyll i alla obligatoriska fält'}
          </button>
        </div>

        {/* Bekräftelsedialog för åtgärdat */}
        {showConfirmDialog && (
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
              padding: '24px',
              margin: '20px',
              maxWidth: '400px',
              width: '100%'
            }}>
              <h3 style={{ marginBottom: '16px', fontSize: '18px', fontWeight: '600' }}>
                Bekräfta åtgärd
              </h3>
              <p style={{ marginBottom: '20px', color: '#6b7280' }}>
                Är du säker på att denna skada har åtgärdats?
              </p>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={cancelFixDamage}
                  style={{
                    flex: 1,
                    backgroundColor: '#f3f4f6',
                    color: '#374151',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    padding: '10px',
                    cursor: 'pointer'
                  }}
                >
                  Avbryt
                </button>
                <button
                  onClick={confirmFixDamage}
                  style={{
                    flex: 1,
                    backgroundColor: '#10b981',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '10px',
                    cursor: 'pointer'
                  }}
                >
                  Bekräfta
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Final bekräftelsedialog */}
        {showFinalConfirmation && (
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
            zIndex: 1000,
            padding: '20px'
          }}>
            <div style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              padding: '32px',
              maxWidth: '600px',
              width: '100%',
              maxHeight: '80vh',
              overflowY: 'auto',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
            }}>
              <h2 style={{
                fontSize: '24px',
                fontWeight: '600',
                marginBottom: '20px',
                color: '#1f2937',
                textAlign: 'center'
              }}>
                Bekräfta incheckning
              </h2>
              
              <div style={{
                backgroundColor: '#f8fafc',
                padding: '20px',
                borderRadius: '8px',
                marginBottom: '24px',
                fontSize: '14px',
                lineHeight: '1.6'
              }}>
                <p style={{ marginBottom: '16px', fontSize: '16px', fontWeight: '600' }}>
                  <strong>Bob</strong> checkar in: <strong>{regInput}</strong>
                </p>
                
                <div style={{ marginBottom: '12px' }}>
                  <strong>📍 Plats:</strong> {usingAnnanPlats ? annanPlats : `${ort} - ${station}`}
                </div>
                
                <div style={{ marginBottom: '12px' }}>
                  <strong>🚗 Allmänt skick:</strong> {vehicleCondition}
                </div>
                
                <div style={{ marginBottom: '12px' }}>
                  <strong>⛽ Bränslestatus:</strong> {fuelLevel === 'full' ? 'Fulltankad' : `Ej fulltankad (${fuelAdded} liter ${fuelType} påfyllda)`}
                </div>
                
                <div style={{ marginBottom: '12px' }}>
                  <strong>🔧 Motorcheck:</strong> {engineCheck}
                </div>
                
                <div style={{ marginBottom: '12px' }}>
                  <strong>🎥 Media:</strong> {images.length} bilder, {videos.length} videos
                </div>
                
                <div style={{ marginBottom: '12px' }}>
                  <strong>👤 Returnerad av:</strong> {returnedBy}
                </div>
                
                {usingMabiData && fixedDamages.size > 0 && (
                  <div style={{ marginBottom: '12px' }}>
                    <strong>✅ Åtgärdade skador:</strong> {fixedDamages.size} st
                  </div>
                )}
              </div>
              
              <div style={{ display: 'flex', gap: '16px' }}>
                <button
                  onClick={() => setShowFinalConfirmation(false)}
                  style={{
                    flex: 1,
                    backgroundColor: '#f3f4f6',
                    color: '#374151',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    padding: '12px 16px',
                    fontSize: '16px',
                    fontWeight: '500',
                    cursor: 'pointer'
                  }}
                >
                  Tillbaka och redigera
                </button>
                <button
                  onClick={confirmSave}
                  style={{
                    flex: 1,
                    backgroundColor: '#10b981',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '12px 16px',
                    fontSize: '16px',
                    fontWeight: '500',
                    cursor: 'pointer'
                  }}
                >
                  Spara incheckning
                </button>
              </div>
            </div>
          </div>
        )}

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
            zIndex: 1000,
            padding: '20px'
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
              
              <p style={{
                fontSize: '16px',
                color: '#6b7280',
                marginBottom: '24px'
              }}>
                Incheckning sparad för {regInput}
              </p>
              
              <button
                onClick={resetForm}
                style={{
                  backgroundColor: '#033066',
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
                Starta ny incheckning
              </button>
            </div>
          </div>
        )}

        <p style={{ 
          textAlign: 'center', 
          color: '#666', 
          fontSize: '12px', 
          margin: '32px 0'
        }}>
          © Albarone AB 2025
        </p>
      </div>
    </div>
  );
}

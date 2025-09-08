'use client';
// Updated 2025-01-09 - Fixed JSX syntax errors

import React, { useEffect, useMemo, useState } from 'react';
// ... resten av koden
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
}'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Smart kolumnmappning för olika datakällor
const getColumnValue = (row: any, preferredName: string, fallbacks: string[] = []) => {
  if (row[preferredName]) return row[preferredName];
  for (const fallback of fallbacks) {
    if (row[fallback]) return row[fallback];
  }
  return null;
};

type CarData = {
  regnr: string;
  brand_model: string | null;
  damage_text: string | null;
  damage_location: string | null;
  damage_notes: string | null;
  wheelstorage: string | null;
  saludatum: string | null;
};

type ExistingDamage = {
  id: string;
  skadetyp: string;
  plats: string;
  notering: string;
  fullText: string;
  shortText: string;
  status: 'not_selected' | 'documented' | 'fixed';
  userType?: string;
  userCarPart?: string;
  userPosition?: string;
  userDescription?: string;
  media?: MediaFile[];
};

type MediaFile = {
  file: File;
  type: 'image' | 'video';
  preview?: string;
  thumbnail?: string;
};

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

const DAMAGE_TYPES = [
  'Buckla', 'Däckskada sommarhjul', 'Däckskada vinterhjul', 'Fälgskada sommarhjul',
  'Fälgskada vinterhjul', 'Feltankning', 'Höjdledsskada', 'Intryck', 'Invändig skada',
  'Jack', 'Krockskada', 'Krossad ruta', 'Oaktsamhet', 'Punktering', 'Repa', 'Repor',
  'Saknas', 'Skrapad', 'Spricka', 'Stenskott', 'Trasig', 'Övrigt'
].sort();

const CAR_PARTS: Record<string, string[]> = {
  'Annan del': [],
  'Bagagelucka': ['Insida', 'Utsida'],
  'Däck': ['Höger bak', 'Höger fram', 'Vänster bak', 'Vänster fram'],
  'Dörr insida': ['Höger bak', 'Höger fram', 'Vänster bak', 'Vänster fram'],
  'Dörr utsida': ['Höger bak', 'Höger fram', 'Vänster bak', 'Vänster fram'],
  'Front läpp': ['Höger', 'Mitten', 'Vänster'],
  'Fälg': ['Höger bak', 'Höger fram', 'Vänster bak', 'Vänster fram'],
  'Glas': ['Bak', 'Fram', 'Höger bak', 'Höger fram', 'Vänster bak', 'Vänster fram'],
  'Grill': [],
  'Motorhuv': ['Utsida'],
  'Skärm': ['Höger bak', 'Höger fram', 'Vänster bak', 'Vänster fram'],
  'Stötfångare fram': ['Bak', 'Fram', 'Höger bak', 'Höger fram', 'Vänster bak', 'Vänster fram'],
  'Tak': [],
  'Tröskel': ['Höger', 'Vänster'],
  'Yttre backspegel': ['Höger', 'Vänster']
};

const getRelevantCarParts = (damageType: string): string[] => {
  const lowerType = damageType.toLowerCase();
  if (lowerType.includes('däckskada')) return ['Däck'];
  if (lowerType.includes('fälgskada')) return ['Fälg'];
  if (lowerType.includes('punktering')) return ['Däck'];
  if (lowerType.includes('ruta') || lowerType.includes('stenskott')) {
    return ['Glas', 'Motorhuv', 'Tak'].sort();
  }
  if (lowerType.includes('krock')) {
    return ['Stötfångare fram', 'Skärm', 'Dörr utsida', 'Bagagelucka', 'Motorhuv'].sort();
  }
  if (lowerType.includes('höjdled')) {
    return ['Tak', 'Motorhuv', 'Bagagelucka'].sort();
  }
  return Object.keys(CAR_PARTS).sort();
};

const CAR_PART_OPTIONS = Object.keys(CAR_PARTS).sort();

const createCombinedDamageText = (skadetyp: string, plats: string, notering: string): string => {
  const parts: string[] = [];
  if (skadetyp?.trim()) parts.push(skadetyp.trim());
  if (plats?.trim() && plats.trim() !== skadetyp?.trim()) parts.push(plats.trim());
  if (notering?.trim() && notering.trim() !== skadetyp?.trim() && notering.trim() !== plats?.trim()) {
    parts.push(notering.trim());
  }
  return parts.length > 0 ? parts.join(' - ') : 'Okänd skada';
};

function normalizeReg(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

const isDateWithinDays = (dateStr: string | null, days: number): boolean => {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  const today = new Date();
  const diffTime = date.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays <= days && diffDays >= 0;
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
    const ctx = canvas.getContext('2d')!;
    
    video.addEventListener('loadedmetadata', () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      video.currentTime = 0.5;
    });
    
    video.addEventListener('seeked', () => {
      ctx.drawImage(video, 0, 0);
      const thumbnail = canvas.toDataURL('image/jpeg', 0.8);
      resolve(thumbnail);
    });
    
    video.addEventListener('error', () => {
      resolve('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyMCIgdmlld0JveD0iMCAwIDEyMCAxMjAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjEyMCIgaGVpZ2h0PSIxMjAiIGZpbGw9IiM2YjcyODAiLz48cGF0aCBkPSJNNDUgNDBWODBMNzUgNjBMNDUgNDBaIiBmaWxsPSJ3aGl0ZSIvPjwvc3ZnPg==');
    });
    
    video.src = URL.createObjectURL(file);
  });
};

const processFiles = async (files: File[]): Promise<MediaFile[]> => {
  const mediaFiles: MediaFile[] = [];
  
  for (const file of files) {
    const type = getFileType(file);
    const mediaFile: MediaFile = { file, type };
    
    if (type === 'image') {
      mediaFile.preview = URL.createObjectURL(file);
    } else if (type === 'video') {
      try {
        mediaFile.thumbnail = await createVideoThumbnail(file);
      } catch (error) {
        console.warn('Could not create video thumbnail:', error);
      }
    }
    
    mediaFiles.push(mediaFile);
  }
  
  return mediaFiles;
};

export default function CheckInForm() {
  const [regInput, setRegInput] = useState('');
  const [carData, setCarData] = useState<CarData[]>([]);
  const [allRegistrations, setAllRegistrations] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [damageToFix, setDamageToFix] = useState<string | null>(null);
  const [showFinalConfirmation, setShowFinalConfirmation] = useState(false);
  const [showFieldErrors, setShowFieldErrors] = useState(false);

  const [ort, setOrt] = useState('');
  const [station, setStation] = useState('');
  const [annanPlats, setAnnanPlats] = useState(false);
  const [annanPlatsText, setAnnanPlatsText] = useState('');
  const [matarstallning, setMatarstallning] = useState('');
  const [drivmedelstyp, setDrivmedelstyp] = useState<'bensin_diesel' | 'elbil' | null>(null);
  const [tankniva, setTankniva] = useState<'fulltankad' | 'tankas_senare' | 'pafylld_nu' | null>(null);
  const [liters, setLiters] = useState('');
  const [bransletyp, setBransletyp] = useState<'Bensin' | 'Diesel' | null>(null);
  const [laddniva, setLaddniva] = useState('');
  const [spolarvatska, setSpolarvatska] = useState<boolean | null>(null);
  const [insynsskydd, setInsynsskydd] = useState<boolean | null>(null);
  const [antalLaddkablar, setAntalLaddkablar] = useState<'0' | '1' | '2' | null>(null);
  const [hjultyp, setHjultyp] = useState<'Sommarthjul' | 'Vinterthjul' | null>(null);
  const [adblue, setAdblue] = useState<boolean | null>(null);
  const [tvatt, setTvatt] = useState<'behover_tvattas' | 'behover_grovtvattas' | 'behover_inte_tvattas' | null>(null);
  const [inre, setInre] = useState<'behover_rengoras_inuti' | 'ren_inuti' | null>(null);
  const [existingDamages, setExistingDamages] = useState<ExistingDamage[]>([]);
  const [skadekontroll, setSkadekontroll] = useState<'ej_skadekontrollerad' | 'nya_skador' | 'inga_nya_skador' | null>(null);
  const [newDamages, setNewDamages] = useState<{
    id: string; 
    type: string; 
    carPart: string;
    position: string;
    text: string;
    media: MediaFile[]
  }[]>([]);
  const [uthyrningsstatus, setUthyrningsstatus] = useState<'redo_for_uthyrning' | 'ledig_tankad' | 'ledig_otankad' | 'klar_otankad' | null>(null);
  const [preliminarAvslutNotering, setPreliminarAvslutNotering] = useState('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const normalizedReg = useMemo(() => normalizeReg(regInput), [regInput]);

  useEffect(() => {
    async function fetchAllRegistrations() {
      try {
        const { data, error } = await supabase
          .from('car_data')
          .select('regnr')
          .order('regnr');

        if (!error && data) {
          const uniqueRegs = [...new Set(data.map(item => item.regnr))].filter(Boolean);
          setAllRegistrations(uniqueRegs);
        }
      } catch (err) {
        console.warn('Could not fetch registrations for autocomplete:', err);
      }
    }
    
    fetchAllRegistrations();
  }, []);

  const suggestions = useMemo(() => {
    if (!regInput.trim()) return [];
    const input = regInput.toUpperCase();
    return allRegistrations
      .filter(reg => reg.toUpperCase().startsWith(input))
      .slice(0, 5);
  }, [regInput, allRegistrations]);

  // SMART DATAHÄMTNING med fixad skadehantering
  useEffect(() => {
    if (!normalizedReg || normalizedReg.length < 3) {
      setCarData([]);
      setExistingDamages([]);
      setNotFound(false);
      return;
    }

    let cancelled = false;
    
    async function fetchCarData() {
      setLoading(true);
      setNotFound(false);

      try {
        // Försök nya MABI-tabellen först
        const { data: newData, error: newError } = await supabase
          .from('mabi_damage_data')
          .select('*')
          .eq('Regnr', normalizedReg)
          .order('created_at', { ascending: false });

        let useData = [];
        let damages: ExistingDamage[] = [];

        if (!newError && newData && newData.length > 0) {
          // Använd nya rika data från MABI
          useData = newData.map(row => ({
            regnr: getColumnValue(row, 'Regnr', ['regnr']),
            brand_model: getColumnValue(row, 'Modell', ['modell', 'brand_model']),
            damage_text: getColumnValue(row, 'Skadetyp', ['skadetyp']),
            damage_location: getColumnValue(row, 'Skadeanmälan', ['skadeanmalan']),
            damage_notes: getColumnValue(row, 'Intern notering', ['intern_notering']),
            wheelstorage: null,
            saludatum: null
          }));

          // FIXAD SKADEHANTERING - alla skador, inte bara första
          damages = newData
            .filter(row => {
              const skadetyp = getColumnValue(row, 'Skadetyp', ['skadetyp']) || '';
              const plats = getColumnValue(row, 'Skadeanmälan', ['skadeanmalan']) || '';
              const notering = getColumnValue(row, 'Intern notering', ['intern_notering']) || '';
              return skadetyp || plats || notering;
            })
            .map((row, index) => {
              const skadetyp = getColumnValue(row, 'Skadetyp', ['skadetyp']) || '';
              const plats = getColumnValue(row, 'Skadeanmälan', ['skadeanmalan']) || '';
              const notering = getColumnValue(row, 'Intern notering', ['intern_notering']) || '';
              
              const fullText = createCombinedDamageText(skadetyp, plats, notering);
              
              return {
                id: `mabi-${index}`,
                skadetyp,
                plats, 
                notering,
                fullText,
                shortText: skadetyp || plats || 'Okänd skada',
                status: 'not_selected' as const,
                userType: '',
                userCarPart: '',
                userPosition: '',
                userDescription: '',
                media: []
              };
            });
        } else {
          // Fallback till gamla car_data
          const { data: oldData, error: oldError } = await supabase
            .from('car_data')
            .select('*')
            .eq('regnr', normalizedReg)
            .order('created_at', { ascending: false });

          if (!oldError && oldData && oldData.length > 0) {
            useData = oldData;
            damages = oldData
              .map((row, index) => {
                const damageText = row.damage_text || '';
                if (!damageText.trim()) return null;
                
                return {
                  id: `legacy-${index}`,
                  skadetyp: damageText,
                  plats: '',
                  notering: '',
                  fullText: damageText,
                  shortText: damageText,
                  status: 'not_selected' as const,
                  userType: '',
                  userCarPart: '',
                  userPosition: '',
                  userDescription: '',
                  media: []
                };
              })
              .filter((damage): damage is ExistingDamage => damage !== null);
          }
        }

        if (cancelled) return;

        if (useData.length > 0) {
          setCarData(useData);
          setExistingDamages(damages);
          setNotFound(false);
        } else {
          setCarData([]);
          setExistingDamages([]);
          setNotFound(true);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Fetch error:', err);
          setNotFound(true);
          setCarData([]);
          setExistingDamages([]);
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

  const carModel = carData[0]?.brand_model || null;
  const wheelStorage = carData[0]?.wheelstorage || null;
  const saludatum = carData[0]?.saludatum || null;

  const availableStations = ort ? STATIONER[ort] || [] : [];const isRegComplete = () => regInput.trim().length > 0;
  
  const isLocationComplete = () => {
    return annanPlats ? annanPlatsText.trim().length > 0 : (ort && station);
  };
  
  const isVehicleStatusComplete = () => {
    if (!matarstallning.trim() || !drivmedelstyp) return false;
    
    if (drivmedelstyp === 'bensin_diesel') {
      if (!tankniva || adblue === null) return false;
      if (tankniva === 'pafylld_nu' && (!liters.trim() || !bransletyp)) return false;
    }
    
    if (drivmedelstyp === 'elbil') {
      if (!laddniva.trim() || antalLaddkablar === null) return false;
      const laddnivaParsed = parseInt(laddniva);
      if (isNaN(laddnivaParsed) || laddnivaParsed < 0 || laddnivaParsed > 100) return false;
    }
    
    return spolarvatska !== null && insynsskydd !== null && hjultyp !== null;
  };
  
  const isCleaningComplete = () => tvatt !== null && inre !== null;
  
  const isDamagesComplete = () => {
    if (!skadekontroll) return false;
    
    if (skadekontroll === 'nya_skador') {
      if (newDamages.length === 0) return false;
      if (newDamages.some(damage => !damage.media.some(m => m.type === 'image') || !damage.media.some(m => m.type === 'video'))) return false;
      if (newDamages.some(damage => !damage.type || !damage.carPart || !damage.text.trim())) return false;
      if (newDamages.some(damage => damage.carPart && CAR_PARTS[damage.carPart].length > 0 && !damage.position)) return false;
    }
    
    const documentedOldDamages = existingDamages.filter(d => d.status === 'documented');
    if (documentedOldDamages.some(damage => !damage.userDescription?.trim())) return false;
    if (documentedOldDamages.some(damage => !damage.userType || !damage.userCarPart)) return false;
    if (documentedOldDamages.some(damage => damage.userCarPart && CAR_PARTS[damage.userCarPart].length > 0 && !damage.userPosition)) return false;
    if (documentedOldDamages.some(damage => !damage.media?.some(m => m.type === 'image') || !damage.media?.some(m => m.type === 'video'))) return false;
    
    return true;
  };
  
  const isStatusComplete = () => uthyrningsstatus !== null && preliminarAvslutNotering.trim().length > 0;

  const canSave = () => {
    return isRegComplete() && 
           isLocationComplete() && 
           isVehicleStatusComplete() && 
           isCleaningComplete() && 
           isDamagesComplete() && 
           isStatusComplete();
  };

  const resetForm = () => {
    setRegInput('');
    setCarData([]);
    setExistingDamages([]);
    setShowSuggestions(false);
    setShowConfirmDialog(false);
    setDamageToFix(null);
    setShowFinalConfirmation(false);
    setShowFieldErrors(false);
    setNotFound(false);
    setOrt('');
    setStation('');
    setAnnanPlats(false);
    setAnnanPlatsText('');
    setMatarstallning('');
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
    setTvatt(null);
    setInre(null);
    setSkadekontroll(null);
    setNewDamages([]);
    setUthyrningsstatus(null);
    setPreliminarAvslutNotering('');
    setShowSuccessModal(false);
  };

  const handleSave = () => {
    if (canSave()) {
      setShowFinalConfirmation(true);
    } else {
      setShowFieldErrors(true);
      setTimeout(() => {
        const firstIncomplete = document.querySelector('.section-incomplete');
        if (firstIncomplete) {
          firstIncomplete.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    }
  };

  const confirmFinalSave = () => {
    console.log('Sparar incheckning...');
    console.log('Dokumenterade gamla skador:', existingDamages.filter(d => d.status === 'documented'));
    console.log('Åtgärdade gamla skador:', existingDamages.filter(d => d.status === 'fixed'));
    console.log('Nya skador:', newDamages);
    setShowFinalConfirmation(false);
    setShowSuccessModal(true);
  };

  const toggleExistingDamageStatus = (id: string, newStatus: 'documented' | 'fixed') => {
    if (newStatus === 'fixed') {
      setDamageToFix(id);
      setShowConfirmDialog(true);
    } else {
      setExistingDamages(prev => prev.map(d => 
        d.id === id ? { 
          ...d, 
          status: d.status === 'documented' ? 'not_selected' : 'documented',
          userDescription: d.status === 'documented' ? '' : d.userDescription,
          userType: d.status === 'documented' ? '' : d.userType,
          userCarPart: d.status === 'documented' ? '' : d.userCarPart,
          userPosition: d.status === 'documented' ? '' : d.userPosition,
          media: d.status === 'documented' ? [] : d.media 
        } : d
      ));
    }
  };

  const confirmFixDamage = () => {
    if (damageToFix) {
      setExistingDamages(prev => prev.map(d => 
        d.id === damageToFix ? { 
          ...d, 
          status: 'fixed',
          userDescription: '',
          userType: '',
          userCarPart: '',
          userPosition: '',
          media: []
        } : d
      ));
    }
    setShowConfirmDialog(false);
    setDamageToFix(null);
  };

  const cancelFixDamage = () => {
    setShowConfirmDialog(false);
    setDamageToFix(null);
  };

  const updateExistingDamageType = (id: string, type: string) => {
    setExistingDamages(prev => prev.map(d => 
      d.id === id ? { ...d, userType: type, userCarPart: '', userPosition: '' } : d
    ));
  };

  const updateExistingDamageCarPart = (id: string, carPart: string) => {
    setExistingDamages(prev => prev.map(d => 
      d.id === id ? { ...d, userCarPart: carPart, userPosition: '' } : d
    ));
  };

  const updateExistingDamagePosition = (id: string, position: string) => {
    setExistingDamages(prev => prev.map(d => 
      d.id === id ? { ...d, userPosition: position } : d
    ));
  };

  const updateExistingDamageDescription = (id: string, description: string) => {
    setExistingDamages(prev => prev.map(d => 
      d.id === id ? { ...d, userDescription: description } : d
    ));
  };

  const updateExistingDamageMedia = async (id: string, files: FileList | null) => {
    if (!files) return;
    
    const newMediaFiles = await processFiles(Array.from(files));
    setExistingDamages(prev => prev.map(d => 
      d.id === id ? { ...d, media: [...(d.media || []), ...newMediaFiles] } : d
    ));
  };

  const removeExistingDamageMedia = (damageId: string, mediaIndex: number) => {
    setExistingDamages(prev => prev.map(d => {
      if (d.id === damageId && d.media) {
        const newMedia = d.media.filter((_, index) => index !== mediaIndex);
        return { ...d, media: newMedia };
      }
      return d;
    }));
  };

  const addDamage = () => {
    setNewDamages(prev => [...prev, {
      id: Math.random().toString(36).slice(2),
      type: '',
      carPart: '',
      position: '',
      text: '',
      media: []
    }]);
  };

  const removeDamage = (id: string) => {
    setNewDamages(prev => prev.filter(d => d.id !== id));
  };

  const updateDamageType = (id: string, type: string) => {
    setNewDamages(prev => prev.map(d => d.id === id ? {...d, type, carPart: '', position: ''} : d));
  };

  const updateDamageCarPart = (id: string, carPart: string) => {
    setNewDamages(prev => prev.map(d => d.id === id ? {...d, carPart, position: ''} : d));
  };

  const updateDamagePosition = (id: string, position: string) => {
    setNewDamages(prev => prev.map(d => d.id === id ? {...d, position} : d));
  };

  const updateDamageText = (id: string, text: string) => {
    setNewDamages(prev => prev.map(d => d.id === id ? {...d, text} : d));
  };

  const updateDamageMedia = async (id: string, files: FileList | null) => {
    if (!files) return;
    
    const newMediaFiles = await processFiles(Array.from(files));
    setNewDamages(prev => prev.map(d => 
      d.id === id ? {...d, media: [...d.media, ...newMediaFiles]} : d
    ));
  };

  const removeDamageMedia = (damageId: string, mediaIndex: number) => {
    setNewDamages(prev => prev.map(d => {
      if (d.id === damageId) {
        const newMedia = d.media.filter((_, index) => index !== mediaIndex);
        return { ...d, media: newMedia };
      }
      return d;
    }));
  };

  const handleRegInputChange = (value: string) => {
    setRegInput(value.toUpperCase());
    setShowSuggestions(value.length > 0 && suggestions.length > 0);
  };

  const selectSuggestion = (suggestion: string) => {
    setRegInput(suggestion);
    setShowSuggestions(false);
  };

  const SectionHeader = ({ title, isComplete }: { title: string; isComplete?: boolean }) => (
    <div style={{
      marginTop: '40px',
      marginBottom: '20px',
      paddingBottom: '12px',
      borderBottom: '2px solid #e5e7eb',
      display: 'flex',
      alignItems: 'center',
      gap: '12px'
    }}>
      <h2 style={{ 
        fontSize: '22px', 
        fontWeight: '700', 
        margin: 0,
        color: '#1f2937',
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        flex: 1
      }}>
        {title}
      </h2>
      {isComplete !== undefined && (
        <div style={{
          width: '24px',
          height: '24px',
          borderRadius: '50%',
          backgroundColor: isComplete ? '#10b981' : '#dc2626',
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '14px',
          fontWeight: 'bold'
        }}>
          {isComplete ? '✓' : '!'}
        </div>
      )}
    </div>
  );

  const SubSectionHeader = ({ title }: { title: string }) => (
    <div style={{
      marginTop: '24px',
      marginBottom: '16px',
      paddingBottom: '8px',
      borderBottom: '1px solid #d1d5db'
    }}>
      <h3 style={{ 
        fontSize: '18px', 
        fontWeight: '600', 
        margin: 0,
        color: '#374151'
      }}>
        {title}
      </h3>
    </div>
  );

  const MediaUpload = ({ 
    damageId, 
    isOld, 
    onMediaUpdate,
    hasImage = false,
    hasVideo = false
  }: { 
    damageId: string; 
    isOld: boolean; 
    onMediaUpdate: (id: string, files: FileList | null) => void;
    hasImage?: boolean;
    hasVideo?: boolean;
  }) => (
    <div style={{ marginBottom: '12px' }}>
      <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
        Lägg till bild och video <span style={{ color: '#dc2626' }}>*</span>
      </label>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ position: 'relative', display: 'inline-block', width: '100%' }}>
          <input
            type="file"
            accept="image/*"
            multiple
            capture="environment"
            onChange={(e) => onMediaUpdate(damageId, e.target.files)}
            style={{ display: 'none' }}
            id={`${isOld ? 'old' : 'new'}-photo-input-${damageId}`}
          />
          <label
            htmlFor={`${isOld ? 'old' : 'new'}-photo-input-${damageId}`}
            style={{
              display: 'block',
              width: '100%',
              padding: '12px',
              border: hasImage ? '2px dashed #10b981' : '2px solid #dc2626',
              borderRadius: '6px',
              fontSize: '16px',
              backgroundColor: hasImage ? '#f0fdf4' : '#fee2e2',
              textAlign: 'center',
              cursor: 'pointer',
              color: hasImage ? '#047857' : '#dc2626',
              fontWeight: hasImage ? 'normal' : 'bold'
            }}
          >
            📷 {hasImage ? 'Lägg till fler bilder' : 'Ta foto *'}
          </label>
        </div>

        <div style={{ position: 'relative', display: 'inline-block', width: '100%' }}>
          <input
            type="file"
            accept="video/*"
            capture="environment"
            onChange={(e) => onMediaUpdate(damageId, e.target.files)}
            style={{ display: 'none' }}
            id={`${isOld ? 'old' : 'new'}-video-input-${damageId}`}
          />
          <label
            htmlFor={`${isOld ? 'old' : 'new'}-video-input-${damageId}`}
            style={{
              display: 'block',
              width: '100%',
              padding: '12px',
              border: hasVideo ? '2px dashed #dc2626' : '2px solid #dc2626',
              borderRadius: '6px',
              fontSize: '16px',
              backgroundColor: hasVideo ? '#fef2f2' : '#fee2e2',
              textAlign: 'center',
              cursor: 'pointer',
              color: '#dc2626',
              fontWeight: hasVideo ? 'normal' : 'bold'
            }}
          >
            🎥 {hasVideo ? 'Lägg till mer video' : 'Spela in video med skada OCH reg.nr. *'}
          </label>
        </div>

        <div style={{ position: 'relative', display: 'inline-block', width: '100%' }}>
          <input
            type="file"
            accept="image/*,video/*"
            multiple
            onChange={(e) => onMediaUpdate(damageId, e.target.files)}
            style={{ display: 'none' }}
            id={`${isOld ? 'old' : 'new'}-gallery-input-${damageId}`}
          />
          <label
            htmlFor={`${isOld ? 'old' : 'new'}-gallery-input-${damageId}`}
            style={{
              display: 'block',
              width: '100%',
              padding: '12px',
              border: '2px dashed #3b82f6',
              borderRadius: '6px',
              fontSize: '16px',
              backgroundColor: '#eff6ff',
              textAlign: 'center',
              cursor: 'pointer',
              color: '#2563eb'
            }}
          >
            📁 Välj från galleri
          </label>
        </div>
      </div>
      
      {(!hasImage || !hasVideo) && (
        <p style={{ color: '#dc2626', fontSize: '12px', marginTop: '4px' }}>
          Både bild och video är obligatoriska för alla skador
        </p>
      )}
    </div>
  );

  return (
    <div style={{ 
      minHeight: '100vh',
      backgroundColor: '#f8fafc',
      color: '#111827'
    }}>
      <div style={{
        backgroundColor: '#033066',
        width: '100vw',
        marginLeft: 'calc(-50vw + 50%)',
        padding: '20px 0',
        marginBottom: '32px'
      }}>
        <div style={{
          maxWidth: '600px',
          margin: '0 auto',
          padding: '0 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end'
        }}>
          <div>
            <h1 style={{ 
              fontSize: '28px', 
              margin: 0, 
              color: '#ffffff',
              fontWeight: '800',
              textTransform: 'uppercase',
              letterSpacing: '1px'
            }}>
              NY INCHECKNING
            </h1>
            <p style={{ 
              color: '#ffffff', 
              margin: '6px 0 0 0',
              fontSize: '16px',
              fontWeight: '400',
              opacity: 0.9
            }}>
              Inloggad: <strong>Bob</strong>
            </p>
          </div>
          
          <div style={{
            width: '120px',
            height: '60px',
            backgroundColor: '#ffffff',
            borderRadius: '6px',
            padding: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '2px solid rgba(255, 255, 255, 0.3)'
          }}>
            <img 
              src={`/mabi-logo.png?v=${Date.now()}`}
              alt="MABI" 
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: 'contain'
              }}
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                e.currentTarget.nextElementSibling!.style.display = 'flex';
              }}
            />
            <div style={{
              width: '100%',
              height: '100%',
              display: 'none',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#033066',
              fontSize: '16px',
              fontWeight: 'bold'
            }}>
              MABI
            </div>
          </div>
        </div>
      </div>

      <div style={{
        maxWidth: '600px',
        margin: '0 auto',
        padding: '0 20px',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}><strong>📍 Plats:</strong> {annanPlats ? annanPlatsText : `${ort}, ${station}`}
                </div>
                
                <div style={{ marginBottom: '12px' }}>
                  <strong>🕐 Datum/Tid:</strong> {new Date().toLocaleString('sv-SE')}
                </div>
                
                <div style={{ marginBottom: '12px' }}>
                  <strong>⚠️ Gamla skador:</strong> {existingDamages.filter(d => d.status === 'documented').length} dokumenterade, {existingDamages.filter(d => d.status === 'fixed').length} åtgärdade
                  {existingDamages.filter(d => d.status !== 'not_selected').length > 0 && (
                    <div style={{ marginLeft: '16px', fontSize: '12px', marginTop: '4px' }}>
                      {existingDamages.filter(d => d.status !== 'not_selected').map((damage, i) => (
                        <div key={i} style={{ color: damage.status === 'fixed' ? '#10b981' : '#2563eb' }}>
                          • {damage.fullText} ({damage.status === 'fixed' ? 'åtgärdat' : 'dokumenterat'})
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                
                <div style={{ marginBottom: '12px' }}>
                  <strong>🆕 Nya skador:</strong> {skadekontroll === 'nya_skador' ? `${newDamages.length} rapporterade` : 
                    skadekontroll?.replace(/_/g, ' ')
                      .replace('ej skadekontrollerad', 'ej skadekontrollerad')
                      .replace('inga nya skador', 'inga nya skador')
                  }
                  {newDamages.length > 0 && (
                    <div style={{ marginLeft: '16px', fontSize: '12px', marginTop: '4px' }}>
                      {newDamages.map((damage, i) => (
                        <div key={i} style={{ color: '#dc2626' }}>
                          • {damage.type} - {damage.carPart} {damage.position && `- ${damage.position}`}: {damage.text}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                
                <div>
                  <strong>📝 Avslut notering:</strong> {preliminarAvslutNotering}
                </div>
              </div>
              
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={() => setShowFinalConfirmation(false)}
                  style={{
                    flex: 1,
                    backgroundColor: '#f3f4f6',
                    color: '#374151',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    padding: '12px 24px',
                    fontSize: '16px',
                    fontWeight: '500',
                    cursor: 'pointer'
                  }}
                >
                  ← Återgå till formuläret
                </button>
                <button
                  onClick={confirmFinalSave}
                  style={{
                    flex: 1,
                    backgroundColor: '#10b981',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '12px 24px',
                    fontSize: '16px',
                    fontWeight: '500',
                    cursor: 'pointer'
                  }}
                >
                  ✅ Bekräfta & Spara
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
        )}<p style={{ 
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

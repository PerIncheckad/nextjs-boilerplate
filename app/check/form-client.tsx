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

const isDateWithinDays = (dateStr: string | null, days: number): boolean => {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  const today = new Date();
  const diffTime = date.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays <= days && diffDays >= 0;
};

export default function CheckInForm() {
  // State för registreringsnummer och bildata
  const [regInput, setRegInput] = useState<string>('');
  const [carData, setCarData] = useState<CarData | null>(null);
  const [loading, setLoading] = useState(false);
  
  // State för formulärdata
  const [mileage, setMileage] = useState<string>('');
  const [valtOrt, setValtOrt] = useState<string>('');
  const [valtStation, setValtStation] = useState<string>('');
  const [tankFull, setTankFull] = useState<boolean | null>(null);
  const [fuelLiters, setFuelLiters] = useState<string>('');
  const [fuelType, setFuelType] = useState<'Bensin' | 'Diesel' | null>(null);
  const [adblueOk, setAdblueOk] = useState<boolean | null>(null);
  const [washerFluidOk, setWasherFluidOk] = useState<boolean | null>(null);
  const [tintOk, setTintOk] = useState<boolean | null>(null);
  const [chargeCables, setChargeCables] = useState<number>(0);
  const [currentWheels, setCurrentWheels] = useState<'Sommarhjul' | 'Vinterhjul' | null>(null);
  const [newDamages, setNewDamages] = useState<Array<{
    id: string;
    description: string;
    category: string;
    files: File[];
  }>>([]);
  const [uthyrningsstatus, setUthyrningsstatus] = useState<'planerat' | 'pagaende' | 'klar_tankad' | 'klar_otankad' | null>(null);
  const [preliminarAvslutNotering, setPreliminarAvslutNotering] = useState<string>('');
  const [otherNotes, setOtherNotes] = useState<string>('');
  const [showSuccess, setShowSuccess] = useState(false);

  // Hämta bildata från Supabase
  const fetchCarData = async (reg: string) => {
    if (!reg) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('cars')
        .select('regnr, brand_model, damage_text, wheelstorage, saludatum')
        .eq('regnr', normalizeReg(reg))
        .single();

      if (error) {
        console.error('Supabase error:', error);
        setCarData(null);
        return;
      }

      setCarData(data);
    } catch (error) {
      console.error('Fetch error:', error);
      setCarData(null);
    } finally {
      setLoading(false);
    }
  };

  // Hantera registreringsnummer-input
  const handleRegChange = (value: string) => {
    const normalized = value.toUpperCase();
    setRegInput(normalized);
    
    if (normalized.length >= 6) {
      fetchCarData(normalized);
    } else {
      setCarData(null);
    }
  };

  // Tillgängliga stationer baserat på vald ort
  const availableStations = valtOrt ? STATIONER[valtOrt] || [] : [];

  // Hantera nya skador
  const addNewDamage = () => {
    const newDamage = {
      id: Date.now().toString(),
      description: '',
      category: '',
      files: []
    };
    setNewDamages([...newDamages, newDamage]);
  };

  const updateDamageDescription = (id: string, description: string) => {
    setNewDamages(prev => prev.map(damage => 
      damage.id === id ? { ...damage, description } : damage
    ));
  };

  const updateDamageCategory = (id: string, category: string) => {
    setNewDamages(prev => prev.map(damage => 
      damage.id === id ? { ...damage, category } : damage
    ));
  };

  const addDamageFiles = (id: string, files: FileList | null) => {
    if (!files) return;
    
    setNewDamages(prev => prev.map(damage => 
      damage.id === id ? { 
        ...damage, 
        files: [...damage.files, ...Array.from(files)]
      } : damage
    ));
  };

  const removeDamageImage = (damageId: string, imageIndex: number) => {
    setNewDamages(prev => prev.map(damage => 
      damage.id === damageId ? {
        ...damage,
        files: damage.files.filter((_, index) => index !== imageIndex)
      } : damage
    ));
  };

  const removeDamage = (id: string) => {
    setNewDamages(prev => prev.filter(damage => damage.id !== id));
  };

  // Validering
  const canSave = () => {
    return regInput.length >= 6 && 
           mileage && 
           valtOrt && 
           valtStation && 
           tankFull !== null &&
           uthyrningsstatus !== null;
  };

  const handleSave = () => {
    if (!canSave()) return;
    
    // Simulera sparande
    console.log('Sparar incheckning...', {
      regInput,
      mileage,
      valtOrt,
      valtStation,
      tankFull,
      fuelLiters: !tankFull ? fuelLiters : '',
      fuelType: !tankFull ? fuelType : null,
      adblueOk,
      washerFluidOk,
      tintOk,
      chargeCables,
      currentWheels,
      newDamages,
      uthyrningsstatus,
      preliminarAvslutNotering,
      otherNotes
    });
    
    setShowSuccess(true);
  };

  const resetForm = () => {
    setRegInput('');
    setCarData(null);
    setMileage('');
    setValtOrt('');
    setValtStation('');
    setTankFull(null);
    setFuelLiters('');
    setFuelType(null);
    setAdblueOk(null);
    setWasherFluidOk(null);
    setTintOk(null);
    setChargeCables(0);
    setCurrentWheels(null);
    setNewDamages([]);
    setUthyrningsstatus(null);
    setPreliminarAvslutNotering('');
    setOtherNotes('');
    setShowSuccess(false);
  };

  const skadeKategorier = [
    'Lack/Repor',
    'Buckla/Deformation', 
    'Glas/Ruta',
    'Belysning',
    'Däck/Fälg',
    'Interiör',
    'Övrigt'
  ];

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f3f4f6',
      padding: '16px'
    }}>
      {/* Header med MABI-logga */}
      <div style={{
        backgroundColor: '#ffffff',
        padding: '24px',
        borderRadius: '12px',
        marginBottom: '24px',
        textAlign: 'center',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
      }}>
        {/* MABI-logga - ersätt denna div med äkta logga */}
        <div style={{
          width: '120px',
          height: '60px',
          backgroundColor: '#e5e7eb',
          margin: '0 auto 16px',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '14px',
          color: '#6b7280',
          fontWeight: '600'
        }}>
          MABI LOGGA
        </div>
        
        <h1 style={{
          fontSize: '28px',
          fontWeight: '700',
          color: '#1f2937',
          margin: '0 0 8px 0'
        }}>
          BILINCHECKNING
        </h1>
        
        <p style={{
          fontSize: '16px',
          color: '#6b7280',
          margin: 0
        }}>
          MABI Syd / Albarone AB
        </p>
      </div>

      {showSuccess ? (
        /* Success Modal */
        <div style={{
          backgroundColor: '#ffffff',
          padding: '32px',
          borderRadius: '12px',
          textAlign: 'center',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
        }}>
          <div style={{
            width: '80px',
            height: '80px',
            backgroundColor: '#10b981',
            borderRadius: '50%',
            margin: '0 auto 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '40px',
            color: '#ffffff'
          }}>
            ✓
          </div>
          
          <h2 style={{
            fontSize: '24px',
            fontWeight: '600',
            color: '#1f2937',
            marginBottom: '16px'
          }}>
            Incheckning sparad!
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
            Starta ny incheckning
          </button>
        </div>
      ) : (
        /* Huvudformulär */
        <>
          {/* Registreringsnummer */}
          <div style={{
            backgroundColor: '#ffffff',
            padding: '24px',
            borderRadius: '12px',
            marginBottom: '24px',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
          }}>
            <h2 style={{
              fontSize: '22px',
              fontWeight: '600',
              color: '#1f2937',
              marginBottom: '16px',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              FORDONSINFORMATION
            </h2>
            
            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                marginBottom: '6px',
                fontWeight: '500',
                color: '#374151'
              }}>
                Registreringsnummer *
              </label>
              <input
                type="text"
                value={regInput}
                onChange={(e) => handleRegChange(e.target.value)}
                placeholder="ABC123"
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '2px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '16px',
                  backgroundColor: '#ffffff'
                }}
              />
            </div>

            {loading && (
              <div style={{
                padding: '12px',
                backgroundColor: '#f3f4f6',
                borderRadius: '6px',
                color: '#6b7280',
                textAlign: 'center'
              }}>
                Söker fordon...
              </div>
            )}

            {carData && (
              <div style={{
                padding: '16px',
                backgroundColor: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: '8px',
                marginBottom: '16px'
              }}>
                <h3 style={{
                  fontSize: '16px',
                  fontWeight: '600',
                  color: '#059669',
                  marginBottom: '8px'
                }}>
                  Fordon hittat
                </h3>
                <p><strong>Modell:</strong> {carData.brand_model || 'Ej angiven'}</p>
                <p><strong>Hjulförvaring:</strong> {carData.wheelstorage || 'Ej angiven'}</p>
                {carData.damage_text && (
                  <p><strong>Befintliga skador:</strong> {carData.damage_text}</p>
                )}
                {carData.saludatum && isDateWithinDays(carData.saludatum, 30) && (
                  <p style={{ color: '#dc2626', fontWeight: '500' }}>
                    <strong>⚠️ Besiktning snart:</strong> {new Date(carData.saludatum).toLocaleDateString('sv-SE')}
                  </p>
                )}
              </div>
            )}

            {regInput.length >= 6 && !carData && !loading && (
              <div style={{
                padding: '12px',
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '6px',
                color: '#dc2626',
                textAlign: 'center'
              }}>
                Okänt registreringsnummer: {regInput}
              </div>
            )}

            <div>
              <label style={{
                display: 'block',
                marginBottom: '6px',
                fontWeight: '500',
                color: '#374151'
              }}>
                Mätarställning (km) *
              </label>
              <input
                type="number"
                value={mileage}
                onChange={(e) => setMileage(e.target.value)}
                placeholder="85000"
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '2px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '16px',
                  backgroundColor: '#ffffff'
                }}
              />
            </div>
          </div>

          {/* Plats för incheckning */}
          <div style={{
            backgroundColor: '#ffffff',
            padding: '24px',
            borderRadius: '12px',
            marginBottom: '24px',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
          }}>
            <h2 style={{
              fontSize: '22px',
              fontWeight: '600',
              color: '#1f2937',
              marginBottom: '16px',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              PLATS FÖR INCHECKNING
            </h2>

            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                marginBottom: '6px',
                fontWeight: '500',
                color: '#374151'
              }}>
                Ort *
              </label>
              <select
                value={valtOrt}
                onChange={(e) => {
                  setValtOrt(e.target.value);
                  setValtStation(''); // Återställ station när ort ändras
                }}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '2px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '16px',
                  backgroundColor: '#ffffff'
                }}
              >
                <option value="">Välj ort</option>
                {ORTER.map(ort => (
                  <option key={ort} value={ort}>{ort}</option>
                ))}
              </select>
            </div>

            {availableStations.length > 0 && (
              <div>
                <label style={{
                  display: 'block',
                  marginBottom: '6px',
                  fontWeight: '500',
                  color: '#374151'
                }}>
                  Station/Depå *
                </label>
                <select
                  value={valtStation}
                  onChange={(e) => setValtStation(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '2px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '16px',
                    backgroundColor: '#ffffff'
                  }}
                >
                  <option value="">Välj station</option>
                  {availableStations.map(station => (
                    <option key={station} value={station}>{station}</option>
                  ))}
                </select>
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
            <h2 style={{
              fontSize: '22px',
              fontWeight: '600',
              color: '#1f2937',
              marginBottom: '16px',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              FORDONSSTATUS
            </h2>

            <div style={{ marginBottom: '20px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontWeight: '500',
                color: '#374151'
              }}>
                Fulltankad? *
              </label>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => setTankFull(true)}
                  style={{
                    flex: 1,
                    padding: '12px',
                    border: '2px solid #d1d5db',
                    borderRadius: '6px',
                    backgroundColor: tankFull === true ? '#10b981' : '#ffffff',
                    color: tankFull === true ? '#ffffff' : '#374151',
                    fontSize: '16px',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  Ja
                </button>
                <button
                  type="button"
                  onClick={() => setTankFull(false)}
                  style={{
                    flex: 1,
                    padding: '12px',
                    border: '2px solid #d1d5db',
                    borderRadius: '6px',
                    backgroundColor: tankFull === false ? '#10b981' : '#ffffff',
                    color: tankFull === false ? '#ffffff' : '#374151',
                    fontSize: '16px',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  Nej
                </button>
              </div>
            </div>

            {tankFull === false && (
              <div style={{ marginBottom: '20px' }}>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{
                    display: 'block',
                    marginBottom: '6px',
                    fontWeight: '500',
                    color: '#374151'
                  }}>
                    Antal liter påfyllda
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={fuelLiters}
                    onChange={(e) => setFuelLiters(e.target.value)}
                    placeholder="25.5"
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '2px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '16px',
                      backgroundColor: '#ffffff'
                    }}
                  />
                </div>
                <div>
                  <label style={{
                    display: 'block',
                    marginBottom: '8px',
                    fontWeight: '500',
                    color: '#374151'
                  }}>
                    Bränsletyp
                  </label>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                      type="button"
                      onClick={() => setFuelType('Bensin')}
                      style={{
                        flex: 1,
                        padding: '10px',
                        border: '2px solid #d1d5db',
                        borderRadius: '6px',
                        backgroundColor: fuelType === 'Bensin' ? '#3b82f6' : '#ffffff',
                        color: fuelType === 'Bensin' ? '#ffffff' : '#374151',
                        fontSize: '14px',
                        cursor: 'pointer'
                      }}
                    >
                      Bensin
                    </button>
                    <button
                      type="button"
                      onClick={() => setFuelType('Diesel')}
                      style={{
                        flex: 1,
                        padding: '10px',
                        border: '2px solid #d1d5db',
                        borderRadius: '6px',
                        backgroundColor: fuelType === 'Diesel' ? '#3b82f6' : '#ffffff',
                        color: fuelType === 'Diesel' ? '#ffffff' : '#374151',
                        fontSize: '14px',
                        cursor: 'pointer'
                      }}
                    >
                      Diesel
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
              <div>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontWeight: '500',
                  color: '#374151'
                }}>
                  AdBlue OK?
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setAdblueOk(true)}
                    style={{
                      flex: 1,
                      padding: '8px',
                      border: '2px solid #d1d5db',
                      borderRadius: '4px',
                      backgroundColor: adblueOk === true ? '#10b981' : '#ffffff',
                      color: adblueOk === true ? '#ffffff' : '#374151',
                      fontSize: '14px',
                      cursor: 'pointer'
                    }}
                  >
                    Ja
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdblueOk(false)}
                    style={{
                      flex: 1,
                      padding: '8px',
                      border: '2px solid #d1d5db',
                      borderRadius: '4px',
                      backgroundColor: adblueOk === false ? '#ef4444' : '#ffffff',
                      color: adblueOk === false ? '#ffffff' : '#374151',
                      fontSize: '14px',
                      cursor: 'pointer'
                    }}
                  >
                    Nej
                  </button>
                </div>
              </div>

              <div>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontWeight: '500',
                  color: '#374151'
                }}>
                  Spolarvätska OK?
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setWasherFluidOk(true)}
                    style={{
                      flex: 1,
                      padding: '8px',
                      border: '2px solid #d1d5db',
                      borderRadius: '4px',
                      backgroundColor: washerFluidOk === true ? '#10b981' : '#ffffff',
                      color: washerFluidOk === true ? '#ffffff' : '#374151',
                      fontSize: '14px',
                      cursor: 'pointer'
                    }}
                  >
                    Ja
                  </button>
                  <button
                    type="button"
                    onClick={() => setWasherFluidOk(false)}
                    style={{
                      flex: 1,
                      padding: '8px',
                      border: '2px solid #d1d5db',
                      borderRadius: '4px',
                      backgroundColor: washerFluidOk === false ? '#ef4444' : '#ffffff',
                      color: washerFluidOk === false ? '#ffffff' : '#374151',
                      fontSize: '14px',
                      cursor: 'pointer'
                    }}
                  >
                    Nej
                  </button>
                </div>
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontWeight: '500',
                color: '#374151'
              }}>
                Insynsskydd OK?
              </label>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => setTintOk(true)}
                  style={{
                    flex: 1,
                    padding: '12px',
                    border: '2px solid #d1d5db',
                    borderRadius: '6px',
                    backgroundColor: tintOk === true ? '#10b981' : '#ffffff',
                    color: tintOk === true ? '#ffffff' : '#374151',
                    fontSize: '16px',
                    cursor: 'pointer'
                  }}
                >
                  Ja
                </button>
                <button
                  type="button"
                  onClick={() => setTintOk(false)}
                  style={{
                    flex: 1,
                    padding: '12px',
                    border: '2px solid #d1d5db',
                    borderRadius: '6px',
                    backgroundColor: tintOk === false ? '#ef4444' : '#ffffff',
                    color: tintOk === false ? '#ffffff' : '#374151',
                    fontSize: '16px',
                    cursor: 'pointer'
                  }}
                >
                  Nej
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={{
                  display: 'block',
                  marginBottom: '6px',
                  fontWeight: '500',
                  color: '#374151'
                }}>
                  Antal laddsladdar
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {[0, 1, 2].map(num => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setChargeCables(num)}
                      style={{
                        flex: 1,
                        padding: '12px',
                        border: '2px solid #d1d5db',
                        borderRadius: '6px',
                        backgroundColor: chargeCables === num ? '#3b82f6' : '#ffffff',
                        color: chargeCables === num ? '#ffffff' : '#374151',
                        fontSize: '16px',
                        cursor: 'pointer',
                        fontWeight: '500'
                      }}
                    >
                      {num}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontWeight: '500',
                  color: '#374151'
                }}>
                  Hjul som sitter på
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setCurrentWheels('Sommarhjul')}
                    style={{
                      flex: 1,
                      padding: '8px',
                      border: '2px solid #d1d5db',
                      borderRadius: '4px',
                      backgroundColor: currentWheels === 'Sommarhjul' ? '#f59e0b' : '#ffffff',
                      color: currentWheels === 'Sommarhjul' ? '#ffffff' : '#374151',
                      fontSize: '14px',
                      cursor: 'pointer'
                    }}
                  >
                    Sommar
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentWheels('Vinterhjul')}
                    style={{
                      flex: 1,
                      padding: '8px',
                      border: '2px solid #d1d5db',
                      borderRadius: '4px',
                      backgroundColor: currentWheels === 'Vinterhjul' ? '#6366f1' : '#ffffff',
                      color: currentWheels === 'Vinterhjul' ? '#ffffff' : '#374151',
                      fontSize: '14px',
                      cursor: 'pointer'
                    }}
                  >
                    Vinter
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Nya skador */}
          <div style={{
            backgroundColor: '#ffffff',
            padding: '24px',
            borderRadius: '12px',
            marginBottom: '24px',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
          }}>
            <h2 style={{
              fontSize: '22px',
              fontWeight: '600',
              color: '#1f2937',
              marginBottom: '16px',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              NYA SKADOR
            </h2>

            {newDamages.length === 0 && (
              <p style={{
                color: '#6b7280',
                fontStyle: 'italic',
                marginBottom: '16px'
              }}>
                Inga nya skador rapporterade
              </p>
            )}

            {newDamages.map(damage => (
              <div key={damage.id} style={{
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '16px',
                marginBottom: '16px',
                backgroundColor: '#fafafa'
              }}>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{
                    display: 'block',
                    marginBottom: '6px',
                    fontWeight: '500',
                    color: '#374151'
                  }}>
                    Beskrivning av skada
                  </label>
                  <textarea
                    value={damage.description}
                    onChange={(e) => updateDamageDescription(damage.id, e.target.value)}
                    placeholder="Beskriv skadan..."
                    rows={2}
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

                <div style={{ marginBottom: '16px' }}>
                  <label style={{
                    display: 'block',
                    marginBottom: '6px',
                    fontWeight: '500',
                    color: '#374151'
                  }}>
                    Kategori
                  </label>
                  <select
                    value={damage.category}
                    onChange={(e) => updateDamageCategory(damage.id, e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '16px',
                      backgroundColor: '#ffffff'
                    }}
                  >
                    <option value="">Välj kategori</option>
                    {skadeKategorier.map(kategori => (
                      <option key={kategori} value={kategori}>{kategori}</option>
                    ))}
                  </select>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{
                    display: 'block',
                    marginBottom: '6px',
                    fontWeight: '500',
                    color: '#374151'
                  }}>
                    Lägg till bilder
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    multiple
                    onChange={(e) => addDamageFiles(damage.id, e.target.files)}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      backgroundColor: '#ffffff'
                    }}
                  />
                </div>

                {damage.files.length > 0 && (
                  <div style={{
                    marginBottom: '16px',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                    gap: '12px'
                  }}>
                    {damage.files.map((file, index) => (
                      <div key={index} style={{
                        position: 'relative',
                        width: '120px',
                        height: '120px'
                      }}>
                        <img
                          src={URL.createObjectURL(file)}
                          alt={`Skadebild ${index + 1}`}
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            borderRadius: '8px',
                            border: '1px solid #d1d5db'
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => removeDamageImage(damage.id, index)}
                          style={{
                            position: 'absolute',
                            top: '4px',
                            right: '4px',
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            backgroundColor: '#dc2626',
                            color: '#ffffff',
                            border: '2px solid #ffffff',
                            cursor: 'pointer',
                            fontSize: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 'bold',
                            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.3)',
                            zIndex: 10
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}

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
                  Ta bort skada
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={addNewDamage}
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
              {newDamages.length === 0 ? 'Lägg till skada' : 'Lägg till ytterligare skada'}
            </button>
          </div>

          {/* Uthyrningsstatus & Preliminär avslut */}
          <div style={{
            backgroundColor: '#ffffff',
            padding: '24px',
            borderRadius: '12px',
            marginBottom: '24px',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
          }}>
            <h2 style={{
              fontSize: '22px',
              fontWeight: '600',
              color: '#1f2937',
              marginBottom: '16px',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              UTHYRNINGSSTATUS
            </h2>

            <div style={{ marginBottom: '20px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontWeight: '500',
                color: '#374151'
              }}>
                Status *
              </label>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                gap: '8px'
              }}>
                <button
                  type="button"
                  onClick={() => setUthyrningsstatus('planerat')}
                  style={{
                    padding: '12px 8px',
                    border: '2px solid #d1d5db',
                    borderRadius: '6px',
                    backgroundColor: uthyrningsstatus === 'planerat' ? '#3b82f6' : '#ffffff',
                    color: uthyrningsstatus === 'planerat' ? '#ffffff' : '#000',
                    cursor: 'pointer',
                    fontSize: '14px',
                    textAlign: 'center'
                  }}
                >
                  Planerat
                </button>
                <button
                  type="button"
                  onClick={() => setUthyrningsstatus('pagaende')}
                  style={{
                    padding: '12px 8px',
                    border: '2px solid #d1d5db',
                    borderRadius: '6px',
                    backgroundColor: uthyrningsstatus === 'pagaende' ? '#f59e0b' : '#ffffff',
                    color: uthyrningsstatus === 'pagaende' ? '#ffffff' : '#000',
                    cursor: 'pointer',
                    fontSize: '14px',
                    textAlign: 'center'
                  }}
                >
                  Pågående
                </button>
                <button
                  type="button"
                  onClick={() => setUthyrningsstatus('klar_tankad')}
                  style={{
                    padding: '12px 8px',
                    border: '2px solid #d1d5db',
                    borderRadius: '6px',
                    backgroundColor: uthyrningsstatus === 'klar_tankad' ? '#10b981' : '#ffffff',
                    color: uthyrningsstatus === 'klar_tankad' ? '#ffffff' : '#000',
                    cursor: 'pointer',
                    fontSize: '14px',
                    textAlign: 'center'
                  }}
                >
                  Klar tankad
                </button>
                <button
                  type="button"
                  onClick={() => setUthyrningsstatus('klar_otankad')}
                  style={{
                    padding: '12px 8px',
                    border: '2px solid #d1d5db',
                    borderRadius: '6px',
                    backgroundColor: uthyrningsstatus === 'klar_otankad' ? '#6b7280' : '#ffffff',
                    color: uthyrningsstatus === 'klar_otankad' ? '#ffffff' : '#000',
                    cursor: 'pointer',
                    fontSize: '14px',
                    textAlign: 'center'
                  }}
                >
                  Klar otankad
                </button>
              </div>
            </div>

            {/* Prel. avslut notering */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
                Prel. avslut notering
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

          {/* Övriga anteckningar */}
          <div style={{
            backgroundColor: '#ffffff',
            padding: '24px',
            borderRadius: '12px',
            marginBottom: '24px',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
          }}>
            <h2 style={{
              fontSize: '22px',
              fontWeight: '600',
              color: '#1f2937',
              marginBottom: '16px',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              ÖVRIGA ANTECKNINGAR
            </h2>

            <textarea
              value={otherNotes}
              onChange={(e) => setOtherNotes(e.target.value)}
              placeholder="Eventuella ytterligare kommentarer..."
              rows={4}
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
              {canSave() ? '✅ Spara incheckning' : '⚠️ Fyll i obligatoriska fält'}
            </button>
          </div>

          {/* Copyright */}
          <div style={{
            textAlign: 'center',
            padding: '16px',
            color: '#6b7280',
            fontSize: '14px'
          }}>
            © Albarone AB 2025
          </div>
        </>
      )}
    </div>
  );
}

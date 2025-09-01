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
};

// Platser och stationer (från din Excel)
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
  const [fulltankad, setFulltankad] = useState<boolean | null>(null);
  const [liters, setLiters] = useState('');
  const [bransletyp, setBransletyp] = useState<'Bensin' | 'Diesel' | null>(null);

  // Nya skador
  const [newDamages, setNewDamages] = useState<{id: string; text: string; files: File[]}[]>([]);

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
          .eq('regnr', normalizedReg);

        if (cancelled) return;

        if (error) {
          console.error('Database error:', error);
          setNotFound(true);
          setCarData([]);
        } else if (data && data.length > 0) {
          setCarData(data);
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
  const damages = carData
    .map(item => item.damage_text)
    .filter(Boolean)
    .filter((damage, index, arr) => arr.indexOf(damage) === index);

  const availableStations = ort ? STATIONER[ort] || [] : [];

  // Lägg till ny skada
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
      d.id === id ? {...d, files: Array.from(files)} : d
    ));
  };

  return (
    <div style={{ 
      minHeight: '100vh',
      backgroundColor: '#ffffff',
      color: '#171717'
    }}>
      <div style={{
        maxWidth: '600px',
        margin: '0 auto',
        padding: '20px',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}>
        <h1 style={{ fontSize: '28px', marginBottom: '8px' }}>Ny incheckning</h1>
        <p style={{ color: '#666', marginBottom: '24px' }}>Inloggad: <strong>Bob</strong></p>

        {/* Registreringsnummer */}
        <div style={{ marginBottom: '24px' }}>
          <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
            Registreringsnummer *
          </label>
          <input
            type="text"
            value={regInput}
            onChange={(e) => setRegInput(e.target.value.toUpperCase())}
            placeholder="Skriv reg.nr"
            style={{
              width: '100%',
              padding: '12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '16px',
              backgroundColor: '#ffffff'
            }}
          />

          {loading && <p style={{ color: '#666', fontSize: '14px', marginTop: '8px' }}>Söker...</p>}
          
          {notFound && normalizedReg && (
            <p style={{ color: '#dc2626', fontSize: '14px', marginTop: '8px' }}>Okänt reg.nr</p>
          )}

          {/* Bilinfo */}
          <div style={{ 
            marginTop: '16px', 
            padding: '16px', 
            backgroundColor: '#f9fafb', 
            borderRadius: '6px',
            border: '1px solid #e5e7eb'
          }}>
            <div style={{ marginBottom: '8px' }}>
              <strong>Bilmodell:</strong> {carModel || '—'}
            </div>
            <div style={{ marginBottom: '8px' }}>
              <strong>Hjulförvaring:</strong> —
            </div>
            <div>
              <strong>Befintliga skador:</strong>
              {damages.length === 0 ? (
                <span> —</span>
              ) : (
                <ul style={{ margin: '8px 0 0 20px', padding: 0 }}>
                  {damages.map((damage, i) => (
                    <li key={i}>{damage}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* Plats för incheckning */}
        <h2 style={{ fontSize: '20px', marginBottom: '16px' }}>Plats för incheckning</h2>
        
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

        <button
          type="button"
          onClick={() => setAnnanPlats(!annanPlats)}
          style={{
            background: 'none',
            border: 'none',
            color: '#2563eb',
            textDecoration: 'underline',
            cursor: 'pointer',
            fontSize: '14px',
            marginBottom: '24px'
          }}
        >
          + Annan plats (fritext)
        </button>

        {annanPlats && (
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
              Annan plats
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

        {/* Fordonsstatus */}
        <h2 style={{ fontSize: '20px', marginBottom: '16px' }}>Fordonsstatus</h2>
        
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
            Mätarställning *
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="text"
              value={matarstallning}
              onChange={(e) => setMatarstallning(e.target.value)}
              placeholder="ex. 42 180"
              style={{
                flex: 1,
                padding: '12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '16px',
                backgroundColor: '#ffffff'
              }}
            />
            <span style={{ color: '#666' }}>km</span>
          </div>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
            Tanknivå *
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={() => setFulltankad(true)}
              style={{
                flex: 1,
                padding: '12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                backgroundColor: fulltankad === true ? '#2563eb' : '#ffffff',
                color: fulltankad === true ? '#ffffff' : '#000',
                cursor: 'pointer'
              }}
            >
              Fulltankad
            </button>
            <button
              type="button"
              onClick={() => setFulltankad(false)}
              style={{
                flex: 1,
                padding: '12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                backgroundColor: fulltankad === false ? '#2563eb' : '#ffffff',
                color: fulltankad === false ? '#ffffff' : '#000',
                cursor: 'pointer'
              }}
            >
              Ej fulltankad
            </button>
          </div>
        </div>

        {fulltankad === false && (
          <>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
                Antal liter påfyllda *
              </label>
              <input
                type="text"
                value={liters}
                onChange={(e) => {
                  const v = e.target.value.replace('.', ',');
                  if (/^\d{0,4}([,]\d{0,1})?$/.test(v)) setLiters(v);
                }}
                placeholder="ex. 12,5"
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

        {/* Nya skador */}
        <h2 style={{ fontSize: '20px', marginBottom: '16px' }}>Nya skador på bilen?</h2>
        
        {newDamages.map(damage => (
          <div key={damage.id} style={{
            padding: '16px',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            marginBottom: '16px',
            backgroundColor: '#fefce8'
          }}>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
                Text (obligatorisk)
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
                Lägg till bild
              </label>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => updateDamageFiles(damage.id, e.target.files)}
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
          onClick={addDamage}
          style={{
            background: 'none',
            border: 'none',
            color: '#2563eb',
            textDecoration: 'underline',
            cursor: 'pointer',
            fontSize: '16px',
            marginBottom: '32px'
          }}
        >
          {newDamages.length === 0 ? 'Lägg till skada' : 'Lägg till ytterligare skada'}
        </button>

        {/* Spara knapp */}
        <button
          type="button"
          onClick={() => alert('Incheckning sparad (demo)')}
          style={{
            width: '100%',
            padding: '16px',
            backgroundColor: '#2563eb',
            color: '#ffffff',
            border: 'none',
            borderRadius: '6px',
            fontSize: '18px',
            fontWeight: '500',
            cursor: 'pointer'
          }}
        >
          Spara incheckning
        </button>

        <p style={{ 
          textAlign: 'center', 
          color: '#666', 
          fontSize: '12px', 
          marginTop: '16px' 
        }}>
          © Albarone AB 2025
        </p>
      </div>
    </div>
  );
}

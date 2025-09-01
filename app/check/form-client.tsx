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

// Normalisera registreringsnummer
function normalizeReg(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export default function CheckInForm() {
  const [regInput, setRegInput] = useState('');
  const [carData, setCarData] = useState<CarData[]>([]);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const normalizedReg = useMemo(() => normalizeReg(regInput), [regInput]);

  // Hämta bildata när reg.nr ändras
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

  // Extrahera bilmodell och skador
  const carModel = carData[0]?.brand_model || null;
  const damages = carData
    .map(item => item.damage_text)
    .filter(Boolean)
    .filter((damage, index, arr) => arr.indexOf(damage) === index); // Ta bort dubletter

  return (
    <div style={{ 
      maxWidth: '600px', 
      margin: '0 auto', 
      padding: '20px',
      fontFamily: 'system-ui, sans-serif'
    }}>
      <h1>Ny incheckning</h1>
      <p>Inloggad: <strong>Bob</strong></p>

      {/* Registreringsnummer */}
      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500' }}>
          Registreringsnummer *
        </label>
        <input
          type="text"
          value={regInput}
          onChange={(e) => setRegInput(e.target.value.toUpperCase())}
          placeholder="Skriv reg.nr"
          style={{
            width: '100%',
            padding: '8px 12px',
            border: '1px solid #ccc',
            borderRadius: '4px',
            fontSize: '16px'
          }}
        />

        {loading && <p style={{ color: '#666', fontSize: '14px' }}>Söker...</p>}
        
        {notFound && normalizedReg && (
          <p style={{ color: '#dc3545', fontSize: '14px' }}>Okänt reg.nr</p>
        )}

        {/* Bilinfo */}
        <div style={{ marginTop: '15px', padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
          <div><strong>Bilmodell:</strong> {carModel || '—'}</div>
          <div><strong>Hjulförvaring:</strong> —</div>
          <div>
            <strong>Befintliga skador:</strong>
            {damages.length === 0 ? (
              <span> —</span>
            ) : (
              <ul style={{ margin: '5px 0 0 20px' }}>
                {damages.map((damage, i) => (
                  <li key={i}>{damage}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Resten av formuläret */}
      <h2>Plats för incheckning</h2>
      {/* Lägg till resten av fälten här */}
      
      <button 
        style={{
          backgroundColor: '#007bff',
          color: 'white',
          border: 'none',
          padding: '10px 20px',
          borderRadius: '4px',
          fontSize: '16px',
          cursor: 'pointer',
          marginTop: '20px'
        }}
        onClick={() => alert('Incheckning sparad (demo)')}
      >
        Spara incheckning
      </button>
    </div>
  );
}

import React, { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export default function FormClient() {
  const [regnr, setRegnr] = useState('');
  const [skador, setSkador] = useState<{ H: string; K: string; M: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSkador = async () => {
    setLoading(true);
    setError(null);
    setSkador([]);
    try {
      const { data, error } = await supabase
        .from('mabi_damage_data')
        .select('H, K, M')
        .eq('regnr', regnr);

      if (error) {
        setError('Fel vid hämtning: ' + error.message);
      } else if (data) {
        setSkador(data);
      }
    } catch (err: any) {
      setError('Tekniskt fel: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 500, margin: 'auto', padding: 24 }}>
      <h2>Skador på bil (från Supabase)</h2>
      <label htmlFor="regnr">Registreringsnummer:</label>
      <input
        id="regnr"
        value={regnr}
        onChange={(e) => setRegnr(e.target.value)}
        style={{ margin: '8px 0', padding: '8px', width: '100%' }}
        placeholder="Ex: RXJ02Y"
      />
      <button onClick={fetchSkador} disabled={loading || !regnr}>
        {loading ? 'Hämtar...' : 'Visa skador'}
      </button>
      {error && (
        <div style={{ color: 'red', marginTop: 16 }}>{error}</div>
      )}
      {skador.length > 0 && (
        <div
          style={{
            marginTop: '24px',
            padding: '16px',
            backgroundColor: '#f0f9ff',
            borderRadius: '8px',
            border: '1px solid #bdfbfe',
          }}
        >
          <h3>Skador för {regnr}</h3>
          {skador.map((row, idx) => (
            <div key={idx} style={{ marginBottom: 12 }}>
              <p>
                <strong>H:</strong> {row.H}
              </p>
              <p>
                <strong>K:</strong> {row.K}
              </p>
              <p>
                <strong>M:</strong> {row.M}
              </p>
            </div>
          ))}
        </div>
      )}
      {skador.length === 0 && !loading && regnr && !error && (
        <div style={{ marginTop: 24, color: '#555' }}>
          Inga skador hittades för {regnr}.
        </div>
      )}
    </div>
  );
}
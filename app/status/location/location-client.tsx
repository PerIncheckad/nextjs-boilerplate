'use client';

import { FormEvent, useState } from 'react';
import { getVehicleStatus } from '@/lib/vehicle-status';
import { STATUS_LOCATION_CITIES, STATUS_LOCATION_STATIONS } from '@/lib/status-location-options';

type LoadedVehicle = {
  regnr: string;
  currentLocation: string;
};

function locationValueFromDisplay(value: string): string {
  if (!value || value === '---') return '';
  return value.split(' (')[0]?.trim() || '';
}

export default function StatusLocationClient() {
  const [regnr, setRegnr] = useState('');
  const [vehicle, setVehicle] = useState<LoadedVehicle | null>(null);
  const [city, setCity] = useState('');
  const [station, setStation] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadVehicle = async (rawRegnr: string) => {
    const normalized = rawRegnr.toUpperCase().replace(/\s/g, '');
    if (normalized.length < 5) {
      setError('Ange ett giltigt registreringsnummer.');
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');
    setVehicle(null);

    try {
      const result = await getVehicleStatus(normalized);
      if (!result.found || !result.vehicle) {
        setError('Fordonet hittades inte.');
        return;
      }

      const currentLocation = locationValueFromDisplay(result.vehicle.bilenStarNu);
      setVehicle({ regnr: result.vehicle.regnr, currentLocation });

      const [currentCity = '', currentStation = ''] = currentLocation.split(' / ');
      const cityKnown = STATUS_LOCATION_CITIES.includes(currentCity as (typeof STATUS_LOCATION_CITIES)[number]);
      setCity(cityKnown ? currentCity : '');
      setStation(cityKnown && STATUS_LOCATION_STATIONS[currentCity]?.includes(currentStation) ? currentStation : '');
    } catch {
      setError('Kunde inte läsa aktuell Status.');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (event: FormEvent) => {
    event.preventDefault();
    await loadVehicle(regnr);
  };

  const handleSave = async () => {
    if (!vehicle || !city || !station) return;

    setSaving(true);
    setError('');
    setMessage('');

    try {
      const newValue = `${city} / ${station}`;
      const response = await fetch('/api/vehicle-edits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          edits: [{
            regnr: vehicle.regnr,
            field_name: 'current_location',
            new_value: newValue,
            old_value: vehicle.currentLocation || null,
          }],
        }),
      });

      if (!response.ok) {
        setError('Kunde inte spara platskorrigeringen.');
        return;
      }

      await loadVehicle(vehicle.regnr);
      setMessage(`Aktuell fysisk plats verifierad: ${newValue}.`);
    } catch {
      setError('Nätverksfel vid sparande.');
    } finally {
      setSaving(false);
    }
  };

  const stations = city ? STATUS_LOCATION_STATIONS[city] || [] : [];
  const proposedLocation = city && station ? `${city} / ${station}` : '';
  const unchanged = !!vehicle && proposedLocation === vehicle.currentLocation;

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <form onSubmit={handleSearch} style={{ display: 'grid', gap: '0.75rem' }}>
        <label style={{ display: 'grid', gap: '0.35rem', fontWeight: 600 }}>
          Registreringsnummer
          <input
            value={regnr}
            onChange={(event) => setRegnr(event.target.value.toUpperCase())}
            placeholder="ABC123"
            autoComplete="off"
            style={{ padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: 8, fontSize: '1rem', textTransform: 'uppercase' }}
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          style={{ width: 'fit-content', padding: '0.65rem 1rem', border: '1px solid #1f2937', borderRadius: 8, background: '#fff', cursor: loading ? 'default' : 'pointer', fontWeight: 600 }}
        >
          {loading ? 'Läser…' : 'Läs aktuell plats'}
        </button>
      </form>

      {vehicle && (
        <div style={{ display: 'grid', gap: '1rem', paddingTop: '0.5rem' }}>
          <div style={{ padding: '0.9rem 1rem', background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 8 }}>
            <div style={{ fontSize: '0.75rem', letterSpacing: '0.08em', color: '#6b7280', fontWeight: 700 }}>CURRENT FACT</div>
            <div style={{ marginTop: '0.3rem', fontWeight: 700 }}>{vehicle.currentLocation || 'Ingen verifierad fysisk plats'}</div>
          </div>

          <label style={{ display: 'grid', gap: '0.35rem', fontWeight: 600 }}>
            Verifierad ort
            <select
              value={city}
              onChange={(event) => {
                setCity(event.target.value);
                setStation('');
                setMessage('');
              }}
              style={{ padding: '0.7rem', border: '1px solid #d1d5db', borderRadius: 8, background: '#fff' }}
            >
              <option value="">Välj ort</option>
              {STATUS_LOCATION_CITIES.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>

          <label style={{ display: 'grid', gap: '0.35rem', fontWeight: 600 }}>
            Verifierad station
            <select
              value={station}
              onChange={(event) => {
                setStation(event.target.value);
                setMessage('');
              }}
              disabled={!city}
              style={{ padding: '0.7rem', border: '1px solid #d1d5db', borderRadius: 8, background: '#fff' }}
            >
              <option value="">Välj station</option>
              {stations.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>

          <p style={{ margin: 0, color: '#4b5563', fontSize: '0.9rem', lineHeight: 1.5 }}>
            Sparandet skapar endast en ny verifierad platsobservation i Status. Det skapar inte Check-in, RENTAL eller AVAILABLE och skriver inte om tidigare historik.
          </p>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !city || !station || unchanged}
            style={{ width: 'fit-content', padding: '0.7rem 1rem', border: 0, borderRadius: 8, background: saving || !city || !station || unchanged ? '#cbd5e1' : '#111827', color: '#fff', cursor: saving || !city || !station || unchanged ? 'default' : 'pointer', fontWeight: 700 }}
          >
            {saving ? 'Sparar…' : 'Verifiera aktuell fysisk plats'}
          </button>
        </div>
      )}

      {message && <p role="status" style={{ margin: 0, color: '#166534', fontWeight: 600 }}>{message}</p>}
      {error && <p role="alert" style={{ margin: 0, color: '#b91c1c', fontWeight: 600 }}>{error}</p>}
    </div>
  );
}

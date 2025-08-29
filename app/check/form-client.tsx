// app/check/form-client.tsx
'use client';

import React, { useState } from 'react';
import supabase from '../../lib/supabase';

// Normalisera reg.nr (ABC123, tar bort mellanrum och bindestreck)
const normalizePlate = (v: string) => v.trim().toUpperCase().replace(/[\s-]/g, '');

// Testa om en rad finns i tabell/kolumn
async function existsIn(table: string, column: string, value: string) {
  const { data, error } = await supabase.from(table).select(column).eq(column, value).limit(1);
  if (error) return false; // om kolumnen inte finns eller annat fel → behandla som “ingen träff”
  return !!(data && data.length);
}

export default function CheckinForm() {
  const [username] = useState('Bob');

  // reg.nr + validering
  const [regnr, setRegnr] = useState('');
  const [regValid, setRegValid] = useState<boolean | null>(null);
  const [loadingLookup, setLoadingLookup] = useState(false);

  // (resten av fält – oförändrat visuellt, men borttaget här för korthet)
  const [city, setCity] = useState('');
  const [station, setStation] = useState('');
  const [odometer, setOdometer] = useState('');
  const [fuelFull, setFuelFull] = useState<boolean | null>(null);
  const [adblueOk, setAdblueOk] = useState<boolean | null>(null);
  const [washOk, setWashOk] = useState<boolean | null>(null);
  const [privacyOk, setPrivacyOk] = useState<boolean | null>(null);
  const [cableCount, setCableCount] = useState<number | null>(null);
  const [wheelsOn, setWheelsOn] = useState<'sommar' | 'vinter' | null>(null);
  const [hasNewDamage, setHasNewDamage] = useState<boolean | null>(null);
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  // ---------- ENDA FIXEN: robust kontroll om reg.nr finns ----------
  async function lookupPlate(raw: string) {
    const plate = normalizePlate(raw);
    if (!plate) {
      setRegValid(null);
      return;
    }
    setLoadingLookup(true);
    setRegValid(null);

    try {
      // Vi provar några säkra tabeller/kolumner – en träff räcker.
      // 1) allowed_plates.regnr (huvudlistan)
      if (await existsIn('allowed_plates', 'regnr', plate)) {
        setRegValid(true);
        return;
      }

      // 2) vehicle_damage_summary: kan heta plate ELLER regnr (view)
      if (await existsIn('vehicle_damage_summary', 'plate', plate)) {
        setRegValid(true);
        return;
      }
      if (await existsIn('vehicle_damage_summary', 'regnr', plate)) {
        setRegValid(true);
        return;
      }

      // 3) active_damages: kan heta plate/regnr
      if (await existsIn('active_damages', 'plate', plate)) {
        setRegValid(true);
        return;
      }
      if (await existsIn('active_damages', 'regnr', plate)) {
        setRegValid(true);
        return;
      }

      // 4) tire_storage_summary: kan heta plate/regnr
      if (await existsIn('tire_storage_summary', 'plate', plate)) {
        setRegValid(true);
        return;
      }
      if (await existsIn('tire_storage_summary', 'regnr', plate)) {
        setRegValid(true);
        return;
      }

      // Inga träffar i någon källa → ogiltigt
      setRegValid(false);
    } catch {
      // Om något går fel, markera inte som fel – lämna neutral
      setRegValid(null);
    } finally {
      setLoadingLookup(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('saving');
    setMessage('');
    try {
      // …din befintliga sparlogik (oförändrad)…
      setStatus('done');
      setMessage(`Tack ${username}! Incheckningen sparades.`);
    } catch {
      setStatus('error');
      setMessage('Misslyckades att spara. Kontrollera fält och försök igen.');
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto w-full max-w-xl px-4 py-6 sm:py-8">
        <h1 className="text-3xl font-bold">Ny incheckning</h1>
        <div className="mt-1 text-sm text-zinc-700">Inloggad: {username}</div>

        <form onSubmit={onSubmit} className="mt-4 rounded-2xl bg-white p-5 shadow-lg ring-1 ring-zinc-200">
          {/* Reg.nr */}
          <label className="block text-sm font-medium">Registreringsnummer *</label>
          <input
            value={regnr}
            onChange={(e) => {
              setRegnr(e.target.value);
              setRegValid(null);
            }}
            onBlur={(e) => lookupPlate(e.target.value)}
            className="mt-1 w-full rounded-lg bg-zinc-100 px-3 py-2 tracking-widest uppercase"
            placeholder="ABC123"
            autoCapitalize="characters"
            inputMode="latin"
          />
          {regValid === false && <div className="mt-1 text-sm text-red-600">Okänt reg.nr</div>}
          {loadingLookup && <div className="mt-1 text-sm text-zinc-500">Kontrollerar…</div>}

          {/* (Resten av din form – oförändrat) */}
          <div className="mt-6">
            <button
              type="submit"
              disabled={status === 'saving'}
              className={`w-full rounded-xl px-4 py-3 text-white ${
                status === 'saving' ? 'bg-blue-500/60' : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {status === 'saving' ? 'Sparar…' : 'Spara incheckning'}
            </button>
            {status === 'error' && <div className="mt-3 text-sm text-red-600">{message}</div>}
            {status === 'done' && <div className="mt-3 text-sm text-green-700">{message}</div>}
          </div>
        </form>

        <div className="mt-6 text-center text-sm text-zinc-500">© Albarone AB {new Date().getFullYear()}</div>
      </div>
    </div>
  );
}

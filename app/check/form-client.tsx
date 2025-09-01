'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

type CarRow = {
  regnr: string | null;
  model: string | null;
  wheelstorage: string | null;
  car_id: string | null;
};

type DamageRow = { regnr: string; description: string | null };

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Hjälpare: normalisera reg.nr (bara A–Z och siffror, versaler)
function normalizePlate(v: string): string {
  return (v || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

export default function CheckInForm() {
  // --- Form state (endast det som behövs för denna fix) ---
  const [regInput, setRegInput] = useState('');
  const normalizedReg = useMemo(() => normalizePlate(regInput), [regInput]);

  const [lookupLoading, setLookupLoading] = useState(false);
  const [

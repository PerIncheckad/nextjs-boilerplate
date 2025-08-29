'use client';

import React, { useMemo, useState, ChangeEvent, FormEvent } from 'react';

/* ===================== Typer ===================== */
type RegNr = string;

type DamageEntry = {
  id: string;
  plats: string;
  typ: string;
  beskrivning?: string;
};

type CanonicalCar = {
  regnr: RegNr;          // originalt reg.nr (oförändrat)
  model: string;         // bilmodell (normaliserat fältnamn)
  wheelStorage: string;  // hjulförvaring (normaliserat fältnamn)
  skador: DamageEntry[];
};

/* ================== Normalisering ================= */
function normalizeReg(input: string): string {
  return (input ?? '')
    .toUpperCase()
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // zero-width
    .replace(/[\s\-_.]/g, '')              // mellanslag, -, _, .
    .trim();
}

/* ======= Mappa godtycklig källdata → CanonicalCar ======= */
function toCanonicalCar(raw: any): CanonicalCar | null {
  if (!raw) return null;

  const reg =
    raw.regnr ?? raw.reg ?? raw.registration ?? raw.registrationNumber ??
    raw.license ?? raw.licensePlate ?? raw.plate ?? raw.regNo ?? raw.reg_no;
  if (!reg || typeof reg !== 'string') return null;

  const model =
    raw.model ?? raw.modell ?? raw.bilmodell ?? raw.vehicleModel ?? raw.vehicle_model ?? '';

  const wheelStorage =
    raw.wheelStorage ?? raw.tyreStorage ?? raw.tireStorage ??
    raw['hjulförvaring'] ?? raw.hjulforvaring ?? raw.hjulforvaring_plats ??
    raw['däckhotell'] ?? raw.dackhotell ?? raw.wheels_location ?? '';

  const damagesArr: any[] =
    raw.skador ?? raw.damages ?? raw.damageList ?? raw.existingDamages ?? [];

  const skador: DamageEntry[] = Array.isArray(damagesArr)
    ? dam

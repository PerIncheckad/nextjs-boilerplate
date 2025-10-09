'use client';
import { useState } from "react";

// Dynamiskt år för copyright
const currentYear = new Date().getFullYear();

const MABI_LOGO_URL = "https://ufioaijcmaujlvmveyra.supabase.co/storage/v1/object/public/MABI%20Syd%20logga/MABI%20Syd%20logga%202.png";

// Dummy-data – ersätt med riktig Supabase-fetch i nästa steg!
const stats = {
  period: "Oktober 2025",
  location: "Total",
  totalCheckins: 123,
  totalDamages: 45,
  damagePercent: "36%",
  lastCheckin: "2025-10-08 14:20",
  lastDamage: "2025-10-08 13:50",
};

export default function RapportPage() {
  // Filter och tabell kan byggas ut vidare
  const [period, setPeriod] = useState("month");

  return (
    <main className="rapport-main">
      <div className="background-img" />
      <img src={MABI_LOGO_URL} alt="MABI Syd logga" className="rapport-logo" />

      <div className="rapport-card">
        <h1 className="rapport-title">Rapport & Statistik</h1>
        {/* Statistik/nyckeltal */}
        <div className="rapport-stats">
          <div>
            <strong>Period:</strong> {stats.period} &nbsp;|&nbsp;
            <strong>Plats:</strong> {stats.location}
          </div>
          <div className="rapport-stats-row">
            <div><strong>Totalt incheckningar:</strong> {stats.totalCheckins}</div>
            <div><strong>Totalt skador:</strong> {stats.totalDamages}</div>
            <div><strong>Skadeprocent:</strong> {stats.damagePercent}</div>
          </div>
          <div className="rapport-stats-row">
            <div><strong>Senaste incheckning:</strong> {stats.lastCheckin}</div>
            <div><strong>Senaste skada:</strong> {stats.lastDamage}</div>
          </div>
        </div>
        {/* Filter för period */}
        <div className="rapport-filter">
          <span>Visa för:</span>
          <select value={period} onChange={e => setPeriod(e.target.value)}>
            <option value="day">Idag</option>
            <option value="week">Denna vecka</option>
            <option value="month">Denna månad</option>
            <option value="ytd">YTD</option>
            <option value="12m">12 mån</option>
          </select>
        </div>
        {/* Graf – dummy för nu */}
        <div className="rapport-graf">
          <div className="graf-placeholder">[Graf/tidslinje kommer här]</div>
        </div>
        {/* Tabell – dummy för nu */}
        <div className="rapport-table">
          <div className="table-header">
            <span>Regnr</span>
            <span>Datum</span>
            <span>Ort</span>
            <span>Station</span>
            <span>Typ/Placering/Position</span>
            <span>Incheckare</span>
            <span>Media</span>
          </div>
          {/* Dummy-rad */}
          <div className="table-row">
            <span>ABC123</span>
            <span>2025-10-08</span>
            <span>Lund</span>
            <span>P7 Revinge</span>
            <span>Buckla – Dörr insida – Höger fram</span>
            <span>Per</span>
            <span><img src="/mabi-logo.png" alt="media" className="media-thumb" /></span>
          </div>
        </div>
      </div>
      <footer className="copyright-footer">
        &copy; Albarone AB {currentYear} &mdash; All rights reserved
      </footer>
    </main>
  );
}

'use client';
import { useState } from "react";

const currentYear = new Date().getFullYear();
const MABI_LOGO_URL = "https://ufioaijcmaujlvmveyra.supabase.co/storage/v1/object/public/MABI%20Syd%20logga/MABI%20Syd%20logga%202.png";

// Dummy-data för demo
const stats = {
  period: "Oktober 2025",
  location: "MABI Syd TOTAL", // Bytt ut enligt önskemål!
  totalCheckins: 123,
  totalDamages: 45,
  damagePercent: "36%",
  lastCheckin: "2025-10-08 14:20",
  lastDamage: "2025-10-08 13:50 - P7 Revinge", // Station syns!
};

const tableData = [
  {
    regnr: "ABC123",
    datum: "2025-10-08",
    region: "Syd",
    ort: "Lund",
    station: "P7 Revinge",
    skada: ["Buckla", "Dörr insida", "Höger fram"],
    media: MABI_LOGO_URL,
    anteckning: "Skada är dokumenterad, synlig under besiktning.",
    anteckningFinns: true,
    incheckare: "Per"
  },
  {
    regnr: "DEF456",
    datum: "2025-10-07",
    region: "Syd",
    ort: "Malmö",
    station: "Werksta Hamn",
    skada: ["Repa", "Fälg", "Vänster bak"],
    media: MABI_LOGO_URL,
    anteckning: "",
    anteckningFinns: false,
    incheckare: "Ingemar"
  }
];

export default function RapportPage() {
  const [period, setPeriod] = useState("month");

  return (
    <main className="rapport-main">
      <div className="background-img" />
      <div className="rapport-logo-row">
        <img src={MABI_LOGO_URL} alt="MABI Syd logga" className="rapport-logo-centered" />
      </div>
      <div className="rapport-card">
        <h1 className="rapport-title">Rapport & Statistik</h1>
        <div className="rapport-divider" />
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
        {/* Graf 1 */}
        <div className="rapport-graf">
          <div className="graf-placeholder">[Graf/tidslinje kommer här]</div>
        </div>
        {/* Graf 2 – placeholder, byggs ut senare */}
        <div className="rapport-graf">
          <div className="graf-placeholder">[Jämförelse av skadeprocent mellan enheter – kommer senare!]</div>
        </div>
        {/* Tabell */}
        <div className="rapport-table">
          <div className="table-header">
            <span>Regnr</span>
            <span>Datum</span>
            <span>Region</span>
            <span>Ort</span>
            <span>Station</span>
            <span>Skada</span>
            <span style={{minWidth: "120px"}}>Kommentar</span>
            <span>Anteckning finns</span>
            <span>Media</span>
            <span>Incheckare</span>
          </div>
          {tableData.map((row, i) => (
            <div className="table-row" key={i}>
              <span>{row.regnr}</span>
              <span>{row.datum}</span>
              <span>{row.region}</span>
              <span>{row.ort}</span>
              <span>{row.station}</span>
              <span>
                {row.skada.map((del, idx) => (
                  <div key={idx}>{del}</div>
                ))}
              </span>
              <span style={{minWidth: "120px"}}>{row.anteckning}</span>
              <span>{row.anteckningFinns ? "Ja" : ""}</span>
              <span>
                <img src={row.media} alt="media" className="media-thumb" />
              </span>
              <span>{row.incheckare}</span>
            </div>
          ))}
        </div>
      </div>
      <footer className="copyright-footer">
        &copy; Albarone AB {currentYear} &mdash; All rights reserved
      </footer>
    </main>
  );
}

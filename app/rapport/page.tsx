'use client';
import { useState } from "react";

// Dummy-data för demo
const MABI_LOGO_URL = "https://ufioaijcmaujlvmveyra.supabase.co/storage/v1/object/public/MABI%20Syd%20logga/MABI%20Syd%20logga%202.png";
const stats = {
  period: "Oktober 2025",
  location: "MABI Syd TOTAL",
  totalCheckins: 123,
  totalDamages: 45,
  damagePercent: "36%",
  lastCheckin: "2025-10-08 14:20",
  lastDamage: "2025-10-08 13:50 - P7 Revinge",
};

const tableData = [
  {
    regnr: "ABC123",
    ny: true,
    datum: "2025-10-08",
    klockslag: "14:22",
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
    ny: false,
    datum: "2025-10-07",
    klockslag: "10:41",
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

// Sökfunktion: filtrera på reg.nr (case-insensitive, enkel demo)
function filterRows(rows, search) {
  if (!search) return rows;
  const foundRows = rows.filter(row => row.regnr.toLowerCase() === search.toLowerCase());
  if (foundRows.length === 0) return "NOT_FOUND";
  return foundRows;
}

export default function RapportPage() {
  const [period, setPeriod] = useState("year");
  const [plats, setPlats] = useState("total");
  const [searchRegnr, setSearchRegnr] = useState("");
  const [activeRegnr, setActiveRegnr] = useState("");

  let filteredRows = tableData;
  let searchStatus = "";

  if (activeRegnr) {
    const result = filterRows(tableData, activeRegnr);
    if (result === "NOT_FOUND") {
      searchStatus = "Okänt reg.nr";
      filteredRows = [];
    } else if (result.length === 0) {
      searchStatus = "Inga skador inlagda";
      filteredRows = [];
    } else {
      filteredRows = result;
      searchStatus = "";
    }
  }

  return (
    <main className="rapport-main">
      <div className="background-img" />
      <div className="rapport-center-content">
        <div className="rapport-logo-row">
          <img src={MABI_LOGO_URL} alt="MABI Syd logga" className="rapport-logo-centered" />
        </div>
        <div className="rapport-card">
          <h1 className="rapport-title">Rapport & Statistik</h1>
          <div className="rapport-divider" />
          <div className="rapport-stats rapport-stats-centered">
            <div>
              <strong>Period:</strong> {stats.period} &nbsp;|&nbsp;
              <strong>Vald plats:</strong> {stats.location}
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
            <label htmlFor="period-select">Vald period:</label>
            <select id="period-select" value={period} onChange={e => setPeriod(e.target.value)}>
              <option value="year">Innevarande kalenderår</option>
              <option value="month">Innevarande kalendermånad, År</option>
              <option value="week">Innevarande vecka</option>
              <option value="ytd">YTD</option>
              <option value="7days">Rullande 7 dagar</option>
              <option value="30days">Rullande 30 dagar</option>
              <option value="rollingyear">Rullande år</option>
            </select>
            <label htmlFor="plats-select">Vald plats:</label>
            <select id="plats-select" value={plats} onChange={e => setPlats(e.target.value)}>
              <option value="total">MABI Syd TOTAL</option>
              <option value="region">Region</option>
              <option value="ort">Ort</option>
              <option value="station">Station</option>
            </select>
          </div>
          <div className="rapport-search-row">
            <input
              type="text"
              placeholder="Sök reg.nr"
              value={searchRegnr}
              onChange={e => setSearchRegnr(e.target.value.toUpperCase())}
              className="rapport-search-input"
            />
            <button
              className="rapport-search-btn"
              onClick={() => setActiveRegnr(searchRegnr.trim())}
              disabled={!searchRegnr.trim()}
            >
              Sök
            </button>
            {activeRegnr && (
              <button
                className="rapport-reset-btn"
                onClick={() => { setActiveRegnr(""); setSearchRegnr(""); }}
              >
                Rensa
              </button>
            )}
          </div>
          {activeRegnr && (
            <div className="rapport-search-active">
              {searchStatus
                ? <span className="search-status">{searchStatus}</span>
                : <span className="search-regnr-big">{activeRegnr.toUpperCase()}</span>
              }
            </div>
          )}
          {/* Grafer */}
          <div className="rapport-graf">
            <div className="graf-placeholder">[Graf/tidslinje kommer här]</div>
          </div>
          <div className="rapport-graf">
            <div className="graf-placeholder">[Jämförelse av skadeprocent mellan enheter – kommer senare!]</div>
          </div>
          {/* Tabell */}
          <div className="rapport-table-wrap">
            <table className="rapport-table">
              <thead>
                <tr>
                  <th className="regnr-col">Regnr</th>
                  <th>Ny/gammal</th>
                  <th className="datum-col">Datum</th>
                  <th className="region-section">Region</th>
                  <th className="region-section">Ort</th>
                  <th className="region-section">Station</th>
                  <th>Skada</th>
                  <th className="kommentar-col">Kommentar</th>
                  <th>Anteckning</th>
                  <th className="centered-cell">Media</th>
                  <th>Incheckare</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, i) => (
                  <tr key={i}>
                    <td className="regnr-col"><strong>{row.regnr}</strong></td>
                    <td className="centered-cell">{row.ny ? "NY" : "Gammal"}</td>
                    <td className="datum-col">
                      <div>{row.datum}</div>
                      <div className="datum-klocka">kl. {row.klockslag}</div>
                    </td>
                    <td className="region-section centered-cell region-shadow">{row.region}</td>
                    <td className="region-section centered-cell region-shadow">{row.ort}</td>
                    <td className="region-section centered-cell region-shadow">{row.station}</td>
                    <td className="skada-cell">
                      <div className="skada-hierarki">
                        <span>{row.skada[0]}</span>
                        <span className="skada-arrow">{'>'}</span>
                        <span>{row.skada[1]}</span>
                        <span className="skada-arrow">{'>'}</span>
                        <span>{row.skada[2]}</span>
                      </div>
                    </td>
                    <td className="kommentar-col">{row.anteckning || <span className="cell-dash">--</span>}</td>
                    <td className="centered-cell">{row.anteckningFinns ? "Ja" : <span className="cell-dash">--</span>}</td>
                    <td className="centered-cell">
                      <img src={row.media} alt="media" className="media-thumb" />
                    </td>
                    <td className="incheckare-cell">{row.incheckare}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <footer className="copyright-footer">
        &copy; Albarone AB 2025 &mdash; All rights reserved
      </footer>
    </main>
  );
}

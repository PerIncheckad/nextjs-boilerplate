'use client';
import { useState } from "react";

const MABI_LOGO_URL = "https://ufioaijcmaujlvmveyra.supabase.co/storage/v1/object/public/MABI%20Syd%20logga/MABI%20Syd%20logga%202.png";

// Endast huvudstationer från skärmdumpen
const huvudstationer = [
  "Huvudstation Malmö Jägersro",
  "Huvudstation Helsingborg",
  "Huvudstation Ängelholm",
  "Huvudstation Halmstad",
  "Huvudstation Falkenberg",
  "Huvudstation Trelleborg",
  "Huvudstation Varberg",
  "Huvudstation Lund"
];
const platsAlternativ = [
  "MABI Syd TOTAL",
  "Region Syd",
  "Region Mitt",
  "Region Norr",
  ...huvudstationer
];

const tableData = [
  {
    regnr: "ABC123",
    ny: true,
    datum: "2025-10-08",
    klockslag: "14:22",
    region: "Syd",
    ort: "Lund",
    station: "Huvudstation Lund",
    skada: ["Buckla", "Dörr insida", "Höger fram"],
    media: MABI_LOGO_URL,
    anteckning: "Skada är dokumenterad, synlig under besiktning.",
    anteckningFinns: true,
    godkandAv: "Per"
  },
  {
    regnr: "DEF456",
    ny: false,
    datum: "2025-10-07",
    klockslag: "10:41",
    region: "Syd",
    ort: "Malmö",
    station: "Huvudstation Malmö Jägersro",
    skada: ["Repa", "Fälg", "Vänster bak"],
    media: MABI_LOGO_URL,
    anteckning: "",
    anteckningFinns: false,
    godkandAv: "Ingemar"
  }
];

// Generera periodtext i klartext
function getPeriodText(period: string) {
  const year = "2025";
  switch (period) {
    case "year":
      return year;
    case "month":
      return "Oktober " + year;
    case "week":
      return "v. 41, 6–12 okt";
    case "ytd":
      return "YTD (" + year + ")";
    case "7days":
      return "Rullande 7 dagar";
    case "30days":
      return "Rullande 30 dagar";
    case "rollingyear":
      return "Rullande år";
    default:
      return year;
  }
}

function filterRows(rows, search) {
  if (!search) return rows;
  const foundRows = rows.filter(row => row.regnr.toLowerCase() === search.toLowerCase());
  if (foundRows.length === 0) return "NOT_FOUND";
  return foundRows;
}

export default function RapportPage() {
  const [period, setPeriod] = useState("year");
  const [plats, setPlats] = useState(platsAlternativ[0]);
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

  const sammanfattning = [
    <div key="incheckningar"><strong>Totalt incheckningar:</strong> {filteredRows.length > 0 ? filteredRows.length : 0}</div>,
    <div key="skador"><strong>Totalt skador:</strong> {filteredRows.reduce((acc, row) => acc + 1, 0)}</div>,
    <div key="procent"><strong>Skadeprocent:</strong> 36%</div>,
    <div key="senaste-incheckning"><strong>Senaste incheckning:</strong> 2025-10-08 kl. 14:20</div>,
    <div key="senaste-skada"><strong>Senaste skada:</strong> 2025-10-08 kl. 13:50 - Huvudstation Lund</div>,
  ];

  return (
    <main className="rapport-main">
      <div className="background-img" />
      <div className="rapport-logo-row rapport-logo-top">
        <img src={MABI_LOGO_URL} alt="MABI Syd logga" className="rapport-logo-centered" />
      </div>
      <div className="rapport-center-content">
        <div className="rapport-card">
          <h1 className="rapport-title">Rapport & Statistik</h1>
          <div className="rapport-divider" />
          <div className="rapport-stats rapport-stats-centered">
            {sammanfattning}
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
              {platsAlternativ.map(p => (<option key={p} value={p}>{p}</option>))}
            </select>
          </div>
          <div className="rapport-filter-periodplats">
            <span><strong>{getPeriodText(period)}</strong> | <strong>{plats}</strong></span>
          </div>
          <div className="rapport-search-row">
            <input
              type="text"
              placeholder="SÖK REG.NR"
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
            <div style={{marginTop: "6px", fontSize: "1rem", color: "#555"}}><strong>{getPeriodText(period)}</strong> | <strong>{plats}</strong></div>
          </div>
          <div className="rapport-graf">
            <div className="graf-placeholder">[Jämförelse av skadeprocent mellan enheter – kommer senare!]</div>
            <div style={{marginTop: "6px", fontSize: "1rem", color: "#555"}}><strong>{getPeriodText(period)}</strong> | <strong>{plats}</strong></div>
          </div>
          {/* Tabell */}
          <div className="rapport-table-wrap">
            <table className="rapport-table">
              <thead>
                <tr>
                  <th className="regnr-col">Regnr</th>
                  <th>Ny/gammal</th>
                  <th className="datum-col">Datum</th>
                  <th className="region-section region-flat">Region</th>
                  <th className="region-section region-flat">Ort</th>
                  <th className="region-section region-flat">Station</th>
                  <th>Skada</th>
                  <th className="kommentar-col">Kommentar</th>
                  <th>Anteckning</th>
                  <th className="centered-cell">Media</th>
                  <th>Godkänd av</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, i) => (
                  <tr key={i}>
                    <td className="regnr-col">{row.regnr}</td>
                    <td className="centered-cell">{row.ny ? "Ny" : "Gammal"}</td>
                    <td className="datum-col">
                      <div>{row.datum} <span style={{color:"#2a3f57"}}>kl. {row.klockslag}</span></div>
                    </td>
                    <td className="region-section region-flat centered-cell">{row.region}</td>
                    <td className="region-section region-flat centered-cell">{row.ort}</td>
                    <td className="region-section region-flat centered-cell">{row.station}</td>
                    <td className="skada-cell">
                      <div className="skada-hierarki" style={{ color: "#222" }}>
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
                    <td className="incheckare-cell">{row.godkandAv}</td>
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

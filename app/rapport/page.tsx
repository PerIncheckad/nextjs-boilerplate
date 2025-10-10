'use client';
import { useEffect, useState } from "react";
import stationer from '../../data/stationer.json';
import { supabase } from "@/lib/supabase";

const MABI_LOGO_URL = "https://ufioaijcmaujlvmveyra.supabase.co/storage/v1/object/public/MABI%20Syd%20logga/MABI%20Syd%20logga%202.png";

const periodAlternativ = [
  { value: "year", label: "2025" },
  { value: "month", label: "Oktober 2025" },
  { value: "week", label: "v. 41, 6–12 okt" },
  { value: "ytd", label: "YTD (2025)" },
  { value: "7days", label: "Rullande 7 dagar" },
  { value: "30days", label: "Rullande 30 dagar" },
  { value: "rollingyear", label: "Rullande år" }
];

const platsAlternativ = stationer.map(st => {
  if (st.type === "total" || st.type === "region" || st.type === "tot") return st.namn;
  if (st.type === "station") return `${st.namn} (${st.station_id})`;
  return st.namn;
});

function filterDamagesByPlats(damages, plats) {
  const st = stationer.find(s =>
    plats === s.namn ||
    (s.type === "station" && plats === `${s.namn} (${s.station_id})`)
  );
  if (!st || st.type === "total") return damages;
  if (st.type === "region") return damages.filter(d => d.region === st.namn.split(" ")[1]);
  if (st.type === "tot") return damages.filter(d => d.huvudstation_id === st.huvudstation_id);
  if (st.type === "station") return damages.filter(d => d.station_id === st.station_id);
  return damages;
}

function getNyGammal(saludatum) {
  if (!saludatum) return "Ny";
  const d = new Date(saludatum);
  const nu = new Date();
  const diff = (nu.getTime() - d.getTime()) / (1000 * 3600 * 24);
  return diff < 30 ? "Ny" : "Gammal";
}

export default function RapportPage() {
  const [damages, setDamages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchRegnr, setSearchRegnr] = useState("");
  const [activeRegnr, setActiveRegnr] = useState("");
  const [period, setPeriod] = useState("year");
  const [plats, setPlats] = useState(platsAlternativ[0]);
  const [autocomplete, setAutocomplete] = useState([]);

  useEffect(() => {
    async function fetchDamages() {
      setLoading(true);
      setError("");
      try {
        const { data, error: fetchError } = await supabase
          .from("damages")
          .select("*")
          .order("created_at", { ascending: false });
        if (fetchError) throw fetchError;
        setDamages(data);
      } catch (e) {
        setError("Misslyckades hämta data från Supabase");
      } finally {
        setLoading(false);
      }
    }
    fetchDamages();
  }, []);

  let filteredRows = filterDamagesByPlats(damages, plats);
  if (activeRegnr) {
    filteredRows = filteredRows.filter(row => row.regnr?.toLowerCase() === activeRegnr.toLowerCase());
  }

  const totIncheckningar = damages.length;
  const totSkador = damages.length;
  const skadeprocent = totIncheckningar ? Math.round((totSkador / totIncheckningar) * 100) : 0;
  const senasteIncheckning = damages.length > 0 ? damages[0].damage_date : "--";
  const senasteSkada = damages.length > 0 ? damages[0].damage_date : "--";

  useEffect(() => {
    if (searchRegnr.length >= 2) {
      const regnrList = Array.from(new Set(damages.map(row => row.regnr).filter(Boolean)));
      setAutocomplete(
        regnrList.filter(r => r.toLowerCase().startsWith(searchRegnr.toLowerCase()))
      );
    } else {
      setAutocomplete([]);
    }
  }, [searchRegnr, damages]);

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
            <div><strong>Period:</strong> {periodAlternativ.find(p => p.value === period)?.label} <strong>| Vald plats:</strong> {plats}</div>
            <div><strong>Totalt incheckningar:</strong> {totIncheckningar}</div>
            <div><strong>Totalt skador:</strong> {totSkador}</div>
            <div><strong>Skadeprocent:</strong> {skadeprocent}%</div>
            <div><strong>Senaste incheckning:</strong> {senasteIncheckning}</div>
            <div><strong>Senaste skada:</strong> {senasteSkada}</div>
          </div>
          <div className="rapport-filter">
            <label htmlFor="period-select">Vald period:</label>
            <select id="period-select" value={period} onChange={e => setPeriod(e.target.value)}>
              {periodAlternativ.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <label htmlFor="plats-select">Vald plats:</label>
            <select id="plats-select" value={plats} onChange={e => setPlats(e.target.value)}>
              {platsAlternativ.map(p => (<option key={p} value={p}>{p}</option>))}
            </select>
          </div>
          <div className="rapport-filter-periodplats">
            <span><strong>{periodAlternativ.find(p => p.value === period)?.label}</strong> | <strong>{plats}</strong></span>
          </div>
          <div className="rapport-graf">
            <div className="graf-placeholder">[Graf/tidslinje kommer här]</div>
            <div style={{marginTop: "6px", fontSize: "1rem", color: "#555"}}><strong>{periodAlternativ.find(p => p.value === period)?.label}</strong> | <strong>{plats}</strong></div>
          </div>
          <div className="rapport-graf">
            <div className="graf-placeholder">[Jämförelse av skadeprocent mellan enheter – kommer senare!]</div>
            <div style={{marginTop: "6px", fontSize: "1rem", color: "#555"}}><strong>{periodAlternativ.find(p => p.value === period)?.label}</strong> | <strong>{plats}</strong></div>
          </div>
          <div className="rapport-search-row" style={{position: "relative"}}>
            <input
              type="text"
              placeholder="SÖK REG.NR"
              value={searchRegnr}
              onChange={e => setSearchRegnr(e.target.value.toUpperCase())}
              className="rapport-search-input"
              autoComplete="off"
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
                style={{
                  background: "#2a7ae4",
                  color: "#fff",
                  border: "none",
                  marginLeft: "8px",
                  cursor: "pointer"
                }}
                onClick={() => { setActiveRegnr(""); setSearchRegnr(""); }}
              >
                Rensa
              </button>
            )}
            {autocomplete.length > 0 && (
              <ul style={{
                position: "absolute",
                top: "36px",
                left: "0",
                background: "#fff",
                border: "1px solid #ddd",
                width: "180px",
                zIndex: 10,
                listStyle: "none",
                padding: "4px",
                margin: "0"
              }}>
                {autocomplete.map(regnr => (
                  <li key={regnr}
                      style={{padding: "4px", cursor: "pointer"}}
                      onClick={() => { setSearchRegnr(regnr); setActiveRegnr(regnr); setAutocomplete([]); }}>
                    {regnr}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {loading ? (
            <div>Hämtar data...</div>
          ) : error ? (
            <div style={{ color: "red" }}>{error}</div>
          ) : (
            <div className="rapport-table-wrap">
              <table className="rapport-table">
                <thead>
                  <tr>
                    <th>Regnr</th>
                    <th>Ny/Gammal</th>
                    <th>Datum</th>
                    <th>Region</th>
                    <th>Ort</th>
                    <th>Station</th>
                    <th>Skada</th>
                    <th>Kommentar</th>
                    <th>Anteckning</th>
                    <th>Media</th>
                    <th>Godkänd av</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={11} style={{ textAlign: "center" }}>Inga skador för det reg.nr eller i systemet.</td>
                    </tr>
                  ) : (
                    filteredRows.map((row) => (
                      <tr key={row.id}>
                        <td>{row.regnr}</td>
                        <td>{getNyGammal(row.saludatum)}</td>
                        <td>{row.damage_date ? new Date(row.damage_date).toLocaleDateString("sv-SE") : "--"}</td>
                        <td>{row.region || "--"}</td>
                        <td>{row.ort || "--"}</td>
                        <td>
                          {row.station_namn
                            ? `${row.station_namn}${row.station_id ? ` (${row.station_id})` : ""}`
                            : (row.station_id ? row.station_id : "--")
                          }
                        </td>
                        <td>{row.damage_type_raw || "--"}</td>
                        <td>{row.note_customer || row.kommentar || "--"}</td>
                        <td>{row.note_internal || row.anteckning || "--"}</td>
                        <td>
                          {row.media_url ? (
                            <img src={row.media_url} style={{height:"32px"}} />
                          ) : (
                            "--"
                          )}
                        </td>
                        <td>{row.inchecker_name || row.godkandAv || "--"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      <footer className="copyright-footer">
        &copy; Albarone AB 2025 &mdash; All rights reserved
      </footer>
    </main>
  );
}

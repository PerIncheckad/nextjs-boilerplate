'use client';
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const MABI_LOGO_URL = "https://ufioaijcmaujlvmveyra.supabase.co/storage/v1/object/public/MABI%20Syd%20logga/MABI%20Syd%20logga%202.png";

// Exempelvärden för rullmenyer
const huvudstationer = [
  "P7 Revinge",
  "Verksta hamn",
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

const periodAlternativ = [
  { value: "year", label: "Innevarande kalenderår" },
  { value: "month", label: "Innevarande kalendermånad, År" },
  { value: "week", label: "Innevarande vecka" },
  { value: "ytd", label: "YTD" },
  { value: "7days", label: "Rullande 7 dagar" },
  { value: "30days", label: "Rullande 30 dagar" },
  { value: "rollingyear", label: "Rullande år" }
];

function getPeriodText(period: string) {
  const year = new Date().getFullYear().toString();
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

export default function RapportPage() {
  const [damages, setDamages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchRegnr, setSearchRegnr] = useState("");
  const [activeRegnr, setActiveRegnr] = useState("");
  const [period, setPeriod] = useState("year");
  const [plats, setPlats] = useState(platsAlternativ[0]);

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

  // Filtrera på regnr om sökning är aktiv
  const filteredRows = damages.filter(row =>
    !activeRegnr || row.regnr?.toLowerCase() === activeRegnr.toLowerCase()
  );

  // Sammanfattning
  const totIncheckningar = damages.length; // Justera logik om incheckningar != skador
  const totSkador = damages.length;
  const skadeprocent = totIncheckningar ? Math.round((totSkador / totIncheckningar) * 100) : 0;
  const senasteIncheckning = damages.length > 0 ? damages[0].damage_date : "--";
  const senasteSkada = damages.length > 0 ? damages[0].damage_date : "--";

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
            <div><strong>Period:</strong> {getPeriodText(period)} <strong>| Vald plats:</strong> {plats}</div>
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
            <span><strong>{getPeriodText(period)}</strong> | <strong>{plats}</strong></span>
          </div>
          {/* Grafer */}
          <div className="rapport-graf">
            <div className="graf-placeholder">[Graf/tidslinje kommer här]</div>
            <div style={{marginTop: "6px", fontSize: "1rem", color: "#555"}}><strong>{getPeriodText(period)}</strong> | <strong>{plats}</strong></div>
          </div>
          <div className="rapport-graf">
            <div className="graf-placeholder">[Jämförelse av skadeprocent mellan enheter – kommer senare!]</div>
            <div style={{marginTop: "6px", fontSize: "1rem", color: "#555"}}><strong>{getPeriodText(period)}</strong> | <strong>{plats}</strong></div>
          </div>
          {/* Sökfält */}
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
          {/* Tabell */}
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
                        <td>{/* getNyGammal(row.saludatum) */ "Ny"}</td>
                        <td>{row.damage_date ? new Date(row.damage_date).toLocaleDateString("sv-SE") : "--"}</td>
                        <td>{row.region || "--"}</td>
                        <td>{row.ort || "--"}</td>
                        <td>{row.station_namn || "--"}</td>
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

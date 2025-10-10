'use client';
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const MABI_LOGO_URL = "https://ufioaijcmaujlvmveyra.supabase.co/storage/v1/object/public/MABI%20Syd%20logga/MABI%20Syd%20logga%202.png";

export default function RapportPage() {
  const [damages, setDamages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchRegnr, setSearchRegnr] = useState("");
  const [activeRegnr, setActiveRegnr] = useState("");

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
  const sammanfattning = [
    <div key="totalt-skador"><strong>Totalt skador:</strong> {damages.length}</div>,
    <div key="senaste-skada"><strong>Senaste skada:</strong> {damages.length > 0 ? damages[0].damage_date : "--"}</div>,
  ];

  // Formatfunktion för datum/klockslag (om du vill dela upp)
  function formatDate(dateStr) {
    if (!dateStr) return "--";
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString("sv-SE");
    } catch { return dateStr; }
  }

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
                    <th>Salu datum</th>
                    <th>Skadedatum</th>
                    <th>Skadetyp</th>
                    <th>Kundnotering</th>
                    <th>Intern notering</th>
                    <th>Övrigt</th>
                    {/* Lägg till fler kolumner nedan vid behov */}
                    <th>Region</th>
                    <th>Ort</th>
                    <th>Station</th>
                    <th>Kommentar</th>
                    <th>Anteckning</th>
                    <th>Media</th>
                    <th>Godkänd av</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={14} style={{ textAlign: "center" }}>Inga skador för det reg.nr eller i systemet.</td>
                    </tr>
                  ) : (
                    filteredRows.map((row) => (
                      <tr key={row.id}>
                        <td>{row.regnr}</td>
                        <td>{formatDate(row.saludatum)}</td>
                        <td>{formatDate(row.damage_date)}</td>
                        <td>{row.damage_type_raw}</td>
                        <td>{row.note_customer}</td>
                        <td>{row.note_internal}</td>
                        <td>{row.vehiclenote}</td>
                        {/* Extra-fält, fyll på efter behov */}
                        <td>{row.region || "-"}</td>
                        <td>{row.ort || "-"}</td>
                        <td>{row.station_namn || "-"}</td>
                        <td>{row.description || "-"}</td>
                        <td>{row.status || "-"}</td>
                        <td>
                          {/* Media-visning kan byggas ut, t.ex. miniatyr/bildlänk */}
                          {row.media_url ? (
                            <img src={row.media_url} alt="skademedia" style={{height:"32px"}} />
                          ) : (
                            "-"
                          )}
                        </td>
                        <td>{row.inchecker_name || "-"}</td>
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

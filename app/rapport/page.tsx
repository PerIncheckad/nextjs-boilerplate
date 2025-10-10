'use client';
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const MABI_LOGO_URL = "https://ufioaijcmaujlvmveyra.supabase.co/storage/v1/object/public/MABI%20Syd%20logga/MABI%20Syd%20logga%202.png";

// Hjälpfunktion för att tolka "Ny/Gammal"
function getNyGammal(saludatum) {
  // Exempel: Om saludatum är inom senaste 30 dagar = "Ny", annars "Gammal"
  if (!saludatum) return "Gammal";
  const d = new Date(saludatum);
  const nu = new Date();
  const diff = (nu.getTime() - d.getTime()) / (1000 * 3600 * 24);
  return diff < 30 ? "Ny" : "Gammal";
}

// Hjälpfunktion för att skapa skada-hierarki
function getSkadaHierarki(row) {
  // Antingen parsar du från flera fält, eller splittar en sträng
  if (row.damage_type_raw) {
    return row.damage_type_raw.split(">").map((del, i) => (
      <span key={i} style={{marginRight:4}}>{del.trim()}{i < 2 ? " > " : ""}</span>
    ));
  }
  // Eller använd flera fält: damage_type, car_part, position
  return [row.damage_type, row.car_part, row.position].filter(Boolean).join(" > ");
}

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

  const filteredRows = damages.filter(row =>
    !activeRegnr || row.regnr?.toLowerCase() === activeRegnr.toLowerCase()
  );

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
                        <td>{getNyGammal(row.saludatum)}</td>
                        <td>
                          {row.damage_date
                            ? new Date(row.damage_date).toLocaleDateString("sv-SE") +
                              (row.klockslag ? " kl. " + row.klockslag : "")
                            : "--"}
                        </td>
                        <td>{row.region || "--"}</td>
                        <td>{row.ort || "--"}</td>
                        <td>{row.station_namn || "--"}</td>
                        <td>{getSkadaHierarki(row)}</td>
                        <td>{row.note_customer || row.kommentar || "--"}</td>
                        <td>{row.note_internal || row.anteckning || "--"}</td>
                        <td>
                          {/* Visa media om du har url: row.media_url eller liknande */}
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

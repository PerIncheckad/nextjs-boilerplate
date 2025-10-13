'use client';
import { useEffect, useState } from "react";
import Image from "next/image";
import stationer from '../../data/stationer.json';
import { supabase } from "@/lib/supabase";
import MediaModal from "@/components/MediaModal";

// ==============================
// Inställningar och metadata
// ==============================
const MABI_LOGO_URL = "https://ufioaijcmaujlvmveyra.supabase.co/storage/v1/object/public/MABI%20Syd%20logga/MABI%20Syd%20logga%202.png";

// NYTT: Korrekt typdefinition för den sammanslagna datan
type DamageWithVehicle = {
  // Alla fält från 'damages'
  id: string;
  regnr: string;
  damage_date: string;
  ort: string;
  station_namn: string;
  damage_type_raw: string;
  notering: string;
  inchecker_name?: string;
  godkandAv?: string;
  media_url?: string;
  created_at: string;
  note_internal?: string;
  damage_type?: string;
  saludatum?: string;
  region?: string;
  huvudstation_id?: string;
  station_id?: string;
  // Fält från 'vehicles'
  brand?: string;
  model?: string;
};

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

function filterDamagesByPlats(damages: DamageWithVehicle[], plats: string) {
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

// ÅTERSTÄLLD: Den ursprungliga funktionen för Ny/gammal, tills databasen är uppdaterad
function getNyGammal(row: DamageWithVehicle) {
  const buhsText = "Detta är info från BUHS. Ännu ej dokumenterad i formuläret.";
  if (
    (row.note_internal && String(row.note_internal).toLowerCase().includes("buhs")) ||
    (row.damage_type_raw && String(row.damage_type_raw).toLowerCase().includes("buhs"))
  ) {
    return buhsText;
  }
  if (row.saludatum) {
    const d = new Date(row.saludatum);
    const nu = new Date();
    const diff = (nu.getTime() - d.getTime()) / (1000 * 3600 * 24);
    return diff < 30 ? "Ny" : "Gammal";
  }
  return "Ny";
}

// ÅTERSTÄLLD & FÖRBÄTTRAD: Klockslagsfunktion som visar tid för "Nya" skador
function formatTime(row: DamageWithVehicle) {
    const isBuhs = getNyGammal(row).includes("BUHS");
    if (isBuhs || !row.damage_date) return "";

    try {
        const d = new Date(row.damage_date);
        if (isNaN(d.getTime())) return "";
        // Visa bara tid om den inte är exakt midnatt
        if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0) return "";
        return d.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Stockholm" });
    } catch {
        return "";
    }
}

// NYTT: Korrekt funktion för att mappa Ort till Region
const mapOrtToRegion = (ort: string): string => {
    if (!ort) return "--";
    const stationData = stationer.find(s => s.ort && s.ort.toLowerCase() === ort.toLowerCase());
    return stationData?.region || ort; // Returnerar orten själv om ingen region hittas
};

export default function RapportPage() {
  const [damages, setDamages] = useState<DamageWithVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchRegnr, setSearchRegnr] = useState("");
  const [activeRegnr, setActiveRegnr] = useState("");
  const [period, setPeriod] = useState("year");
  const [plats, setPlats] = useState(platsAlternativ[0]);
  const [autocomplete, setAutocomplete] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState("damage_date");
  const [sortOrder, setSortOrder] = useState("desc");

  // Modal-state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMedia, setModalMedia] = useState([]);
  const [modalTitle, setModalTitle] = useState("");
  const [modalIdx, setModalIdx] = useState(0);
  const [modalMultiSkada, setModalMultiSkada] = useState(false);

  // JUSTERAD: Datahämtning för att inkludera bilmodeller
  useEffect(() => {
    async function fetchAllData() {
      setLoading(true);
      setError("");
      try {
        const { data: damagesData, error: fetchError } = await supabase
          .from("damages")
          .select("*")
          .order("damage_date", { ascending: false });
        if (fetchError) throw fetchError;

        const { data: vehiclesData, error: vehiclesError } = await supabase
            .from("vehicles")
            .select("regnr, brand, model");
        if (vehiclesError) throw vehiclesError;

        const vehiclesMap = new Map(vehiclesData.map(v => [v.regnr, { brand: v.brand, model: v.model }]));
        const combinedData = damagesData.map(damage => ({
            ...damage,
            ...vehiclesMap.get(damage.regnr)
        }));

        setDamages(combinedData);
      } catch (e: any) {
        setError("Misslyckades hämta data från Supabase: " + e.message);
      } finally {
        setLoading(false);
      }
    }
    fetchAllData();
  }, []);

  let filteredRows = filterDamagesByPlats(damages, plats);
  if (activeRegnr) {
    filteredRows = filteredRows.filter(row => row.regnr?.toLowerCase() === activeRegnr.toLowerCase());
  }

  filteredRows = [...filteredRows].sort((a, b) => {
    let ak = a[sortKey] ?? "";
    let bk = b[sortKey] ?? "";
    if (sortKey === "damage_date" || sortKey === "created_at" || sortKey === "updated_at") {
      ak = new Date(ak).getTime();
      bk = new Date(bk).getTime();
      return sortOrder === "desc" ? bk - ak : ak - bk;
    }
    if (typeof ak === "string" && typeof bk === "string") {
      return sortOrder === "desc" ? bk.localeCompare(ak) : ak.localeCompare(bk);
    }
    return 0;
  });

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

  useEffect(() => {
    if (activeRegnr) setAutocomplete([]);
  }, [activeRegnr]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortOrder("desc");
    }
  };

  // ----- Modalhantering (Befintlig logik, bevarad) -----
  const openMediaModalForRow = (row: DamageWithVehicle) => {
    const mediaArr = [];
    if (row.media_url) {
      mediaArr.push({
        url: row.media_url,
        type: "image", // Antagande, kan behöva ett 'media_type' fält
        metadata: {
          date: row.damage_date ? new Date(row.damage_date).toLocaleDateString("sv-SE") : "--",
          time: formatTime(row),
          damageType: row.damage_type || row.damage_type_raw || "--",
          station: row.station_namn || row.station_id || "--",
          note: row.notering || "",
          inchecker: row.inchecker_name || row.godkandAv || "",
          documentationDate: row.created_at ? new Date(row.created_at).toLocaleDateString("sv-SE") : undefined,
          damageDate: row.damage_date ? new Date(row.damage_date).toLocaleDateString("sv-SE") : undefined,
        },
      });
    }
    setModalMedia(mediaArr);
    setModalTitle(
      `${row.regnr} - ${getNyGammal(row) === "Ny" ? "Senaste skada" : "Skada"}: ${row.damage_type || row.damage_type_raw || "--"} - ${row.damage_date ? new Date(row.damage_date).toLocaleDateString("sv-SE") : ""}`
    );
    setModalIdx(0);
    setModalMultiSkada(false);
    setModalOpen(true);
  };

  const openMediaModalForRegnr = (regnr: string) => {
    const skador = filteredRows.filter(row => row.regnr === regnr);
    const mediaArr = skador.map(row => ({
      url: row.media_url,
      type: "image",
      metadata: {
        date: row.damage_date ? new Date(row.damage_date).toLocaleDateString("sv-SE") : "--",
        time: formatTime(row),
        damageType: row.damage_type || row.damage_type_raw || "--",
        station: row.station_namn || row.station_id || "--",
        note: row.notering || "",
        inchecker: row.inchecker_name || row.godkandAv || "",
        documentationDate: row.created_at ? new Date(row.created_at).toLocaleDateString("sv-SE") : undefined,
        damageDate: row.damage_date ? new Date(row.damage_date).toLocaleDateString("sv-SE") : undefined,
      }
    })).filter(item => !!item.url);
    setModalMedia(mediaArr);
    setModalTitle(`Alla skador för ${regnr}`);
    setModalIdx(0);
    setModalMultiSkada(true);
    setModalOpen(true);
  };

  const handleModalPrev = () => setModalIdx(idx => (idx > 0 ? idx - 1 : idx));
  const handleModalNext = () => setModalIdx(idx => (idx < modalMedia.length - 1 ? idx + 1 : idx));

  return (
    <main className="rapport-main" style={{ paddingBottom: "60px" }}>
      <div className="background-img" />
      <div style={{ height: "8px" }}></div>
      <div className="rapport-logo-row rapport-logo-top" style={{ marginBottom: "4px" }}>
        <img src={MABI_LOGO_URL} alt="MABI Syd logga" className="rapport-logo-centered" style={{ width: "190px", height: "auto" }} />
      </div>
      <div className="rapport-center-content">
        <div className="rapport-card" style={{ background: "rgba(255,255,255,0.92)" }}>
          <h1 className="rapport-title">Rapport & Statistik</h1>
          <div className="rapport-divider" />
          
          {/* ÅTERSTÄLLD: Hela blocket för statistik och filter */}
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
                position: "absolute", top: "36px", left: "0", background: "#fff",
                border: "1px solid #ddd", width: "180px", zIndex: 10,
                listStyle: "none", padding: "4px", margin: "0"
              }}>
                {autocomplete.map(regnr => (
                  <li key={regnr} style={{padding: "4px", cursor: "pointer"}}
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
                    <th onClick={() => handleSort("regnr")} style={{cursor:"pointer"}}>Regnr</th>
                    <th onClick={() => handleSort("brand")} style={{cursor:"pointer"}}>Bilmodell</th>
                    <th onClick={() => handleSort("saludatum")} style={{cursor:"pointer"}}>Ny/gammal</th>
                    <th onClick={() => handleSort("damage_date")} style={{cursor:"pointer", minWidth:"120px"}}>Datum</th>
                    <th onClick={() => handleSort("region")} style={{cursor:"pointer"}}>Region</th>
                    <th onClick={() => handleSort("ort")} style={{cursor:"pointer"}}>Ort</th>
                    <th onClick={() => handleSort("station_namn")} style={{cursor:"pointer"}}>Station</th>
                    <th onClick={() => handleSort("damage_type")} style={{cursor:"pointer"}}>Skada</th>
                    <th onClick={() => handleSort("notering")} style={{cursor:"pointer"}}>Anteckning</th>
                    <th onClick={() => handleSort("media_url")} style={{cursor:"pointer"}}>Bild/video</th>
                    <th onClick={() => handleSort("inchecker_name")} style={{cursor:"pointer"}}>Godkänd av</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length === 0 ? (
                    <tr><td colSpan={11} style={{ textAlign: "center" }}>Inga skador för det reg.nr eller i systemet.</td></tr>
                  ) : (
                    filteredRows.map((row) => (
                      <tr key={row.id}>
                        <td><span style={{textDecoration: "underline", cursor: "pointer", color: "#005A9C"}} onClick={() => openMediaModalForRegnr(row.regnr)}>{row.regnr}</span></td>
                        <td>{row.brand} {row.model}</td>
                        <td>{getNyGammal(row)}</td>
                        <td style={{minWidth:"120px"}}>
                          {row.damage_date ? new Date(row.damage_date).toLocaleDateString("sv-SE") : "--"}
                          <div style={{ fontSize: "0.9em", color: "#555" }}><span>{formatTime(row)}</span></div>
                        </td>
                        <td>{mapOrtToRegion(row.ort)}</td>
                        <td>{row.ort || "--"}</td>
                        <td>{row.station_namn ? `${row.station_namn}${row.station_id ? ` (${row.station_id})` : ""}`: (row.station_id ? row.station_id : "--")}</td>
                        <td>{row.damage_type || row.damage_type_raw || "--"}</td>
                        <td>{row.notering || "--"}</td>
                        <td>
                          {row.media_url ? (
                            <Image src={row.media_url} width={72} height={72} style={{cursor:"pointer", borderRadius:"7px", border:"1.5px solid #b0b4b8", objectFit:"cover", margin: "0 auto", display: "block"}}
                              onClick={() => openMediaModalForRow(row)} alt="Tumnagel" />
                          ) : ("--")}
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
      <footer className="copyright-footer" style={{ position: "fixed", left: 0, bottom: 0, width: "100vw", background: "rgba(255,255,255,0.7)" }}>
        &copy; Albarone AB 2025 &mdash; All rights reserved
      </footer>
      <MediaModal open={modalOpen} onClose={() => setModalOpen(false)} media={modalMedia} title={modalTitle} currentIdx={modalIdx}
        onPrev={modalMedia.length > 1 ? handleModalPrev : undefined} onNext={modalMedia.length > 1 ? handleModalNext : undefined}
        hasPrev={modalIdx > 0} hasNext={modalIdx < modalMedia.length - 1} />
      <style jsx global>{`
        .background-img {
          position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
          background: url('/bakgrund.jpg') center center / cover no-repeat;
          opacity: 0.19; z-index: -1;
        }
        .rapport-logo-row { display: flex; justify-content: center; }
        .rapport-logo-centered { width: 220px; height: auto; }
        .rapport-center-content { display: flex; justify-content: center; }
        .rapport-card { margin-top: 0px; margin-bottom: 0px; padding: 36px 28px 28px 28px;
          max-width: 900px; border-radius: 18px; box-shadow: 0 2px 32px #0002;
        }
        .rapport-title { font-size: 2.1rem; font-weight: 700; text-align: center; margin-bottom: 18px; }
        .rapport-divider { height: 2px; background: #e5e7eb; margin: 0 0 18px 0; }
        .rapport-stats-centered { text-align: center; }
        .rapport-table-wrap { margin-top: 20px; }
        .rapport-table { width: 100%; border-collapse: collapse; background: rgba(255,255,255,0.97); }
        .rapport-table th, .rapport-table td { border: 1px solid #e5e7eb; padding: 6px 10px; font-size: 1rem; }
        .rapport-table th { background: #f5f6fa; font-weight: 600; text-align: left; }
        .rapport-table tr:nth-child(even) { background: #fafbfc; }
        .rapport-search-row { margin-top: 22px; margin-bottom: 12px; text-align: center; }
      `}</style>
    </main>
  );
}

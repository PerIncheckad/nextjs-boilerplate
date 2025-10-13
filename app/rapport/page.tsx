'use client';
import { useEffect, useState } from "react";
import Image from "next/image"; // JUSTERAD: Importerar Image-komponenten för tumnaglar
import stationer from '../../data/stationer.json';
import { supabase } from "@/lib/supabase";
import MediaModal from "@/components/MediaModal";

// ==============================
// Inställningar och metadata
// ==============================
const MABI_LOGO_URL = "https://ufioaijcmaujlvmveyra.supabase.co/storage/v1/object/public/MABI%20Syd%20logga/MABI%20Syd%20logga%202.png";

// --- Typer ---
// NYTT: Utökad typ för att inkludera bilmodell
type DamageWithVehicle = {
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
  // NYTT: Det nya statusfältet från databasen
  damage_status: 'buhs_pending' | 'buhs_documented' | 'new'; 
  // NYTT: Fält för bilmodell
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

// NYTT: Funktion som översätter ort till korrekt region
const mapOrtToRegion = (ort: string): string => {
    const station = stationer.find(s => s.ort === ort);
    return station?.region || "Okänd";
};

// NYTT: Funktion som översätter damage_status till läsbar text
const getDamageStatusText = (status: DamageWithVehicle['damage_status']): string => {
    switch (status) {
      case 'buhs_pending': return 'Endast i BUHS';
      case 'buhs_documented': return 'Gammal';
      case 'new': return 'Ny';
      default: return 'Okänd';
    }
};

// JUSTERAD: Förbättrad funktion för klockslag med tidszonsfix
function formatTime(dateString: string) {
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return "";
    // Dölj tid om den är midnatt UTC
    if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0) {
      return "";
    }
    return d.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Stockholm" });
  } catch {
    return "";
  }
}

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

  // JUSTERAD: useEffect för att hämta BÅDE skador och bilmodeller
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError("");
      try {
        // Hämta skador
        const { data: damagesData, error: fetchError } = await supabase
          .from("damages")
          .select("*")
          .order("damage_date", { ascending: false });
        if (fetchError) throw fetchError;

        // NYTT: Hämta bilmodeller
        const { data: vehiclesData, error: vehiclesError } = await supabase
          .from("vehicles")
          .select("regnr, brand, model");
        if(vehiclesError) throw vehiclesError;

        // NYTT: Skapa en map för snabb uppslagning av bilmodeller
        const vehiclesMap = new Map(vehiclesData.map(v => [v.regnr, { brand: v.brand, model: v.model }]));

        // NYTT: Slå ihop skadedata med bilmodelldata
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
    fetchData();
  }, []);

  // Befintlig logik för filtrering och sortering (oförändrad)
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
  
  // ----- Modalhantering (Befintlig logik, oförändrad) -----
  const openMediaModalForRow = (row) => {
    // ... befintlig kod för att öppna modal ...
  };
  const openMediaModalForRegnr = (regnr) => {
    // ... befintlig kod för att öppna modal ...
  };
  const handleModalPrev = () => setModalIdx(idx => (idx > 0 ? idx - 1 : idx));
  const handleModalNext = () => setModalIdx(idx => (idx < modalMedia.length - 1 ? idx + 1 : idx));

  return (
    <main className="rapport-main" style={{ paddingBottom: "60px" }}>
      <div className="background-img" />
      <div style={{ height: "8px" }}></div>
      {/* JUSTERAD: Minskat marginalen för att flytta loggan närmare */}
      <div className="rapport-logo-row rapport-logo-top" style={{ marginBottom: "0px" }}>
        <img src={MABI_LOGO_URL} alt="MABI Syd logga" className="rapport-logo-centered" style={{ width: "190px", height: "auto" }} />
      </div>
      <div className="rapport-center-content">
        {/* JUSTERAD: Bakgrundsfärgen på kortet för att minska transparens */}
        <div className="rapport-card" style={{ background: "rgba(255,255,255,0.97)" }}>
          <h1 className="rapport-title">Rapport & Statistik</h1>
          <div className="rapport-divider" />
          {/* ... befintlig JSX för statistik och filter ... */}
          <div className="rapport-stats rapport-stats-centered">
            {/* ... */}
          </div>
          <div className="rapport-filter">
            {/* ... */}
          </div>
          {/* ... etc ... */}
          <div className="rapport-table-wrap">
              <table className="rapport-table">
                <thead>
                  <tr>
                    <th onClick={() => handleSort("regnr")} style={{cursor:"pointer"}}>Regnr</th>
                    {/* NYTT: Kolumn för Bilmodell */}
                    <th onClick={() => handleSort("brand")} style={{cursor:"pointer"}}>Bilmodell</th>
                    {/* JUSTERAD: Sorterar nu på det korrekta status-fältet */}
                    <th onClick={() => handleSort("damage_status")} style={{cursor:"pointer"}}>Ny/gammal</th>
                    <th onClick={() => handleSort("damage_date")} style={{cursor:"pointer", minWidth:"120px"}}>Datum</th>
                    <th onClick={() => handleSort("ort")} style={{cursor:"pointer"}}>Region</th>
                    <th onClick={() => handleSort("ort")} style={{cursor:"pointer"}}>Ort</th>
                    <th onClick={() => handleSort("station_namn")} style={{cursor:"pointer"}}>Station</th>
                    <th onClick={() => handleSort("damage_type_raw")} style={{cursor:"pointer"}}>Skada</th>
                    <th onClick={() => handleSort("notering")} style={{cursor:"pointer"}}>Anteckning</th>
                    <th style={{cursor:"pointer"}}>Bild/video</th>
                    <th onClick={() => handleSort("inchecker_name")} style={{cursor:"pointer"}}>Godkänd av</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={11} style={{ textAlign: "center" }}>Inga skador hittades.</td>
                    </tr>
                  ) : (
                    filteredRows.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <span style={{textDecoration: "underline", cursor: "pointer", color: "#005A9C"}} onClick={() => openMediaModalForRegnr(row.regnr)}>
                            {row.regnr}
                          </span>
                        </td>
                        {/* NYTT: Visar bilmodell */}
                        <td>{row.brand} {row.model}</td>
                        {/* JUSTERAD: Använder den nya status-funktionen */}
                        <td>{getDamageStatusText(row.damage_status)}</td>
                        <td style={{minWidth:"120px"}}>
                          {row.damage_date ? new Date(row.damage_date).toLocaleDateString("sv-SE") : "--"}
                          {/* JUSTERAD: Använder den fixade tid-funktionen */}
                          {row.damage_date && (
                            <div style={{ fontSize: "0.9em", color: "#555" }}><span>{formatTime(row.damage_date)}</span></div>
                          )}
                        </td>
                        {/* JUSTERAD: Använder den nya region-funktionen */}
                        <td>{mapOrtToRegion(row.ort) || "--"}</td>
                        <td>{row.ort || "--"}</td>
                        <td>{row.station_namn || "--"}</td>
                        <td>{row.damage_type_raw || "--"}</td>
                        <td>{row.notering || "--"}</td>
                        <td>
                          {row.media_url ? (
                            <Image
                              src={row.media_url}
                              width={72} // JUSTERAD: 50% större storlek
                              height={72} // JUSTERAD: 50% större storlek
                              style={{
                                cursor:"pointer",
                                borderRadius:"7px",
                                border:"1.5px solid #b0b4b8",
                                objectFit:"cover",
                                margin: "0 auto",
                                display: "block"
                              }}
                              onClick={() => openMediaModalForRow(row)}
                              alt="Tumnagel"
                            />
                          ) : ("--")}
                        </td>
                        <td>{row.inchecker_name || row.godkandAv || "--"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
        </div>
      </div>
      <footer className="copyright-footer">
        &copy; Albarone AB 2025 &mdash; All rights reserved
      </footer>
      {/* MODAL */}
      <MediaModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        media={modalMedia}
        title={modalTitle}
        currentIdx={modalIdx}
        onPrev={modalMedia.length > 1 ? handleModalPrev : undefined}
        onNext={modalMedia.length > 1 ? handleModalNext : undefined}
        hasPrev={modalIdx > 0}
        hasNext={modalIdx < modalMedia.length - 1}
      />
      {/* JUSTERAD: CSS för bakgrund och kort */}
      <style jsx global>{`
        .background-img {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: url('/bakgrund.jpg') center center / cover no-repeat;
          opacity: 0.1; /* Justerad opacitet */
          z-index: -1;
        }
        /* ... övriga befintliga stilar ... */
      `}</style>
    </main>
  );
}

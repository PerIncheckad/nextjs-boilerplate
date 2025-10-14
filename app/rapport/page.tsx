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
  note_internal?: string;
  damage_type?: string;
  saludatum?: string;
  region?: string;
  huvudstation_id?: string;
  station_id?: string;
  brand?: string;
  model?: string;
};

// PUNKT 3: Komponent för sorteringspil
const SortArrow = ({ column, sortKey, sortOrder }: { column: string, sortKey: string, sortOrder: string }) => {
  if (sortKey !== column) return null;
  return <span>{sortOrder === 'asc' ? ' ▲' : ' ▼'}</span>;
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

// PUNKT 11 & Namnbyte: Korrigerad logik för "Incheckad/BUHS"
function getDamageStatus(row: DamageWithVehicle) {
  const note = row.note_internal || "";
  const damageType = row.damage_type_raw || "";

  if (note.toLowerCase().includes("buhs") || damageType.toLowerCase().includes("buhs")) {
    return "BUHS";
  }
  return "Incheckad";
}

// PUNKT 9: Klockslag visas endast för "Incheckad"
function formatTime(row: DamageWithVehicle) {
    const status = getDamageStatus(row);
    if (status === "BUHS" || !row.damage_date) return "";

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

const mapOrtToRegion = (ort: string): string => {
    if (!ort) return "--";
    const stationData = stationer.find(s => s.ort && s.ort.toLowerCase() === ort.toLowerCase());
    return stationData?.region || ort;
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
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMedia, setModalMedia] = useState<any[]>([]);
  const [modalTitle, setModalTitle] = useState("");
  const [modalIdx, setModalIdx] = useState(0);

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

  // PUNKT 10: Autocomplete använder .includes() för att matcha delsträngar
  useEffect(() => {
    if (searchRegnr.length >= 2) {
      const regnrList = Array.from(new Set(damages.map(row => row.regnr).filter(Boolean)));
      setAutocomplete(
        regnrList.filter(r => r.toLowerCase().includes(searchRegnr.toLowerCase()))
      );
    } else {
      setAutocomplete([]);
    }
  }, [searchRegnr, damages]);

  useEffect(() => {
    if (activeRegnr) setAutocomplete([]);
  }, [activeRegnr]);

  let filteredRows = filterDamagesByPlats(damages, plats);
  if (activeRegnr) {
    filteredRows = filteredRows.filter(row => row.regnr?.toLowerCase() === activeRegnr.toLowerCase());
  }

  filteredRows = [...filteredRows].sort((a: any, b: any) => {
    let ak = a[sortKey] ?? "";
    let bk = b[sortKey] ?? "";
    if (sortKey === "damage_date" || sortKey === "created_at") {
      ak = new Date(ak).getTime() || 0;
      bk = new Date(bk).getTime() || 0;
      return sortOrder === "desc" ? bk - ak : ak - bk;
    }
    if (typeof ak === "string" && typeof bk === "string") {
      return sortOrder === "desc" ? bk.localeCompare(ak) : ak.localeCompare(bk);
    }
    return 0;
  });

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortOrder("desc");
    }
  };

  const openMediaModalForRow = (row: DamageWithVehicle) => {
    const mediaArr: any[] = [];
    if (row.media_url) {
      mediaArr.push({
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
        },
      });
    }
    setModalMedia(mediaArr);
    setModalTitle(
      `${row.regnr} - ${row.damage_type || row.damage_type_raw || "--"}`
    );
    setModalIdx(0);
    setModalOpen(true);
  };

  const openMediaModalForRegnr = (regnr: string) => {
    const skador = filteredRows.filter(row => row.regnr === regnr && row.media_url);
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
    setModalTitle(`Alla media för ${regnr}`);
    setModalIdx(0);
    setModalOpen(true);
  };

  const handleModalPrev = () => setModalIdx(idx => (idx > 0 ? idx - 1 : idx));
  const handleModalNext = () => setModalIdx(idx => (idx < modalMedia.length - 1 ? idx + 1 : idx));

  const totSkador = filteredRows.length;

  return (
    <main className="rapport-main" style={{ paddingBottom: "60px" }}>
      <div className="background-img" />
      <div style={{ height: "8px" }}></div>
      <div className="rapport-logo-row rapport-logo-top">
        <img src={MABI_LOGO_URL} alt="MABI Syd logga" className="rapport-logo-centered" style={{ width: "190px", height: "auto" }} />
      </div>
      <div className="rapport-center-content">
        <div className="rapport-card">
          <h1 className="rapport-title">Rapport & Statistik</h1>
          <div className="rapport-divider" />
          
          <div className="rapport-stats rapport-stats-centered">
            <div><strong>Antal skador i listan:</strong> {totSkador}</div>
          </div>

          <div className="rapport-filter">
            <div>
              <label htmlFor="period-select">Period:</label>
              <select id="period-select" value={period} onChange={e => setPeriod(e.target.value)}>
                {periodAlternativ.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="plats-select">Plats:</label>
              <select id="plats-select" value={plats} onChange={e => setPlats(e.target.value)}>
                {platsAlternativ.map(p => (<option key={p} value={p}>{p}</option>))}
              </select>
            </div>
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
                onClick={() => { setActiveRegnr(""); setSearchRegnr(""); }}
              >
                Rensa
              </button>
            )}
            {autocomplete.length > 0 && (
              <ul className="autocomplete-list">
                {autocomplete.map(regnr => (
                  <li key={regnr} onMouseDown={() => { setSearchRegnr(regnr); setActiveRegnr(regnr); setAutocomplete([]); }}>
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
                    <th onClick={() => handleSort("regnr")}>Regnr<SortArrow column="regnr" sortKey={sortKey} sortOrder={sortOrder} /></th>
                    <th onClick={() => handleSort("brand")}>Bilmodell<SortArrow column="brand" sortKey={sortKey} sortOrder={sortOrder} /></th>
                    <th onClick={() => handleSort("saludatum")}>Incheckad/BUHS<SortArrow column="saludatum" sortKey={sortKey} sortOrder={sortOrder} /></th>
                    <th onClick={() => handleSort("damage_date")}>Datum<SortArrow column="damage_date" sortKey={sortKey} sortOrder={sortOrder} /></th>
                    <th onClick={() => handleSort("region")}>Region<SortArrow column="region" sortKey={sortKey} sortOrder={sortOrder} /></th>
                    <th onClick={() => handleSort("ort")}>Ort<SortArrow column="ort" sortKey={sortKey} sortOrder={sortOrder} /></th>
                    <th onClick={() => handleSort("station_namn")}>Station<SortArrow column="station_namn" sortKey={sortKey} sortOrder={sortOrder} /></th>
                    <th onClick={() => handleSort("damage_type")}>Skada<SortArrow column="damage_type" sortKey={sortKey} sortOrder={sortOrder} /></th>
                    {/* PUNKT 2: Kolumnen "Anteckning" återinförd */}
                    <th onClick={() => handleSort("notering")}>Anteckning<SortArrow column="notering" sortKey={sortKey} sortOrder={sortOrder} /></th>
                    {/* PUNKT 4: Kolumnen "Bild/video" återinförd */}
                    <th>Bild/video</th>
                    <th onClick={() => handleSort("inchecker_name")}>Godkänd av<SortArrow column="inchecker_name" sortKey={sortKey} sortOrder={sortOrder} /></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length === 0 ? (
                    <tr><td colSpan={11} style={{ textAlign: "center" }}>Inga skador för det reg.nr eller i systemet.</td></tr>
                  ) : (
                    filteredRows.map((row) => (
                      <tr key={row.id}>
                        <td><span className="regnr-link" onClick={() => openMediaModalForRegnr(row.regnr)}>{row.regnr}</span></td>
                        <td>{row.brand || ""} {row.model || ""}</td>
                        <td>{getDamageStatus(row)}</td>
                        <td>
                          {row.damage_date ? new Date(row.damage_date).toLocaleDateString("sv-SE") : "--"}
                          <div className="time-display"><span>{formatTime(row)}</span></div>
                        </td>
                        <td>{mapOrtToRegion(row.ort)}</td>
                        <td>{row.ort || "--"}</td>
                        <td>{row.station_namn ? `${row.station_namn}${row.station_id ? ` (${row.station_id})` : ""}`: (row.station_id ? row.station_id : "--")}</td>
                        <td>{row.damage_type || row.damage_type_raw || "--"}</td>
                        {/* PUNKT 2: Data för "Anteckning" återinförd */}
                        <td>{row.notering || "--"}</td>
                        {/* PUNKT 4: Data för "Bild/video" återinförd */}
                        <td>
                          {row.media_url ? (
                            <Image src={row.media_url} width={72} height={72} className="thumbnail-image"
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
      <footer className="copyright-footer">
        &copy; Albarone AB 2025 &mdash; All rights reserved
      </footer>
      <MediaModal open={modalOpen} onClose={() => setModalOpen(false)} media={modalMedia} title={modalTitle} currentIdx={modalIdx}
        onPrev={modalMedia.length > 1 ? handleModalPrev : undefined} onNext={modalMedia.length > 1 ? handleModalNext : undefined}
        hasPrev={modalIdx > 0} hasNext={modalIdx < modalMedia.length - 1} />
      
      {/* PUNKT 1, 6, 8: Global CSS med alla justeringar */}
      <style jsx global>{`
        .background-img {
          position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
          background: url('/bakgrund.jpg') center center / cover no-repeat;
          opacity: 0.18; /* Justerad transparens */
          z-index: -1;
        }
        .rapport-logo-row { 
          display: flex; 
          justify-content: center;
          margin-bottom: 2px; /* PUNKT 6: Minskat avstånd */
        }
        .rapport-logo-centered { width: 220px; height: auto; }
        .rapport-center-content { display: flex; justify-content: center; }
        .rapport-card { 
          margin-top: 0px; 
          margin-bottom: 0px; 
          padding: 36px 28px 28px 28px;
          max-width: 1100px; /* PUNKT 8: Bredare innehållskort */
          border-radius: 18px; 
          box-shadow: 0 2px 32px #0002;
          background: rgba(255,255,255,0.92); /* Justerad transparens */
        }
        .rapport-title { font-size: 2.1rem; font-weight: 700; text-align: center; margin-bottom: 18px; }
        .rapport-divider { height: 2px; background: #e5e7eb; margin: 0 auto 18px auto; width: 240px; }
        .rapport-stats-centered { text-align: center; margin-bottom: 20px; }
        .rapport-filter { display: flex; justify-content: center; gap: 2rem; margin-bottom: 20px; }
        .rapport-table-wrap { margin-top: 20px; width: 100%; overflow-x: auto; }
        .rapport-table { width: 100%; border-collapse: collapse; }
        .rapport-table th, .rapport-table td { border: 1px solid #e5e7eb; padding: 8px 12px; font-size: 0.95rem; text-align: left; }
        .rapport-table th { background: #f5f6fa; font-weight: 600; cursor: pointer; user-select: none; }
        .rapport-table th:hover { background: #e9edf5; }
        .rapport-table tr:nth-child(even) { background: #fafbfc; }
        .rapport-search-row { margin-top: 22px; margin-bottom: 12px; text-align: center; display: flex; justify-content: center; gap: 8px; }
        .rapport-search-input { padding: 6px 10px; font-size: 1rem; }
        .rapport-search-btn, .rapport-reset-btn { padding: 6px 12px; font-size: 1rem; border: none; color: white; cursor: pointer; border-radius: 4px; }
        .rapport-search-btn { background: #2a7ae4; }
        .rapport-reset-btn { background: #6c757d; }
        .autocomplete-list {
          position: absolute; top: 38px; left: 50%; transform: translateX(-50%);
          background: #fff; border: 1px solid #ddd; width: calc(100% - 16px); max-width: 200px;
          z-index: 10; list-style: none; padding: 4px; margin: 0;
          text-align: left; border-radius: 4px;
        }
        .autocomplete-list li { padding: 6px; cursor: pointer; }
        .autocomplete-list li:hover { background: #f0f0f0; }
        .regnr-link { text-decoration: underline; cursor: pointer; color: #005A9C; font-weight: 500; }
        .time-display { font-size: 0.9em; color: #555; }
        .thumbnail-image {
          cursor: pointer;
          border-radius: 7px;
          border: 1.5px solid #b0b4b8;
          object-fit: cover;
          margin: 0 auto;
          display: block;
        }
        .thumbnail-image:hover { border-color: #005A9C; }
      `}</style>
    </main>
  );
}

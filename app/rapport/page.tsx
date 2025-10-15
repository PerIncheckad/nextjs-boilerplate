'use client';
import { useEffect, useState, useMemo } from "react";
// import Image from "next/image"; // === ÄNDRING: Tas bort då den inte längre används ===
import stationer from '../../data/stationer.json';
import { supabase } from "@/lib/supabase";
import MediaModal from "@/components/MediaModal";

// ==============================
// Typer och konstanter
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
  photo_urls?: string[];
  created_at: string;
  note_internal?: string;
  damage_type?: string;
  saludatum?: string;
  huvudstation_id?: string;
  station_id?: string;
  brand?: string;
  model?: string;
  region?: string;
};

const SortArrow = ({ column, sortKey, sortOrder }: { column: string, sortKey: string, sortOrder: string }) => {
  if (sortKey !== column) return null;
  return <span style={{ fontSize: '0.8em', verticalAlign: 'middle' }}>{sortOrder === 'asc' ? ' ▲' : ' ▼'}</span>;
};

const periodAlternativ = [
  { value: "all", label: "All tid" },
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
  // @ts-ignore
  if (st.type === "station") return `${st.namn} (${st.station_id})`;
  return st.namn;
});

// ==============================
// Hjälpfunktioner
// ==============================

function getDamageStatus(row: DamageWithVehicle): 'Incheckad' | 'BUHS' {
  if (row.inchecker_name || row.godkandAv) {
    return "Incheckad";
  }
  return "BUHS";
}

function formatCheckinTime(row: DamageWithVehicle): string {
  if (getDamageStatus(row) !== 'Incheckad' || !row.created_at) {
    return "";
  }
  try {
    const d = new Date(row.created_at);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Stockholm" });
  } catch {
    return "";
  }
}

const mapOrtToRegion = (ort: string): string => {
    if (!ort) return "--";
    const ortLower = ort.toLowerCase();
    
    if (['halmstad', 'varberg', 'falkenberg'].includes(ortLower)) return 'Norr';
    if (['helsingborg', 'ängelholm'].includes(ortLower)) return 'Mitt';
    if (['malmö', 'trelleborg', 'lund'].includes(ortLower)) return 'Syd';
    
    return "--";
};

// ==============================
// Huvudkomponent
// ==============================

export default function RapportPage() {
  const [allDamages, setAllDamages] = useState<DamageWithVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchRegnr, setSearchRegnr] = useState("");
  const [activeRegnr, setActiveRegnr] = useState("");
  const [period, setPeriod] = useState("all");
  const [plats, setPlats] = useState(platsAlternativ[0]);
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
        const { data: damagesData, error: damagesError } = await supabase
          .from("damages")
          .select('*')
          .order("created_at", { ascending: false }); // Sorterar på created_at för att få senaste först
        if (damagesError) throw damagesError;

        const { data: vehiclesData, error: vehiclesError } = await supabase
          .from("vehicles")
          .select("regnr, brand, model");
        if (vehiclesError) throw vehiclesError;

        const vehiclesMap = new Map(vehiclesData.map(v => [v.regnr, v]));
        
        const combinedData = damagesData.map((damage: any) => {
          const vehicle = vehiclesMap.get(damage.regnr);
          return {
            ...damage,
            brand: vehicle?.brand,
            model: vehicle?.model,
            region: mapOrtToRegion(damage.ort),
          };
        });

        setAllDamages(combinedData);
      } catch (e: any) {
        setError("Misslyckades hämta data från Supabase: " + e.message);
      } finally {
        setLoading(false);
      }
    }
    fetchAllData();
  }, []);

  const filteredRows = useMemo(() => {
    let items = [...allDamages];

    const st = stationer.find(s => plats === s.namn || (s.type === "station" && plats === `${s.namn} (${s.station_id})`));
    if (st && st.type !== 'total') {
        // @ts-ignore
        if (st.type === "region") items = items.filter(d => d.region === st.namn.split(" ")[1]);
        // @ts-ignore
        else if (st.type === "tot") items = items.filter(d => d.huvudstation_id === st.huvudstation_id);
        // @ts-ignore
        else if (st.type === "station") items = items.filter(d => d.station_id === st.station_id);
    }
    
    if (activeRegnr) {
      items = items.filter(row => row.regnr?.toLowerCase().includes(activeRegnr.toLowerCase()));
    }

    return items.sort((a: any, b: any) => {
      if (sortKey === 'status') {
        const aStatus = getDamageStatus(a);
        const bStatus = getDamageStatus(b);
        return sortOrder === 'desc' ? bStatus.localeCompare(aStatus) : aStatus.localeCompare(bStatus);
      }

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
  }, [allDamages, plats, activeRegnr, sortKey, sortOrder]);

  const [autocomplete, setAutocomplete] = useState<string[]>([]);
  useEffect(() => {
    if (searchRegnr.length >= 2) {
      const regnrList = Array.from(new Set(allDamages.map(row => row.regnr).filter(Boolean)));
      setAutocomplete(
        regnrList.filter(r => r.toLowerCase().includes(searchRegnr.toLowerCase()))
      );
    } else {
      setAutocomplete([]);
    }
  }, [searchRegnr, allDamages]);

  const handleSort = (key: string) => {
    if (sortKey === key) setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortOrder("desc"); }
  };

  const openMediaModalForRow = (row: DamageWithVehicle) => {
    const mediaArr = (row.photo_urls || []).map(url => ({
      url: url,
      type: "image",
      metadata: {
        date: row.damage_date ? new Date(row.damage_date).toLocaleDateString("sv-SE") : "--", time: formatCheckinTime(row),
        damageType: row.damage_type || row.damage_type_raw || "--", station: row.station_namn || row.station_id || "--",
        note: row.notering || "", inchecker: row.inchecker_name || row.godkandAv || "",
        documentationDate: row.created_at ? new Date(row.created_at).toLocaleDateString("sv-SE") : undefined,
        damageDate: row.damage_date ? new Date(row.damage_date).toLocaleDateString("sv-SE") : undefined,
      },
    }));

    if (mediaArr.length === 0) return;

    setModalMedia(mediaArr);
    setModalTitle(`${row.regnr} - ${row.damage_type || row.damage_type_raw || "--"}`);
    setModalIdx(0);
    setModalOpen(true);
  };
  
  const openMediaModalForRegnr = (regnr: string) => {
    const skador = filteredRows.filter(row => row.regnr === regnr && row.photo_urls && row.photo_urls.length > 0);
    const mediaArr = skador.flatMap(row => 
        (row.photo_urls || []).map(url => ({
            url: url,
            type: "image",
            metadata: {
                date: row.damage_date ? new Date(row.damage_date).toLocaleDateString("sv-SE") : "--", time: formatCheckinTime(row),
                damageType: row.damage_type || row.damage_type_raw || "--", station: row.station_namn || row.station_id || "--",
                note: row.notering || "", inchecker: row.inchecker_name || row.godkandAv || "",
                documentationDate: row.created_at ? new Date(row.created_at).toLocaleDateString("sv-SE") : undefined,
                damageDate: row.damage_date ? new Date(row.damage_date).toLocaleDateString("sv-SE") : undefined,
            }
        }))
    );
    
    if (mediaArr.length === 0) return;

    setModalMedia(mediaArr);
    setModalTitle(`Alla media för ${regnr}`);
    setModalIdx(0);
    setModalOpen(true);
  };
  const handleModalPrev = () => setModalIdx(idx => (idx > 0 ? idx - 1 : idx));
  const handleModalNext = () => setModalIdx(idx => (idx < modalMedia.length - 1 ? idx + 1 : idx));

  const totIncheckningar = allDamages.length;
  const totSkador = allDamages.filter(d => getDamageStatus(d) === 'Incheckad').length;
  const skadeprocent = totIncheckningar ? Math.round((totSkador / totIncheckningar) * 100) : 0;
  const senasteIncheckning = allDamages.length > 0 ? new Date(allDamages[0].created_at).toLocaleDateString("sv-SE") : "--";

  return (
    <main className="rapport-main">
      <div className="rapport-logo-row">
        <img src={MABI_LOGO_URL} alt="MABI Syd logga" className="rapport-logo-centered" />
      </div>
      <div className="rapport-card">
        <h1 className="rapport-title">Rapport & Statistik</h1>
        <div className="rapport-divider" />
        
        <div className="rapport-stats rapport-stats-centered">
          <div><strong>Totalt incheckningar (all tid):</strong> {totIncheckningar}</div>
          <div><strong>Totalt skador (all tid):</strong> {totSkador}</div>
          <div><strong>Skadeprocent (all tid):</strong> {skadeprocent}%</div>
          <div><strong>Senaste incheckning:</strong> {senasteIncheckning}</div>
          <hr style={{width: '50%', margin: '1rem auto', border: 'none', borderTop: '1px solid #ddd'}}/>
          <div><strong>Antal träffar i listan:</strong> {filteredRows.length}</div>
        </div>

        <div className="rapport-filter">
          <div>
            <label htmlFor="period-select">Period:</label>
            <select id="period-select" value={period} onChange={e => setPeriod(e.target.value)}>
              {periodAlternativ.map(opt => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
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
            type="text" placeholder="SÖK REG.NR" value={searchRegnr}
            onChange={e => setSearchRegnr(e.target.value.toUpperCase())} className="rapport-search-input" autoComplete="off"
          />
          {autocomplete.length > 0 && (
            <ul className="autocomplete-list" style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #ddd', zIndex: 10, listStyle: 'none', padding: '4px', margin: 0, textAlign: 'left', borderRadius: '4px' }}>
              {autocomplete.map(regnr => (
                <li key={regnr} onMouseDown={() => { setSearchRegnr(regnr); setActiveRegnr(regnr); setAutocomplete([]); }} style={{ padding: '6px', cursor: 'pointer' }}>
                  {regnr}
                </li>
              ))}
            </ul>
          )}
          <button className="rapport-search-btn" onClick={() => setActiveRegnr(searchRegnr.trim())} disabled={!searchRegnr.trim()}>Sök</button>
          {activeRegnr && (<button className="rapport-reset-btn" onClick={() => { setActiveRegnr(""); setSearchRegnr(""); }}>Rensa</button>)}
        </div>
        
        {loading ? (<div>Hämtar data...</div>) 
         : error ? (<div style={{ color: "red" }}>{error}</div>) 
         : (
          <div className="rapport-table-wrap">
            <table className="rapport-table">
              <thead>
                <tr>
                  <th onClick={() => handleSort("regnr")}>Regnr<SortArrow column="regnr" sortKey={sortKey} sortOrder={sortOrder} /></th>
                  <th onClick={() => handleSort("brand")}>Bilmodell<SortArrow column="brand" sortKey={sortKey} sortOrder={sortOrder} /></th>
                  <th onClick={() => handleSort("status")}>Källa<SortArrow column="status" sortKey={sortKey} sortOrder={sortOrder} /></th>
                  <th onClick={() => handleSort("created_at")} className="datum-col">Datum<SortArrow column="created_at" sortKey={sortKey} sortOrder={sortOrder} /></th>
                  <th onClick={() => handleSort("region")} className="location-group">Region<SortArrow column="region" sortKey={sortKey} sortOrder={sortOrder} /></th>
                  <th onClick={() => handleSort("ort")} className="location-group">Ort<SortArrow column="ort" sortKey={sortKey} sortOrder={sortOrder} /></th>
                  <th onClick={() => handleSort("station_namn")} className="location-group">Station<SortArrow column="station_namn" sortKey={sortKey} sortOrder={sortOrder} /></th>
                  <th onClick={() => handleSort("damage_type")}>Skada<SortArrow column="damage_type" sortKey={sortKey} sortOrder={sortOrder} /></th>
                  <th onClick={() => handleSort("notering")}>Anteckning<SortArrow column="notering" sortKey={sortKey} sortOrder={sortOrder} /></th>
                  <th>Bild/video</th>
                  <th onClick={() => handleSort("inchecker_name")}>Godkänd av<SortArrow column="inchecker_name" sortKey={sortKey} sortOrder={sortOrder} /></th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr><td colSpan={11} style={{ textAlign: "center" }}>Inga skador för det reg.nr eller valda filtret.</td></tr>
                ) : (
                  filteredRows.map((row) => (
                    <tr key={row.id}>
                      <td className="regnr-col"><span className="regnr-link" style={{ textDecoration: 'underline', cursor: 'pointer' }} onClick={() => openMediaModalForRegnr(row.regnr)}>{row.regnr}</span></td>
                      <td>{row.brand || ""} {row.model || ""}</td>
                      <td>{getDamageStatus(row)}</td>
                      <td className="datum-col">
                        {row.created_at ? new Date(row.created_at).toLocaleDateString("sv-SE") : "--"}
                        <div className="datum-klocka">{formatCheckinTime(row)}</div>
                      </td>
                      <td className="location-group region-section">{row.region}</td>
                      <td className="location-group">{row.ort || "--"}</td>
                      <td className="location-group">{row.station_namn || "--"}</td>
                      <td>{row.damage_type || row.damage_type_raw || "--"}</td>
                      <td className="kommentar-col">{row.notering || "--"}</td>
                      <td className="centered-cell">
                        {/* === ÄNDRING: Bytt till vanlig <img>-tagg === */}
                        {row.photo_urls && row.photo_urls.length > 0 ? (
                          <img 
                            src={row.photo_urls[0]} 
                            width={72} 
                            height={72} 
                            className="media-thumb"
                            onClick={() => openMediaModalForRow(row)} 
                            alt={`Skadebild för ${row.regnr}`}
                            style={{ cursor: 'pointer', objectFit: 'cover', borderRadius: '4px' }}
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
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
        )}
      </div>
      <footer className="copyright-footer">&copy; Albarone AB 2025 &mdash; All rights reserved</footer>
      <MediaModal open={modalOpen} onClose={() => setModalOpen(false)} media={modalMedia} title={modalTitle} currentIdx={modalIdx}
        onPrev={modalMedia.length > 1 ? handleModalPrev : undefined} onNext={modalMedia.length > 1 ? handleModalNext : undefined}
        hasPrev={modalIdx > 0} hasNext={modalIdx < modalMedia.length - 1} />
    </main>
  );
}

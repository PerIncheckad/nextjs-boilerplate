'use client';

import React, { useEffect, useState, useMemo, useCallback, Fragment } from 'react';
import { supabase } from '@/lib/supabase';
import { getVehicleStatus, VehicleStatusResult, DamageRecord, HistoryRecord } from '@/lib/vehicle-status';

// =================================================================
// 1. CONSTANTS
// =================================================================

const MABI_LOGO_URL = "https://ufioaijcmaujlvmveyra.supabase.co/storage/v1/object/public/MABI%20Syd%20logga/MABI%20Syd%20logga%202.png";
const BACKGROUND_IMAGE_URL = "https://ufioaijcmaujlvmveyra.supabase.co/storage/v1/object/public/MB%20300%20SL%20Roadster%201962/MB%20300-SL-Roadster_1962.jpg";

// Warning banner styles for avvikelser
const WARNING_BANNER_STYLE: React.CSSProperties = {
  backgroundColor: '#B30E0E',
  color: 'white',
  padding: '0.5rem 1rem',
  borderRadius: '4px',
  marginBottom: '0.25rem',
};

// Event card styles for recent events
const EVENT_CARD_STYLE: React.CSSProperties = {
  marginBottom: '1rem',
  padding: '1rem',
  backgroundColor: 'rgba(255,255,255,0.9)',
  borderRadius: '8px',
};

const EVENT_DATE_STYLE: React.CSSProperties = {
  color: '#666',
  marginBottom: '0.5rem',
};

const EVENT_TITLE_STYLE: React.CSSProperties = {
  fontWeight: 'bold',
  marginBottom: '0.5rem',
};

// =================================================================
// 2. HELPER FUNCTIONS
// =================================================================

const capitalizeFirstLetter = (str: string): string => {
  return str.charAt(0).toUpperCase() + str.slice(1);
};

const getFirstNameFromEmail = (email: string): string => {
  if (!email) return 'Okänd';
  const namePart = email.split('@')[0];
  const firstName = namePart.split('.')[0];
  return capitalizeFirstLetter(firstName);
};

const getFullNameFromEmail = (email: string): string => {
  if (!email) return 'Okänd';
  const namePart = email.split('@')[0];
  const parts = namePart.split('.');
  if (parts.length >= 2) {
    const firstName = capitalizeFirstLetter(parts[0]);
    const lastName = capitalizeFirstLetter(parts[1]);
    return `${firstName} ${lastName}`;
  }
  return capitalizeFirstLetter(parts[0]);
};

/**
 * Escape HTML special characters to prevent XSS
 */
const escapeHtml = (str: string | null | undefined): string => {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

/**
 * Check if a Saludatum is at risk (past or within 10 days from today)
 */
const isSaludatumAtRisk = (saludatumStr: string | null | undefined): boolean => {
  if (!saludatumStr || saludatumStr === 'Ingen information' || saludatumStr === '---') return false;
  
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const saludatumDate = new Date(saludatumStr);
    saludatumDate.setHours(0, 0, 0, 0);
    
    const diffDays = Math.floor((saludatumDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    // Risk if past (< 0) or within 10 days (0-10)
    return diffDays <= 10;
  } catch {
    return false;
  }
};

/**
 * Build the public media URL for a damage based on regnr, damage date, and folder.
 * Returns the URL path or null if no valid date/folder is available.
 * 
 * Handles two folder structures:
 * 1. From /check: {REGNR}/{REGNR}-{YYYYMMDD}/{folder}
 * 2. From /nybil: {REGNR}/SKADOR/{YYYYMMDD}-{details}-NYBIL/
 * 
 * @param regnr - Vehicle registration number (e.g., "ABC123")
 * @param datumStr - Damage date in YYYY-MM-DD format or "---" if unknown
 * @param folder - Event folder name or full path
 * @returns URL path to public media browser, or null if regnr is empty
 */
const buildDamageMediaUrl = (regnr: string, datumStr: string | null | undefined, folder?: string): string | null => {
  if (!regnr) return null;
  
  const normalizedReg = regnr.toUpperCase().replace(/\s/g, '');
  
  // If folder contains full path (starts with REGNR or contains SKADOR), use it directly
  // This handles nybil damages: ABC123/SKADOR/20251204-repa-hoger-dorr-per-NYBIL
  if (folder && (folder.includes('/SKADOR/') || folder.startsWith(normalizedReg + '/'))) {
    return `/public-media/${folder.split('/').map(encodeURIComponent).join('/')}`;
  }
  
  // If no valid date, link to the vehicle's root folder
  if (!datumStr || datumStr === '---') {
    return `/public-media/${encodeURIComponent(normalizedReg)}`;
  }
  
  // Convert YYYY-MM-DD to YYYYMMDD
  const datePart = datumStr.replace(/-/g, '');
  
  // Validate it looks like a valid date (8 digits)
  // Note: The date comes from formatDate() in lib/vehicle-status.ts which ensures proper formatting
  if (!/^\d{8}$/.test(datePart)) {
    return `/public-media/${encodeURIComponent(normalizedReg)}`;
  }
  
  // Build folder path for /check damages: /public-media/{REGNR}/{REGNR}-{YYYYMMDD}/{folder}
  const basePath = `/public-media/${encodeURIComponent(normalizedReg)}/${encodeURIComponent(`${normalizedReg}-${datePart}`)}`;
  
  // If folder is provided, append it
  if (folder) {
    return `${basePath}/${encodeURIComponent(folder)}`;
  }
  
  return basePath;
};

// =================================================================
// 3. MAIN COMPONENT
// =================================================================

export default function StatusForm() {
  // User state
  const [firstName, setFirstName] = useState('');
  const [fullName, setFullName] = useState('');
  
  // Search state
  const [regInput, setRegInput] = useState('');
  const [allRegistrations, setAllRegistrations] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Vehicle data state
  const [vehicleStatus, setVehicleStatus] = useState<VehicleStatusResult | null>(null);
  const [initialUrlLoadHandled, setInitialUrlLoadHandled] = useState(false);
  
  // History section state
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<'all' | 'incheckning' | 'nybil' | 'manual'>('all');
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  
  // Nybil modal state
  const [showNybilModal, setShowNybilModal] = useState(false);
  
  // Print options state
  const [includeHistoryInPrint, setIncludeHistoryInPrint] = useState(false);
  const [includeDetailedHistory, setIncludeDetailedHistory] = useState(false);

  const normalizedReg = useMemo(() => regInput.toUpperCase().replace(/\s/g, ''), [regInput]);
  const currentYear = useMemo(() => new Date().getFullYear(), []);

  // Fetch vehicle data
  const fetchVehicleData = useCallback(async (reg: string) => {
    setLoading(true);
    setVehicleStatus(null);
    
    try {
      const normalized = reg.toUpperCase().replace(/\s/g, '');
      const result = await getVehicleStatus(normalized);
      setVehicleStatus(result);
    } catch (error) {
      console.error("Fetch vehicle data error:", error);
      setVehicleStatus({
        found: false,
        source: 'none',
        vehicle: null,
        damages: [],
        history: [],
        nybilPhotos: null,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  // Health check: log Supabase URL
  useEffect(() => {
    console.log('[/status] NEXT_PUBLIC_SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
  }, []);

  // Get user info
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const email = user?.email || '';
      setFirstName(getFirstNameFromEmail(email));
      setFullName(getFullNameFromEmail(email));
    };
    getUser();
  }, []);

  // Fetch all registrations for autocomplete
  useEffect(() => {
    async function fetchAllRegistrations() {
      const { data, error } = await supabase.rpc('get_all_allowed_plates');
      if (error) console.error("Could not fetch registrations via RPC:", error);
      else if (data) setAllRegistrations(data.map((item: any) => item.regnr));
    }
    fetchAllRegistrations();
  }, []);

  // Update suggestions based on input
  useEffect(() => {
    if (regInput.length >= 2 && allRegistrations.length > 0) {
      const filteredSuggestions = allRegistrations
        .filter(r => r && r.toUpperCase().startsWith(regInput.toUpperCase()));
      setSuggestions(filteredSuggestions);
    } else {
      setSuggestions([]);
    }
  }, [regInput, allRegistrations]);

  // Handle URL parameter and search debounce
  useEffect(() => {
    if (!initialUrlLoadHandled) {
      const params = new URLSearchParams(window.location.search);
      const regFromUrl = params.get('reg');
      if (regFromUrl) {
        const normalized = regFromUrl.toUpperCase().replace(/\s/g, '');
        setRegInput(normalized);
        fetchVehicleData(normalized);
        setInitialUrlLoadHandled(true);
        return;
      }
      setInitialUrlLoadHandled(true);
    }

    const normalizedReg = regInput.toUpperCase().replace(/\s/g, '');
    if (normalizedReg.length < 5) {
      setVehicleStatus(null);
      return;
    }

    const timer = setTimeout(() => {
      fetchVehicleData(normalizedReg);
    }, 400);

    return () => clearTimeout(timer);
  }, [regInput, fetchVehicleData, initialUrlLoadHandled]);

  // Filter history based on selected filter
  const filteredHistory = useMemo(() => {
    if (!vehicleStatus?.history) return [];
    if (historyFilter === 'all') return vehicleStatus.history;
    return vehicleStatus.history.filter(h => h.typ === historyFilter);
  }, [vehicleStatus?.history, historyFilter]);

  // Toggle functions for expandable history
  const toggleEvent = useCallback((eventId: string) => {
    setExpandedEvents(prev => {
      const next = new Set(prev);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    if (vehicleStatus?.history) {
      setExpandedEvents(new Set(vehicleStatus.history.map(e => e.id)));
    }
  }, [vehicleStatus?.history]);

  const collapseAll = useCallback(() => {
    setExpandedEvents(new Set());
  }, []);

  // Handle print: add/remove class based on includeHistoryInPrint and includeDetailedHistory
  useEffect(() => {
    const handleBeforePrint = () => {
      if (includeHistoryInPrint) {
        document.body.classList.add('include-history-print');
        if (includeDetailedHistory) {
          document.body.classList.add('include-detailed-history-print');
        } else {
          document.body.classList.remove('include-detailed-history-print');
        }
      } else {
        document.body.classList.remove('include-history-print');
        document.body.classList.remove('include-detailed-history-print');
      }
    };

    window.addEventListener('beforeprint', handleBeforePrint);
    return () => window.removeEventListener('beforeprint', handleBeforePrint);
  }, [includeHistoryInPrint, includeDetailedHistory]);

  // Helper to build nybil photos title
  const getNybilPhotosTitle = useCallback(() => {
    if (!vehicleStatus?.nybilPhotos) return '';
    const regnr = vehicleStatus.vehicle?.regnr || normalizedReg;
    const datum = vehicleStatus.nybilPhotos.registreringsdatum;
    const av = vehicleStatus.nybilPhotos.registreradAv;
    return `${regnr} registrerad ${datum} av ${av}`;
  }, [vehicleStatus, normalizedReg]);

  return (
    <Fragment>
      <GlobalStyles backgroundUrl={BACKGROUND_IMAGE_URL} />
      
      <div className="status-form">
        <div className="main-header">
          <img src={MABI_LOGO_URL} alt="MABI Logo" className="main-logo" />
          <h1 className="page-title">STATUS</h1>
          {fullName && <p className="user-info">Inloggad: {fullName}</p>}
        </div>

        {/* Search Section */}
        <Card className="search-form-card">
          <SectionHeader title="Sök fordon" />
          <div style={{ position: 'relative' }}>
            <Field label="Registreringsnummer">
              <input
                type="text"
                value={regInput}
                onChange={(e) => setRegInput(e.target.value)}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                placeholder="ABC 123"
                className="reg-input"
              />
            </Field>
            {showSuggestions && suggestions.length > 0 && (
              <div className="suggestions-dropdown">
                {suggestions.slice(0, 10).map(s => (
                  <div
                    key={s}
                    className="suggestion-item"
                    onMouseDown={() => { setRegInput(s); setShowSuggestions(false); }}
                  >
                    {s}
                  </div>
                ))}
              </div>
            )}
          </div>
          {loading && <p className="loading-text">Söker...</p>}
          {vehicleStatus && !vehicleStatus.found && !loading && regInput.length >= 5 && (
            <p className="not-found-text">Fordonet hittades inte</p>
          )}
          {vehicleStatus?.found && vehicleStatus.vehicle && vehicleStatus.vehicle.saludatum !== '---' && (
            <div style={{ marginTop: '1rem', textAlign: 'center' }}>
              <p 
                style={{ 
                  margin: 0, 
                  fontSize: '0.875rem', 
                  fontWeight: 500,
                  color: isSaludatumAtRisk(vehicleStatus.vehicle.saludatum) ? 'var(--color-danger)' : 'inherit'
                }}
              >
                Saludatum: {vehicleStatus.vehicle.saludatum}
              </p>
            </div>
          )}
        </Card>

        {/* Print Header (hidden on screen, visible on print) */}
        {vehicleStatus?.found && vehicleStatus.vehicle && (
          <div className="print-header">
            <img src={MABI_LOGO_URL} alt="MABI Syd" className="print-logo-img" />
            <h1 className="print-regnr">{vehicleStatus.vehicle.regnr}</h1>
            {vehicleStatus.nybilPhotos && (
              <p className="print-subtitle">
                Registrerad {vehicleStatus.nybilPhotos.registreringsdatum} av {vehicleStatus.nybilPhotos.registreradAv}
                {vehicleStatus.vehicle.bilenStarNu && vehicleStatus.vehicle.bilenStarNu !== '---' && 
                  ` i ${vehicleStatus.vehicle.bilenStarNu.split(' / ')[0]}`}
              </p>
            )}
          </div>
        )}

        {/* Nybil Reference Photos Section */}
        {vehicleStatus?.found && vehicleStatus.nybilPhotos?.photoUrls?.length > 0 && (
          <Card className="nybil-photos-card">
            <SectionHeader title={getNybilPhotosTitle()} />
            <div className="nybil-photos-grid">
              {vehicleStatus.nybilPhotos.photoUrls.map((url, index) => (
                <a 
                  key={index} 
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="nybil-photo-item"
                >
                  <img 
                    src={url} 
                    alt={`Nybilsfoto ${index + 1}`} 
                    className="nybil-photo"
                  />
                </a>
              ))}
            </div>
            {vehicleStatus.vehicle?.saludatum && vehicleStatus.vehicle.saludatum !== '---' && (
              <div style={{ textAlign: 'center', marginTop: '1rem' }}>
                <p 
                  style={{ 
                    margin: 0, 
                    fontSize: '0.875rem', 
                    fontWeight: 500,
                    color: isSaludatumAtRisk(vehicleStatus.vehicle.saludatum) ? 'var(--color-danger)' : 'inherit'
                  }}
                >
                  Saludatum: {vehicleStatus.vehicle.saludatum}
                </p>
              </div>
            )}
            
            {/* Button to show complete nybil registration */}
            {vehicleStatus.nybilFullData && (
              <div className="nybil-link-button" style={{ textAlign: 'center', marginTop: '1rem' }}>
                <button 
                  onClick={() => setShowNybilModal(true)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#1a73e8',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    textDecoration: 'underline',
                    padding: 0
                  }}
                >
                  📋 Visa komplett nybilsregistrering
                </button>
              </div>
            )}
          </Card>
        )}

        {/* Recent Events Section - Senaste händelser */}
        {vehicleStatus?.found && vehicleStatus.history && vehicleStatus.history.length > 0 && (
          <Card className="recent-events-card">
            <SectionHeader title="Senaste händelser" />
            
            {vehicleStatus.history.slice(0, 2).map((event) => {
              // Kolla om det finns avvikelser
              const hasAvvikelser = 
                (event.avvikelser?.nyaSkador && event.avvikelser.nyaSkador > 0) ||
                event.avvikelser?.garInteAttHyraUt ||
                event.avvikelser?.varningslampaPa ||
                event.avvikelser?.rekondBehov ||
                event.avvikelser?.husdjurSanering ||
                event.avvikelser?.rokningSanering ||
                event.avvikelser?.insynsskyddSaknas ||
                event.nybilAvvikelser?.harSkadorVidLeverans ||
                event.nybilAvvikelser?.ejRedoAttHyrasUt;
              
              return (
                <div key={event.id} style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: '8px' }}>
                  <div style={{ color: '#666', marginBottom: '0.5rem' }}>
                    📅 {event.datum}
                  </div>
                  <div style={{ fontWeight: 'normal', fontSize: '1rem' }}>
                    {event.typ === 'incheckning' 
                      ? `Incheckad av ${event.utfordAv}${event.plats ? ` på ${event.plats}` : ''}`
                      : event.typ === 'buhs_skada' && event.buhsSkadaDetaljer?.skadetyp
                        ? event.buhsSkadaDetaljer.skadetyp
                        : `Nybilsregistrering av ${event.utfordAv}`
                    }
                    {hasAvvikelser && ' ⚠️'}
                  </div>
                </div>
              );
            })}
            
            <p style={{ textAlign: 'center', color: '#666', fontSize: '0.9rem' }}>
              Detaljer och fler poster i sektionen <a href="#history-section" style={{ color: '#1a73e8' }}>Historik</a> nedan
            </p>
          </Card>
        )}

        {/* Vehicle Info Section (Executive Summary) */}
        {vehicleStatus?.found && vehicleStatus.vehicle && (
          <Card>
            <SectionHeader title="Fordonsinformation" />
            <div className="info-grid">
              <span className="info-label hide-in-print">Reg.nr</span>
              <span className="info-value hide-in-print">{vehicleStatus.vehicle.regnr}</span>
              <InfoRow label="Bilmärke & Modell" value={vehicleStatus.vehicle.bilmarkeModell} />
              <InfoRow label="Senast incheckad" value={vehicleStatus.vehicle.bilenStarNu} />
              <InfoRow label="Mätarställning" value={vehicleStatus.vehicle.matarstallning} />
              <InfoRow label="Däck som sitter på" value={vehicleStatus.vehicle.hjultyp} />
              <InfoRow label="Planerad station" value={vehicleStatus.vehicle.planeradStation} />
              <InfoRow label="Drivmedel" value={vehicleStatus.vehicle.drivmedel} />
              {vehicleStatus.vehicle.vaxel !== '---' && <InfoRow label="Växellåda" value={vehicleStatus.vehicle.vaxel} />}
              {vehicleStatus.vehicle.stoldGps !== '---' && <InfoRow label="Stöld-GPS monterad" value={vehicleStatus.vehicle.stoldGps} />}
              <InfoRow label="Serviceintervall" value={vehicleStatus.vehicle.serviceintervall} />
              <InfoRow label="Max km/månad" value={vehicleStatus.vehicle.maxKmManad} />
              <InfoRow label="Avgift över-km" value={vehicleStatus.vehicle.avgiftOverKm} />
              <InfoRow label="Antal registrerade skador" value={vehicleStatus.vehicle.antalSkador.toString()} />
              <InfoRow label="Saludatum" value={vehicleStatus.vehicle.saludatum || '---'} />
              <InfoRow 
                label="Såld" 
                value={
                  vehicleStatus.vehicle.isSold === true 
                    ? 'Ja' 
                    : vehicleStatus.vehicle.isSold === false 
                      ? 'Nej' 
                      : '---'
                } 
              />
            </div>
          </Card>
        )}

        {/* Equipment Storage Section */}
        {vehicleStatus?.found && vehicleStatus.vehicle && (
          vehicleStatus.vehicle.hjulForvaringInfo !== '---' ||
          vehicleStatus.vehicle.reservnyckelInfo !== '---' ||
          vehicleStatus.vehicle.laddkablarForvaringInfo !== '---' ||
          vehicleStatus.vehicle.instruktionsbokForvaringInfo !== '---' ||
          vehicleStatus.vehicle.cocForvaringInfo !== '---'
        ) && (
          <Card>
            <SectionHeader title="Förvaring" />
            <div className="info-grid">
              {vehicleStatus.vehicle.hjulForvaringInfo !== '---' && <InfoRow label="Hjulförvaring" value={vehicleStatus.vehicle.hjulForvaringInfo} />}
              {vehicleStatus.vehicle.reservnyckelInfo !== '---' && <InfoRow label="Reservnyckel" value={vehicleStatus.vehicle.reservnyckelInfo} />}
              {vehicleStatus.vehicle.laddkablarForvaringInfo !== '---' && <InfoRow label="Laddkablar" value={vehicleStatus.vehicle.laddkablarForvaringInfo} />}
              {vehicleStatus.vehicle.instruktionsbokForvaringInfo !== '---' && <InfoRow label="Instruktionsbok" value={vehicleStatus.vehicle.instruktionsbokForvaringInfo} />}
              {vehicleStatus.vehicle.cocForvaringInfo !== '---' && <InfoRow label="COC-dokument" value={vehicleStatus.vehicle.cocForvaringInfo} />}
            </div>
          </Card>
        )}

        {/* Damages Section */}
        {vehicleStatus?.found && (
          <Card className={`damages-card ${vehicleStatus.damages.length === 0 ? 'empty-damages' : ''}`}>
            <SectionHeader title={`Skador (${vehicleStatus.damages.length})`} />
            {vehicleStatus.damages.length === 0 ? (
              <p className="no-data-text">Inga registrerade skador</p>
            ) : (
              <div className="damage-list">
                {vehicleStatus.damages.map((damage) => (
                  <DamageItem key={damage.id} damage={damage} regnr={vehicleStatus.vehicle?.regnr || normalizedReg} />
                ))}
              </div>
            )}
          </Card>
        )}

        {/* Equipment Section */}
        {vehicleStatus?.found && vehicleStatus.vehicle && (
          vehicleStatus.vehicle.antalNycklar !== '---' ||
          vehicleStatus.vehicle.antalLaddkablar !== '---' ||
          vehicleStatus.vehicle.antalInsynsskydd !== '---' ||
          vehicleStatus.vehicle.harInstruktionsbok !== '---' ||
          vehicleStatus.vehicle.harCoc !== '---' ||
          vehicleStatus.vehicle.harLasbultar !== '---' ||
          vehicleStatus.vehicle.harDragkrok !== '---' ||
          vehicleStatus.vehicle.harGummimattor !== '---' ||
          vehicleStatus.vehicle.harDackkompressor !== '---'
        ) && (
          <Card>
            <SectionHeader title="Utrustning vid leverans" />
            <div className="info-grid">
              {vehicleStatus.vehicle.antalNycklar !== '---' && <InfoRow label="Nycklar" value={vehicleStatus.vehicle.antalNycklar} />}
              {vehicleStatus.vehicle.antalLaddkablar !== '---' && <InfoRow label="Laddkablar" value={vehicleStatus.vehicle.antalLaddkablar} />}
              {vehicleStatus.vehicle.antalInsynsskydd !== '---' && <InfoRow label="Insynsskydd" value={vehicleStatus.vehicle.antalInsynsskydd} />}
              {vehicleStatus.vehicle.harInstruktionsbok !== '---' && <InfoRow label="Instruktionsbok" value={vehicleStatus.vehicle.harInstruktionsbok} />}
              {vehicleStatus.vehicle.harCoc !== '---' && <InfoRow label="COC" value={vehicleStatus.vehicle.harCoc} />}
              {vehicleStatus.vehicle.harLasbultar !== '---' && <InfoRow label="Låsbultar" value={vehicleStatus.vehicle.harLasbultar} />}
              {vehicleStatus.vehicle.harDragkrok !== '---' && <InfoRow label="Dragkrok" value={vehicleStatus.vehicle.harDragkrok} />}
              {vehicleStatus.vehicle.harGummimattor !== '---' && <InfoRow label="Gummimattor" value={vehicleStatus.vehicle.harGummimattor} />}
              {vehicleStatus.vehicle.harDackkompressor !== '---' && <InfoRow label="Däckkompressor" value={vehicleStatus.vehicle.harDackkompressor} />}
            </div>
          </Card>
        )}

        {/* Övrig info vid leverans till MABI Section - Consolidated */}
        {vehicleStatus?.found && vehicleStatus.vehicle && (
          <Card>
            <SectionHeader title="Övrig info vid leverans till MABI" />
            <div className="info-grid">
              {vehicleStatus.vehicle.tankstatusVidLeverans !== '---' && (
                <InfoRow label="Tankstatus vid leverans" value={vehicleStatus.vehicle.tankstatusVidLeverans} />
              )}
              <Fragment>
                <span className="info-label">Skador vid leverans</span>
                <span className={`info-value ${vehicleStatus.vehicle.harSkadorVidLeverans === true ? 'at-risk' : ''}`}>
                  {vehicleStatus.vehicle.harSkadorVidLeverans === true
                    ? 'Skador vid leverans, se skaderegistreringen ovan' 
                    : vehicleStatus.vehicle.harSkadorVidLeverans === false
                      ? 'Inga'
                      : '---'}
                </span>
              </Fragment>
              <InfoRow label="Kommentarer" value={vehicleStatus.vehicle.anteckningar} />
            </div>
          </Card>
        )}

        {/* Sale Section */}
        {vehicleStatus?.found && vehicleStatus.vehicle && vehicleStatus.vehicle.saludatum !== '---' && (
          <Card>
            <SectionHeader title="Salu" />
            <div className="info-grid">
              <SaludatumInfoRow label="Saludatum" value={vehicleStatus.vehicle.saludatum} />
              <InfoRow label="Station" value={vehicleStatus.vehicle.saluStation} />
              {vehicleStatus.vehicle.saluKopare !== '---' && <InfoRow label="Köpare (företag)" value={vehicleStatus.vehicle.saluKopare} />}
              {vehicleStatus.vehicle.saluReturadress !== '---' && <InfoRow label="Returadress" value={vehicleStatus.vehicle.saluReturadress} />}
              {vehicleStatus.vehicle.saluRetur !== '---' && <InfoRow label="Returort" value={vehicleStatus.vehicle.saluRetur} />}
              {vehicleStatus.vehicle.saluAttention !== '---' && <InfoRow label="Attention" value={vehicleStatus.vehicle.saluAttention} />}
              {vehicleStatus.vehicle.saluNotering !== '---' && <InfoRow label="Notering försäljning" value={vehicleStatus.vehicle.saluNotering} />}
            </div>
          </Card>
        )}

        {/* History Section */}
        {vehicleStatus?.found && (
          <Card className="history-card" id="history-section">
            <div 
              className="section-header-expandable"
              onClick={() => setHistoryExpanded(!historyExpanded)}
            >
              <h2>
                Historik ({vehicleStatus.history.length})
                <span className="expand-icon">{historyExpanded ? '▲' : '▼'}</span>
              </h2>
            </div>
            
            {historyExpanded && (
              <>
                <div className="history-controls">
                  <div className="history-expand-buttons">
                    <button 
                      type="button" 
                      className="expand-all-btn"
                      onClick={expandAll}
                    >
                      Expandera alla
                    </button>
                    <button 
                      type="button" 
                      className="collapse-all-btn"
                      onClick={collapseAll}
                    >
                      Fäll ihop alla
                    </button>
                  </div>
                  
                  <div className="history-filter">
                    <FilterButton
                      active={historyFilter === 'all'}
                      onClick={() => setHistoryFilter('all')}
                    >
                      Alla
                    </FilterButton>
                    <FilterButton
                      active={historyFilter === 'incheckning'}
                      onClick={() => setHistoryFilter('incheckning')}
                    >
                      Incheckningar
                    </FilterButton>
                    <FilterButton
                      active={historyFilter === 'nybil'}
                      onClick={() => setHistoryFilter('nybil')}
                    >
                      Nybil
                    </FilterButton>
                    <FilterButton
                      active={historyFilter === 'manual'}
                      onClick={() => setHistoryFilter('manual')}
                    >
                      Manuella ändringar
                    </FilterButton>
                  </div>
                </div>

                {filteredHistory.length === 0 ? (
                  <p className="no-data-text">Ingen historik att visa</p>
                ) : (
                  <div className="history-list">
                    {filteredHistory.map((record) => (
                      <HistoryItem 
                        key={record.id} 
                        record={record}
                        isExpanded={expandedEvents.has(record.id)}
                        onToggle={() => toggleEvent(record.id)}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </Card>
        )}

        {/* Print Section - UTSKRIFT */}
        {vehicleStatus?.found && (
          <Card className="print-controls-card">
            <SectionHeader title="Utskrift" />
            <div className="print-controls-content">
              <div className="print-options">
                <label className="print-checkbox">
                  <input 
                    type="checkbox" 
                    checked={includeHistoryInPrint} 
                    onChange={(e) => {
                      setIncludeHistoryInPrint(e.target.checked);
                      if (!e.target.checked) {
                        setIncludeDetailedHistory(false);
                      }
                    }} 
                  />
                  <span>Inkludera historik vid utskrift</span>
                </label>
                
                {includeHistoryInPrint && (
                  <label className="print-checkbox print-checkbox-nested">
                    <input 
                      type="checkbox" 
                      checked={includeDetailedHistory}
                      onChange={(e) => setIncludeDetailedHistory(e.target.checked)}
                    />
                    <span>Inkludera detaljerad historik</span>
                  </label>
                )}
              </div>
              <div className="print-button-container">
                <button
                  type="button"
                  className="print-btn"
                  onClick={() => window.print()}
                >
                  🖨️ Skriv ut
                </button>
              </div>
            </div>
          </Card>
        )}

        <footer className="copyright-footer">
          &copy; {currentYear} Albarone AB &mdash; Alla rättigheter förbehållna
        </footer>
      </div>
      
      {/* Nybil Modal */}
      {showNybilModal && vehicleStatus?.nybilFullData && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000
          }}
          onClick={() => setShowNybilModal(false)}
        >
          <div 
            style={{
              backgroundColor: 'white',
              borderRadius: '8px',
              padding: '2rem',
              maxWidth: '600px',
              maxHeight: '80vh',
              overflow: 'auto',
              margin: '1rem'
            }}
            onClick={(e) => e.stopPropagation()}
            id="nybil-print-content"
          >
            <div className="print-button" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 'bold' }}>KOMPLETT NYBILSREGISTRERING</h1>
              <button 
                onClick={() => setShowNybilModal(false)} 
                style={{ 
                  fontSize: '1.5rem', 
                  background: 'none', 
                  border: 'none', 
                  cursor: 'pointer',
                  padding: '0 0.5rem'
                }}
              >
                ×
              </button>
            </div>
            
            <div style={{ marginBottom: '1.5rem' }}>
              <p style={{ margin: '0.25rem 0' }}><strong>Registrerad:</strong> {vehicleStatus.nybilFullData.registreringsdatum}</p>
              <p style={{ margin: '0.25rem 0' }}><strong>Registrerad av:</strong> {vehicleStatus.nybilFullData.registreradAv}</p>
            </div>
            
            <div className="print-section">
              <h2 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginTop: '1.5rem', marginBottom: '0.75rem' }}>FORDON</h2>
              <p style={{ margin: '0.25rem 0' }}><strong>Registreringsnummer:</strong> {vehicleStatus.nybilFullData.regnr}</p>
              <p style={{ margin: '0.25rem 0' }}><strong>Bilmärke & Modell:</strong> {vehicleStatus.nybilFullData.bilmarkeModell}</p>
              <p style={{ margin: '0.25rem 0' }}><strong>Mottagen vid:</strong> {vehicleStatus.nybilFullData.mottagenVid}</p>
              <p style={{ margin: '0.25rem 0' }}><strong>Planerad station:</strong> {vehicleStatus.nybilFullData.planeradStation}</p>
            </div>
            
            <div className="print-section">
              <h2 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginTop: '1.5rem', marginBottom: '0.75rem' }}>FORDONSSTATUS</h2>
              <p style={{ margin: '0.25rem 0' }}><strong>Mätarställning vid leverans:</strong> {vehicleStatus.nybilFullData.matarstallningVidLeverans}</p>
              <p style={{ margin: '0.25rem 0' }}><strong>Hjultyp (monterat):</strong> {vehicleStatus.nybilFullData.hjultypMonterat}</p>
              <p style={{ margin: '0.25rem 0' }}><strong>Hjul till förvaring:</strong> {vehicleStatus.nybilFullData.hjulTillForvaring}</p>
              <p style={{ margin: '0.25rem 0' }}><strong>Drivmedel:</strong> {vehicleStatus.nybilFullData.drivmedel}</p>
              <p style={{ margin: '0.25rem 0' }}><strong>Växellåda:</strong> {vehicleStatus.nybilFullData.vaxellada}</p>
              <p style={{ margin: '0.25rem 0' }}><strong>Tankstatus vid leverans:</strong> {vehicleStatus.nybilFullData.tankstatusVidLeverans}</p>
            </div>
            
            <div className="print-section">
              <h2 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginTop: '1.5rem', marginBottom: '0.75rem' }}>AVTALSVILLKOR</h2>
              <p style={{ margin: '0.25rem 0' }}><strong>Serviceintervall:</strong> {vehicleStatus.nybilFullData.serviceintervall}</p>
              <p style={{ margin: '0.25rem 0' }}><strong>Max km/månad:</strong> {vehicleStatus.nybilFullData.maxKmManad}</p>
              <p style={{ margin: '0.25rem 0' }}><strong>Avgift över-km:</strong> {vehicleStatus.nybilFullData.avgiftOverKm}</p>
              <p style={{ margin: '0.25rem 0' }}><strong>Saludatum:</strong> {vehicleStatus.nybilFullData.saludatum}</p>
            </div>
            
            <div className="print-section">
              <h2 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginTop: '1.5rem', marginBottom: '0.75rem' }}>UTRUSTNING VID LEVERANS</h2>
              <p style={{ margin: '0.25rem 0' }}><strong>Nycklar:</strong> {vehicleStatus.nybilFullData.antalNycklar}</p>
              {vehicleStatus.nybilFullData.drivmedel !== 'Bensin' && vehicleStatus.nybilFullData.drivmedel !== 'Diesel' && (
                <p style={{ margin: '0.25rem 0' }}><strong>Laddkablar:</strong> {vehicleStatus.nybilFullData.antalLaddkablar}</p>
              )}
              <p style={{ margin: '0.25rem 0' }}><strong>Insynsskydd:</strong> {vehicleStatus.nybilFullData.antalInsynsskydd}</p>
              <p style={{ margin: '0.25rem 0' }}><strong>Instruktionsbok:</strong> {vehicleStatus.nybilFullData.harInstruktionsbok}</p>
              <p style={{ margin: '0.25rem 0' }}><strong>COC:</strong> {vehicleStatus.nybilFullData.harCoc}</p>
              <p style={{ margin: '0.25rem 0' }}><strong>Låsbultar:</strong> {vehicleStatus.nybilFullData.harLasbultar}</p>
              <p style={{ margin: '0.25rem 0' }}><strong>Dragkrok:</strong> {vehicleStatus.nybilFullData.harDragkrok}</p>
              <p style={{ margin: '0.25rem 0' }}><strong>Gummimattor:</strong> {vehicleStatus.nybilFullData.harGummimattor}</p>
              <p style={{ margin: '0.25rem 0' }}><strong>Däckkompressor:</strong> {vehicleStatus.nybilFullData.harDackkompressor}</p>
            </div>
            
            <div className="print-section">
              <h2 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginTop: '1.5rem', marginBottom: '0.75rem' }}>FÖRVARING</h2>
              <p style={{ margin: '0.25rem 0' }}><strong>Hjulförvaring:</strong> {vehicleStatus.nybilFullData.hjulforvaring}</p>
              <p style={{ margin: '0.25rem 0' }}><strong>Reservnyckel:</strong> {vehicleStatus.nybilFullData.reservnyckelForvaring}</p>
              {vehicleStatus.nybilFullData.drivmedel !== 'Bensin' && vehicleStatus.nybilFullData.drivmedel !== 'Diesel' && (
                <p style={{ margin: '0.25rem 0' }}><strong>Laddkablar:</strong> {vehicleStatus.nybilFullData.laddkablarForvaring}</p>
              )}
            </div>
            
            <div className="print-section">
              <h2 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginTop: '1.5rem', marginBottom: '0.75rem' }}>LEVERANSSTATUS</h2>
              <p style={{ margin: '0.25rem 0' }}><strong>Skador vid leverans:</strong> {vehicleStatus.nybilFullData.skadorVidLeverans}</p>
              <p style={{ margin: '0.25rem 0' }}><strong>Klar för uthyrning:</strong> {vehicleStatus.nybilFullData.klarForUthyrning}</p>
              <p style={{ margin: '0.25rem 0' }}><strong>Anteckningar:</strong> {vehicleStatus.nybilFullData.anteckningar}</p>
            </div>
            
            <div className="print-button" style={{ textAlign: 'center', marginTop: '2rem' }}>
              <button 
                className="print-button"
                onClick={() => {
                  const content = document.getElementById('nybil-print-content');
                  if (content) {
                    const printWindow = window.open('', '_blank');
                    if (printWindow) {
                      // Escape title text to prevent XSS
                      const safeRegnr = escapeHtml(vehicleStatus.vehicle?.regnr);
                      
                      printWindow.document.write(`
  <html>
    <head>
      <title>Nybilsregistrering - ${safeRegnr}</title>
      <style>
        body { 
          font-family: Arial, sans-serif; 
          font-size: 8pt; 
          line-height: 1.4;
          padding: 20px;
        }
        h1 { font-size: 16pt; text-align: center; margin-bottom: 10px; }
        h2 { font-size: 10pt; margin: 15px 0 8px 0; border-bottom: 1px solid #ccc; padding-bottom: 4px; page-break-after: avoid; }
        h2 + * { page-break-before: avoid; }
        h3 { font-size: 10pt; margin: 10px 0 5px 0; }
        p { margin: 3px 0; }
        table { width: 100%; border-collapse: collapse; margin: 5px 0; }
        td { padding: 2px 5px; vertical-align: top; }
        td:first-child { font-weight: bold; width: 40%; }
        .photos { display: grid; grid-template-columns: repeat(3, 1fr); justify-items: center; gap: 10px; margin: 15px 0; }
        .photos img { height: 150px; width: auto; object-fit: cover; }
        .info-text { text-align: center; font-size: 9pt; margin: 10px 0; color: #666; }
        .print-button { display: none; }
        .print-section { page-break-inside: avoid; }
      </style>
    </head>
    <body>
`);
                      
                      // Add regnr as main heading
                      printWindow.document.write(`<h1>${safeRegnr}</h1>`);
                      
                      // Add info text with date
                      const registreringsdatum = vehicleStatus.nybilFullData?.registreringsdatum || '';
                      printWindow.document.write(`<p class="info-text">All info från nybilsregistrering ${registreringsdatum}</p>`);
                      
                      // Add nybil photos if available (larger size)
                      // URLs come from Supabase storage and are trusted (stored in photo_urls column from nybil_inventering)
                      if (vehicleStatus.nybilPhotos?.photoUrls && vehicleStatus.nybilPhotos.photoUrls.length > 0) {
                        printWindow.document.write('<div class="photos">');
                        vehicleStatus.nybilPhotos.photoUrls.forEach((url) => {
                          // Validate URL starts with expected Supabase storage domain
                          if (url.startsWith('https://ufioaijcmaujlvmveyra.supabase.co/')) {
                            printWindow.document.write(`<img src="${url}" alt="Nybilsfoto" />`);
                          }
                        });
                        printWindow.document.write('</div>');
                      }
                      
                      // Clone and filter content to exclude print-button elements
                      const contentClone = content.cloneNode(true) as HTMLElement;
                      const printButtons = contentClone.querySelectorAll('.print-button');
                      printButtons.forEach(el => el.remove());
                      
                      printWindow.document.write(contentClone.innerHTML);
                      printWindow.document.write('</body></html>');
                      printWindow.document.close();
                      printWindow.print();
                    }
                  }
                }}
                style={{
                  backgroundColor: '#1a73e8',
                  color: 'white',
                  padding: '0.75rem 1.5rem',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '1rem',
                  fontWeight: 500
                }}
              >
                🖨️ Skriv ut nybilsregistrering
              </button>
            </div>
          </div>
        </div>
      )}
    </Fragment>
  );
}

// =================================================================
// 4. SUB-COMPONENTS
// =================================================================

const Card: React.FC<React.PropsWithChildren<any>> = ({ children, className, ...props }) => (
  <div className={`card ${className || ''}`} {...props}>{children}</div>
);

const SectionHeader: React.FC<{ title: string }> = ({ title }) => (
  <div className="section-header"><h2>{title}</h2></div>
);

const Field: React.FC<React.PropsWithChildren<{ label: string }>> = ({ label, children }) => (
  <div className="field"><label>{label}</label>{children}</div>
);

const InfoRow: React.FC<{ label: string, value: string }> = ({ label, value }) => (
  <Fragment>
    <span className="info-label">{label}</span>
    <span className="info-value">{value}</span>
  </Fragment>
);

const SaludatumInfoRow: React.FC<{ label: string, value: string }> = ({ label, value }) => {
  const isAtRisk = isSaludatumAtRisk(value);
  return (
    <Fragment>
      <span className="info-label">{label}</span>
      <span className={`info-value ${isAtRisk ? 'at-risk' : ''}`}>{value}</span>
    </Fragment>
  );
};

const FilterButton: React.FC<React.PropsWithChildren<{ active: boolean; onClick: () => void }>> = ({ 
  active, 
  onClick, 
  children 
}) => (
  <button
    type="button"
    className={`filter-btn ${active ? 'active' : ''}`}
    onClick={onClick}
  >
    {children}
  </button>
);

const DamageItem: React.FC<{ damage: DamageRecord; regnr: string }> = ({ damage, regnr }) => {
  const mediaUrl = damage.folder ? buildDamageMediaUrl(regnr, damage.datum, damage.folder) : null;
  
  return (
    <div className="damage-item">
      <div className="damage-info">
        <span className="damage-type">{damage.skadetyp}</span>
        <span className="damage-date">{damage.datum}</span>
        {damage.status && (
          <span className="damage-status">{damage.status}</span>
        )}
        {damage.sourceInfo && (
          <span className="damage-source" style={{ whiteSpace: 'pre-line' }}>
            {damage.sourceInfo}
          </span>
        )}
        {mediaUrl && (
          <a
            href={mediaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="damage-media-link"
          >
            📁 Visa media
          </a>
        )}
      </div>
    </div>
  );
};

const HistoryItem: React.FC<{ 
  record: HistoryRecord; 
  isExpanded: boolean; 
  onToggle: () => void;
}> = ({ record, isExpanded, onToggle }) => {
  const getTypeLabel = (typ: string) => {
    switch (typ) {
      case 'incheckning': return 'INCHECKNING';
      case 'nybil': return 'NYBILSREGISTRERING';
      case 'manual': return 'MANUELL ÄNDRING';
      case 'buhs_skada': return 'SKADA';
      default: return typ.toUpperCase();
    }
  };

  const isNybil = record.typ === 'nybil';
  const isBuhsSkada = record.typ === 'buhs_skada';
  // Make nybil expandable if it has skador or attachments
  const nybilHasExpandableContent = isNybil && (
    (record.nybilDetaljer?.skador && record.nybilDetaljer.skador.length > 0) ||
    (record.nybilDetaljer?.mediaLankar && (
      record.nybilDetaljer.mediaLankar.rekond ||
      record.nybilDetaljer.mediaLankar.husdjur ||
      record.nybilDetaljer.mediaLankar.rokning
    ))
  );
  // Make BUHS skada (SKADA events) always non-expandable (content shows directly in summary)
  const buhsHasExpandableContent = false; // Always show SKADA content in collapsed view
  const isNonExpandable = isBuhsSkada || (isNybil && !nybilHasExpandableContent);

  return (
    <div className="history-item-expandable">
      {/* Collapsed view - always visible */}
      <div 
        className="history-item-collapsed" 
        onClick={isNonExpandable ? undefined : onToggle}
        style={{ cursor: isNonExpandable ? 'default' : 'pointer' }}
      >
        <div className="history-collapsed-content">
          <span className="history-type-label" style={isBuhsSkada ? { color: '#B30E0E' } : undefined}>{getTypeLabel(record.typ)}</span>
          {record.plats && <span className="history-plats-label">{record.plats}</span>}
          {/* For BUHS damages, show the damage type and summary */}
          {isBuhsSkada && record.buhsSkadaDetaljer && (
            <span className="history-buhs-label">{record.buhsSkadaDetaljer.skadetyp}</span>
          )}
          {/* For SKADA, show date on title row (same layout as INCHECKNING) */}
          {isBuhsSkada ? (
            <span className="history-date-label">{record.datum}</span>
          ) : (
            <span className="history-date-label">{record.datum}</span>
          )}
          {/* Keep "Dokumenterad …" on next line */}
          {isBuhsSkada && record.sammanfattning && (
            <span className="history-buhs-summary">
              {record.sammanfattning.split('\n').map((line, idx, arr) => (
                <React.Fragment key={idx}>
                  {line}
                  {idx < arr.length - 1 && <br />}
                </React.Fragment>
              ))}
            </span>
          )}
          {/* Left-align "Visa media" link without indent */}
          {isBuhsSkada && record.buhsSkadaDetaljer?.mediaFolder && (
            <a 
              href={`/media/${record.buhsSkadaDetaljer.mediaFolder}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#1a73e8', fontWeight: 'normal' }}
              onClick={(e) => e.stopPropagation()}
            >
              📁 Visa media
            </a>
          )}
        </div>
        {!isNonExpandable && <span className="history-toggle-icon">{isExpanded ? '▲' : '▼'}</span>}
      </div>

      {/* Expanded view - only when isExpanded */}
      {isExpanded && (
        <div className="history-item-expanded">
          {/* For incheckning */}
          {record.typ === 'incheckning' && record.checkinDetaljer && (
            <>
              {record.checkinDetaljer.platsForIncheckning && (
                <div className="history-detail-row">
                  <strong>Plats för incheckning:</strong> {record.checkinDetaljer.platsForIncheckning}
                </div>
              )}
              {record.checkinDetaljer.bilenStarNu && (
                <div className="history-detail-row">
                  <strong>Bilen står nu:</strong> {record.checkinDetaljer.bilenStarNu}
                </div>
              )}
              {record.checkinDetaljer.parkeringsinfo && (
                <div className="history-detail-row">
                  <strong>Parkeringsinfo:</strong> {record.checkinDetaljer.parkeringsinfo}
                </div>
              )}
              {record.checkinDetaljer.matarstallning && (
                <div className="history-detail-row">
                  <strong>Mätarställning:</strong> {record.checkinDetaljer.matarstallning}
                </div>
              )}
              {record.checkinDetaljer.hjultyp && (
                <div className="history-detail-row">
                  <strong>Hjultyp:</strong> {record.checkinDetaljer.hjultyp}
                </div>
              )}
              {record.checkinDetaljer.tankningInfo && (
                <div className="history-detail-row">
                  <strong>Tankning:</strong> {record.checkinDetaljer.tankningInfo}
                </div>
              )}
              {record.checkinDetaljer.laddningInfo && (
                <div className="history-detail-row">
                  <strong>Laddning:</strong> {record.checkinDetaljer.laddningInfo}
                </div>
              )}
              <div className="history-detail-row">
                <strong>Utförd av:</strong> {record.utfordAv}
              </div>
            </>
          )}

          {/* For nybil */}
          {record.typ === 'nybil' && record.nybilDetaljer && (
            <>
              {record.nybilDetaljer.bilmarkeModell && (
                <div className="history-detail-row">
                  <strong>Bilmärke & Modell:</strong> {record.nybilDetaljer.bilmarkeModell}
                </div>
              )}
              {record.nybilDetaljer.mottagenVid && (
                <div className="history-detail-row">
                  <strong>Mottagen vid:</strong> {record.nybilDetaljer.mottagenVid}
                </div>
              )}
              {record.nybilDetaljer.matarstallningVidLeverans && (
                <div className="history-detail-row">
                  <strong>Mätarställning vid leverans:</strong> {record.nybilDetaljer.matarstallningVidLeverans}
                </div>
              )}
              {record.nybilDetaljer.hjultyp && (
                <div className="history-detail-row">
                  <strong>Hjultyp:</strong> {record.nybilDetaljer.hjultyp}
                </div>
              )}
              {record.nybilDetaljer.drivmedel && (
                <div className="history-detail-row">
                  <strong>Drivmedel:</strong> {record.nybilDetaljer.drivmedel}
                </div>
              )}
              {record.nybilDetaljer.planeradStation && (
                <div className="history-detail-row">
                  <strong>Planerad station:</strong> {record.nybilDetaljer.planeradStation}
                </div>
              )}
              <div className="history-detail-row">
                <strong>Utförd av:</strong> {record.utfordAv}
              </div>
            </>
          )}

          {/* Avvikelser för incheckning */}
          {record.avvikelser && (
            <>
              {record.avvikelser.nyaSkador !== undefined && record.avvikelser.nyaSkador > 0 && (
                <div className="history-avvikelse">
                  ⚠️ NYA SKADOR ({record.avvikelser.nyaSkador})
                </div>
              )}
              {record.avvikelser.garInteAttHyraUt && (
                <div className="history-avvikelse">
                  ⚠️ GÅR INTE ATT HYRA UT: {record.avvikelser.garInteAttHyraUt}
                </div>
              )}
              {record.avvikelser.varningslampaPa && (
                <div className="history-avvikelse">
                  ⚠️ VARNINGSLAMPA EJ SLÄCKT: {record.avvikelser.varningslampaPa}
                </div>
              )}
              {record.avvikelser.rekondBehov && (
                <div className="history-avvikelse">
                  ⚠️ REKOND ({[
                    record.avvikelser.rekondBehov.invandig && 'invändig',
                    record.avvikelser.rekondBehov.utvandig && 'utvändig'
                  ].filter(Boolean).join(' + ') || 'behövs'}){record.avvikelser.rekondBehov.kommentar ? `: ${record.avvikelser.rekondBehov.kommentar}` : ''}
                </div>
              )}
              {record.avvikelser.husdjurSanering && (
                <div className="history-avvikelse">
                  ⚠️ HUSDJUR (SANERING): {record.avvikelser.husdjurSanering}
                </div>
              )}
              {record.avvikelser.rokningSanering && (
                <div className="history-avvikelse">
                  ⚠️ RÖKNING (SANERING): {record.avvikelser.rokningSanering}
                </div>
              )}
              {record.avvikelser.insynsskyddSaknas && (
                <div className="history-avvikelse">
                  ⚠️ INSYNSSKYDD SAKNAS
                </div>
              )}
            </>
          )}
          
          {/* Media links - shown after avvikelser for incheckning */}
          {record.typ === 'incheckning' && (() => {
            return record.checkinDetaljer?.mediaLankar && (
              record.checkinDetaljer?.mediaLankar?.rekond || 
              record.checkinDetaljer?.mediaLankar?.husdjur || 
              record.checkinDetaljer?.mediaLankar?.rokning
            );
          })() && (
            <div style={{ marginTop: '1rem' }}>
              <strong>Bilagor:</strong>
              <ul style={{ margin: '0.5rem 0', paddingLeft: '1.5rem' }}>
                {record.checkinDetaljer?.mediaLankar?.rekond && (
                  <li>
                    <a 
                      href={record.checkinDetaljer?.mediaLankar?.rekond} 
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#1a73e8' }}
                    >
                      Rekond 📎
                    </a>
                  </li>
                )}
                {record.checkinDetaljer?.mediaLankar?.husdjur && (
                  <li>
                    <a 
                      href={record.checkinDetaljer?.mediaLankar?.husdjur} 
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#1a73e8' }}
                    >
                      Husdjur 📎
                    </a>
                  </li>
                )}
                {record.checkinDetaljer?.mediaLankar?.rokning && (
                  <li>
                    <a 
                      href={record.checkinDetaljer?.mediaLankar?.rokning} 
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#1a73e8' }}
                    >
                      Rökning 📎
                    </a>
                  </li>
                )}
              </ul>
            </div>
          )}
          
          {/* Damages registered at this checkin - shown after avvikelser */}
          {record.typ === 'incheckning' && record.checkinDetaljer?.skador && record.checkinDetaljer.skador.length > 0 && (
            <div style={{ marginTop: '1rem' }}>
              {(() => {
                // Group damages by type
                const documentedOlder = record.checkinDetaljer.skador.filter(s => s.isDocumentedOlder);
                const notFoundOlder = record.checkinDetaljer.skador.filter(s => s.isNotFoundOlder);
                const newDamages = record.checkinDetaljer.skador.filter(s => !s.isDocumentedOlder && !s.isNotFoundOlder);
                
                return (
                  <>
                    {/* Documented older damages */}
                    {documentedOlder.length > 0 && (
                      <>
                        <strong style={{ color: '#B30E0E' }}>Befintliga skador som dokumenterades:</strong>
                        <ul style={{ margin: '0.5rem 0', paddingLeft: '1.5rem' }}>
                          {documentedOlder.map((skada, idx) => (
                            <li key={`doc-${idx}`}>
                              {skada.originalDamageDate && `Dokumenterad äldre skada [${skada.originalDamageDate}]: `}
                              {skada.typ}
                              {skada.beskrivning && ` - ${skada.beskrivning}`}
                              {skada.mediaUrl && (
                                <>
                                  <br />
                                  <a 
                                    href={skada.mediaUrl} 
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ color: '#1a73e8' }}
                                  >
                                    📁 Visa media
                                  </a>
                                </>
                              )}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                    
                    {/* Not found older damages */}
                    {notFoundOlder.length > 0 && (
                      <>
                        <strong style={{ color: '#B30E0E' }}>Befintliga skador som inte kunde dokumenteras:</strong>
                        <ul style={{ margin: '0.5rem 0', paddingLeft: '1.5rem' }}>
                          {notFoundOlder.map((skada, idx) => (
                            <li key={`notfound-${idx}`}>
                              {skada.typ}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                    
                    {/* New damages */}
                    {newDamages.length > 0 && (
                      <>
                        <strong style={{ color: '#B30E0E' }}>Nya skador dokumenterade:</strong>
                        <ul style={{ margin: '0.5rem 0', paddingLeft: '1.5rem' }}>
                          {newDamages.map((skada, idx) => (
                            <li key={`new-${idx}`}>
                              {skada.typ}
                              {skada.beskrivning && `: ${skada.beskrivning}`}
                              {skada.mediaUrl && (
                                <>
                                  <br />
                                  <a 
                                    href={skada.mediaUrl} 
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ color: '#1a73e8' }}
                                  >
                                    📁 Visa media
                                  </a>
                                </>
                              )}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </>
                );
              })()}
            </div>
          )}

          {/* Nybil-avvikelser */}
          {record.nybilAvvikelser && (
            <>
              {record.nybilAvvikelser.harSkadorVidLeverans && (
                <div className="history-avvikelse">
                  ⚠️ SKADOR VID LEVERANS
                </div>
              )}
              {record.nybilAvvikelser.ejRedoAttHyrasUt && (
                <div className="history-avvikelse">
                  ⚠️ EJ REDO ATT HYRAS UT
                </div>
              )}
            </>
          )}
          
          {/* Nybil attachments */}
          {record.typ === 'nybil' && record.nybilDetaljer?.mediaLankar && (
            record.nybilDetaljer.mediaLankar.rekond ||
            record.nybilDetaljer.mediaLankar.husdjur ||
            record.nybilDetaljer.mediaLankar.rokning
          ) && (
            <div style={{ marginTop: '1rem' }}>
              <strong>Bilagor:</strong>
              <ul style={{ margin: '0.5rem 0', paddingLeft: '1.5rem' }}>
                {record.nybilDetaljer.mediaLankar.rekond && (
                  <li>
                    <a 
                      href={record.nybilDetaljer.mediaLankar.rekond} 
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#1a73e8' }}
                    >
                      Rekond 📎
                    </a>
                  </li>
                )}
                {record.nybilDetaljer.mediaLankar.husdjur && (
                  <li>
                    <a 
                      href={record.nybilDetaljer.mediaLankar.husdjur} 
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#1a73e8' }}
                    >
                      Husdjur 📎
                    </a>
                  </li>
                )}
                {record.nybilDetaljer.mediaLankar.rokning && (
                  <li>
                    <a 
                      href={record.nybilDetaljer.mediaLankar.rokning} 
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#1a73e8' }}
                    >
                      Rökning 📎
                    </a>
                  </li>
                )}
              </ul>
            </div>
          )}
          
          {/* Nybil damages */}
          {record.typ === 'nybil' && record.nybilDetaljer?.skador && record.nybilDetaljer.skador.length > 0 && (
            <div style={{ marginTop: '1rem' }}>
              <strong>Skador vid leverans:</strong>
              <ul style={{ margin: '0.5rem 0', paddingLeft: '1.5rem' }}>
                {record.nybilDetaljer.skador.map((skada, idx) => (
                  <li key={idx}>
                    {skada.typ}{skada.beskrivning && `: ${skada.beskrivning}`}
                    {skada.mediaUrl && (
                      <span>
                        {' '}
                        <a 
                          href={skada.mediaUrl} 
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: '#1a73e8', marginLeft: '0.5rem' }}
                        >
                          Visa media 📎
                        </a>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// =================================================================
// 5. GLOBAL STYLES
// =================================================================

const GlobalStyles: React.FC<{ backgroundUrl: string }> = ({ backgroundUrl }) => (
  <style jsx global>{`
    :root {
      --color-bg: #f8fafc;
      --color-card: #ffffff;
      --color-text: #1f2937;
      --color-text-secondary: #6b7280;
      --color-primary: #2563eb;
      --color-primary-light: #eff6ff;
      --color-success: #16a34a;
      --color-success-light: #f0fdf4;
      --color-danger: #dc2626;
      --color-danger-light: #fef2f2;
      --color-warning: #f59e0b;
      --color-warning-light: #fffbeb;
      --color-border: #e5e7eb;
      --color-border-focus: #3b82f6;
      --color-disabled: #a1a1aa;
      --color-disabled-light: #f4f4f5;
      --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
      --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
    }

    body::before {
      content: '';
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-image: url('${backgroundUrl}');
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
      z-index: -1;
      pointer-events: none;
    }

    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background-color: var(--color-bg);
      color: var(--color-text);
      margin: 0;
      padding: 0;
    }

    .status-form {
      max-width: 700px;
      margin: 0 auto;
      padding: 1rem;
      box-sizing: border-box;
    }

    .main-header {
      text-align: center;
      margin-bottom: 1.5rem;
    }

    .main-logo {
      max-width: 188px;
      height: auto;
      margin: 0 auto 1rem auto;
      display: block;
    }

    .user-info {
      font-weight: 500;
      color: var(--color-text-secondary);
      margin: 0;
    }

    .page-title {
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--color-text);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin: 0 0 0.5rem 0;
    }

    .card {
      background-color: rgba(255, 255, 255, 0.92);
      padding: 1.5rem;
      border-radius: 12px;
      margin-bottom: 1.5rem;
      box-shadow: var(--shadow-md);
    }

    .section-header {
      padding-bottom: 0.75rem;
      border-bottom: 1px solid var(--color-border);
      margin-bottom: 1.5rem;
    }

    .section-header h2 {
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--color-text);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin: 0;
    }

    .section-header-expandable {
      padding-bottom: 0.75rem;
      border-bottom: 1px solid var(--color-border);
      margin-bottom: 1rem;
      cursor: pointer;
      user-select: none;
    }

    .section-header-expandable:hover {
      opacity: 0.8;
    }

    .section-header-expandable h2 {
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--color-text);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin: 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .expand-icon {
      font-size: 0.875rem;
      color: var(--color-text-secondary);
    }

    .field {
      margin-bottom: 1rem;
    }

    .field label {
      display: block;
      margin-bottom: 0.5rem;
      font-weight: 500;
      font-size: 0.875rem;
    }

    .field input {
      width: 100%;
      padding: 0.75rem;
      border: 1px solid var(--color-border);
      border-radius: 6px;
      font-size: 1rem;
      background-color: white;
      box-sizing: border-box;
    }

    .field input:focus {
      outline: 2px solid var(--color-border-focus);
      border-color: transparent;
    }

    .reg-input {
      text-align: center;
      font-weight: 600;
      letter-spacing: 2px;
      text-transform: uppercase;
    }

    .suggestions-dropdown {
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      background-color: white;
      border: 1px solid var(--color-border);
      border-radius: 6px;
      z-index: 10;
      box-shadow: var(--shadow-md);
      max-height: 200px;
      overflow-y: auto;
    }

    .suggestion-item {
      padding: 0.75rem;
      cursor: pointer;
    }

    .suggestion-item:hover {
      background-color: var(--color-primary-light);
    }

    .loading-text {
      color: var(--color-text-secondary);
      font-style: italic;
    }

    .not-found-text {
      color: var(--color-danger);
      font-weight: 500;
    }

    .no-data-text {
      color: var(--color-text-secondary);
      font-style: italic;
      margin: 0;
    }

    .info-grid {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 0.5rem 1rem;
    }

    .info-label {
      font-weight: 600;
      font-size: 0.875rem;
      color: #1e3a8a;
    }

    .info-value {
      font-size: 0.875rem;
      align-self: center;
    }

    .info-value.at-risk {
      color: var(--color-danger);
      font-weight: bold;
    }

    .source-info {
      margin-top: 1rem;
      padding-top: 0.75rem;
      border-top: 1px solid var(--color-border);
      color: var(--color-text-secondary);
    }

    /* Damage list styles */
    .damage-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .damage-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem;
      background-color: var(--color-bg);
      border-radius: 8px;
      border: 1px solid var(--color-border);
    }

    .damage-info {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .damage-type {
      font-weight: 600;
      color: var(--color-text);
    }

    .damage-date {
      font-size: 0.875rem;
      color: var(--color-text-secondary);
    }

    .damage-status {
      font-size: 0.875rem;
      color: var(--color-text);
    }

    .damage-source {
      font-size: 0.75rem;
      color: var(--color-text-secondary);
      font-style: italic;
    }

    .damage-link {
      color: var(--color-primary);
      font-size: 0.875rem;
      text-decoration: none;
      font-weight: 500;
    }

    .damage-link:hover {
      text-decoration: underline;
    }

    .damage-media-link {
      color: var(--color-primary);
      font-size: 0.75rem;
      text-decoration: none;
      font-weight: 500;
    }

    .damage-media-link:hover {
      text-decoration: underline;
    }

    /* History controls - buttons and filter */
    .history-controls {
      margin-bottom: 1rem;
    }

    .history-expand-buttons {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1rem;
    }

    .expand-all-btn,
    .collapse-all-btn {
      padding: 0.5rem 1rem;
      border-radius: 6px;
      border: 1px solid var(--color-border);
      background-color: white;
      color: var(--color-text);
      font-size: 0.875rem;
      cursor: pointer;
      transition: all 0.2s;
    }

    .expand-all-btn:hover,
    .collapse-all-btn:hover {
      background-color: var(--color-bg);
    }

    /* History filter styles */
    .history-filter {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .filter-btn {
      padding: 0.5rem 1rem;
      border-radius: 6px;
      border: 1px solid var(--color-border);
      background-color: white;
      color: var(--color-text);
      font-size: 0.875rem;
      cursor: pointer;
      transition: all 0.2s;
    }

    .filter-btn:hover {
      background-color: var(--color-bg);
    }

    .filter-btn.active {
      background-color: var(--color-primary);
      color: white;
      border-color: var(--color-primary);
    }

    /* History list styles */
    .history-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    /* Expandable history item styles */
    .history-item-expandable {
      background-color: var(--color-bg);
      border-radius: 8px;
      border: 1px solid var(--color-border);
      overflow: hidden;
    }

    .history-item-collapsed {
      padding: 0.75rem;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
      user-select: none;
      transition: background-color 0.2s;
    }

    .history-item-collapsed:hover {
      background-color: rgba(0, 0, 0, 0.02);
    }

    .history-collapsed-content {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      flex-wrap: wrap;
      flex: 1;
    }

    .history-type-label {
      font-weight: 700;
      font-size: 0.875rem;
      text-transform: uppercase;
      color: var(--color-text);
    }

    .history-plats-label {
      font-size: 0.875rem;
      color: var(--color-text);
    }

    .history-date-label {
      font-size: 0.875rem;
      color: var(--color-text-secondary);
      margin-left: auto;
    }

    .history-buhs-summary {
      display: block;
      width: 100%;
      text-align: left;
    }

    .history-toggle-icon {
      font-size: 0.875rem;
      color: var(--color-text-secondary);
      margin-left: 0.5rem;
    }

    .history-item-expanded {
      padding: 0.75rem;
      padding-top: 0;
      border-top: 1px solid var(--color-border);
      background-color: white;
    }

    .history-detail-row {
      padding: 0.5rem 0;
      font-size: 0.875rem;
      line-height: 1.4;
    }

    .history-detail-row strong {
      font-weight: 600;
      color: var(--color-text);
    }

    .history-avvikelse {
      background-color: #B30E0E;
      color: white;
      padding: 0.5rem 1rem;
      border-radius: 4px;
      margin-top: 0.5rem;
      font-size: 0.875rem;
    }

    .copyright-footer {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      text-align: center;
      padding: 1rem 0;
      background-color: rgba(255, 255, 255, 0.95);
      border-top: 1px solid var(--color-border);
      color: var(--color-text-secondary);
      font-size: 0.875rem;
      z-index: 100;
      box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.05);
    }

    .status-form {
      padding-bottom: 4rem; /* Add space for fixed footer */
    }

    /* Print controls card */
    .print-controls-card {
      /* Inherits card styles */
    }

    .print-controls-content {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    /* Print options styles */
    .print-options {
      text-align: left;
    }

    .print-checkbox {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      cursor: pointer;
      font-size: 0.875rem;
    }

    .print-checkbox input[type="checkbox"] {
      cursor: pointer;
      width: 1rem;
      height: 1rem;
    }

    .print-checkbox-nested {
      margin-left: 1.5rem;
      display: block;
      margin-top: 0.5rem;
    }

    /* Print button container - centered */
    .print-button-container {
      display: flex;
      justify-content: center;
    }

    /* Print button styles - max 200px */
    .print-btn {
      padding: 0.75rem 1.5rem;
      background-color: var(--color-primary);
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 1rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      max-width: 200px;
    }

    .print-btn:hover {
      background-color: #1d4ed8;
    }

    /* Print header (hidden on screen) */
    .print-header {
      display: none;
    }

    @media (max-width: 480px) {
      .damage-item {
        flex-direction: column;
        align-items: flex-start;
        gap: 0.5rem;
      }

      .history-filter {
        justify-content: center;
      }

      .filter-btn {
        flex: 1;
        min-width: 100px;
        text-align: center;
      }
    }

    /* Print-specific styles */
    @media print {
      /* Hide elements not needed for print */
      .main-header,
      .copyright-footer,
      .print-controls,
      .print-controls-card,
      body::before {
        display: none !important;
      }

      /* Hide search form in print */
      .search-form-card {
        display: none !important;
      }

      /* Hide Recent Events section in print */
      .recent-events-card {
        display: none !important;
      }

      /* Hide nybil link button in print */
      .nybil-link-button {
        display: none !important;
      }

      /* Hide media links in print */
      .damage-media-link {
        display: none !important;
      }
      
      /* Hide attachment links in history expanded view in print */
      .history-item-expanded a {
        display: none !important;
      }

      /* Compact print header */
      .print-header {
        display: block;
        text-align: center;
        margin-bottom: 4px !important;
        padding-bottom: 2px !important;
        max-height: 2cm;
      }

      .print-logo-img {
        max-height: 1.5cm !important;
        max-width: 6cm !important;
        margin: 0 auto 2px auto !important;
        display: block !important;
      }

      .print-regnr {
        font-size: 14pt !important;
        font-weight: bold;
        margin: 2px 0 !important;
        color: #000;
      }

      .print-subtitle {
        font-size: 7pt !important;
        margin: 0 !important;
        color: #666;
      }

      /* Optimize for print - ultra compact layout with 8pt text */
      body {
        background: white !important;
        color: black !important;
        font-size: 8pt !important;
        line-height: 1.2 !important;
      }

      .status-form {
        max-width: 100%;
        padding: 0;
        margin: 0;
      }

      .card {
        background-color: white !important;
        box-shadow: none !important;
        border: 1px solid #e5e7eb;
        border-radius: 0;
        page-break-inside: avoid;
        margin-bottom: 4px !important;
        padding: 4px !important;
      }

      /* Hide elements marked for print hiding */
      .hide-in-print {
        display: none !important;
      }

      .section-header,
      .section-header-expandable {
        border-bottom-color: #000;
      }

      .section-header h2,
      .section-header-expandable h2 {
        color: #000;
        font-size: 10pt !important;
        margin: 2px 0 !important;
        padding: 0 !important;
      }

      /* Remove background colors and shadows */
      .damage-item,
      .history-item {
        background-color: white !important;
        box-shadow: none !important;
        border: 1px solid #e5e7eb;
        margin-bottom: 3px !important;
        padding: 3px !important;
      }

      /* Compact text sizes */
      .info-label,
      .info-value {
        font-size: 8pt !important;
        color: #000 !important;
        line-height: 1.2 !important;
      }

      .damage-type,
      .damage-date,
      .history-summary {
        color: #000 !important;
        font-size: 8pt !important;
        line-height: 1.2 !important;
      }

      /* Minimal spacing */
      .info-grid {
        gap: 1px 6px !important;
        margin: 0 !important;
      }

      .damage-list,
      .history-list {
        gap: 3px !important;
      }

      /* Don't force page breaks - let content flow naturally */
      .damages-card {
        page-break-before: auto;
      }

      /* Hide empty damages section in print */
      .damages-card.empty-damages {
        display: none !important;
      }

      /* Hide expand icons, filters, and expand buttons */
      .expand-icon,
      .history-filter,
      .filter-btn,
      .history-expand-buttons,
      .history-controls {
        display: none !important;
      }

      /* Hide history card by default in print */
      .history-card {
        display: none !important;
      }

      /* Show history card only if body has the class */
      body.include-history-print .history-card {
        display: block !important;
        page-break-before: always;
      }

      /* Force history to show all items by making content visible */
      body.include-history-print .history-list {
        display: flex !important;
        flex-direction: column;
      }

      /* Force expanded history section content to show */
      body.include-history-print .section-header-expandable + * {
        display: block !important;
      }

      /* Expandable history items in print */
      body.include-history-print .history-item-expandable {
        background-color: white !important;
        box-shadow: none !important;
        border: 1px solid #e5e7eb;
        margin-bottom: 3px !important;
        padding: 3px !important;
      }

      body.include-history-print .history-item-collapsed {
        padding: 3px !important;
        cursor: default;
      }

      body.include-history-print .history-toggle-icon {
        display: none !important;
      }

      /* Hide expanded details by default in print */
      body.include-history-print .history-item-expanded {
        display: none !important;
      }

      /* Show expanded details only when detailed history is enabled */
      body.include-history-print.include-detailed-history-print .history-item-expanded {
        display: block !important;
        padding: 3px !important;
        border-top: 1px solid #e5e7eb;
        background-color: white;
      }

      body.include-history-print.include-detailed-history-print .history-detail-row {
        padding: 2px 0;
        font-size: 8pt !important;
        line-height: 1.2 !important;
      }

      body.include-history-print.include-detailed-history-print .history-avvikelse {
        padding: 3px 6px;
        margin-top: 2px;
        font-size: 7pt !important;
      }

      /* Page break control */
      .damage-item,
      .history-item-expandable {
        page-break-inside: avoid;
      }

      /* Show nybil photos in print - make them much smaller */
      .nybil-photos-card {
        padding: 2px !important;
        margin-bottom: 2px !important;
        border: none !important;
      }

      .nybil-photos-card .section-header {
        display: none !important;
      }

      .nybil-photos-grid {
        gap: 2px !important;
        margin-bottom: 0 !important;
      }

      .nybil-photos-card .nybil-photo {
        max-height: 60px !important;
        max-width: 80px !important;
      }
    }

    /* Nybil photos styling */
    .nybil-photos-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
      justify-content: center;
      align-items: flex-start;
      margin-bottom: 1rem;
    }

    .nybil-photo-item {
      flex: 0 1 auto;
      max-width: 100%;
      cursor: pointer;
      transition: transform 0.2s ease, opacity 0.2s ease;
      display: block;
    }

    .nybil-photo-item:hover {
      transform: scale(1.05);
      opacity: 0.9;
    }

    /* Accessibility: Respect reduced motion preferences */
    @media (prefers-reduced-motion: reduce) {
      .nybil-photo-item {
        transition: none;
      }
      
      .nybil-photo-item:hover {
        transform: none;
        opacity: 1;
      }
    }

    .nybil-photo {
      max-height: 200px;
      width: auto;
      max-width: 100%;
      border-radius: 8px;
      box-shadow: var(--shadow-sm);
      object-fit: contain;
      display: block;
    }

    .nybil-photo-item:hover .nybil-photo {
      box-shadow: var(--shadow-md);
    }

    /* Responsive layout for nybil photos */
    @media (max-width: 600px) {
      .nybil-photos-grid {
        flex-direction: column;
        align-items: center;
      }

      .nybil-photo {
        max-height: 180px;
      }
    }
  `}</style>
);

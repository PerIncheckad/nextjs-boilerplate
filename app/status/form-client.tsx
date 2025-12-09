'use client';

import React, { useEffect, useState, useMemo, useCallback, Fragment } from 'react';
import { supabase } from '@/lib/supabase';
import { getVehicleStatus, VehicleStatusResult, DamageRecord, HistoryRecord } from '@/lib/vehicle-status';

// =================================================================
// 1. CONSTANTS
// =================================================================

const MABI_LOGO_URL = "https://ufioaijcmaujlvmveyra.supabase.co/storage/v1/object/public/MABI%20Syd%20logga/MABI%20Syd%20logga%202.png";
const BACKGROUND_IMAGE_URL = "https://ufioaijcmaujlvmveyra.supabase.co/storage/v1/object/public/MB%20300%20SL%20Roadster%201962/MB%20300-SL-Roadster_1962.jpg";

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
  
  // Print options state
  const [includeHistoryInPrint, setIncludeHistoryInPrint] = useState(false);
  
  // Recent events state
  const [previousEventExpanded, setPreviousEventExpanded] = useState(false);

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

  // Handle print: add/remove class based on includeHistoryInPrint
  useEffect(() => {
    const handleBeforePrint = () => {
      if (includeHistoryInPrint) {
        document.body.classList.add('include-history-print');
      } else {
        document.body.classList.remove('include-history-print');
      }
    };

    window.addEventListener('beforeprint', handleBeforePrint);
    return () => window.removeEventListener('beforeprint', handleBeforePrint);
  }, [includeHistoryInPrint]);

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

        {/* Recent Events Section */}
        {vehicleStatus?.found && vehicleStatus.history.length > 0 && (
          <Card className="recent-events-card">
            <SectionHeader title="Senaste händelser" />
            
            {/* Latest Event - Always Expanded */}
            {vehicleStatus.history[0] && (
              <RecentEventItem 
                record={vehicleStatus.history[0]} 
                damages={vehicleStatus.damages}
                isLatest={true}
                isExpanded={true}
                onToggle={() => {}}
              />
            )}
            
            {/* Previous Event - Collapsible */}
            {vehicleStatus.history[1] && (
              <>
                <div className="event-separator" />
                <RecentEventItem 
                  record={vehicleStatus.history[1]} 
                  damages={vehicleStatus.damages}
                  isLatest={false}
                  isExpanded={previousEventExpanded}
                  onToggle={() => setPreviousEventExpanded(!previousEventExpanded)}
                />
              </>
            )}
            
            {/* Link to History Section */}
            <div className="history-link-container">
              <a 
                href="#history-section" 
                className="history-link"
                onClick={(e) => {
                  e.preventDefault();
                  document.querySelector('.history-card')?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                💬 För fler händelser, se HISTORIK nedan
              </a>
            </div>
          </Card>
        )}

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
              <InfoRow label="Övrig info" value={vehicleStatus.vehicle.anteckningar} />
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
                <span className="expand-icon">{historyExpanded ? '▼' : '▶'}</span>
              </h2>
            </div>
            
            {historyExpanded && (
              <>
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

                {filteredHistory.length === 0 ? (
                  <p className="no-data-text">Ingen historik att visa</p>
                ) : (
                  <div className="history-list">
                    {filteredHistory.map((record) => (
                      <HistoryItem key={record.id} record={record} />
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
                    onChange={(e) => setIncludeHistoryInPrint(e.target.checked)} 
                  />
                  <span>Inkludera all historik vid utskrift</span>
                </label>
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

const HistoryItem: React.FC<{ record: HistoryRecord }> = ({ record }) => {
  const getTypeLabel = (typ: string) => {
    switch (typ) {
      case 'incheckning': return 'Incheckning';
      case 'nybil': return 'Nybilsregistrering';
      case 'manual': return 'Manuell ändring';
      default: return typ;
    }
  };

  const getTypeClass = (typ: string) => {
    switch (typ) {
      case 'incheckning': return 'type-incheckning';
      case 'nybil': return 'type-nybil';
      case 'manual': return 'type-manual';
      default: return '';
    }
  };

  return (
    <div className="history-item">
      <div className="history-header">
        <span className={`history-type ${getTypeClass(record.typ)}`}>
          {getTypeLabel(record.typ)}
        </span>
        <span className="history-date">{record.datum}</span>
      </div>
      <p className="history-summary">{record.sammanfattning}</p>
      <span className="history-user">Utförd av: {record.utfordAv}</span>
    </div>
  );
};

const RecentEventItem: React.FC<{ 
  record: HistoryRecord; 
  damages: DamageRecord[];
  isLatest: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}> = ({ record, damages, isLatest, isExpanded, onToggle }) => {
  const getTypeLabel = (typ: string) => {
    switch (typ) {
      case 'incheckning': return 'Incheckning';
      case 'nybil': return 'Nybilsregistrering';
      case 'manual': return 'Manuell ändring';
      default: return typ;
    }
  };

  const getTypeClass = (typ: string) => {
    switch (typ) {
      case 'incheckning': return 'type-incheckning';
      case 'nybil': return 'type-nybil';
      case 'manual': return 'type-manual';
      default: return '';
    }
  };

  // Match damages to this event by date
  // Extract date from record.datum (e.g., "2025-12-09 kl 14:32" -> "2025-12-09")
  const eventDate = record.datum.split(' ')[0];
  const eventDamages = damages.filter(damage => damage.datum === eventDate);

  // Parse the summary to extract deviations
  const parseDeviations = (summary: string) => {
    const deviations: string[] = [];
    
    // Check for various deviation patterns in the summary
    if (summary.includes('Ny skada:') || summary.includes('Nya skador:')) {
      const newDamages = eventDamages.filter(d => 
        summary.toLowerCase().includes(d.skadetyp.toLowerCase())
      );
      newDamages.forEach(d => {
        const mediaIcon = d.folder ? ' [📷]' : '';
        deviations.push(`⚠️ Ny skada: ${d.skadetyp}${mediaIcon}`);
      });
    }
    
    if (summary.includes('Befintlig') || summary.includes('befintlig')) {
      deviations.push('⚠️ Befintlig skada dokumenterad [📷]');
    }
    
    if (summary.toLowerCase().includes('rekond')) {
      deviations.push('⚠️ Rekond krävs');
    }
    
    if (summary.toLowerCase().includes('husdjur')) {
      deviations.push('⚠️ Husdjur noterat');
    }
    
    if (summary.toLowerCase().includes('rökning') || summary.toLowerCase().includes('rokt')) {
      deviations.push('⚠️ Rökning noterat');
    }
    
    if (summary.toLowerCase().includes('insynsskydd saknas')) {
      deviations.push('⚠️ Insynsskydd saknas');
    }
    
    return deviations;
  };

  const deviations = parseDeviations(record.sammanfattning);

  if (!isLatest && !isExpanded) {
    // Collapsed view for previous event
    return (
      <div className="recent-event-collapsed" onClick={onToggle}>
        <div className="recent-event-collapsed-header">
          <span className="expand-chevron">▼</span>
          <span className="recent-event-collapsed-text">Visa föregående händelse</span>
        </div>
        <div className="recent-event-collapsed-preview">
          <span className="recent-event-date">📅 {record.datum}</span>
          <span className="recent-event-type-preview">{getTypeLabel(record.typ)}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="recent-event-item">
      {!isLatest && (
        <div className="recent-event-collapse-btn" onClick={onToggle}>
          <span className="expand-chevron">▲</span>
          <span>Dölj händelse</span>
        </div>
      )}
      
      <div className="recent-event-date-row">
        <span className="recent-event-date">📅 {record.datum}</span>
      </div>
      
      <div className="recent-event-summary">
        <span className={`recent-event-type ${getTypeClass(record.typ)}`}>
          {getTypeLabel(record.typ)}
        </span>
        <span className="recent-event-user"> av {record.utfordAv}</span>
      </div>
      
      {deviations.length > 0 && (
        <div className="recent-event-deviations">
          {deviations.map((deviation, index) => (
            <div key={index} className="recent-event-deviation">
              {deviation}
            </div>
          ))}
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

    /* History filter styles */
    .history-filter {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-bottom: 1rem;
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

    .history-item {
      padding: 0.75rem;
      background-color: var(--color-bg);
      border-radius: 8px;
      border: 1px solid var(--color-border);
    }

    .history-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.5rem;
    }

    .history-type {
      font-size: 0.75rem;
      font-weight: 600;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      text-transform: uppercase;
    }

    .history-type.type-incheckning {
      background-color: var(--color-success-light);
      color: var(--color-success);
    }

    .history-type.type-nybil {
      background-color: var(--color-primary-light);
      color: var(--color-primary);
    }

    .history-type.type-manual {
      background-color: var(--color-warning-light);
      color: #92400e;
    }

    .history-date {
      font-size: 0.875rem;
      color: var(--color-text-secondary);
    }

    .history-summary {
      margin: 0 0 0.5rem 0;
      font-size: 0.875rem;
      line-height: 1.4;
    }

    .history-user {
      font-size: 0.75rem;
      color: var(--color-text-secondary);
    }

    /* Recent Events Section Styles */
    .recent-events-card {
      /* Inherits card styles */
    }

    .event-separator {
      height: 1px;
      background-color: var(--color-border);
      margin: 1.5rem 0;
    }

    .recent-event-item {
      padding: 1rem;
      background-color: var(--color-bg);
      border-radius: 8px;
      border: 1px solid var(--color-border);
    }

    .recent-event-date-row {
      margin-bottom: 0.5rem;
    }

    .recent-event-date {
      font-size: 0.875rem;
      color: var(--color-text-secondary);
      font-weight: 500;
    }

    .recent-event-summary {
      margin-bottom: 0.75rem;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.25rem;
    }

    .recent-event-type {
      font-size: 0.875rem;
      font-weight: 600;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      text-transform: uppercase;
    }

    .recent-event-type.type-incheckning {
      background-color: var(--color-success-light);
      color: var(--color-success);
    }

    .recent-event-type.type-nybil {
      background-color: var(--color-primary-light);
      color: var(--color-primary);
    }

    .recent-event-type.type-manual {
      background-color: var(--color-warning-light);
      color: #92400e;
    }

    .recent-event-user {
      font-size: 0.875rem;
      color: var(--color-text);
    }

    .recent-event-deviations {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      margin-top: 0.75rem;
    }

    .recent-event-deviation {
      font-size: 0.875rem;
      color: var(--color-danger);
      font-weight: 500;
      padding: 0.5rem;
      background-color: var(--color-danger-light);
      border-radius: 4px;
      border-left: 3px solid var(--color-danger);
    }

    .recent-event-collapsed {
      padding: 1rem;
      background-color: var(--color-bg);
      border-radius: 8px;
      border: 1px solid var(--color-border);
      cursor: pointer;
      transition: all 0.2s;
    }

    .recent-event-collapsed:hover {
      background-color: var(--color-primary-light);
      border-color: var(--color-primary);
    }

    .recent-event-collapsed-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
    }

    .expand-chevron {
      font-size: 0.75rem;
      color: var(--color-text-secondary);
    }

    .recent-event-collapsed-text {
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--color-text);
    }

    .recent-event-collapsed-preview {
      display: flex;
      gap: 1rem;
      font-size: 0.875rem;
      color: var(--color-text-secondary);
      padding-left: 1.25rem;
    }

    .recent-event-type-preview {
      font-weight: 500;
    }

    .recent-event-collapse-btn {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.875rem;
      color: var(--color-text-secondary);
      cursor: pointer;
      margin-bottom: 0.75rem;
      padding: 0.25rem;
    }

    .recent-event-collapse-btn:hover {
      color: var(--color-primary);
    }

    .history-link-container {
      text-align: center;
      margin-top: 1.5rem;
      padding-top: 1rem;
      border-top: 1px solid var(--color-border);
    }

    .history-link {
      color: var(--color-primary);
      text-decoration: none;
      font-size: 0.875rem;
      font-weight: 500;
      transition: all 0.2s;
    }

    .history-link:hover {
      text-decoration: underline;
      color: #1d4ed8;
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

      /* Hide recent events section in print */
      .recent-events-card {
        display: none !important;
      }

      /* Hide media links in print */
      .damage-media-link {
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

      /* Hide expand icons and filters */
      .expand-icon,
      .history-filter,
      .filter-btn {
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

      /* Page break control */
      .damage-item,
      .history-item {
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

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
 * @param regnr - Vehicle registration number (e.g., "ABC123")
 * @param datumStr - Damage date in YYYY-MM-DD format or "---" if unknown
 * @param folder - Event folder name (e.g., "repa-hoger-dor")
 * @returns URL path to public media browser, or null if regnr is empty
 */
const buildDamageMediaUrl = (regnr: string, datumStr: string | null | undefined, folder?: string): string | null => {
  if (!regnr) return null;
  
  const normalizedReg = regnr.toUpperCase().replace(/\s/g, '');
  
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
  
  // Build folder path: /public-media/{REGNR}/{REGNR}-{YYYYMMDD}/{folder}
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
        </Card>

        {/* Print Header (hidden on screen, visible on print) */}
        {vehicleStatus?.found && vehicleStatus.vehicle && (
          <div className="print-header">
            <div className="print-logo">MABI Syd</div>
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
            </div>
          </Card>
        )}

        {/* Damages Section - Moved here under FORDONSINFORMATION */}
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

        {/* Damages at Delivery Section - Moved here under UTRUSTNING */}
        {vehicleStatus?.found && vehicleStatus.vehicle && vehicleStatus.vehicle.harSkadorVidLeverans && (
          <Card>
            <SectionHeader title="⚠️ Skador vid leverans" />
            <div style={{ padding: '0.5rem 0' }}>
              <p style={{ margin: 0, fontSize: '0.875rem', lineHeight: '1.5', color: 'var(--color-danger)', fontWeight: 600 }}>
                Detta fordon registrerades med skador vid leverans. Se skaderegistreringen i sektionen "Skador" ovan.
              </p>
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

        {/* Fuel Filling Section */}
        {vehicleStatus?.found && vehicleStatus.vehicle && (vehicleStatus.vehicle.tankstatusVidLeverans !== '---' || vehicleStatus.vehicle.tankningInfo !== '---') && (
          <Card>
            <SectionHeader title="Tankstatus vid leverans" />
            <div className="info-grid">
              {vehicleStatus.vehicle.tankstatusVidLeverans !== '---' && <InfoRow label="Tankstatus vid leverans" value={vehicleStatus.vehicle.tankstatusVidLeverans} />}
              {vehicleStatus.vehicle.tankningInfo !== '---' && <InfoRow label="Detaljer" value={vehicleStatus.vehicle.tankningInfo} />}
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

        {/* General Comment Section */}
        {vehicleStatus?.found && vehicleStatus.vehicle && vehicleStatus.vehicle.anteckningar !== '---' && (
          <Card>
            <SectionHeader title="Övrig info vid leverans till MABI" />
            <div style={{ padding: '0.5rem 0' }}>
              <p style={{ margin: 0, fontSize: '0.875rem', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>{vehicleStatus.vehicle.anteckningar}</p>
            </div>
          </Card>
        )}

        {/* History Section */}
        {vehicleStatus?.found && (
          <Card className="history-card">
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
  const mediaUrl = buildDamageMediaUrl(regnr, damage.datum, damage.folder);
  
  return (
    <div className="damage-item">
      <div className="damage-info">
        <span className="damage-type">{damage.skadetyp}</span>
        <span className="damage-date">{damage.datum}</span>
        {damage.sourceInfo && (
          <span className="damage-source">{damage.sourceInfo}</span>
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

      /* Hide media links in print */
      .damage-media-link {
        display: none !important;
      }

      /* Compact print header - max 5cm height */
      .print-header {
        display: block;
        text-align: center;
        margin-bottom: 8px !important;
        padding-bottom: 8px !important;
        max-height: 5cm;
      }

      .print-logo {
        font-size: 14pt !important;
        font-weight: bold;
        margin: 0 !important;
        color: #000;
      }

      .print-regnr {
        font-size: 18pt !important;
        font-weight: bold;
        margin: 4px 0 !important;
        color: #000;
      }

      .print-subtitle {
        font-size: 8pt !important;
        margin: 0.2rem 0 0.5rem 0;
        color: #666;
      }

      /* Optimize for print - very compact layout with 9pt text */
      body {
        background: white !important;
        color: black !important;
        font-size: 9pt !important;
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
        margin-bottom: 8px !important;
        padding: 8px !important;
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
        font-size: 11pt !important;
      }

      /* Remove background colors and shadows */
      .damage-item,
      .history-item {
        background-color: white !important;
        box-shadow: none !important;
        border: 1px solid #e5e7eb;
      }

      /* Compact text sizes */
      .info-label,
      .info-value {
        font-size: 9pt !important;
        color: #000 !important;
      }

      .damage-type,
      .damage-date,
      .history-summary {
        color: #000 !important;
        font-size: 9pt !important;
      }

      /* Minimal spacing */
      .info-grid {
        gap: 2px 8px !important;
      }

      .damage-list,
      .history-list {
        gap: 0.5rem;
      }

      /* Force damages section to start on new page */
      .damages-card {
        page-break-before: always;
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

      /* Show nybil photos in print - make them smaller and hide title */
      .nybil-photos-card {
        padding: 0.3rem !important;
        margin-bottom: 0.3rem !important;
        border: none !important;
      }

      .nybil-photos-card .section-header {
        display: none !important;
      }

      .nybil-photos-grid {
        gap: 0.3rem !important;
        margin-bottom: 0 !important;
      }

      .nybil-photos-card .nybil-photo {
        max-height: 100px !important;
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

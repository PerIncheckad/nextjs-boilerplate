'use client';

import { useEffect, useMemo, useState } from 'react';
import stationer from '../../data/stationer.json';
import MediaModal from '@/components/MediaModal';
import type { MetricResultV1 } from '@/lib/analytics/contracts';
import Layer1PeriodDurationReport from './layer1-period-duration-report';
import {
  isCompletedCheckinReportPeriod,
  latestCompletedDayInput,
  latestCompletedMonthInput,
  resolveCheckinReportPeriod,
  type CheckinReportPeriodType,
} from '@/lib/reporting/checkin-report-period';

const MABI_LOGO_URL = 'https://ufioaijcmaujlvmveyra.supabase.co/storage/v1/object/public/MABI%20Syd%20logga/MABI%20Syd%20logga%202.png';

type DamageWithVehicle = {
  id: string;
  regnr: string;
  damage_date: string;
  ort: string;
  station_namn: string;
  damage_type: string;
  notering: string;
  description: string;
  inchecker_name?: string;
  godkandAv?: string;
  media_url?: string;
  created_at: string;
  brand?: string;
  model?: string;
  region?: string;
  damage_type_raw?: string;
  note_internal?: string;
  huvudstation_id?: string;
  station_id?: string;
  saludatum?: string;
};

type ReportResponse<T> = {
  data?: T;
  error?: string;
  code?: string;
};

type SignedMetricEvaluationV1 = {
  contract: 'SIGNED_METRIC_EVALUATION_V1';
  result: MetricResultV1;
};

const SortArrow = ({ column, sortKey, sortOrder }: { column: string; sortKey: string; sortOrder: string }) => {
  if (sortKey !== column) return null;
  return <span style={{ fontSize: '0.8em', verticalAlign: 'middle' }}>{sortOrder === 'asc' ? ' ▲' : ' ▼'}</span>;
};

const platsAlternativ = stationer.map((st) => {
  if (st.type === 'total' || st.type === 'region' || st.type === 'tot') return st.namn;
  if (st.type === 'station') return `${st.namn} (${st.station_id})`;
  return st.namn;
});

function getDamageStatus(row: DamageWithVehicle): 'Incheckad' | 'BUHS' {
  return row.inchecker_name || row.godkandAv ? 'Incheckad' : 'BUHS';
}

function formatCheckinTime(row: DamageWithVehicle): string {
  if (getDamageStatus(row) !== 'Incheckad' || !row.created_at) return '';
  try {
    const d = new Date(row.created_at);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm' });
  } catch {
    return '';
  }
}

async function readReportApi<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const body = await response.json() as ReportResponse<T>;
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body.data ?? ([] as T);
}

async function readCheckinMetric(period: { start: string; end: string }): Promise<MetricResultV1> {
  const response = await fetch('/api/analytics/checkin-completed-count', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      metricId: 'CHECKIN_COMPLETED_COUNT',
      metricVersion: 1,
      period: { start: period.start, end: period.end },
    }),
  });

  const body = await response.json() as ReportResponse<SignedMetricEvaluationV1>;
  if (!response.ok || !body.data) throw new Error(body.error || body.code || `HTTP ${response.status}`);

  const evaluation = body.data;
  const result = evaluation.result;
  if (evaluation.contract !== 'SIGNED_METRIC_EVALUATION_V1') throw new Error('Ogiltigt evaluation-kontrakt');
  if (result.resultContract !== 'METRIC_RESULT_V1') throw new Error('Ogiltigt metric-resultat');
  if (result.metricId !== 'CHECKIN_COMPLETED_COUNT' || result.metricVersion !== 1) throw new Error('Fel metric/version');
  if (result.unit !== 'COUNT') throw new Error('Fel metric-enhet');
  if (result.scope.timezone !== 'Europe/Stockholm' || result.scope.intervalSemantics !== '[start,end)') throw new Error('Fel periodkontrakt');
  if (result.scope.dimensions.length !== 0) throw new Error('Check-in report v1 får endast använda TOTAL');

  return result;
}

function formatPeriodLabel(start: string, end: string, type: CheckinReportPeriodType): string {
  const startDate = new Date(start);
  if (type === 'month') {
    return startDate.toLocaleDateString('sv-SE', { year: 'numeric', month: 'long', timeZone: 'Europe/Stockholm' });
  }
  const endDate = new Date(end);
  return `${startDate.toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' })} · ${startDate.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm' })}–${endDate.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm' })}`;
}

export default function RapportPage() {
  const [allDamages, setAllDamages] = useState<DamageWithVehicle[]>([]);
  const [damageLoading, setDamageLoading] = useState(true);
  const [damageError, setDamageError] = useState('');
  const [searchRegnr, setSearchRegnr] = useState('');
  const [activeRegnr, setActiveRegnr] = useState('');
  const [plats, setPlats] = useState(platsAlternativ[0]);
  const [sortKey, setSortKey] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');

  const [periodType, setPeriodType] = useState<CheckinReportPeriodType>('day');
  const [periodValue, setPeriodValue] = useState(() => latestCompletedDayInput());
  const [metricResult, setMetricResult] = useState<MetricResultV1 | null>(null);
  const [metricLoading, setMetricLoading] = useState(true);
  const [metricError, setMetricError] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMedia, setModalMedia] = useState<any[]>([]);
  const [modalTitle, setModalTitle] = useState('');
  const [modalIsLoading, setModalIsLoading] = useState(false);
  const [modalIdx, setModalIdx] = useState(0);

  const resolvedPeriod = useMemo(() => {
    try {
      return resolveCheckinReportPeriod(periodType, periodValue);
    } catch {
      return null;
    }
  }, [periodType, periodValue]);

  useEffect(() => {
    let cancelled = false;

    async function fetchMetric() {
      if (!resolvedPeriod) {
        setMetricResult(null);
        setMetricLoading(false);
        setMetricError('Ogiltig period.');
        return;
      }
      if (!isCompletedCheckinReportPeriod(resolvedPeriod)) {
        setMetricResult(null);
        setMetricLoading(false);
        setMetricError('Endast avslutade perioder kan visas som slutligt rapportutfall.');
        return;
      }

      setMetricLoading(true);
      setMetricError('');
      try {
        const result = await readCheckinMetric(resolvedPeriod);
        if (!cancelled) setMetricResult(result);
      } catch (error: unknown) {
        if (!cancelled) {
          setMetricResult(null);
          setMetricError(error instanceof Error ? error.message : 'Kunde inte hämta Check-in-volym.');
        }
      } finally {
        if (!cancelled) setMetricLoading(false);
      }
    }

    void fetchMetric();
    return () => { cancelled = true; };
  }, [resolvedPeriod]);

  useEffect(() => {
    let cancelled = false;

    async function fetchAllData() {
      setDamageLoading(true);
      setDamageError('');
      try {
        const rows = await readReportApi<DamageWithVehicle[]>('/api/report-damages');
        if (!cancelled) setAllDamages(rows);
      } catch (error: unknown) {
        if (!cancelled) setDamageError(`Misslyckades hämta skadejournal: ${error instanceof Error ? error.message : 'Okänt fel'}`);
      } finally {
        if (!cancelled) setDamageLoading(false);
      }
    }

    void fetchAllData();
    return () => { cancelled = true; };
  }, []);

  const filteredRows = useMemo(() => {
    let items = [...allDamages];
    const st = stationer.find((s) => plats === s.namn || (s.type === 'station' && plats === `${s.namn} (${s.station_id})`));
    if (st && st.type !== 'total') {
      if (st.type === 'region') items = items.filter((d) => d.region === st.namn.split(' ')[1]);
      else if (st.type === 'tot') items = items.filter((d) => d.huvudstation_id === st.huvudstation_id);
      else if (st.type === 'station') items = items.filter((d) => d.station_id === st.station_id);
    }
    if (activeRegnr) items = items.filter((row) => row.regnr?.toLowerCase().includes(activeRegnr.toLowerCase()));

    return items.sort((a: any, b: any) => {
      if (sortKey === 'status') {
        const aStatus = getDamageStatus(a);
        const bStatus = getDamageStatus(b);
        return sortOrder === 'desc' ? bStatus.localeCompare(aStatus) : aStatus.localeCompare(bStatus);
      }
      let ak = a[sortKey] ?? '';
      let bk = b[sortKey] ?? '';
      if (sortKey === 'damage_date' || sortKey === 'created_at') {
        ak = new Date(ak).getTime() || 0;
        bk = new Date(bk).getTime() || 0;
        return sortOrder === 'desc' ? bk - ak : ak - bk;
      }
      if (typeof ak === 'string' && typeof bk === 'string') return sortOrder === 'desc' ? bk.localeCompare(ak) : ak.localeCompare(bk);
      return 0;
    });
  }, [allDamages, plats, activeRegnr, sortKey, sortOrder]);

  const [autocomplete, setAutocomplete] = useState<string[]>([]);
  useEffect(() => {
    if (searchRegnr.length >= 2) {
      const regnrList = Array.from(new Set(allDamages.map((row) => row.regnr).filter(Boolean)));
      setAutocomplete(regnrList.filter((regnr) => regnr.toLowerCase().includes(searchRegnr.toLowerCase())));
    } else {
      setAutocomplete([]);
    }
  }, [searchRegnr, allDamages]);

  const handleSort = (key: string) => {
    if (sortKey === key) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    else {
      setSortKey(key);
      setSortOrder('desc');
    }
  };

  const openMediaModalForRow = async (row: DamageWithVehicle) => {
    setModalOpen(true);
    setModalIsLoading(true);
    setModalTitle(`${row.regnr} - ${row.damage_type || '--'}`);
    setModalMedia([]);
    setModalIdx(0);

    try {
      const data = await readReportApi<Array<{ url: string; type: string; comment?: string }>>(
        `/api/report-damages?damageId=${encodeURIComponent(row.id)}`,
      );

      const formattedMedia = data.map((media) => ({
        url: media.url,
        type: media.type as 'image' | 'video',
        metadata: {
          date: row.damage_date ? new Date(row.damage_date).toLocaleDateString('sv-SE') : '--',
          time: formatCheckinTime(row),
          damageType: row.damage_type || '--',
          station: row.station_namn || '--',
          note: media.comment || row.description,
          generalNote: row.notering,
          inchecker: row.inchecker_name || row.godkandAv || '',
          documentationDate: row.created_at ? new Date(row.created_at).toLocaleDateString('sv-SE') : undefined,
          damageDate: row.damage_date ? new Date(row.damage_date).toLocaleDateString('sv-SE') : undefined,
        },
      }));
      setModalMedia(formattedMedia);
    } catch (error) {
      console.error('Kunde inte hämta media:', error);
      setModalMedia([]);
    } finally {
      setModalIsLoading(false);
    }
  };

  const handleModalPrev = () => setModalIdx((idx) => (idx > 0 ? idx - 1 : idx));
  const handleModalNext = () => setModalIdx((idx) => (idx < modalMedia.length - 1 ? idx + 1 : idx));

  const handlePeriodType = (nextType: CheckinReportPeriodType) => {
    setPeriodType(nextType);
    setPeriodValue(nextType === 'day' ? latestCompletedDayInput() : latestCompletedMonthInput());
  };

  return (
    <main className="rapport-main">
      <div className="rapport-logo-row">
        <img src={MABI_LOGO_URL} alt="MABI Syd logga" className="rapport-logo-centered" />
      </div>

      <div className="rapport-card">
        <h1 className="rapport-title">Rapport & Statistik</h1>
        <div className="rapport-divider" />

        <section aria-labelledby="checkin-volume-title" style={{ border: '1px solid #dedbd3', borderRadius: 12, padding: '18px 20px', marginBottom: 24, background: '#faf9f6' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.6 }}>Officiell plattformsrapport</div>
              <h2 id="checkin-volume-title" style={{ margin: '4px 0 2px', fontSize: 20 }}>CHECK-IN – VOLYM</h2>
              <div style={{ fontSize: 13, opacity: 0.7 }}>TOTAL · avslutade perioder · Europe/Stockholm</div>
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap' }}>
              <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                Periodtyp
                <select value={periodType} onChange={(event) => handlePeriodType(event.target.value as CheckinReportPeriodType)}>
                  <option value="day">DAG</option>
                  <option value="month">MÅNAD</option>
                </select>
              </label>
              <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                Period
                <input
                  type={periodType === 'day' ? 'date' : 'month'}
                  value={periodValue}
                  max={periodType === 'day' ? latestCompletedDayInput() : latestCompletedMonthInput()}
                  onChange={(event) => setPeriodValue(event.target.value)}
                />
              </label>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(170px, 0.7fr) minmax(220px, 1.3fr)', gap: 22, marginTop: 18, alignItems: 'end' }}>
            <div>
              <div style={{ fontSize: 12, opacity: 0.65 }}>Antal slutförda Check-ins</div>
              <div style={{ fontSize: 34, lineHeight: 1.1, fontWeight: 650, marginTop: 3 }}>
                {metricLoading ? '…' : metricResult?.value ?? '—'}
                <span style={{ fontSize: 13, fontWeight: 500, marginLeft: 8, opacity: 0.65 }}>{metricResult?.unit ?? 'COUNT'}</span>
              </div>
              <div style={{ fontSize: 12, marginTop: 7 }}>
                Status: <strong>{metricResult?.quality.maturity ?? (metricLoading ? 'HÄMTAR' : 'EJ TILLGÄNGLIG')}</strong>
              </div>
            </div>

            <div style={{ fontSize: 12, lineHeight: 1.55, opacity: 0.68 }}>
              {resolvedPeriod && <div>Vald period: {formatPeriodLabel(resolvedPeriod.start, resolvedPeriod.end, periodType)}</div>}
              {metricResult && (
                <>
                  <div>Beräknad: {new Date(metricResult.evaluation.calculatedAt).toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm' })}</div>
                  <div>Verifiering: {metricResult.engineBuildSha.slice(0, 12)} · {metricResult.scope.intervalSemantics} · {metricResult.scope.timezone}</div>
                </>
              )}
              {metricError && <div style={{ color: '#8b1e1e', opacity: 1 }}>{metricError}</div>}
            </div>
          </div>
        </section>

        <Layer1PeriodDurationReport />

        <section aria-labelledby="damage-journal-title">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.55 }}>Separat verksamhetsjournal</div>
              <h2 id="damage-journal-title" style={{ margin: '4px 0 0', fontSize: 20 }}>SKADEJOURNAL</h2>
            </div>
            <div style={{ fontSize: 13 }}><strong>Antal träffar i listan:</strong> {filteredRows.length}</div>
          </div>

          <div className="rapport-filter">
            <div>
              <label htmlFor="plats-select">Platsfilter – endast skadejournal:</label>
              <select id="plats-select" value={plats} onChange={(event) => setPlats(event.target.value)}>
                {platsAlternativ.map((place) => <option key={place} value={place}>{place}</option>)}
              </select>
            </div>
          </div>

          <div className="rapport-search-row" style={{ position: 'relative' }}>
            <input type="text" placeholder="SÖK REG.NR" value={searchRegnr} onChange={(event) => setSearchRegnr(event.target.value.toUpperCase())} className="rapport-search-input" autoComplete="off" />
            {autocomplete.length > 0 && (
              <ul className="autocomplete-list" style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #ddd', zIndex: 10, listStyle: 'none', padding: '4px', margin: 0, borderRadius: '4px' }}>
                {autocomplete.map((regnr) => (
                  <li key={regnr} onMouseDown={() => { setSearchRegnr(regnr); setActiveRegnr(regnr); setAutocomplete([]); }} style={{ padding: '6px', cursor: 'pointer' }}>{regnr}</li>
                ))}
              </ul>
            )}
            <button className="rapport-search-btn" onClick={() => setActiveRegnr(searchRegnr.trim())} disabled={!searchRegnr.trim()}>Sök</button>
            {activeRegnr && <button className="rapport-reset-btn" onClick={() => { setActiveRegnr(''); setSearchRegnr(''); }}>Rensa</button>}
          </div>

          {damageLoading ? <div>Hämtar skadejournal...</div>
            : damageError ? <div style={{ color: 'red' }}>{damageError}</div>
              : (
                <div className="rapport-table-wrap">
                  <table className="rapport-table">
                    <thead>
                      <tr>
                        <th onClick={() => handleSort('regnr')}>Regnr<SortArrow column="regnr" sortKey={sortKey} sortOrder={sortOrder} /></th>
                        <th onClick={() => handleSort('brand')}>Bilmodell<SortArrow column="brand" sortKey={sortKey} sortOrder={sortOrder} /></th>
                        <th onClick={() => handleSort('status')}>Källa<SortArrow column="status" sortKey={sortKey} sortOrder={sortOrder} /></th>
                        <th onClick={() => handleSort('created_at')} className="datum-col">Datum<SortArrow column="created_at" sortKey={sortKey} sortOrder={sortOrder} /></th>
                        <th onClick={() => handleSort('region')} className="location-group">Region<SortArrow column="region" sortKey={sortKey} sortOrder={sortOrder} /></th>
                        <th onClick={() => handleSort('ort')} className="location-group">Ort<SortArrow column="ort" sortKey={sortKey} sortOrder={sortOrder} /></th>
                        <th onClick={() => handleSort('station_namn')} className="location-group">Station<SortArrow column="station_namn" sortKey={sortKey} sortOrder={sortOrder} /></th>
                        <th onClick={() => handleSort('damage_type')}>Skada<SortArrow column="damage_type" sortKey={sortKey} sortOrder={sortOrder} /></th>
                        <th onClick={() => handleSort('description')}>Anteckning<SortArrow column="description" sortKey={sortKey} sortOrder={sortOrder} /></th>
                        <th>Bild/video</th>
                        <th onClick={() => handleSort('inchecker_name')}>Godkänd av<SortArrow column="inchecker_name" sortKey={sortKey} sortOrder={sortOrder} /></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.length === 0 ? (
                        <tr><td colSpan={11} style={{ textAlign: 'center' }}>Inga skador för det reg.nr eller valda filtret.</td></tr>
                      ) : filteredRows.map((row) => (
                        <tr key={row.id}>
                          <td className="regnr-col"><span className="regnr-link" style={{ textDecoration: 'underline', cursor: 'pointer' }}>{row.regnr}</span></td>
                          <td>{row.brand || ''} {row.model || ''}</td>
                          <td>{getDamageStatus(row)}</td>
                          <td className="datum-col">
                            {row.created_at ? new Date(row.created_at).toLocaleDateString('sv-SE') : '--'}
                            <div className="datum-klocka">{formatCheckinTime(row)}</div>
                          </td>
                          <td className="location-group region-section">{row.region}</td>
                          <td className="location-group">{row.ort || '--'}</td>
                          <td className="location-group">{row.station_namn || '--'}</td>
                          <td>{row.damage_type || '--'}</td>
                          <td className="kommentar-col">{row.description || '--'}</td>
                          <td className="centered-cell">
                            {row.media_url ? (
                              <img
                                src={row.media_url}
                                width={72}
                                height={72}
                                className="media-thumb"
                                onClick={() => openMediaModalForRow(row)}
                                alt={`Skadebild för ${row.regnr}`}
                                style={{ cursor: 'pointer', objectFit: 'cover', borderRadius: '4px' }}
                                onError={(event) => { (event.currentTarget as HTMLImageElement).style.display = 'none'; }}
                              />
                            ) : '--'}
                          </td>
                          <td>{row.inchecker_name || row.godkandAv || '--'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
        </section>
      </div>

      <footer className="copyright-footer">&copy; {new Date().getFullYear()} Albarone AB &mdash; Alla rättigheter förbehållna</footer>
      <MediaModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        media={modalMedia}
        title={modalTitle}
        currentIdx={modalIdx}
        isLoading={modalIsLoading}
        onPrev={modalMedia.length > 1 ? handleModalPrev : undefined}
        onNext={modalMedia.length > 1 ? handleModalNext : undefined}
        hasPrev={modalIdx > 0}
        hasNext={modalIdx < modalMedia.length - 1}
      />
    </main>
  );
}

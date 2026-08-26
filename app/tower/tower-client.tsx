'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildTowerCsv } from '@/lib/tower-export';
import TowerWheelChangePanel from './tower-wheel-change-panel';
import styles from './tower.module.css';

type CockpitItem = {
  regnr: string;
  station: string | null;
  state: string | null;
  stateStartedAt: string | null;
  downtimeReason: string | null;
  attention: string[];
  ownerFunctions: string[];
  actionStatus: string | null;
  deadlineAt: string | null;
  overdue: boolean;
  waitingVerification: boolean;
  nextSteps: string[];
  tankReceipt: { url: string; uploadedAt: string | null } | null;
  tankReceiptCount: number;
  links: { vagnkort: string };
};

type CockpitData = {
  generatedAt: string;
  perspective: string;
  stationFilter: string | null;
  summary: {
    attentionVehicles: number;
    downtime: number;
    blocked: number;
    overdue: number;
    waitingVerification: number;
  };
  items: CockpitItem[];
};

type TowerTheme = 'dark' | 'ivory' | 'steel' | 'contrast';
type TowerLayout = 'cockpit' | 'focus' | 'command';
type WindowKey = 'fleet' | 'signals' | 'detail';

const themeLabels: Record<TowerTheme, string> = {
  dark: 'IT DARK',
  ivory: 'CORE IVORY',
  steel: 'STEEL',
  contrast: 'HIGH CONTRAST',
};

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('sv-SE', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function age(value: string | null): string {
  if (!value) return '—';
  const ms = Date.now() - new Date(value).getTime();
  if (ms < 0) return '0 h';
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return `${days} d ${rest} h`;
}

function label(value: string): string {
  const labels: Record<string, string> = {
    DOWNTIME: 'Downtime',
    BLOCKERANDE_KONTROLLPUNKT: 'Blockerande kontrollpunkt',
    BLOCKERANDE_ACTION: 'Blockerande action',
    BLOCKERANDE_HANDSLAG: 'Blockerande handslag',
    FÖRSENAD: 'Försenad',
    VÄNTAR_VERIFIERING: 'Väntar verifiering',
    SALU_T10: 'SALU T-10',
    SALU_PASSERAD: 'SALU passerad',
  };
  return labels[value] ?? value;
}

async function fetchCockpit(): Promise<CockpitData> {
  const response = await fetch('/api/operator-cockpit', { cache: 'no-store' });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error ?? 'Kunde inte läsa Tower');
  return payload.data as CockpitData;
}

function safeFilePart(value: string): string {
  return value.replaceAll(':', '-').replaceAll('.', '-');
}

function signalWeight(item: CockpitItem): number {
  let score = item.attention.length;
  if (item.overdue) score += 6;
  if (item.waitingVerification) score += 3;
  if (item.state === 'DOWNTIME') score += 2;
  return score;
}

export default function OperatorCockpit() {
  const [data, setData] = useState<CockpitData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [station, setStation] = useState('ALLA');
  const [query, setQuery] = useState('');
  const [theme, setTheme] = useState<TowerTheme>('dark');
  const [layout, setLayout] = useState<TowerLayout>('cockpit');
  const [compact, setCompact] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [selectedReg, setSelectedReg] = useState<string | null>(null);
  const [minimized, setMinimized] = useState<WindowKey[]>([]);
  const [pinned, setPinned] = useState<WindowKey[]>([]);
  const [maximized, setMaximized] = useState<WindowKey | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchCockpit());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Kunde inte läsa Tower');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void fetchCockpit()
      .then((next) => {
        if (!active) return;
        setData(next);
        setError(null);
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : 'Kunde inte läsa Tower');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem('incheckad-tower-theme') as TowerTheme | null;
    const savedLayout = window.localStorage.getItem('incheckad-tower-layout') as TowerLayout | null;
    const savedCompact = window.localStorage.getItem('incheckad-tower-compact');
    if (savedTheme && savedTheme in themeLabels) setTheme(savedTheme);
    if (savedLayout === 'cockpit' || savedLayout === 'focus' || savedLayout === 'command') setLayout(savedLayout);
    if (savedCompact === '1') setCompact(true);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen((open) => !open);
      }
      if (event.key === 'Escape') {
        setCommandOpen(false);
        setThemeOpen(false);
        setMaximized(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const stations = useMemo(() => {
    const values = new Set((data?.items ?? []).map((item) => item.station).filter(Boolean) as string[]);
    return ['ALLA', ...Array.from(values).sort((a, b) => a.localeCompare(b, 'sv'))];
  }, [data]);

  const items = useMemo(() => {
    const needle = query.trim().toUpperCase();
    return (data?.items ?? []).filter((item) => {
      if (station !== 'ALLA' && item.station !== station) return false;
      if (!needle) return true;
      return item.regnr.includes(needle)
        || (item.station ?? '').toUpperCase().includes(needle)
        || item.ownerFunctions.some((owner) => owner.toUpperCase().includes(needle))
        || item.attention.some((reason) => label(reason).toUpperCase().includes(needle));
    });
  }, [data, station, query]);

  const signalItems = useMemo(() => {
    return [...(data?.items ?? [])]
      .filter((item) => item.attention.length > 0 || item.overdue || item.waitingVerification)
      .sort((a, b) => signalWeight(b) - signalWeight(a))
      .slice(0, 8);
  }, [data]);

  const stationSignals = useMemo(() => {
    const buckets = new Map<string, { attention: number; overdue: number }>();
    for (const item of data?.items ?? []) {
      const key = item.station ?? 'Okänd station';
      const current = buckets.get(key) ?? { attention: 0, overdue: 0 };
      if (item.attention.length > 0) current.attention += 1;
      if (item.overdue) current.overdue += 1;
      buckets.set(key, current);
    }
    return [...buckets.entries()]
      .map(([name, counts]) => ({ name, ...counts }))
      .sort((a, b) => b.overdue - a.overdue || b.attention - a.attention || a.name.localeCompare(b.name, 'sv'))
      .slice(0, 6);
  }, [data]);

  useEffect(() => {
    if (!selectedReg && items.length > 0) setSelectedReg(items[0].regnr);
    if (selectedReg && items.length > 0 && !items.some((item) => item.regnr === selectedReg)) {
      setSelectedReg(items[0].regnr);
    }
  }, [items, selectedReg]);

  const selected = useMemo(
    () => items.find((item) => item.regnr === selectedReg) ?? signalItems.find((item) => item.regnr === selectedReg) ?? items[0] ?? null,
    [items, selectedReg, signalItems],
  );

  const exportCurrentView = useCallback(() => {
    if (!data || items.length === 0) return;
    const csv = buildTowerCsv(items, data.generatedAt);
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `incheckad-tower-${safeFilePart(data.generatedAt)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }, [data, items]);

  const setThemeAndPersist = (next: TowerTheme) => {
    setTheme(next);
    setThemeOpen(false);
    window.localStorage.setItem('incheckad-tower-theme', next);
  };

  const setLayoutAndPersist = (next: TowerLayout) => {
    setLayout(next);
    window.localStorage.setItem('incheckad-tower-layout', next);
  };

  const setCompactAndPersist = (next: boolean) => {
    setCompact(next);
    window.localStorage.setItem('incheckad-tower-compact', next ? '1' : '0');
  };

  const toggleWindow = (key: WindowKey, kind: 'min' | 'pin' | 'max') => {
    if (kind === 'min') {
      setMinimized((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
      if (maximized === key) setMaximized(null);
    }
    if (kind === 'pin') {
      setPinned((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
    }
    if (kind === 'max') {
      setMaximized((current) => current === key ? null : key);
      setMinimized((current) => current.filter((item) => item !== key));
    }
  };

  const resetWindows = () => {
    setMinimized([]);
    setPinned([]);
    setMaximized(null);
    setLayoutAndPersist('cockpit');
  };

  const shellClassName = [
    styles.shell,
    layout === 'focus' ? styles.focusLayout : '',
    layout === 'command' ? styles.commandLayout : '',
    compact ? styles.compact : '',
  ].filter(Boolean).join(' ');

  const windowClass = (key: WindowKey, extra: string) => [
    styles.window,
    extra,
    minimized.includes(key) ? styles.windowMinimized : '',
    pinned.includes(key) ? styles.windowPinned : '',
    maximized === key ? styles.windowMaximized : '',
  ].filter(Boolean).join(' ');

  return (
    <main className={shellClassName} data-theme={theme}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <strong>INCHECKAD</strong>
          <span>BY INVISTO / IT</span>
          <i />
        </div>
        <nav className={styles.nav} aria-label="Tower navigation">
          <Link href="/">Startsida</Link>
          <Link className={styles.activeNav} href="/tower">Tower</Link>
          <Link href="/planning">Planering</Link>
          <Link href="/garage">Garaget</Link>
          <Link href="/ankomst">Ankomst</Link>
          <Link href="/check">Incheckning</Link>
          <Link href="/nybil">Ny bil</Link>
          <Link href="/vagnkort">Vagnkort</Link>
        </nav>
        <div className={styles.sidebarFoot}>
          <span>INVISTO</span>
          <small>CORE / IT</small>
        </div>
      </aside>

      <section className={styles.main}>
        <header className={styles.topbar}>
          <div>
            <strong>Tower</strong>
            <span>OPERATIV KONTROLL</span>
          </div>
          <div className={styles.topbarSpacer} />
          <div className={styles.liveState}><i /> LIVE</div>
          <button className={styles.commandButton} type="button" onClick={() => setCommandOpen(true)}>⌘K COMMAND</button>
          <div className={styles.themePicker}>
            <button className={styles.themeButton} type="button" onClick={() => setThemeOpen((open) => !open)}>
              DISPLAY: {themeLabels[theme]} ▾
            </button>
            {themeOpen ? (
              <div className={styles.themeMenu}>
                {(Object.keys(themeLabels) as TowerTheme[]).map((value) => (
                  <button key={value} type="button" onClick={() => setThemeAndPersist(value)}>
                    <span>{themeLabels[value]}</span>
                    {theme === value ? <b>ACTIVE</b> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </header>

        <div className={styles.workspace}>
          <section className={styles.heroLine}>
            <div>
              <span>INVISTO IT / CONTROL SURFACE</span>
              <h1>Vad kräver uppmärksamhet nu?</h1>
            </div>
            <div className={styles.workspaceActions}>
              <Link href="/tower/history">Drifthistorik</Link>
              <Link href="/tower/metrics">Driftmätning</Link>
              <button type="button" onClick={exportCurrentView} disabled={!data || items.length === 0}>CSV</button>
              <button type="button" onClick={() => void load()} disabled={loading}>{loading ? 'UPPDATERAR…' : 'UPPDATERA'}</button>
            </div>
          </section>

          {error ? <div className={styles.error}>{error}</div> : null}

          <section className={styles.metrics} aria-label="Operativ summering">
            <Metric title="Kräver uppmärksamhet" value={data?.summary.attentionVehicles ?? 0} />
            <Metric title="Blockerade" value={data?.summary.blocked ?? 0} />
            <Metric title="Downtime" value={data?.summary.downtime ?? 0} />
            <Metric title="Försenade" value={data?.summary.overdue ?? 0} emphasis />
            <Metric title="Väntar verifiering" value={data?.summary.waitingVerification ?? 0} />
            <Metric title="Visade" value={items.length} />
          </section>

          <section className={styles.signalRail} aria-label="Live signaler">
            <span>LIVE SIGNAL</span>
            <div>
              {signalItems.length === 0 ? <em>Inga aktiva signaler</em> : signalItems.slice(0, 5).map((item) => (
                <button key={item.regnr} type="button" onClick={() => setSelectedReg(item.regnr)}>
                  <i className={item.overdue ? styles.signalBad : styles.signalWarn} />
                  <strong>{item.regnr}</strong>
                  <small>{item.attention.length ? label(item.attention[0]) : 'Väntar verifiering'}</small>
                </button>
              ))}
            </div>
          </section>

          <section className={styles.controlStrip}>
            <div className={styles.layoutSwitch} aria-label="Tower layout">
              {(['cockpit', 'focus', 'command'] as TowerLayout[]).map((value) => (
                <button key={value} type="button" className={layout === value ? styles.activeLayout : undefined} onClick={() => setLayoutAndPersist(value)}>
                  {value.toUpperCase()}
                </button>
              ))}
            </div>
            <label className={styles.compactToggle}>
              <input type="checkbox" checked={compact} onChange={(event) => setCompactAndPersist(event.target.checked)} />
              <span>COMPACT</span>
            </label>
            <button className={styles.resetButton} type="button" onClick={resetWindows}>RESET WINDOWS</button>
            <div className={styles.generated}>
              <span>SENAST LÄST</span>
              <strong>{data ? formatDate(data.generatedAt) : '—'}</strong>
            </div>
          </section>

          <div className={styles.cockpit}>
            <section className={windowClass('fleet', styles.fleetWindow)}>
              <WindowHead title="FORDONSFLÖDE" windowKey="fleet" minimized={minimized} pinned={pinned} maximized={maximized} onToggle={toggleWindow} />
              {!minimized.includes('fleet') ? (
                <>
                  <div className={styles.filters}>
                    <label>
                      <span>Station</span>
                      <select value={station} onChange={(event) => setStation(event.target.value)}>
                        {stations.map((value) => <option key={value} value={value}>{value === 'ALLA' ? 'Alla stationer' : value}</option>)}
                      </select>
                    </label>
                    <label className={styles.searchField}>
                      <span>Sök</span>
                      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Reg.nr, station, ansvar eller signal" />
                    </label>
                    <div className={styles.filterCount}>{items.length} FORDON</div>
                  </div>

                  {loading && !data ? (
                    <div className={styles.empty}>Läser operativ verklighet…</div>
                  ) : items.length === 0 ? (
                    <div className={styles.empty}>Inga fordon matchar aktuell vy.</div>
                  ) : (
                    <div className={styles.tableWrap}>
                      <table>
                        <thead>
                          <tr>
                            <th>Fordon</th>
                            <th>Signal</th>
                            <th>Tillstånd</th>
                            <th>Ansvar</th>
                            <th>Deadline</th>
                            <th>Nästa steg</th>
                            <th>Evidens</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((item) => (
                            <tr
                              key={item.regnr}
                              className={`${item.overdue ? styles.overdueRow : ''} ${selected?.regnr === item.regnr ? styles.selectedRow : ''}`}
                              onClick={() => setSelectedReg(item.regnr)}
                            >
                              <td><strong className={styles.regnr}>{item.regnr}</strong><span className={styles.subtle}>{item.station ?? 'Station okänd'}</span></td>
                              <td>
                                <div className={styles.tags}>
                                  {item.attention.slice(0, 2).map((reason) => <span key={reason} className={reason === 'FÖRSENAD' ? styles.dangerTag : styles.tag}>{label(reason)}</span>)}
                                </div>
                                {item.downtimeReason ? <span className={styles.reason}>{item.downtimeReason}</span> : null}
                              </td>
                              <td><strong>{item.state ?? '—'}</strong><span className={styles.subtle}>{item.stateStartedAt ? age(item.stateStartedAt) : '—'}</span></td>
                              <td><strong>{item.ownerFunctions.join(' · ') || 'Ej identifierad'}</strong>{item.waitingVerification ? <span className={styles.subtle}>Väntar verifiering</span> : null}</td>
                              <td><strong>{item.actionStatus ?? '—'}</strong><span className={item.overdue ? styles.overdueText : styles.subtle}>{formatDate(item.deadlineAt)}</span></td>
                              <td>{item.nextSteps.length ? item.nextSteps.slice(0, 2).map((step) => <span key={step} className={styles.nextStep}>{step}</span>) : '—'}</td>
                              <td>{item.tankReceipt ? <a className={styles.openLink} href={item.tankReceipt.url} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()}>Tankkvitto →</a> : <Link className={styles.openLink} href={item.links.vagnkort} onClick={(event) => event.stopPropagation()}>Vagnkort →</Link>}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              ) : null}
            </section>

            <section className={windowClass('signals', styles.signalWindow)}>
              <WindowHead title="PRIORITERAT" windowKey="signals" minimized={minimized} pinned={pinned} maximized={maximized} onToggle={toggleWindow} />
              {!minimized.includes('signals') ? (
                <div className={styles.signalBody}>
                  <div className={styles.priorityList}>
                    {signalItems.length === 0 ? <div className={styles.emptySmall}>Inga aktiva avvikelser.</div> : signalItems.map((item) => (
                      <button key={item.regnr} type="button" className={selected?.regnr === item.regnr ? styles.priorityActive : undefined} onClick={() => setSelectedReg(item.regnr)}>
                        <div><strong>{item.regnr}</strong><span>{item.station ?? 'Station okänd'}</span></div>
                        <p>{item.attention.length ? item.attention.map(label).join(' · ') : 'Väntar verifiering'}</p>
                        <small className={item.overdue ? styles.overdueText : undefined}>{item.deadlineAt ? formatDate(item.deadlineAt) : 'Ingen deadline'}</small>
                      </button>
                    ))}
                  </div>
                  <div className={styles.stationSignals}>
                    <div className={styles.sectionLabel}>STATION SIGNAL</div>
                    {stationSignals.map((entry) => (
                      <button key={entry.name} type="button" onClick={() => setStation(entry.name)}>
                        <span>{entry.name}</span>
                        <i><b style={{ width: `${Math.min(100, entry.attention * 18 + entry.overdue * 12)}%` }} /></i>
                        <strong>{entry.attention}</strong>
                        {entry.overdue > 0 ? <em>{entry.overdue} sen</em> : null}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>

            <section className={windowClass('detail', styles.detailWindow)}>
              <WindowHead title="FORDONSDETALJ" windowKey="detail" minimized={minimized} pinned={pinned} maximized={maximized} onToggle={toggleWindow} />
              {!minimized.includes('detail') ? (
                selected ? (
                  <div className={styles.detailBody}>
                    <div className={styles.detailHero}>
                      <div><strong>{selected.regnr}</strong><span>{selected.station ?? 'Station okänd'}</span></div>
                      <em className={selected.overdue ? styles.detailCritical : styles.detailNormal}>{selected.overdue ? 'KRITISK' : 'AKTIV'}</em>
                    </div>
                    <dl className={styles.detailGrid}>
                      <div><dt>Tillstånd</dt><dd>{selected.state ?? '—'}</dd></div>
                      <div><dt>Tid i state</dt><dd>{selected.stateStartedAt ? age(selected.stateStartedAt) : '—'}</dd></div>
                      <div><dt>Ansvar</dt><dd>{selected.ownerFunctions.join(' · ') || 'Ej identifierad'}</dd></div>
                      <div><dt>Action</dt><dd>{selected.actionStatus ?? '—'}</dd></div>
                      <div><dt>Deadline</dt><dd className={selected.overdue ? styles.overdueText : undefined}>{formatDate(selected.deadlineAt)}</dd></div>
                      <div><dt>Verifiering</dt><dd>{selected.waitingVerification ? 'Väntar' : 'Ej väntande'}</dd></div>
                    </dl>
                    <div className={styles.detailSection}>
                      <span>SIGNALER</span>
                      <div className={styles.tags}>{selected.attention.length ? selected.attention.map((reason) => <b key={reason} className={reason === 'FÖRSENAD' ? styles.dangerTag : styles.tag}>{label(reason)}</b>) : <em>Inga signaler</em>}</div>
                    </div>
                    {selected.downtimeReason ? <div className={styles.detailSection}><span>ORSAK</span><p>{selected.downtimeReason}</p></div> : null}
                    <div className={styles.detailSection}>
                      <span>NÄSTA STEG</span>
                      {selected.nextSteps.length ? selected.nextSteps.map((step) => <p key={step} className={styles.detailStep}>→ {step}</p>) : <p>—</p>}
                    </div>
                    <div className={styles.detailActions}>
                      <Link href={selected.links.vagnkort}>ÖPPNA VAGNKORT</Link>
                      {selected.tankReceipt ? <a href={selected.tankReceipt.url} target="_blank" rel="noopener noreferrer">TANKKVITTO</a> : null}
                    </div>
                  </div>
                ) : <div className={styles.emptySmall}>Välj ett fordon.</div>
              ) : null}
            </section>
          </div>

          <section className={styles.wheelSurface}>
            <TowerWheelChangePanel />
          </section>

          <footer className={styles.footerLine}>
            <span>DATA → INSIGHT → ACTION → EFFECT</span>
            <strong>INVISTO IT / DYNAMIC CONTROL SURFACE</strong>
          </footer>
        </div>
      </section>

      {commandOpen ? (
        <div className={styles.commandOverlay} role="dialog" aria-modal="true" aria-label="Tower command center" onMouseDown={(event) => { if (event.currentTarget === event.target) setCommandOpen(false); }}>
          <div className={styles.commandPalette}>
            <div className={styles.commandHeader}><span>&gt;_</span><strong>COMMAND CENTER</strong><button type="button" onClick={() => setCommandOpen(false)}>ESC</button></div>
            <div className={styles.commandGroup}><span>LAYOUT</span>
              <button type="button" onClick={() => { setLayoutAndPersist('cockpit'); setCommandOpen(false); }}>COCKPIT <small>Hela kontrollrummet</small></button>
              <button type="button" onClick={() => { setLayoutAndPersist('focus'); setCommandOpen(false); }}>FOCUS <small>Fordonsflöde + detalj</small></button>
              <button type="button" onClick={() => { setLayoutAndPersist('command'); setCommandOpen(false); }}>COMMAND <small>Signal + prioritet</small></button>
            </div>
            <div className={styles.commandGroup}><span>DISPLAY</span>
              {(Object.keys(themeLabels) as TowerTheme[]).map((value) => <button key={value} type="button" onClick={() => { setThemeAndPersist(value); setCommandOpen(false); }}>{themeLabels[value]}<small>{value === 'dark' ? 'INVISTO IT' : 'Personlig display'}</small></button>)}
            </div>
            <div className={styles.commandGroup}><span>ACTION</span>
              <button type="button" onClick={() => { void load(); setCommandOpen(false); }}>UPPDATERA DATA <small>Läs om Tower read-model</small></button>
              <button type="button" onClick={() => { resetWindows(); setCommandOpen(false); }}>RESET WINDOWS <small>Återställ arbetsytan</small></button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function Metric({ title, value, emphasis = false }: { title: string; value: number; emphasis?: boolean }) {
  return (
    <div className={`${styles.metric} ${emphasis && value > 0 ? styles.metricEmphasis : ''}`}>
      <span>{title}</span>
      <strong>{value}</strong>
      <i />
    </div>
  );
}

function WindowHead({
  title,
  windowKey,
  minimized,
  pinned,
  maximized,
  onToggle,
}: {
  title: string;
  windowKey: WindowKey;
  minimized: WindowKey[];
  pinned: WindowKey[];
  maximized: WindowKey | null;
  onToggle: (key: WindowKey, kind: 'min' | 'pin' | 'max') => void;
}) {
  return (
    <header className={styles.windowHead}>
      <strong>{title}</strong>
      <div className={styles.windowSpacer} />
      <div className={styles.windowTools}>
        <button type="button" aria-pressed={pinned.includes(windowKey)} onClick={() => onToggle(windowKey, 'pin')} title="Fäst fönster">P</button>
        <button type="button" onClick={() => onToggle(windowKey, 'min')} title="Minimera">{minimized.includes(windowKey) ? '+' : '−'}</button>
        <button type="button" aria-pressed={maximized === windowKey} onClick={() => onToggle(windowKey, 'max')} title="Maximera">{maximized === windowKey ? '↙' : '↗'}</button>
      </div>
    </header>
  );
}

import type { Metadata } from 'next';
import CoreProductShell from '@/components/CoreProductShell';
import LegacyCurrentStatePanel from './legacy-current-state-panel';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'LEGACY | Incheckad',
  description: 'Verifierad current-state och explicit överlämning till Garage UT',
};

const workspace: React.CSSProperties = { display: 'grid', gap: 18 };
const section: React.CSSProperties = { display: 'grid', gap: 8 };
const label: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', fontSize: 12, letterSpacing: '.04em', color: '#50565a' };

export default function LegacyPage() {
  return (
    <CoreProductShell
      active="legacy"
      title="LEGACY"
      descriptor="CURRENT-STATE / GARAGE UT HANDOFF"
      eyebrow="INVISTO CORE / LEGACY CONTROL"
    >
      <div style={workspace}>
        <section style={section}>
          <div style={label}>
            <strong>01 / VERIFIERA CURRENT-STATE</strong>
            <span>Aktuell sanning från verifieringstidpunkten · ingen historisk backfill</span>
          </div>
          <LegacyCurrentStatePanel />
        </section>
        <section style={section} aria-label="LEGACY till Garage UT">
          <div style={label}>
            <strong>02 / ÖVERLÄMNA TILL GARAGE UT</strong>
            <span>Visas i kontrollbilden när verifierad LEGACY-entry finns · därefter fortsätter arbetet i Garage</span>
          </div>
        </section>
      </div>
    </CoreProductShell>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import styles from './home.module.css';

export const metadata: Metadata = {
  title: 'INCHECKAD',
  description: 'Operativ plattform',
};

const modules = [
  { href: '/tower', label: 'Tower', detail: 'Överblick och kontroll', index: '01' },
  { href: '/planning', label: 'Planering', detail: 'Beslutsstöd, beslut och handslag', index: '02' },
  { href: '/garage', label: 'Garaget', detail: 'Överlämningar, orderflöde och kontrollpunkter', index: '03' },
  { href: '/ankomst', label: 'Ankomst', detail: 'Registrera faktisk ankomst', index: '04' },
  { href: '/check', label: 'Incheckning', detail: 'Kontrollera och verifiera', index: '05' },
  { href: '/nybil', label: 'Ny bil', detail: 'Registrera och verifiera ny bil', index: '06' },
];

export default function HomePage() {
  return (
    <main className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <strong>INCHECKAD</strong>
          <span>BY INVISTO / IT</span>
          <i />
        </div>

        <div className={styles.sidebarCopy}>
          <span>OPERATIV PLATTFORM</span>
          <p>En ingång till kontroll, planering och operativt arbete.</p>
        </div>

        <div className={styles.sidebarFoot}>
          <span>INVISTO</span>
          <small>CORE / OPERATIONS</small>
        </div>
      </aside>

      <section className={styles.surface}>
        <header className={styles.topbar}>
          <div className={styles.topbarTitle}>
            <strong>Startsida</strong>
            <span>CONTROL / OPERATIONS / VERIFIED FLOW</span>
          </div>
          <div className={styles.topbarSpacer} />
          <span className={styles.mode}>INVISTO CORE</span>
        </header>

        <section className={styles.hero}>
          <span>INCHECKAD CORE / OPERATIONS</span>
          <h1>Vad ska du göra?</h1>
          <p>Välj arbetsyta utifrån var i verksamhetsflödet du befinner dig.</p>
          <i />
        </section>

        <section className={styles.workspace} aria-label="INCHECKAD arbetsytor">
          <div className={styles.workspaceHeading}>
            <strong>ARBETSFLÖDE</strong>
            <span>Från överblick och beslut till faktisk kontroll och verifiering.</span>
          </div>

          <div className={styles.moduleGrid}>
            {modules.map((item) => (
              <Link href={item.href} key={item.href} className={styles.moduleCard}>
                <span className={styles.index}>{item.index}</span>
                <div>
                  <strong>{item.label}</strong>
                  <small>{item.detail}</small>
                </div>
                <span className={styles.arrow} aria-hidden="true">→</span>
              </Link>
            ))}

            <Link href="/vagnkort" className={styles.moduleCard}>
              <span className={styles.index}>07</span>
              <div>
                <strong>Vagnkort</strong>
                <small>Fordonsinformation och historik</small>
              </div>
              <span className={styles.arrow} aria-hidden="true">→</span>
            </Link>
          </div>
        </section>
      </section>
    </main>
  );
}

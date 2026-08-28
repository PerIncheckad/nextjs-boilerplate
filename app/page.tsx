import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import styles from './home.module.css';

export const metadata: Metadata = {
  title: 'INCHECKAD',
  description: 'Operativ plattform',
};

const coreModules = [
  { href: '/tower', label: 'Tower', detail: 'Operativ uppmärksamhet och kontroll', index: '01' },
  { href: '/planning', label: 'Planering', detail: 'Beslut, behov och handslag', index: '02' },
  { href: '/garage', label: 'Garaget', detail: 'Orderflöde och kontrollpunkter', index: '03' },
];

const operationModules = [
  { href: '/ankomst', label: 'Ankomst' },
  { href: '/check', label: 'Incheckning' },
  { href: '/nybil', label: 'Ny bil' },
];

export default function HomePage() {
  return (
    <main className={styles.shell}>
      <section className={styles.entry}>
        <header className={styles.header}>
          <Image
            src="/brand/incheckad-by-invisto-it.svg"
            alt="INCHECKAD — BY INVISTO / IT"
            width={520}
            height={210}
            priority
            className={styles.logo}
          />
          <div className={styles.meta}>
            <span>OPERATIV PLATTFORM</span>
            <span>INVISTO CORE</span>
          </div>
        </header>

        <section className={styles.hero}>
          <span className={styles.eyebrow}>CONTROL / OPERATIONS</span>
          <h1>Från signal<br />till verifierad effekt.</h1>
          <p>
            En sammanhängande arbetsyta för kontroll, beslut och operativ verklighet.
          </p>
        </section>

        <section className={styles.core} aria-label="INCHECKAD Core">
          <div className={styles.sectionIntro}>
            <span>CORE</span>
            <p>Välj var arbetet börjar.</p>
          </div>

          <nav className={styles.coreNav}>
            {coreModules.map((item) => (
              <Link href={item.href} key={item.href} className={styles.coreLink}>
                <span className={styles.index}>{item.index}</span>
                <span className={styles.coreCopy}>
                  <strong>{item.label}</strong>
                  <small>{item.detail}</small>
                </span>
                <span className={styles.arrow} aria-hidden="true">↗</span>
              </Link>
            ))}
          </nav>
        </section>

        <footer className={styles.footer}>
          <div className={styles.operationLabel}>
            <span>OPERATIVT</span>
          </div>
          <nav className={styles.operationNav} aria-label="Operativa arbetsytor">
            {operationModules.map((item) => (
              <Link href={item.href} key={item.href}>{item.label}</Link>
            ))}
            <Link href="/vagnkort">Vagnkort</Link>
          </nav>
          <span className={styles.footerMark}>MABISYD MOBILITY / ALBARONE</span>
        </footer>
      </section>

      <aside className={styles.visual} aria-hidden="true">
        <div className={styles.visualShade} />
        <div className={styles.visualTop}>INCHECKAD / BY INVISTO / IT</div>
        <div className={styles.visualCopy}>
          <span>DATA → INSIGHT → ACTION → EFFECT</span>
          <strong>CONTROL THE WORK.<br />PROVE THE EFFECT.</strong>
        </div>
      </aside>
    </main>
  );
}

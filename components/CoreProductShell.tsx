import Link from 'next/link';
import type { ReactNode } from 'react';
import OperationalNavigation from './OperationalNavigation';
import styles from './core-product-shell.module.css';

type ActiveModule = 'tower' | 'planning' | 'garage' | 'inhyrd' | 'legacy' | 'hjulskifte' | 'avveckla';

const coreModules = [
  ['/tower', 'TOWER', 'tower'],
  ['/planning', 'PLANERING', 'planning'],
  ['/garage', 'GARAGET', 'garage'],
] as const;

const supportingModules = [
  ['/hjulskifte', 'HJULSKIFTE', 'hjulskifte'],
  ['/avveckla', 'AVVECKLA', 'avveckla'],
  ['/legacy', 'LEGACY', 'legacy'],
] as const;

export default function CoreProductShell({
  active,
  title,
  descriptor,
  eyebrow,
  children,
}: {
  active: ActiveModule;
  title: string;
  descriptor: string;
  eyebrow: string;
  children: ReactNode;
}) {
  const operationalActive = active === 'inhyrd' ? '/inhyrd' : undefined;

  return (
    <div className={styles.shell}>
      <header className={styles.globalHeader}>
        <Link className={styles.homeLink} href="/" aria-label="INCHECKAD startsida">
          <span className={styles.brandName}>INCHECKAD</span>
          <span className={styles.brandByline}>BY INVISTO / IT</span>
        </Link>

        <div className={styles.headerContext}>
          <strong>{title}</strong>
          <span>{descriptor}</span>
        </div>
      </header>

      <nav className={styles.coreNavigation} aria-label="INCHECKAD Core">
        <span className={styles.navigationLabel}>CORE</span>
        <div className={styles.navigationLinks}>
          {coreModules.map(([href, label, key]) => (
            <Link key={href} className={key === active ? styles.active : undefined} href={href}>
              {label}
            </Link>
          ))}
        </div>

        <div className={styles.supportingLinks} aria-label="Stödytor">
          {supportingModules.map(([href, label, key]) => (
            <Link key={href} className={key === active ? styles.active : undefined} href={href}>
              {label}
            </Link>
          ))}
        </div>
      </nav>

      <OperationalNavigation active={operationalActive} />

      <main className={styles.surface}>
        <section className={styles.hero}>
          <span>{eyebrow}</span>
          <h1>{title}</h1>
          <p>{descriptor}</p>
        </section>

        <div className={styles.content}>{children}</div>
      </main>
    </div>
  );
}

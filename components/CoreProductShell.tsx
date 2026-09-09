import Link from 'next/link';
import type { ReactNode } from 'react';
import OperationalNavigation from './OperationalNavigation';
import styles from './core-product-shell.module.css';

type ActiveModule = 'tower' | 'planning' | 'garage' | 'inhyrd' | 'legacy' | 'hjulskifte' | 'avveckla';

const primaryModules = [
  ['/', 'STARTSIDA', 'home'],
  ['/tower', 'TOWER', 'tower'],
  ['/planning', 'PLANERING', 'planning'],
  ['/garage', 'GARAGET', 'garage'],
] as const;

const trailingModules = [
  ['/legacy', 'LEGACY', 'legacy'],
  ['/hjulskifte', 'HJULSKIFTE', 'hjulskifte'],
  ['/avveckla', 'AVVECKLA', 'avveckla'],
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
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <strong>INCHECKAD</strong>
          <span>BY INVISTO / IT</span>
          <i />
        </div>

        <nav className={styles.nav} aria-label={`${title} navigation`}>
          {primaryModules.map(([href, label, key]) => (
            <Link key={href} className={key === active ? styles.active : undefined} href={href}>
              {label}
            </Link>
          ))}

          <OperationalNavigation
            variant="sidebar"
            active={active === 'inhyrd' ? '/inhyrd' : undefined}
          />

          {trailingModules.map(([href, label, key]) => (
            <Link key={href} className={key === active ? styles.active : undefined} href={href}>
              {label}
            </Link>
          ))}
        </nav>

        <div className={styles.sidebarFoot}>
          <span>INVISTO</span>
          <small>CORE / OPERATIONS</small>
        </div>
      </aside>

      <section className={styles.surface}>
        <header className={styles.topbar}>
          <div className={styles.topbarTitle}>
            <strong>{title}</strong>
            <span>{descriptor}</span>
          </div>
          <div className={styles.topbarSpacer} />
          <span className={styles.mode}>INVISTO CORE</span>
        </header>

        <section className={styles.hero}>
          <span>{eyebrow}</span>
          <h1>{title}</h1>
          <i />
        </section>

        <div className={styles.content}>{children}</div>
      </section>
    </div>
  );
}

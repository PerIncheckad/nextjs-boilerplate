import Link from 'next/link';
import type { ReactNode } from 'react';
import styles from './core-product-shell.module.css';

type ActiveModule = 'tower' | 'planning' | 'garage';

const modules = [
  ['/', 'Startsida', 'home'],
  ['/tower', 'Tower', 'tower'],
  ['/planning', 'Planering', 'planning'],
  ['/garage', 'Garaget', 'garage'],
  ['/ankomst', 'Ankomst', 'ankomst'],
  ['/check', 'Incheckning', 'check'],
  ['/nybil', 'Ny bil', 'nybil'],
  ['/status', 'Status', 'status'],
  ['/vagnkort', 'Vagnkort', 'vagnkort'],
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
          {modules.map(([href, label, key]) => (
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

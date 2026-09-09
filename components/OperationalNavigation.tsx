import Link from 'next/link';
import {
  OPERATIONAL_NAVIGATION_ITEMS,
  type OperationalRoute,
} from './operational-navigation-contract';
import styles from './operational-navigation.module.css';

type OperationalNavigationProps = {
  active?: OperationalRoute;
  variant?: 'sidebar' | 'compact';
};

function NavigationLinks({ active }: { active?: OperationalRoute }) {
  return (
    <>
      {OPERATIONAL_NAVIGATION_ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.href === active ? 'page' : undefined}
          className={item.href === active ? styles.active : undefined}
        >
          {item.label}
        </Link>
      ))}
    </>
  );
}

function NavigationContent({ active }: { active?: OperationalRoute }) {
  const activeLabel = OPERATIONAL_NAVIGATION_ITEMS.find((item) => item.href === active)?.label;

  return (
    <>
      <div className={styles.desktopNavigation}>
        <span className={styles.groupLabel}>OPERATIVT</span>
        <div className={styles.links}>
          <NavigationLinks active={active} />
        </div>
      </div>

      <details className={styles.mobileNavigation}>
        <summary>
          <span>OPERATIVT</span>
          {activeLabel ? <strong>{activeLabel}</strong> : null}
        </summary>
        <div className={styles.mobileLinks}>
          <NavigationLinks active={active} />
        </div>
      </details>
    </>
  );
}

export default function OperationalNavigation({ active, variant = 'compact' }: OperationalNavigationProps) {
  if (variant === 'sidebar') {
    return (
      <div className={styles.sidebar}>
        <NavigationContent active={active} />
      </div>
    );
  }

  return (
    <nav className={styles.compact} aria-label="OPERATIVT">
      <NavigationContent active={active} />
    </nav>
  );
}

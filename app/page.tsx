import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'INCHECKAD',
  description: 'Operativ plattform',
};

const controlModules = [
  { href: '/tower', label: 'Tower', detail: 'Överblick och kontroll' },
  { href: '/planning', label: 'Planering', detail: 'Framtida behov och beslut' },
  { href: '/garage', label: 'Garaget', detail: 'Operativ fordonsstyrning' },
];

const operationModules = [
  { href: '/ankomst', label: 'Ankomst', detail: 'Registrera faktisk ankomst' },
  { href: '/check', label: 'Incheckning', detail: 'Kontrollera och verifiera' },
  { href: '/nybil', label: 'Ny bil', detail: 'Registrera ny bil' },
  { href: '/vagnkort', label: 'Vagnkort', detail: 'Fordonsinformation' },
];

function ModuleLink({ href, label, detail }: { href: string; label: string; detail: string }) {
  return (
    <Link href={href} className="home-module-link">
      <span>
        <strong>{label}</strong>
        <small>{detail}</small>
      </span>
      <span className="home-module-arrow" aria-hidden="true">→</span>
    </Link>
  );
}

export default function HomePage() {
  return (
    <main className="home-shell">
      <section className="home-workspace" aria-label="INCHECKAD navigation">
        <header className="home-header">
          <Image
            src="/brand/incheckad-by-invisto-it.svg"
            alt="INCHECKAD — BY INVISTO / IT"
            width={520}
            height={210}
            priority
            className="home-brand-mark"
          />
          <div className="home-header-meta">
            <span>OPERATIV PLATTFORM</span>
            <span>SECURE ACCESS</span>
          </div>
        </header>

        <div className="home-intro">
          <p className="home-eyebrow">CONTROL / OPERATIONS</p>
          <h1>Vad ska du göra?</h1>
          <p>Välj arbetsyta. Systemet håller isär kontroll, planering och operativt arbete.</p>
        </div>

        <div className="home-module-groups">
          <section className="home-module-group" aria-labelledby="home-control-title">
            <div className="home-group-heading">
              <span>01</span>
              <h2 id="home-control-title">Kontroll</h2>
            </div>
            <div className="home-module-list">
              {controlModules.map((item) => <ModuleLink key={item.href} {...item} />)}
            </div>
          </section>

          <section className="home-module-group" aria-labelledby="home-operations-title">
            <div className="home-group-heading">
              <span>02</span>
              <h2 id="home-operations-title">Operativt</h2>
            </div>
            <div className="home-module-list">
              {operationModules.map((item) => <ModuleLink key={item.href} {...item} />)}
            </div>
          </section>
        </div>

        <footer className="home-footer">
          <span>MABISYD MOBILITY / ALBARONE</span>
          <span>OPERATIV MILJÖ</span>
        </footer>
      </section>

      <aside className="home-visual" aria-hidden="true">
        <div className="home-visual-overlay" />
        <div className="home-visual-copy">
          <span>DATA → INSIGHT → ACTION → EFFECT</span>
          <strong>CONTROL THE WORK.<br />PROVE THE EFFECT.</strong>
        </div>
      </aside>
    </main>
  );
}

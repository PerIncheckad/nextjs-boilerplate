import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Incheckad',
  description: 'Startsida',
};

const MABI_LOGO_URL = "/mabi-logo.png";
const REPORT_WHITELIST = [
  'per.andersson@mabi.se',
  'ingemar.carqueija@mabi.se',
];

function canShowReport(userEmail: string): boolean {
  return REPORT_WHITELIST.includes(userEmail?.toLowerCase());
}

const userEmail = typeof window !== "undefined"
  ? window.localStorage.getItem("user_email") || ""
  : "";

// ----- Lägg till GlobalStyles -----
const GlobalStyles = () => (
    <style jsx global>{`
        :root {
          --color-bg: #f8fafc; --color-card: #ffffff; --color-text: #1f2937; --color-text-secondary: #6b7280;
          --color-primary: #2563eb; --color-primary-light: #eff6ff; --color-success: #16a34a; --color-success-light: #f0fdf4;
          --color-danger: #dc2626; --color-danger-light: #fef2f2; --color-warning: #f59e0b; --color-warning-light: #fffbeb;
          --color-border: #e5e7eb; --color-border-focus: #3b82f6; --color-disabled: #a1a1aa; --color-disabled-light: #f4f4f5;
        }
        body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; background-color: var(--color-bg); color: var(--color-text); margin: 0; }
        .main-logo { max-width: 90px; height: auto; margin: 0 auto 24px auto; display: block; }
        .home-card { background-color: var(--color-card); padding: 2rem; border-radius: 12px; max-width: 460px; margin: 3rem auto 0 auto; box-shadow: 0 1px 4px rgba(0,0,0,0.08); border: 1px solid var(--color-border);}
        h1 { font-size: 2rem; font-weight: 700; color: var(--color-text); margin:0 0 1rem 0; }
        p { color: var(--color-text-secondary); }
        .btn { padding: 0.75rem 1.5rem; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; transition: all 0.2s; margin-bottom: 8px;}
        .btn.primary { background-color: var(--color-primary); color: white; }
        .btn.secondary { background-color: var(--color-border); color: var(--color-text); }
        .btn:not(:disabled):hover { filter: brightness(1.08); }
        hr { margin: 2rem auto; border-color: var(--color-border); }
        .report-btn { background: var(--color-primary); color: #fff; border-radius: 8px; font-weight: 600; font-size: 1.12rem; letter-spacing: 1px; border: none; padding: 0.8rem 1.8rem; margin-top: 12px;}
        .report-btn:hover { background: #1d4ed8; }
      `}
    </style>
);

export default function HomePage() {
  const showReport = canShowReport(userEmail);

  return (
    <main>
      <GlobalStyles />
      <div className="home-card">
        <img src={MABI_LOGO_URL} alt="MABI Logo" className="main-logo" />
        <h1>Välkommen</h1>
        <p>Använd knappen nedan för att göra en ny incheckning.</p>
        <a href="/check" className="btn primary">Ny incheckning</a>
        <a href="/check/drafts" className="btn secondary" style={{marginLeft: 12}}>Fortsätt påbörjad incheckning</a>
        <hr />
        {showReport && (
          <a href="/rapport" className="report-btn">
            Rapport
          </a>
        )}
      </div>
    </main>
  );
}

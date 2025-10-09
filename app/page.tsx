import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Incheckad',
  description: 'Startsida',
};

const MABI_LOGO_URL = "/mabi-logo.png";

// Hardcoded whitelist (byt till Supabase senare)
const REPORT_WHITELIST = [
  'per.andersson@mabi.se',
  'ingemar.carqueija@mabi.se',
];

function canShowReport(userEmail: string): boolean {
  return REPORT_WHITELIST.includes(userEmail?.toLowerCase());
}

export default function HomePage() {
  // Byt ut mot riktig epost från auth när det är dags
  // Nu testas: visa rapport för Per
  const userEmail = "per.andersson@mabi.se"; // <-- Här anger du aktuell användare!

  const showReport = canShowReport(userEmail);

  return (
    <main>
      <div className="home-card">
        <img src={MABI_LOGO_URL} alt="MABI Logo" className="main-logo" />
        <h1>Välkommen</h1>
        <p>Använd knappen nedan för att göra en ny incheckning.</p>
        <div className="btn-group">
          <a href="/check" className="btn primary">Ny incheckning</a>
          <a href="/check/drafts" className="btn secondary">Fortsätt påbörjad incheckning</a>
        </div>
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

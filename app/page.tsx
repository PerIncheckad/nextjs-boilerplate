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

export default function HomePage() {
  const userEmail = "per.andersson@mabi.se"; // BYT till auth senare!
  const showReport = canShowReport(userEmail);

  return (
    <main className="welcome-main">
      <div className="welcome-content">
        <img src={MABI_LOGO_URL} alt="MABI Logo" className="main-logo" />
        <h1 className="welcome-title">Välkommen</h1>
        <div className="btn-group">
          <a href="/check" className="btn primary">Ny incheckning</a>
          <a href="/check/drafts" className="btn secondary">Fortsätt påbörjad incheckning</a>
        </div>
        {showReport && (
          <div className="report-section">
            <a href="/rapport" className="report-btn">Rapport</a>
          </div>
        )}
      </div>
    </main>
  );
}

import type { Metadata } from 'next';

// Dynamiskt år, alltid aktuellt
const currentYear = new Date().getFullYear();

export const metadata: Metadata = {
  title: 'Incheckad',
  description: 'Startsida',
};

const MABI_LOGO_URL = "https://ufioaijcmaujlvmveyra.supabase.co/storage/v1/object/public/MABI%20Syd%20logga/MABI%20Syd%20logga.png";
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
      <div className="background-img" />
      <img src={MABI_LOGO_URL} alt="MABI Syd logga" className="main-logo" />
      <div className="welcome-card">
        <h1 className="welcome-title">Välkommen!</h1>
        <div className="btn-group">
          <a href="/check" className="btn incheckning">Ny incheckning</a>
          <a href="/check/drafts" className="btn incheckning">Fortsätt påbörjad<br />incheckning</a>
        </div>
        <div className="divider-wrap">
          <hr className="divider" />
        </div>
        {showReport && (
          <div className="report-section">
            <a href="/rapport" className="btn report-btn">RAPPORT</a>
          </div>
        )}
      </div>
      <footer className="copyright-footer">
        &copy; Albarone AB {currentYear} &mdash; All rights reserved
      </footer>
    </main>
  );
}

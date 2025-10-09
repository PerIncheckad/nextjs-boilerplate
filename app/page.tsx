import type { Metadata } from 'next';
import LoginGate from '@/components/LoginGate'; // ← Lägg till denna rad!

// Dynamiskt år, alltid aktuellt
const currentYear = new Date().getFullYear();

export const metadata: Metadata = {
  title: 'Incheckad',
  description: 'Startsida',
};

const MABI_LOGO_URL = "https://ufioaijcmaujlvmveyra.supabase.co/storage/v1/object/public/MABI%20Syd%20logga/MABI%20Syd%20logga%202.png";
const REPORT_WHITELIST = [
  'per.andersson@mabi.se',
  'ingemar.carqueija@mabi.se',
];

function canShowReport(userEmail: string): boolean {
  return REPORT_WHITELIST.includes(userEmail?.toLowerCase());
}

export default function HomePage() {
  // TA BORT HARDCODAD userEmail! LoginGate hanterar detta via supabase!
  // const userEmail = "per.andersson@mabi.se";
  // const showReport = canShowReport(userEmail);

  return (
    <LoginGate>
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
          {/* Rapport-knapp visas via LoginGate-vetot */}
          <div className="report-section">
            <a href="/rapport" className="btn report-btn">RAPPORT</a>
          </div>
        </div>
        <footer className="copyright-footer">
          &copy; Albarone AB {currentYear} &mdash; All rights reserved
        </footer>
      </main>
    </LoginGate>
  );
}

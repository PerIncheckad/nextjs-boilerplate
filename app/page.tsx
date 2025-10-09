import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Incheckad',
  description: 'Startsida',
};

const MABI_LOGO_URL = "/mabi-logo.png";
const BG_IMAGE_URL = "https://ufioaijcmaujlvmveyra.supabase.co/storage/v1/object/public/Bild%20gammal%20MB/MB%20front%20old.avif";

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
      <div className="welcome-card">
        <img src={MABI_LOGO_URL} alt="MABI Logo" className="main-logo" />
        <h1 className="welcome-title">Välkommen!</h1>
        <div className="btn-group">
          <a href="/check" className="btn incheckning">Ny incheckning</a>
          <a href="/check/drafts" className="btn incheckning">Fortsätt påbörjad incheckning</a>
        </div>
        <hr className="divider" />
        {showReport && (
          <div className="report-section">
            <a href="/rapport" className="btn report-btn">Rapport</a>
          </div>
        )}
      </div>
    </main>
  );
}

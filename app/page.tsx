import type { Metadata } from 'next';
import LoginGate from '@/components/LoginGate';

const currentYear = new Date().getFullYear();

export const metadata: Metadata = {
  title: 'Incheckad',
  description: 'Startsida',
};

const MABI_LOGO_URL = "https://ufioaijcmaujlvmveyra.supabase.co/storage/v1/object/public/MABI%20Syd%20logga/MABI%20Syd%20logga%202.png";

export default function HomePage() {
  return (
    <LoginGate>
      <main className="welcome-main">
        <div className="background-img" />
        
        <div className="welcome-card">
          <img src={MABI_LOGO_URL} alt="MABI Syd logga" className="main-logo" />
          
          <h1 className="welcome-title">Välkommen!</h1>
          
          <div className="btn-group">
            <a href="/check" className="btn incheckning">Ny incheckning</a>
            <a href="/nybil" className="btn nybil">Registrera ny bil</a>
          </div>
          
          <div className="divider-wrap">
            <hr className="divider" />
          </div>
          
          <div className="report-section">
            <a href="/rapport" className="btn report-btn">RAPPORT</a>
          </div>
        </div>
        
        <footer className="homepage-footer">
          &copy; {currentYear} Albarone AB &mdash; Alla rättigheter förbehållna
        </footer>
      </main>
    </LoginGate>
  );
}

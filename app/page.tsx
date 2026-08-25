import type { Metadata } from 'next';
const currentYear = new Date().getFullYear();
export const metadata: Metadata = {
  title: 'Incheckad',
  description: 'Startsida',
};
const MABI_LOGO_URL = "https://ufioaijcmaujlvmveyra.supabase.co/storage/v1/object/public/MABI%20Syd%20logga/MABI%20Syd%20logga%202.png";
export default function HomePage() {
  return (
    <main className="welcome-main">
      <div className="background-img" />
      
      <div className="welcome-card">
        <img src={MABI_LOGO_URL} alt="MABI Syd logga" className="main-logo" />
        
        <h1 className="welcome-title">Välkommen!</h1>
        
        <div className="btn-group">
          <a href="/tower" className="btn inkommen">Tower</a>
          <a href="/planning" className="btn inkommen">Planering</a>
          <a href="/garage" className="btn inkommen">Garaget</a>
          <a href="/ankomst" className="btn inkommen">Inkommen</a>
          <a href="/check" className="btn incheckning">Ny incheckning</a>
          <a href="/nybil" className="btn registrera">Registrera ny bil</a>
          <a href="/vagnkort" className="btn incheckning">Vagnkort</a>
        </div>
        
      </div>
      
      <footer className="homepage-footer">
        &copy; {currentYear} Albarone AB &mdash; Alla rättigheter förbehållna
      </footer>
    </main>
  );
}

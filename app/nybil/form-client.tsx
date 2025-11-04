'use client';

import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';

const MABI_LOGO_URL = "https://ufioaijcmaujlvmveyra.supabase.co/storage/v1/object/public/MABI%20Syd%20logga/MABI%20Syd%20logga%202.png";
const BACKGROUND_IMAGE_URL = "https://ufioaijcmaujlvmveyra.supabase.co/storage/v1/object/public/Svart%20bakgrund%20MB%20grill/MB%20front%20grill%20logo.jpg";

const currentYear = new Date().getFullYear();

// Helper functions
const capitalizeFirstLetter = (str: string): string => {
  return str.charAt(0).toUpperCase() + str.slice(1);
};

const getFirstNameFromEmail = (email: string): string => {
  if (!email) return 'Okänd';
  const namePart = email.split('@')[0];
  const firstName = namePart.split('.')[0];
  return capitalizeFirstLetter(firstName);
};

// UI Components
const Card: React.FC<React.PropsWithChildren<{ className?: string }>> = ({ children, className = '' }) => (
  <div className={`card ${className}`}>{children}</div>
);

const SectionHeader: React.FC<{ title: string }> = ({ title }) => (
  <div className="section-header"><h2>{title}</h2></div>
);

const Field: React.FC<React.PropsWithChildren<{ label: string }>> = ({ label, children }) => (
  <div className="field"><label>{label}</label>{children}</div>
);

const Button: React.FC<{ onClick: () => void; variant?: 'primary' | 'secondary' | 'success' | 'danger'; disabled?: boolean; children: React.ReactNode; style?: React.CSSProperties }> = ({ onClick, variant = 'primary', disabled = false, children, style }) => (
  <button onClick={onClick} className={`btn ${variant} ${disabled ? 'disabled' : ''}`} disabled={disabled} style={style}>{children}</button>
);

const GlobalStyles: React.FC<{ backgroundUrl: string }> = ({ backgroundUrl }) => (
  <style jsx global>{`
    :root {
      --color-bg: #f8fafc;
      --color-card: #ffffff;
      --color-text: #1f2937;
      --color-text-secondary: #6b7280;
      --color-primary: #2563eb;
      --color-primary-light: #eff6ff;
      --color-success: #16a34a;
      --color-success-light: #f0fdf4;
      --color-danger: #dc2626;
      --color-danger-light: #fef2f2;
      --color-warning: #f59e0b;
      --color-warning-light: #fffbeb;
      --color-border: #e5e7eb;
      --color-border-focus: #3b82f6;
      --color-disabled: #a1a1aa;
      --color-disabled-light: #f4f4f5;
      --color-green-light: #dcfce7;
      --color-green-border: #86efac;
      --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
      --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
    }
    
    body::before {
      content: '';
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-image: url('${backgroundUrl}');
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
      z-index: -1;
      pointer-events: none;
    }
    
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background-color: var(--color-bg);
      color: var(--color-text);
      margin: 0;
      padding: 0;
    }
    
    .nybil-form {
      max-width: 700px;
      margin: 0 auto;
      padding: 1rem;
      box-sizing: border-box;
    }
    
    .main-header {
      text-align: center;
      margin-bottom: 1.5rem;
    }
    
    .main-logo {
      max-width: 188px;
      height: auto;
      margin: 0 auto 1rem auto;
      display: block;
    }
    
    .user-info {
      font-weight: 500;
      color: var(--color-text-secondary);
      margin: 0;
    }
    
    .card {
      background-color: rgba(220, 252, 231, 0.92);
      padding: 1.5rem;
      border-radius: 12px;
      margin-bottom: 1.5rem;
      box-shadow: var(--shadow-md);
      border: 2px solid var(--color-green-border);
    }
    
    .section-header {
      padding-bottom: 0.75rem;
      border-bottom: 1px solid var(--color-border);
      margin-bottom: 1.5rem;
    }
    
    .section-header h2 {
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--color-text);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin: 0;
    }
    
    .field {
      margin-bottom: 1rem;
    }
    
    .field label {
      display: block;
      margin-bottom: 0.5rem;
      font-weight: 500;
      font-size: 0.875rem;
    }
    
    .field input,
    .field select,
    .field textarea {
      width: 100%;
      padding: 0.75rem;
      border: 1px solid var(--color-border);
      border-radius: 6px;
      font-size: 1rem;
      background-color: white;
      box-sizing: border-box;
    }
    
    .field input:focus,
    .field select:focus,
    .field textarea:focus {
      outline: 2px solid var(--color-border-focus);
      border-color: transparent;
    }
    
    .reg-input {
      text-align: center;
      font-weight: 600;
      letter-spacing: 2px;
      text-transform: uppercase;
    }
    
    .form-actions {
      margin-top: 2rem;
      padding-top: 1.5rem;
      border-top: 1px solid var(--color-border);
      display: flex;
      gap: 1rem;
      justify-content: flex-end;
      padding-bottom: 1.5rem;
    }
    
    .copyright-footer {
      text-align: center;
      margin-top: 2rem;
      padding: 1.5rem 0 3rem 0;
      color: var(--color-text-secondary);
      font-size: 0.875rem;
    }
    
    .btn {
      padding: 0.75rem 1.5rem;
      border: none;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    
    .btn.primary {
      background-color: var(--color-primary);
      color: white;
    }
    
    .btn.secondary {
      background-color: var(--color-border);
      color: var(--color-text);
    }
    
    .btn.success {
      background-color: var(--color-success);
      color: white;
    }
    
    .btn.danger {
      background-color: var(--color-danger);
      color: white;
    }
    
    .btn.disabled {
      background-color: var(--color-disabled-light);
      color: var(--color-disabled);
      cursor: not-allowed;
    }
    
    .btn:not(:disabled):hover {
      filter: brightness(1.1);
    }
    
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: rgba(0, 0, 0, 0.5);
      z-index: 100;
    }
    
    .modal-content {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background-color: rgba(255, 255, 255, 0.92);
      padding: 2rem;
      border-radius: 12px;
      z-index: 101;
      box-shadow: var(--shadow-md);
      width: 90%;
      max-width: 600px;
      text-align: center;
    }
    
    .success-icon {
      font-size: 3rem;
      color: var(--color-success);
      margin-bottom: 1rem;
    }
    
    .spinner-overlay {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 1.2rem;
      font-weight: 600;
    }
    
    .spinner {
      border: 5px solid #f3f3f3;
      border-top: 5px solid var(--color-primary);
      border-radius: 50%;
      width: 50px;
      height: 50px;
      animation: spin 1s linear infinite;
      margin-bottom: 1rem;
    }
    
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `}</style>
);

export default function NybilForm() {
  // Get user info
  const [userEmail] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('userEmail') || '';
    }
    return '';
  });
  const firstName = getFirstNameFromEmail(userEmail);

  // Form state
  const [regnr, setRegnr] = useState('');
  const [marke, setMarke] = useState('');
  const [modell, setModell] = useState('');
  const [arsmodell, setArsmodell] = useState('');
  const [utrustning, setUtrustning] = useState('');
  const [matarstallning, setMatarstallning] = useState('');
  const [initialCheckNotes, setInitialCheckNotes] = useState('');
  const [kopinfo, setKopinfo] = useState('');
  const [koparNamn, setKoparNamn] = useState('');
  const [koparKontakt, setKoparKontakt] = useState('');

  // UI state
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const handleSubmit = async () => {
    // Basic validation
    if (!regnr.trim()) {
      alert('Registreringsnummer är obligatoriskt');
      return;
    }

    setIsSaving(true);

    try {
      const { error } = await supabase
        .from('nybil_inventering')
        .insert([
          {
            regnr: regnr.toUpperCase().trim(),
            marke: marke.trim() || null,
            modell: modell.trim() || null,
            arsmodell: arsmodell.trim() || null,
            utrustning: utrustning.trim() || null,
            matarstallning: matarstallning.trim() || null,
            initial_check_notes: initialCheckNotes.trim() || null,
            kopinfo: kopinfo.trim() || null,
            kopare_namn: koparNamn.trim() || null,
            kopare_kontakt: koparKontakt.trim() || null,
            created_by: userEmail,
          },
        ]);

      if (error) {
        console.error('Error saving to database:', error);
        alert('Ett fel uppstod när data skulle sparas. Försök igen.');
        return;
      }

      // Show success modal
      setShowSuccessModal(true);
      
      // Reset form after a short delay
      setTimeout(() => {
        setRegnr('');
        setMarke('');
        setModell('');
        setArsmodell('');
        setUtrustning('');
        setMatarstallning('');
        setInitialCheckNotes('');
        setKopinfo('');
        setKoparNamn('');
        setKoparKontakt('');
        setShowSuccessModal(false);
      }, 3000);
    } catch (err) {
      console.error('Unexpected error:', err);
      alert('Ett oväntat fel uppstod. Försök igen.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <GlobalStyles backgroundUrl={BACKGROUND_IMAGE_URL} />
      <div className="nybil-form">
        <header className="main-header">
          <img src={MABI_LOGO_URL} alt="MABI Syd" className="main-logo" />
          <p className="user-info">Inloggad som {firstName}</p>
        </header>

        {/* Vehicle Section */}
        <Card>
          <SectionHeader title="Fordon" />
          <Field label="Registreringsnummer *">
            <input
              type="text"
              className="reg-input"
              value={regnr}
              onChange={(e) => setRegnr(e.target.value)}
              placeholder="ABC123"
              maxLength={10}
            />
          </Field>
          <Field label="Märke">
            <input
              type="text"
              value={marke}
              onChange={(e) => setMarke(e.target.value)}
              placeholder="T.ex. Mercedes-Benz"
            />
          </Field>
          <Field label="Modell">
            <input
              type="text"
              value={modell}
              onChange={(e) => setModell(e.target.value)}
              placeholder="T.ex. C-Klass"
            />
          </Field>
          <Field label="Årsmodell">
            <input
              type="text"
              value={arsmodell}
              onChange={(e) => setArsmodell(e.target.value)}
              placeholder="T.ex. 2023"
            />
          </Field>
        </Card>

        {/* Equipment Section */}
        <Card>
          <SectionHeader title="Utrustning" />
          <Field label="Utrustning och tillbehör">
            <textarea
              value={utrustning}
              onChange={(e) => setUtrustning(e.target.value)}
              placeholder="Beskriv utrustning, tillbehör, tillval..."
              rows={4}
            />
          </Field>
        </Card>

        {/* KM Info Section */}
        <Card>
          <SectionHeader title="KM-Information" />
          <Field label="Mätarställning">
            <input
              type="text"
              value={matarstallning}
              onChange={(e) => setMatarstallning(e.target.value)}
              placeholder="T.ex. 45000 km"
            />
          </Field>
        </Card>

        {/* Initial Check Section */}
        <Card>
          <SectionHeader title="Initial Kontroll" />
          <Field label="Anteckningar från initial kontroll">
            <textarea
              value={initialCheckNotes}
              onChange={(e) => setInitialCheckNotes(e.target.value)}
              placeholder="Skador, brister, anmärkningar..."
              rows={4}
            />
          </Field>
        </Card>

        {/* Sale Info Section */}
        <Card>
          <SectionHeader title="Köpinformation" />
          <Field label="Köpinformation">
            <textarea
              value={kopinfo}
              onChange={(e) => setKopinfo(e.target.value)}
              placeholder="Pris, inköpsdatum, återförsäljare..."
              rows={3}
            />
          </Field>
        </Card>

        {/* Buyer Info Section */}
        <Card>
          <SectionHeader title="Köparinformation" />
          <Field label="Köparens namn">
            <input
              type="text"
              value={koparNamn}
              onChange={(e) => setKoparNamn(e.target.value)}
              placeholder="För- och efternamn"
            />
          </Field>
          <Field label="Kontaktuppgifter">
            <textarea
              value={koparKontakt}
              onChange={(e) => setKoparKontakt(e.target.value)}
              placeholder="Telefon, e-post, adress..."
              rows={3}
            />
          </Field>
        </Card>

        {/* Form Actions */}
        <div className="form-actions">
          <Button onClick={() => window.location.href = '/'} variant="secondary">
            Avbryt
          </Button>
          <Button onClick={handleSubmit} variant="success" disabled={isSaving || !regnr.trim()}>
            {isSaving ? 'Sparar...' : 'Spara'}
          </Button>
        </div>

        <footer className="copyright-footer">
          &copy; {currentYear} Albarone AB &mdash; Alla rättigheter förbehållna
        </footer>
      </div>

      {/* Saving Overlay */}
      {isSaving && (
        <>
          <div className="modal-overlay" />
          <div className="modal-content spinner-overlay">
            <div className="spinner" />
            <p>Sparar registrering...</p>
          </div>
        </>
      )}

      {/* Success Modal */}
      {showSuccessModal && (
        <>
          <div className="modal-overlay" onClick={() => setShowSuccessModal(false)} />
          <div className="modal-content">
            <div className="success-icon">✓</div>
            <h2>Registrering sparad!</h2>
            <p>Fordonet {regnr.toUpperCase()} har registrerats i systemet.</p>
          </div>
        </>
      )}
    </>
  );
}

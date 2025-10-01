'use client';

import React from 'react';
// Notera: Fler importer kommer att behövas i nästa steg.

// =================================================================
// HUVUDKOMPONENT (Tomt skal)
// =================================================================

export default function CheckInForm() {
  // STEG 2: All logik (useState, useEffect, funktioner etc.) kommer att klistras in här.

  // STEG 3: Den nya JSX-strukturen kommer att placeras här.
  return (
    <div>
      <h1>Formulär (under uppbyggnad)</h1>
      <p>Detta är ett tomt skal. Logik och rendering kommer i nästa steg.</p>
    </div>
  );
}

// =================================================================
// 4. ÅTERANVÄNDBARA KOMPONENTER (Struktur & Styling)
// =================================================================

const Card: React.FC<React.PropsWithChildren<any>> = ({ children, ...props }) => (<div className="card" {...props}>{children}</div>);
const SectionHeader: React.FC<{ title: string }> = ({ title }) => (<div className="section-header"><h2>{title}</h2></div>);
const SubSectionHeader: React.FC<{ title: string }> = ({ title }) => (<div className="sub-section-header"><h3>{title}</h3></div>);
const Field: React.FC<React.PropsWithChildren<{ label?: string }>> = ({ label, children }) => (<div className="field">{label && <label>{label}</label>}{children}</div>);
const InfoRow: React.FC<{ label: string, value: string }> = ({ label, value }) => (<div className="info-row"><span>{label}</span><span>{value}</span></div>);
const RadioGroup: React.FC<React.PropsWithChildren<{}>> = ({ children }) => <div className="radio-group">{children}</div>;
const Radio: React.FC<any> = ({ label, ...props }) => (<label className="radio-label"><input type="radio" {...props} />{label}</label>);
const Checkbox: React.FC<any> = ({ label, className, ...props }) => (<label className={`checkbox-label ${className || ''}`}><input type="checkbox" {...props} />{label}</label>);

const Button: React.FC<React.PropsWithChildren<any>> = ({ children, onClick, variant = 'primary', style, ...props }) => {
    const variantClasses: Record<string, string> = {
        primary: 'btn-primary', secondary: 'btn-secondary', success: 'btn-success',
        danger: 'btn-danger', warning: 'btn-warning', disabled: 'btn-disabled',
    };
    return (<>
        <button onClick={onClick} className={`btn ${variantClasses[variant]}`} style={style} {...props}>{children}</button>
        <style jsx>{`
          .btn { padding: 0.75rem 1.5rem; border: none; border-radius: 8px; font-size: 1rem; font-weight: 600; cursor: pointer; transition: all 0.2s; }
          .btn-primary { background-color: var(--color-primary); color: white; }
          .btn-secondary { background-color: var(--color-text-secondary); color: white; }
          .btn-success { background-color: var(--color-success); color: white; }
          .btn-danger { background-color: var(--color-danger); color: white; }
          .btn-warning { background-color: var(--color-warning); color: var(--color-text); }
          .btn-disabled { background-color: var(--color-disabled-light); color: var(--color-disabled); cursor: not-allowed; }
          .btn:hover:not(.btn-disabled) { filter: brightness(1.1); }
        `}</style>
    </>);
};

const SuccessModal = () => (
    <div className="modal-overlay">
        <div className="modal-content">
            <h2 className="modal-title">✓ Incheckning slutförd!</h2>
            <p>Formuläret kommer nu att återställas.</p>
        </div>
        <style jsx>{`
          .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background-color: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 100; }
          .modal-content { background-color: white; padding: 2.5rem; border-radius: 12px; text-align: center; box-shadow: var(--shadow-md); }
          .modal-title { color: var(--color-success); font-size: 1.5rem; margin-top:0; }
        `}</style>
    </div>
);

// Tomma skal för DamageItem och MediaUpload, de kommer att fyllas på senare.
const DamageItem: React.FC<any> = ({ damage, isExisting }) => {
    return (
        <div className={`damage-item ${isExisting ? 'damage-item--existing' : 'damage-item--new'}`}>
            <p>Skada: {isExisting ? damage.fullText : 'Ny skada'}</p>
            {/* Mer logik kommer här */}
             <style jsx>{`
                .damage-item { padding: 1rem; margin-bottom: 1rem; border: 1px solid #e5e7eb; border-radius: 8px; }
                .damage-item--existing { background-color: #f3f4f6; }
                .damage-item--new { background-color: #fef2f2; border-color: #dc2626; }
            `}</style>
        </div>
    );
};

const MediaUpload: React.FC<any> = ({ media, videoRequired, photoRequired }) => {
    const photoInputId = `photo-${React.useId()}`;
    const videoInputId = `video-${React.useId()}`;

    return (
        <div>
            <div className="grid-2-col" style={{gap: '0.5rem', marginTop: '1rem'}}>
                <MediaButton htmlFor={photoInputId} required={photoRequired}>📷 Ta foto *</MediaButton>
                <MediaButton htmlFor={videoInputId} required={videoRequired}>🎥 Spela in video{videoRequired ? ' *' : ''}</MediaButton>
                <input type="file" id={photoInputId} style={{ display: 'none' }} />
                <input type="file" id={videoInputId} style={{ display: 'none' }} />
            </div>
            {/* Förhandsvisning kommer här */}
        </div>
    );
};

const MediaButton: React.FC<React.PropsWithChildren<any>> = ({ htmlFor, required, children }) => {
    const baseStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', width: '100%', padding: '0.75rem', borderRadius: '6px', fontSize: '0.875rem', textAlign: 'center', cursor: 'pointer', transition: 'background-color 0.2s', border: '1px dashed' };
    const color = required ? '#dc2626' : '#6b7280';
    const bgColor = required ? '#fef2f2' : 'transparent';
    const borderColor = required ? '#dc2626' : '#e5e7eb';

    return <label htmlFor={htmlFor} style={{ ...baseStyle, color, backgroundColor: bgColor, borderColor }}>{children}</label>;
};

// =================================================================
// Globala Styles
// =================================================================

export const GlobalStyles = () => (
    <style jsx global>{`
        :root {
          --color-bg: #f8fafc; --color-card: #ffffff; --color-text: #1f2937; --color-text-secondary: #6b7280;
          --color-primary: #2563eb; --color-primary-light: #eff6ff; --color-success: #16a34a; --color-success-light: #f0fdf4;
          --color-danger: #dc2626; --color-danger-light: #fef2f2; --color-warning: #f59e0b; --color-warning-light: #fefce8;
          --color-border: #e5e7eb; --color-border-focus: #3b82f6; --color-disabled: #a1a1aa; --color-disabled-light: #f4f4f5;
          --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05); --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
        }
        body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; background-color: var(--color-bg); }
        .checkin-form { max-width: 700px; margin: 0 auto; padding: 1rem 0; }
        .card { background-color: var(--color-card); padding: 1.5rem; border-radius: 12px; margin-bottom: 1.5rem; box-shadow: var(--shadow-md); border: 2px solid transparent; transition: border 0.2s; }
        .card[data-error="true"] { border: 2px solid var(--color-danger); }
        .section-header { padding-bottom: 0.75rem; border-bottom: 1px solid var(--color-border); margin-bottom: 1.5rem; }
        .section-header h2 { font-size: 1.25rem; font-weight: 700; color: var(--color-text); text-transform: uppercase; letter-spacing: 0.05em; margin:0; }
        .sub-section-header { margin-top: 2rem; margin-bottom: 1rem; }
        .sub-section-header h3 { font-size: 1rem; font-weight: 600; color: var(--color-text); margin:0; }
        .field { margin-bottom: 1rem; }
        .field label { display: block; margin-bottom: 0.5rem; font-weight: 500; font-size: 0.875rem; }
        .field input, .field select, .field textarea { width: 100%; padding: 0.75rem; border: 1px solid var(--color-border); border-radius: 6px; font-size: 1rem; background-color: white; box-sizing: border-box; }
        .field input:focus, .field select:focus, .field textarea:focus { outline: 2px solid var(--color-border-focus); border-color: transparent; }
        .field select[disabled] { background-color: var(--color-disabled-light); cursor: not-allowed; }
        .reg-input { text-align: center; font-weight: 600; letter-spacing: 2px; }
        .suggestions-dropdown { position: absolute; top: 100%; left: 0; right: 0; background-color: white; border: 1px solid var(--color-border); border-radius: 6px; z-index: 10; box-shadow: var(--shadow-md); }
        .suggestion-item { padding: 0.75rem; cursor: pointer; }
        .suggestion-item:hover { background-color: var(--color-primary-light); }
        .error-text { color: var(--color-danger); }
        .info-box { margin-top: 1rem; padding: 1rem; background-color: var(--color-primary-light); border-radius: 8px; }
        .info-row { display: flex; justify-content: space-between; font-size: 0.875rem; padding: 0.25rem 0; }
        .info-row span:first-child { font-weight: 600; }
        .grid-2-col { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; }
        .grid-3-col { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; margin-top: 1rem; }
        .radio-group { display: flex; gap: 1.5rem; align-items: center; }
        .radio-label { display: flex; align-items: center; gap: 0.5rem; }
        .checkbox-label { display: flex; align-items: center; gap: 0.75rem; font-size: 1rem; padding: 0.5rem; border-radius: 6px; cursor: pointer; transition: background-color 0.2s; }
        .checkbox-label:hover { background-color: var(--color-disabled-light); }
        .checkbox-label input[type="checkbox"] { width: 1rem; height: 1rem; }
        .rekond-box { padding: 1rem; background-color: var(--color-danger-light); border-radius: 8px; border: 1px solid var(--color-danger); margin-bottom: 1.5rem; }
        .rekond-checkbox { font-weight: bold; color: var(--color-danger); font-size: 1.1rem; }
        .form-actions { margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid var(--color-border); display: flex; gap: 1rem; justify-content: flex-end; padding-bottom: 3rem; }
      `}</style>
)

'use client';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { installAuthenticatedApiFetch } from '@/lib/api-auth-client';

type Props = { children: React.ReactNode };

export default function LoginGate({ children }: Props) {
  const [state, setState] =
    useState<'checking' | 'login' | 'denied' | 'ok'>('checking');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const uninstallApiAuthFetch = installAuthenticatedApiFetch();

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setState('login'); return; }

      try {
        const response = await fetch('/api/auth/me');
        if (!response.ok) {
          await supabase.auth.signOut();
          setState('denied');
          return;
        }

        setState('ok');
      } catch (error) {
        console.error('[LoginGate] Access verification failed:', error);
        await supabase.auth.signOut();
        setState('denied');
      }
    })();

    return uninstallApiAuthFetch;
  }, []);

  const sendSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');

    const normalizedEmail = email.trim().toLowerCase();
    const redirectTo = (process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin) + '/';

    const { error } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: { emailRedirectTo: redirectTo },
    });

    if (error) {
      setMsg(error.message);
      return;
    }

    setEmail(normalizedEmail);
    setOtpSent(true);
    setMsg('Vi har skickat en sexsiffrig engångskod till din e-post.');
  };

  const verifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');

    const { error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: otp.trim(),
      type: 'email',
    });

    if (error) {
      setMsg(error.message);
      return;
    }

    window.location.reload();
  };

  if (state === 'login') {
    return (
      <main className="login-shell">
        <section className="login-brand" aria-label="INCHECKAD by INVISTO IT">
          <div className="login-brand-inner">
            <Image
              src="/brand/incheckad-by-invisto-it.svg"
              width={1200}
              height={300}
              priority
              alt="INCHECKAD by INVISTO / IT"
              className="login-brand-mark"
            />
            <div className="login-brand-rule" />
            <p className="login-kicker">OPERATIV KONTROLLPLATTFORM</p>
            <h1 className="login-statement">Data. Ansvar. Handling. Effekt.</h1>
            <p className="login-brand-copy">
              Ett arbetslager för verifierade fordonsflöden, operativ kontroll och mätbar effekt.
            </p>
          </div>
          <p className="login-brand-footer">INVISTO / IT · PRECISION SYSTEM</p>
        </section>

        <section className="login-access">
          <div className="login-access-inner">
            <p className="login-eyebrow">SECURE ACCESS</p>
            <h2 className="login-title">{otpSent ? 'Verifiera åtkomst' : 'Åtkomst till INCHECKAD'}</h2>
            <p className="login-intro">
              {otpSent
                ? `Ange koden som skickades till ${email}.`
                : 'Använd din registrerade e-postadress för att fortsätta.'}
            </p>

            {!otpSent ? (
              <form onSubmit={sendSignIn} className="login-form">
                <label className="login-field-label" htmlFor="login-email">E-POSTADRESS</label>
                <input
                  id="login-email"
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="namn@foretag.se"
                  className="login-input"
                  autoFocus
                  autoComplete="email"
                />
                <button type="submit" className="login-btn">
                  FORTSÄTT <span aria-hidden="true">→</span>
                </button>
              </form>
            ) : (
              <form onSubmit={verifyOtp} className="login-form">
                <label className="login-field-label" htmlFor="login-otp">ENGÅNGSKOD</label>
                <input
                  id="login-otp"
                  type="text"
                  required
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={otp}
                  onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className="login-input login-otp-input"
                  autoFocus
                />
                <button type="submit" className="login-btn">
                  VERIFIERA <span aria-hidden="true">→</span>
                </button>
                <button
                  type="button"
                  className="login-secondary-btn"
                  onClick={() => {
                    setOtpSent(false);
                    setOtp('');
                    setMsg('');
                  }}
                >
                  BYT E-POSTADRESS
                </button>
              </form>
            )}

            {msg && <p className="login-msg">{msg}</p>}
          </div>
          <footer className="login-access-footer">
            <span>SECURE ACCESS</span>
            <span>BY INVISTO / IT</span>
          </footer>
        </section>
      </main>
    );
  }

  if (state === 'denied') {
    return (
      <main className="login-shell login-system-state">
        <div className="login-system-panel">
          <p className="login-eyebrow">ACCESS CONTROL</p>
          <h1>Åtkomst nekad.</h1>
          <p>Kontot saknar giltig åtkomst till INCHECKAD.</p>
        </div>
      </main>
    );
  }

  if (state === 'checking') {
    return (
      <main className="login-shell login-system-state">
        <div className="login-system-panel">
          <p className="login-eyebrow">INCHECKAD · BY INVISTO / IT</p>
          <h1>Kontrollerar åtkomst.</h1>
          <div className="login-progress" aria-hidden="true"><span /></div>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}

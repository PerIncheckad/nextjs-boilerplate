'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { isWhitelistedEmail } from '@/lib/access-control';
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

      const lower = user.email?.toLowerCase() ?? null;

      if (isWhitelistedEmail(lower)) {
        setState('ok');
        return;
      }

      const { data, error } = await supabase
        .from('employees')
        .select('email,is_active')
        .eq('email', lower!)
        .single();

      if (error || !data?.is_active) {
        await supabase.auth.signOut();
        setState('denied');
        return;
      }

      setState('ok');
    })();

    return uninstallApiAuthFetch;
  }, []);

  const sendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');

    const normalizedEmail = email.trim().toLowerCase();
    const { error } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
    });

    if (error) {
      setMsg(error.message);
      return;
    }

    setEmail(normalizedEmail);
    setOtpSent(true);
    setMsg('En engångskod har skickats till din mejl.');
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

    // Re-run the existing whitelist / employees authorization check using
    // the newly established Supabase session. This avoids creating a second
    // authorization path for OTP sign-in.
    window.location.reload();
  };

  if (state === 'login') {
    return (
      <div className="login-bg">
        <div className="login-card">
          <h1 className="login-title">Logga in</h1>

          {!otpSent ? (
            <form onSubmit={sendOtp} className="login-form">
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="E-postadress"
                className="login-input"
                autoFocus
              />
              <button type="submit" className="login-btn">
                Skicka engångskod
              </button>
            </form>
          ) : (
            <form onSubmit={verifyOtp} className="login-form">
              <input
                type="text"
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                value={otp}
                onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="6-siffrig kod"
                className="login-input"
                autoFocus
              />
              <button type="submit" className="login-btn">
                Verifiera kod
              </button>
              <button
                type="button"
                className="login-btn"
                onClick={() => {
                  setOtpSent(false);
                  setOtp('');
                  setMsg('');
                }}
              >
                Byt e-postadress
              </button>
            </form>
          )}

          {msg && <p className="login-msg">{msg}</p>}
        </div>
      </div>
    );
  }

  if (state === 'denied') return <div className="login-bg"><div className="login-card">Åtkomst nekad (ej vitlistad).</div></div>;
  if (state === 'checking') return <div className="login-bg"><div className="login-card">Kontrollerar inloggning…</div></div>;
  return <>{children}</>;
}

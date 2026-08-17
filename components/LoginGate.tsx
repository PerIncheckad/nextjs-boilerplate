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

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');

    // Return the magic-link to the exact deployment the user is signing in from.
    // This keeps Production on www.incheckad.se while allowing Vercel Preview
    // deployments to test authentication without being redirected to Production.
    const redirectTo = window.location.origin + '/';

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo }
    });

    setMsg(error ? error.message : 'Kolla din mejl för inloggningslänken.');
  };

  if (state === 'login') {
    return (
      <div className="login-bg">
        <div className="login-card">
          <h1 className="login-title">Logga in</h1>
          <form onSubmit={signIn} className="login-form">
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="E-postadress"
              className="login-input"
              autoFocus
            />
            <button
              type="submit"
              className="login-btn"
            >
              Skicka magisk länk
            </button>
          </form>
          {msg && (
            <div className="login-msg-wrap">
              <h2 className="login-thanks">Tack!</h2>
              <p className="login-msg">Kolla din mejl för inloggningslänken.</p>
              <p className="login-close-tab">Du kan nu stänga denna flik.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (state === 'denied') return <div className="login-bg"><div className="login-card">Åtkomst nekad (ej vitlistad).</div></div>;
  if (state === 'checking') return <div className="login-bg"><div className="login-card">Kontrollerar inloggning…</div></div>;
  return <>{children}</>;
}
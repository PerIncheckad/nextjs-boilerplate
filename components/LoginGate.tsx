'use client';
import { useEffect, useState } from 'react';
import supabase from '@/lib/supabase';

type Props = { children: React.ReactNode };

export default function LoginGate({ children }: Props) {
  const [state, setState] =
    useState<'checking' | 'login' | 'denied' | 'ok'>('checking');
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setState('login'); return; }

      const { data, error } = await supabase
        .from('employees')
        .select('email,is_active')
        .eq('email', user.email!)
        .single();

      if (error || !data?.is_active) {
        await supabase.auth.signOut();
        setState('denied');
        return;
      }
      setState('ok');
    })();
  }, []);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');

    const redirectTo =
      (process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin) + '/check';

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo }
    });

    setMsg(error ? error.message : 'Kolla din mejl för inloggningslänken.');
  };

  if (state === 'login') {
    return (
      <div className="mx-auto max-w-md p-4">
        <h1 className="text-xl font-semibold mb-2">Logga in</h1>
        <form onSubmit={signIn} className="space-y-2">
          <input
            type="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="din@mabi.se"
            className="border rounded p-2 w-full bg-white text-black placeholder-gray-500"
          />
          <button
            type="submit"
            className="rounded px-4 py-2 border bg-white text-black hover:bg-gray-100"
          >
            Skicka magisk länk
          </button>
        </form>
        {msg && <p className="mt-2 text-sm">{msg}</p>}
      </div>
    );
  }

  if (state === 'denied') return <div className="p-4">Åtkomst nekad (ej vitlistad).</div>;
  if (state === 'checking') return <div className="p-4">Kontrollerar inloggning…</div>;
  return <>{children}</>;
}

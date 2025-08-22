'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type UploadResult = { key: string; url?: string };

function nowStamp() {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

export default function CheckPage() {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [plate, setPlate] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState<string>('');
  const [result, setResult] = useState<UploadResult | null>(null);

  // Hämta session vid sidladdning
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user?.id ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setMsg('');
    setSending(true);
    const { error } = await supabase.auth.signInWithOtp({ email });
    setSending(false);
    if (error) setMsg(`Fel: ${error.message}`);
    else setMsg('Kolla din e-post för magisk inloggningslänk.');
  }

  async function signOut() {
    await supabase.auth.signOut();
    setMsg('Utloggad.');
  }

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    setMsg('');
    setResult(null);

    if (!userId) {
      setMsg('Du måste vara inloggad.');
      return;
    }
    if (!file) {
      setMsg('Välj en bildfil först.');
      return;
    }
    const cleanPlate = plate.trim().toUpperCase();
    if (!cleanPlate) {
      setMsg('Ange registreringsnummer (mappnamn).');
      return;
    }

    const ext = file.name.split('.').pop() || 'jpg';
    const key = `${cleanPlate}/${userId}-${cleanPlate}-${nowStamp()}.${ext}`;

    const { error } = await supabase
      .storage
      .from('damage-photos')
      .upload(key, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || 'image/jpeg',
      });

    if (error) {
      setMsg(`Uppladdningsfel: ${error.message}`);
      return;
    }

    // Skapa en tidsbegränsad nedladdningslänk (bucketen är privat)
    const { data: signed, error: signedErr } = await supabase
      .storage
      .from('damage-photos')
      .createSignedUrl(key, 60 * 60); // 1 timme

    if (signedErr) {
      setMsg(`Uppladdat (${key}) men kunde inte skapa länk: ${signedErr.message}`);
      setResult({ key });
    } else {
      setMsg('Uppladdat!');
      setResult({ key, url: signed.signedUrl });
    }
  }

  return (
    <div style={{ maxWidth: 520, margin: '40px auto', padding: 16, fontFamily: 'ui-sans-serif, system-ui, -apple-system' }}>
      <h1>Mini-check: Supabase-inloggning & uppladdning</h1>

      {!userId ? (
        <form onSubmit={sendMagicLink} style={{ marginTop: 16 }}>
          <label style={{ display: 'block', marginBottom: 8 }}>E-post för inloggning</label>
          <input
            type="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="namn@exempel.se"
            style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #444' }}
          />
          <button disabled={sending} type="submit" style={{ marginTop: 12, padding: '8px 12px' }}>
            Skicka magisk länk
          </button>
        </form>
      ) : (
        <>
          <p style={{ marginTop: 8 }}>Inloggad som <code>{userId}</code></p>
          <button onClick={signOut} style={{ marginBottom: 24, padding: '6px 10px' }}>
            Logga ut
          </button>

          <form onSubmit={upload} style={{ display: 'grid', gap: 12 }}>
            <div>
              <label>Registreringsnummer (mapp):</label>
              <input
                value={plate}
                onChange={e => setPlate(e.target.value)}
                placeholder="ABC123"
                style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #444' }}
              />
            </div>
            <div>
              <label>Bildfil:</label>
              <input type="file" accept="image/*" onChange={e => setFile(e.target.files?.[0] ?? null)} />
            </div>
            <button type="submit" style={{ padding: '8px 12px' }}>Ladda upp</button>
          </form>
        </>
      )}

      {msg && <p style={{ marginTop: 16 }}>{msg}</p>}
      {result?.url && (
        <p>
          Förhandsgranska (1h):{' '}
          <a href={result.url} target="_blank" rel="noreferrer">Öppna länk</a>
        </p>
      )}
      {result?.key && !result.url && (
        <p>Nyckel: <code>{result.key}</code></p>
      )}
    </div>
  );
}

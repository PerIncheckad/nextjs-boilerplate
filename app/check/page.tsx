'use client';

import { useEffect, useMemo, useState } from 'react';
import supabase from '@/lib/supabaseClient';

type NewCheckin = {
  regnr: string;
  reservation: string;
  email: string;
  notes: string;
};

export default function CheckPage() {
  // ---------- Form ----------
  const [form, setForm] = useState<NewCheckin>({
    regnr: '',
    reservation: '',
    email: '',
    notes: '',
  });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkinId, setCheckinId] = useState<string | null>(null);

  // ---------- Auth (anonymt om möjligt) för Storage-policy ----------
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      try {
        const anyAuth = supabase.auth as any;
        // För projekt där Anonymous provider är AV: gör inget.
        // Är den PÅ och metoden finns: logga in anonymt => role "authenticated".
        if (!data.session && typeof anyAuth.signInAnonymously === 'function') {
          await anyAuth.signInAnonymously();
        }
      } catch {
        // Ignorera – uppladdning kan ändå fungera om bucketen släpper in anon.
      }
    })();
  }, []);

  // ---------- Skapa incheckning ----------
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('checkins')
        .insert([
          {
            regnr: form.regnr.trim(),
            reservation: form.reservation.trim() || null,
            email: form.email.trim() || null,
            notes: form.notes.trim() || null,
          },
        ])
        .select()
        .single();

      if (error) throw error;
      setCheckinId(data.id as string);
      setForm({ regnr: '', reservation: '', email: '', notes: '' });
    } catch (err: any) {
      setError(err.message ?? 'Kunde inte spara incheckningen.');
    } finally {
      setCreating(false);
    }
  }

  // ---------- Uppladdning ----------
  const [files, setFiles] = useState<FileList | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);

  async function uploadSelectedFiles() {
    if (!checkinId || !files?.length) return;
    setUploading(true);
    setUploadMsg(null);
    try {
      for (const file of Array.from(files)) {
        const ext = file.name.split('.').pop();
        const safeName = file.name.replace(/\s+/g, '_');
        const random = Math.random().toString(36).slice(2);
        const path = `${checkinId}/${Date.now()}-${random}-${safeName}`;

        const { error } = await supabase
          .storage
          .from('damage-photos')
          .upload(path, file, {
            cacheControl: '3600',
            upsert: false,
            contentType: file.type || `image/${ext || 'jpeg'}`,
          });

        if (error) throw error;
      }
      setUploadMsg('Uppladdning klar ✅');
      await refreshList();
      setFiles(null);
    } catch (err: any) {
      setUploadMsg(err.message ?? 'Uppladdningen misslyckades.');
    } finally {
      setUploading(false);
    }
  }

  // ---------- Lista uppladdade bilder ----------
  const [items, setItems] = useState<{ name: string; url: string }[]>([]);
  const canList = useMemo(() => Boolean(checkinId), [checkinId]);

  async function refreshList() {
    if (!checkinId) return;
    const { data: list, error } = await supabase
      .storage
      .from('damage-photos')
      .list(checkinId, { limit: 50, sortBy: { column: 'created_at', order: 'desc' } });

    if (error) return;
    const paths = (list ?? []).map((f) => `${checkinId}/${f.name}`);
    if (!paths.length) {
      setItems([]);
      return;
    }

    const { data: signed, error: signErr } = await supabase
      .storage
      .from('damage-photos')
      .createSignedUrls(paths, 60 * 10);

    if (signErr) return;
    setItems(signed!.map((s) => ({ name: s.path.split('/').pop() || s.path, url: s.signedUrl })));
  }

  useEffect(() => {
    refreshList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkinId]);

  return (
    <main className="min-h-screen grid place-items-start p-8">
      <div className="max-w-2xl w-full space-y-8">
        <h1 className="text-3xl font-semibold">Ny incheckning</h1>

        {checkinId && (
          <div className="rounded-lg border p-4">
            <p className="font-medium">Incheckning skapad</p>
            <p className="text-sm opacity-80">ID: <code>{checkinId}</code></p>
          </div>
        )}
        {error && (
          <div className="rounded-lg border border-red-500/40 p-4">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm mb-1">Registreringsnummer *</label>
            <input
              required
              value={form.regnr}
              onChange={(e) => setForm({ ...form, regnr: e.target.value })}
              className="w-full rounded-md border bg-transparent p-2"
              placeholder="ABC123"
            />
          </div>

          <div>
            <label className="block text-sm mb-1">Reservationsnummer</label>
            <input
              value={form.reservation}
              onChange={(e) => setForm({ ...form, reservation: e.target.value })}
              className="w-full rounded-md border bg-transparent p-2"
              placeholder="t.ex. 12345"
            />
          </div>

          <div>
            <label className="block text-sm mb-1">E-post</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full rounded-md border bg-transparent p-2"
              placeholder="namn@exempel.se"
            />
          </div>

          <div>
            <label className="block text-sm mb-1">Anteckningar</label>
            <textarea
              rows={4}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full rounded-md border bg-transparent p-2"
              placeholder="Övrig info…"
            />
          </div>

          <button
            type="submit"
            disabled={creating}
            className="rounded-md border px-4 py-2 disabled:opacity-60"
          >
            {creating ? 'Sparar…' : 'Spara incheckning'}
          </button>
        </form>

        {checkinId && (
          <section className="space-y-4">
            <h2 className="text-xl font-semibold">Ladda upp skadefoton</h2>

            <div className="space-y-3">
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={(e) => setFiles(e.target.files)}
              />
              <button
                onClick={uploadSelectedFiles}
                disabled={uploading || !files?.length}
                className="rounded-md border px-4 py-2 disabled:opacity-60"
                type="button"
              >
                {uploading ? 'Laddar upp…' : 'Ladda upp valda filer'}
              </button>
              {uploadMsg && <p className="text-sm opacity-80">{uploadMsg}</p>}
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <h3 className="font-medium">Bilder för denna incheckning</h3>
                <button
                  type="button"
                  onClick={refreshList}
                  className="text-sm underline"
                >
                  Uppdatera lista
                </button>
              </div>

              {canList && items.length === 0 && (
                <p className="text-sm opacity-70">Inga bilder än.</p>
              )}

              <ul className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {items.map((it) => (
                  <li key={it.url} className="space-y-1">
                    <img src={it.url} alt={it.name} className="w-full rounded-md border" />
                    <p className="text-xs break-all opacity-80">{it.name}</p>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

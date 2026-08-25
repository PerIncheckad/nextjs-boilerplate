'use client';

import { ChangeEvent, DragEvent, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

const DOCUMENT_TYPES = [
  ['LEVERANTORSFAKTURA', 'Leverantörsfaktura'],
  ['KVITTO', 'Kvitto'],
  ['SKADEBILD', 'Skadebild'],
  ['SKADEANMALAN', 'Skadeanmälan'],
  ['VERKSTADSUNDERLAG', 'Verkstadsunderlag'],
  ['SERVICE', 'Service / reparation'],
  ['TRANSPORT', 'Transportdokument'],
  ['COC', 'COC / fordonsdokument'],
  ['RETURBLANKETT', 'Returblankett'],
  ['OVRIGT', 'Övrigt'],
] as const;

type ContextOption = {
  value: string;
  label: string;
};

type DamageContext = {
  id: string;
  damage_type_raw?: string | null;
  legacy_damage_source_text?: string | null;
  damage_date?: string | null;
  source?: string | null;
};

type Props = {
  regnr: string;
  damages: DamageContext[];
  checkpoints: Array<Record<string, unknown>>;
  childProcesses: Array<Record<string, unknown>>;
  onUploaded: () => void;
};

type PrepareResponse = {
  data?: { bucket: string; path: string; token: string };
  error?: string;
};

type CompleteResponse = {
  data?: { document_id: string };
  error?: string;
  duplicate?: { documentId: string; fileName: string; documentType: string; uploadedAt: string };
};

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export default function DocumentUpload({ regnr, damages, checkpoints, childProcesses, onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [documentType, setDocumentType] = useState('OVRIGT');
  const [title, setTitle] = useState('');
  const [contextType, setContextType] = useState('VEHICLE');
  const [contextId, setContextId] = useState('');
  const [supplier, setSupplier] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [documentDate, setDocumentDate] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [currency, setCurrency] = useState('SEK');
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState('');

  const isEconomicSource = documentType === 'LEVERANTORSFAKTURA' || documentType === 'KVITTO';

  const damageOptions = useMemo<ContextOption[]>(() => damages.map((damage) => ({
    value: damage.id,
    label: `${damage.damage_type_raw || damage.legacy_damage_source_text || 'Skada'}${damage.damage_date ? ` · ${damage.damage_date}` : ''}${damage.source ? ` · ${damage.source}` : ''}`,
  })), [damages]);

  const checkpointOptions = useMemo<ContextOption[]>(() => checkpoints.map((checkpoint) => ({
    value: text(checkpoint.checkpoint_id),
    label: `${text(checkpoint.checkpoint_code) || 'Checkpoint'} · ${text(checkpoint.status) || 'okänd status'}`,
  })).filter((option) => option.value), [checkpoints]);

  const childProcessOptions = useMemo<ContextOption[]>(() => childProcesses.map((process) => ({
    value: text(process.child_process_id),
    label: `${text(process.process_type) || 'SALU-åtgärd'}${text(process.source_checkpoint) ? ` · ${text(process.source_checkpoint)}` : ''} · ${text(process.status) || 'okänd status'}`,
  })).filter((option) => option.value), [childProcesses]);

  const contextOptions = contextType === 'DAMAGE'
    ? damageOptions
    : contextType === 'SALU_CHECKPOINT'
      ? checkpointOptions
      : contextType === 'SALU_CHILD_PROCESS'
        ? childProcessOptions
        : [];

  function changeContextType(nextType: string) {
    setContextType(nextType);
    setContextId('');
  }

  async function uploadFiles(files: File[]) {
    if (!files.length || uploading) return;
    if (contextType !== 'VEHICLE' && !contextId) {
      setMessage('Välj vilken skada eller SALU-post dokumentet ska kopplas till.');
      return;
    }

    setUploading(true);
    setMessage('');

    try {
      for (const file of files) {
        if (file.size > 50 * 1024 * 1024) throw new Error(`${file.name} är större än 50 MB.`);

        const prepareResponse = await fetch('/api/vehicle-documents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'prepare',
            regnr,
            fileName: file.name,
            mimeType: file.type || null,
            sizeBytes: file.size,
          }),
        });
        const prepared = (await prepareResponse.json()) as PrepareResponse;
        if (!prepareResponse.ok || !prepared.data) {
          throw new Error(prepared.error || `Kunde inte förbereda ${file.name}`);
        }

        const { bucket, path, token } = prepared.data;
        const { error: uploadError } = await supabase.storage
          .from(bucket)
          .uploadToSignedUrl(path, token, file, {
            contentType: file.type || 'application/octet-stream',
          });
        if (uploadError) throw new Error(`Uppladdning misslyckades för ${file.name}: ${uploadError.message}`);

        const completeResponse = await fetch('/api/vehicle-documents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'complete',
            regnr,
            path,
            fileName: file.name,
            mimeType: file.type || null,
            sizeBytes: file.size,
            documentType,
            title: title.trim() || null,
            contextType,
            contextId: contextType === 'VEHICLE' ? null : contextId,
            sourceFacts: isEconomicSource ? {
              supplier: supplier.trim() || null,
              invoiceNumber: invoiceNumber.trim() || null,
              documentDate: documentDate || null,
              totalAmount: totalAmount.trim() || null,
              currency,
            } : null,
          }),
        });
        const completed = (await completeResponse.json()) as CompleteResponse;
        if (!completeResponse.ok || !completed.data) {
          throw new Error(completed.error || `Kunde inte registrera ${file.name}`);
        }
      }

      setMessage(files.length === 1 ? 'Dokumentet är sparat på Vagnkortet.' : `${files.length} dokument är sparade på Vagnkortet.`);
      setTitle('');
      setSupplier('');
      setInvoiceNumber('');
      setDocumentDate('');
      setTotalAmount('');
      setCurrency('SEK');
      if (inputRef.current) inputRef.current.value = '';
      onUploaded();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Uppladdningen misslyckades.');
    } finally {
      setUploading(false);
      setDragging(false);
    }
  }

  function onFileInput(event: ChangeEvent<HTMLInputElement>) {
    void uploadFiles(Array.from(event.target.files ?? []));
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    void uploadFiles(Array.from(event.dataTransfer.files));
  }

  return (
    <div style={{ display: 'grid', gap: '.75rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '.6rem' }}>
        <label style={{ display: 'grid', gap: '.25rem', fontSize: 13 }}>
          Dokumenttyp
          <select value={documentType} onChange={(event) => setDocumentType(event.target.value)} disabled={uploading} style={{ padding: '.65rem', border: '1px solid #bbb', borderRadius: 8 }}>
            {DOCUMENT_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label style={{ display: 'grid', gap: '.25rem', fontSize: 13 }}>
          Koppla till
          <select value={contextType} onChange={(event) => changeContextType(event.target.value)} disabled={uploading} style={{ padding: '.65rem', border: '1px solid #bbb', borderRadius: 8 }}>
            <option value="VEHICLE">Bilen generellt</option>
            <option value="DAMAGE">Skada</option>
            <option value="SALU_CHECKPOINT">SALU-checkpoint</option>
            <option value="SALU_CHILD_PROCESS">SALU-åtgärd</option>
          </select>
        </label>
        {contextType !== 'VEHICLE' && (
          <label style={{ display: 'grid', gap: '.25rem', fontSize: 13 }}>
            Välj post
            <select value={contextId} onChange={(event) => setContextId(event.target.value)} disabled={uploading || contextOptions.length === 0} style={{ padding: '.65rem', border: '1px solid #bbb', borderRadius: 8 }}>
              <option value="">{contextOptions.length === 0 ? 'Inga valbara poster' : 'Välj…'}</option>
              {contextOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
        )}
        <label style={{ display: 'grid', gap: '.25rem', fontSize: 13 }}>
          Rubrik (valfri)
          <input value={title} onChange={(event) => setTitle(event.target.value)} disabled={uploading} placeholder="T.ex. Faktura Werksta 20/8" style={{ padding: '.65rem', border: '1px solid #bbb', borderRadius: 8 }} />
        </label>
      </div>

      {isEconomicSource && (
        <div style={{ border: '1px solid #d7d7d7', borderRadius: 10, padding: '.8rem', background: '#fafafa' }}>
          <div style={{ fontWeight: 700, marginBottom: '.5rem' }}>Källfakta från dokumentet</div>
          <div style={{ color: '#666', fontSize: 12, marginBottom: '.65rem' }}>Fälten är källregistrering, inte kostnadsansvar eller ekonomisk tolkning.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '.6rem' }}>
            <label style={{ display: 'grid', gap: '.25rem', fontSize: 13 }}>
              Leverantör
              <input value={supplier} onChange={(event) => setSupplier(event.target.value)} disabled={uploading} placeholder="Leverantör" style={{ padding: '.65rem', border: '1px solid #bbb', borderRadius: 8 }} />
            </label>
            <label style={{ display: 'grid', gap: '.25rem', fontSize: 13 }}>
              Faktura-/kvittonummer
              <input value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} disabled={uploading} placeholder="Nummer" style={{ padding: '.65rem', border: '1px solid #bbb', borderRadius: 8 }} />
            </label>
            <label style={{ display: 'grid', gap: '.25rem', fontSize: 13 }}>
              Dokumentdatum
              <input type="date" value={documentDate} onChange={(event) => setDocumentDate(event.target.value)} disabled={uploading} style={{ padding: '.65rem', border: '1px solid #bbb', borderRadius: 8 }} />
            </label>
            <label style={{ display: 'grid', gap: '.25rem', fontSize: 13 }}>
              Totalbelopp
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 74px', gap: '.4rem' }}>
                <input type="number" min="0" step="0.01" value={totalAmount} onChange={(event) => setTotalAmount(event.target.value)} disabled={uploading} placeholder="0,00" style={{ padding: '.65rem', border: '1px solid #bbb', borderRadius: 8 }} />
                <select value={currency} onChange={(event) => setCurrency(event.target.value)} disabled={uploading} style={{ padding: '.65rem', border: '1px solid #bbb', borderRadius: 8 }}>
                  <option value="SEK">SEK</option>
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                </select>
              </div>
            </label>
          </div>
        </div>
      )}

      <div
        onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !uploading && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => { if ((event.key === 'Enter' || event.key === ' ') && !uploading) inputRef.current?.click(); }}
        style={{
          border: `2px dashed ${dragging ? '#222' : '#aaa'}`,
          background: dragging ? '#f0f0f0' : '#fafafa',
          borderRadius: 10,
          padding: '1.4rem',
          textAlign: 'center',
          cursor: uploading ? 'wait' : 'pointer',
        }}
      >
        <strong>{uploading ? 'Laddar upp…' : 'Släpp filer här'}</strong>
        <div style={{ marginTop: '.25rem', color: '#666', fontSize: 13 }}>eller klicka för att välja · max 50 MB per fil</div>
        <input ref={inputRef} type="file" multiple onChange={onFileInput} disabled={uploading} style={{ display: 'none' }} />
      </div>

      {message && <div style={{ fontSize: 13, color: message.includes('misslyck') || message.includes('Kunde') || message.includes('större') || message.includes('Välj') || message.includes('redan') ? '#a00' : '#176b2c' }}>{message}</div>}
    </div>
  );
}

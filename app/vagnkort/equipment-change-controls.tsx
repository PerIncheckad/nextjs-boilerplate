'use client';

import { FormEvent, useMemo, useState } from 'react';

type EquipmentState = {
  keys?: number | null;
  chargingCables?: number | null;
  privacyCovers?: number | null;
  instructionBook?: boolean | null;
  coc?: boolean | null;
  wheelLocks?: boolean | null;
  towbar?: boolean | null;
  rubberMats?: boolean | null;
  tireCompressor?: boolean | null;
  mountedWheels?: string | null;
  looseWheels?: string | null;
};

type Props = {
  regnr: string;
  current: EquipmentState | null;
  onChanged: () => void;
};

type FieldName = keyof EquipmentState;

type FieldDefinition = {
  field: FieldName;
  label: string;
  kind: 'number' | 'boolean' | 'text';
};

const fields: FieldDefinition[] = [
  { field: 'keys', label: 'Nycklar', kind: 'number' },
  { field: 'chargingCables', label: 'Laddkablar', kind: 'number' },
  { field: 'privacyCovers', label: 'Insynsskydd / hatthylla', kind: 'number' },
  { field: 'instructionBook', label: 'Instruktionsbok', kind: 'boolean' },
  { field: 'coc', label: 'COC', kind: 'boolean' },
  { field: 'wheelLocks', label: 'Låsbultar', kind: 'boolean' },
  { field: 'towbar', label: 'Dragkrok', kind: 'boolean' },
  { field: 'rubberMats', label: 'Gummimattor', kind: 'boolean' },
  { field: 'tireCompressor', label: 'Däckkompressor', kind: 'boolean' },
  { field: 'mountedWheels', label: 'Monterade hjul', kind: 'text' },
  { field: 'looseWheels', label: 'Lösa hjul', kind: 'text' },
];

function present(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Ja' : 'Nej';
  return String(value);
}

export default function EquipmentChangeControls({ regnr, current, onChanged }: Props) {
  const [field, setField] = useState<FieldName>('keys');
  const [rawValue, setRawValue] = useState('');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const definition = useMemo(() => fields.find((item) => item.field === field) ?? fields[0], [field]);
  const currentValue = current?.[field];

  function parseValue() {
    if (definition.kind === 'number') return Number(rawValue);
    if (definition.kind === 'boolean') return rawValue === 'true';
    return rawValue.trim();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');

    if (!comment.trim()) {
      setError('Kommentar krävs för att dokumentera förändringen.');
      return;
    }
    if (definition.kind !== 'boolean' && !rawValue.trim()) {
      setError('Ange det nya värdet.');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/vehicle-journey/equipment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          regnr,
          field,
          value: parseValue(),
          comment: comment.trim(),
        }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || 'Kunde inte registrera förändringen');

      setRawValue('');
      setComment('');
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte registrera förändringen');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ borderTop: '1px solid #e5e5e5', marginTop: '1rem', paddingTop: '1rem' }}>
      <div style={{ fontWeight: 700, marginBottom: '.65rem' }}>Dokumentera utrustningsförändring</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '.6rem' }}>
        <label>
          <div style={{ fontSize: 12, color: '#666', marginBottom: '.25rem' }}>Attribut</div>
          <select
            value={field}
            onChange={(event) => {
              const next = event.target.value as FieldName;
              setField(next);
              setRawValue('');
            }}
            style={{ width: '100%', padding: '.65rem', borderRadius: 7, border: '1px solid #bbb' }}
          >
            {fields.map((item) => <option key={item.field} value={item.field}>{item.label}</option>)}
          </select>
        </label>

        <label>
          <div style={{ fontSize: 12, color: '#666', marginBottom: '.25rem' }}>Nu registrerat: {present(currentValue)}</div>
          {definition.kind === 'boolean' ? (
            <select value={rawValue} onChange={(event) => setRawValue(event.target.value)} required style={{ width: '100%', padding: '.65rem', borderRadius: 7, border: '1px solid #bbb' }}>
              <option value="">Välj nytt värde</option>
              <option value="true">Ja</option>
              <option value="false">Nej</option>
            </select>
          ) : (
            <input
              type={definition.kind === 'number' ? 'number' : 'text'}
              min={definition.kind === 'number' ? 0 : undefined}
              max={definition.kind === 'number' ? 20 : undefined}
              value={rawValue}
              onChange={(event) => setRawValue(event.target.value)}
              placeholder="Nytt värde"
              required
              style={{ width: '100%', boxSizing: 'border-box', padding: '.65rem', borderRadius: 7, border: '1px solid #bbb' }}
            />
          )}
        </label>
      </div>

      <textarea
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        placeholder="Vad har ändrats och varför?"
        maxLength={500}
        required
        rows={2}
        style={{ width: '100%', boxSizing: 'border-box', marginTop: '.6rem', padding: '.65rem', borderRadius: 7, border: '1px solid #bbb', resize: 'vertical' }}
      />

      {error && <div style={{ color: '#a00', fontSize: 13, marginTop: '.45rem' }}>{error}</div>}
      <button type="submit" disabled={saving} style={{ marginTop: '.6rem', border: 0, borderRadius: 7, background: '#111', color: '#fff', padding: '.65rem .9rem', fontWeight: 700, cursor: 'pointer' }}>
        {saving ? 'Sparar…' : 'Registrera förändring'}
      </button>
    </form>
  );
}

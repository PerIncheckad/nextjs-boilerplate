from pathlib import Path

form = Path('app/check/form-client.tsx')
s = form.read_text()

replacements = [
    (
        "  const [receiptMedia, setReceiptMedia] = useState<MediaFile | null>(null);\n  const [liters, setLiters] = useState('');",
        "  const [receiptMedia, setReceiptMedia] = useState<MediaFile | null>(null);\n  const [receiptMissing, setReceiptMissing] = useState(false);\n  const [receiptMissingReason, setReceiptMissingReason] = useState('');\n  const [liters, setLiters] = useState('');",
    ),
    (
        "    if (needsTank && tankstatusChoice !== 'inherit' && (!tankniva || (tankniva === 'tankad_nu' && (!liters || !literpris)))) return false;",
        "    if (needsTank && tankstatusChoice !== 'inherit' && (!tankniva || (tankniva === 'tankad_nu' && (!liters || !literpris || (!receiptMedia && !(receiptMissing && receiptMissingReason.trim())))))) return false;",
    ),
    (
        "        // --- Handle Receipt Upload (frivilligt, icke-blockerande) ---",
        "        // --- Handle Receipt Upload (obligatorisk evidensväg; uppladdningsfel blockerar) ---",
    ),
    (
        "            } catch (e) {\n                console.error('Receipt upload failed (non-blocking):', e);\n                alert('Tankkvittot kunde inte laddas upp, men incheckningen sparas.');\n            }",
        "            } catch (e) {\n                console.error('Receipt upload failed (blocking):', e);\n                throw new Error('Tankkvittot kunde inte laddas upp. Försök igen eller välj Kvitto saknas och ange obligatorisk orsak.');\n            }",
    ),
    (
        "            tankning_receipt: tempReceiptUrl ? {",
        "            fuel_receipt_status: tankniva === 'tankad_nu' ? (tempReceiptUrl ? 'DOCUMENTED' : 'MISSING_WITH_REASON') : null,\n            fuel_receipt_missing_reason: tankniva === 'tankad_nu' && !tempReceiptUrl ? receiptMissingReason.trim() : null,\n            tankning_receipt: tempReceiptUrl ? {",
    ),
    (
        "        <Card data-error={showFieldErrors && (!matarstallning || !hjultyp || !detailedBransletyp || (needsTank && !tankniva) || (needsTank && tankniva === 'tankad_nu' && (!liters || !literpris)) || (needsChargeLevel && !laddniva) || (needsChargeCables && antalLaddkablar === null))}>",
        "        <Card data-error={showFieldErrors && (!matarstallning || !hjultyp || !detailedBransletyp || (needsTank && !tankniva) || (needsTank && tankniva === 'tankad_nu' && (!liters || !literpris || (!receiptMedia && !(receiptMissing && receiptMissingReason.trim())))) || (needsChargeLevel && !laddniva) || (needsChargeCables && antalLaddkablar === null))}>",
    ),
]

for old, new in replacements:
    if old not in s:
        raise SystemExit(f'missing form marker: {old[:80]}')
    s = s.replace(old, new, 1)

s = s.replace("<ChoiceButton onClick={() => setTankniva('återlämnades_fulltankad')}", "<ChoiceButton onClick={() => { setTankniva('återlämnades_fulltankad'); setReceiptMedia(null); setReceiptMissing(false); setReceiptMissingReason(''); }}", 1)
s = s.replace("<ChoiceButton onClick={() => setTankniva('ej_upptankad')}", "<ChoiceButton onClick={() => { setTankniva('ej_upptankad'); setReceiptMedia(null); setReceiptMissing(false); setReceiptMissingReason(''); }}", 1)

start = s.index('                  <Field label="Tankkvitto (frivilligt)">')
end_marker = '                  </Field>\n                )}'
end = s.index(end_marker, start) + len('                  </Field>')
replacement = '''                  <Field label="Tankkvitto *">
                    {receiptMedia ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '6px', fontSize: '0.9rem' }}>
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{receiptMedia.file.name}</span>
                        <button type="button" onClick={() => setReceiptMedia(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: '#dc2626', padding: '0 0.25rem', lineHeight: 1 }} aria-label="Ta bort kvitto">×</button>
                      </div>
                    ) : (
                      <>
                        <label htmlFor="receipt-upload-input" className="media-label mandatory">Fotografera tankkvitto</label>
                        <input
                          id="receipt-upload-input"
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={e => {
                            const file = e.target.files?.[0];
                            if (file) {
                              setReceiptMedia({ file, type: 'image' });
                              setReceiptMissing(false);
                              setReceiptMissingReason('');
                            }
                            e.target.value = '';
                          }}
                          style={{ display: 'none' }}
                        />
                      </>
                    )}
                    <div style={{ marginTop: '0.75rem' }}>
                      <ChoiceButton
                        onClick={() => {
                          const next = !receiptMissing;
                          setReceiptMissing(next);
                          if (next) setReceiptMedia(null);
                          if (!next) setReceiptMissingReason('');
                        }}
                        isActive={receiptMissing}
                      >Kvitto saknas</ChoiceButton>
                    </div>
                    {receiptMissing && (
                      <div className="field" data-error={showFieldErrors && !receiptMissingReason.trim()} style={{ marginTop: '0.75rem', marginBottom: 0 }}>
                        <label>Orsak till att kvitto saknas *</label>
                        <textarea value={receiptMissingReason} onChange={e => setReceiptMissingReason(e.target.value)} placeholder="Ange varför kvittot saknas..." rows={2}></textarea>
                      </div>
                    )}
                    <div style={{ marginTop: '0.6rem', fontSize: '0.8rem', color: '#6b7280' }}>
                      Kvitto finns = verifierad evidens. Kvitto saknas + orsak = verifierad avvikelse.
                    </div>
                  </Field>'''
s = s[:start] + replacement + s[end:]
form.write_text(s)

handler = Path('app/api/notify/legacy-handler.ts')
h = handler.read_text()
marker = "    const regNr = payload.regnr || '';\n\n   // Mottagare/ämnen"
insert = """    const regNr = payload.regnr || '';

    const isNewFuelReceiptEvent = payload.tankning?.tankniva === 'tankad_nu';
    const declaredReceiptStatus = payload.fuel_receipt_status;
    const declaredMissingReason = typeof payload.fuel_receipt_missing_reason === 'string'
      ? payload.fuel_receipt_missing_reason.trim()
      : '';
    const hasReceiptEvidence = Boolean(payload.tankning_receipt?.file_url);
    const fuelReceiptStatus = isNewFuelReceiptEvent
      ? hasReceiptEvidence
        ? 'DOCUMENTED'
        : declaredReceiptStatus === 'MISSING_WITH_REASON' && declaredMissingReason
          ? 'MISSING_WITH_REASON'
          : null
      : null;

    if (isNewFuelReceiptEvent && !fuelReceiptStatus) {
      return NextResponse.json(
        { error: 'Tankad nu kräver kvittobild eller Kvitto saknas med obligatorisk orsak.' },
        { status: 400 }
      );
    }

   // Mottagare/ämnen"""
if marker not in h:
    raise SystemExit('missing handler reg marker')
h = h.replace(marker, insert, 1)
marker = "fuel_level: payload.tankning?.tankniva || null,"
if marker not in h:
    raise SystemExit('missing handler fuel marker')
h = h.replace(marker, "fuel_level: payload.tankning?.tankniva || null,\n          fuel_receipt_status: fuelReceiptStatus,\n          fuel_receipt_missing_reason: fuelReceiptStatus === 'MISSING_WITH_REASON' ? declaredMissingReason : null,", 1)
h = h.replace('// Save tankning_receipt if provided (frivilligt — fil är redan uppladdad till Storage av klienten)', '// Save tankning_receipt if provided (obligatorisk evidensväg för DOCUMENTED; filen är redan uppladdad av klienten)', 1)
handler.write_text(h)

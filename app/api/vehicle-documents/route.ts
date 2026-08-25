import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyApiUser } from '@/lib/server-auth';

const REGNR_RE = /^[A-Z]{3}[0-9]{2}[0-9A-Z]$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BUCKET = 'vehicle-documents';
const MAX_FILE_SIZE = 50 * 1024 * 1024;

type ContextType = 'VEHICLE' | 'DAMAGE' | 'SALU_CHECKPOINT' | 'SALU_CHILD_PROCESS';

type ContextResolution =
  | {
      ok: true;
      links: {
        damage_id: string | null;
        salu_flag_id: string | null;
        salu_checkpoint_id: string | null;
        salu_child_process_id: string | null;
      };
      payload: {
        type: ContextType;
        id: string | null;
        label: string | null;
      };
    }
  | { ok: false; status: 400 | 500; error: string };

function cleanRegnr(value: unknown): string {
  return typeof value === 'string' ? value.toUpperCase().replace(/\s+/g, '') : '';
}

function cleanFileName(value: unknown): string {
  const fileName = typeof value === 'string' ? value.trim() : '';
  const base = fileName.split(/[\\/]/).pop() || 'document';
  return base.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'document';
}

function cleanDocumentType(value: unknown): string {
  const documentType = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return documentType.replace(/[^A-Z0-9_-]+/g, '_').slice(0, 80) || 'OVRIGT';
}

function cleanContextType(value: unknown): ContextType | null {
  const contextType = typeof value === 'string' ? value.trim().toUpperCase() : 'VEHICLE';
  return ['VEHICLE', 'DAMAGE', 'SALU_CHECKPOINT', 'SALU_CHILD_PROCESS'].includes(contextType)
    ? contextType as ContextType
    : null;
}

function cleanContextId(value: unknown): string | null {
  const contextId = typeof value === 'string' ? value.trim() : '';
  return UUID_RE.test(contextId) ? contextId : null;
}

function cleanText(value: unknown, maxLength = 200): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function cleanAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const normalized = typeof value === 'string' ? value.replace(',', '.') : value;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0 || amount > 100_000_000) return null;
  return Math.round(amount * 100) / 100;
}

function cleanDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const parsed = new Date(`${trimmed}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : trimmed;
}

function cleanCurrency(value: unknown): string {
  const currency = typeof value === 'string' ? value.trim().toUpperCase() : 'SEK';
  return /^[A-Z]{3}$/.test(currency) ? currency : 'SEK';
}

function cleanFingerprint(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.replaceAll('"', '').trim().toLowerCase();
  return /^[a-f0-9]{16,128}$/.test(cleaned) ? cleaned : null;
}

function cleanSourceFacts(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const supplier = cleanText(raw.supplier);
  const invoiceNumber = cleanText(raw.invoiceNumber, 100);
  const documentDate = cleanDate(raw.documentDate);
  const totalAmount = cleanAmount(raw.totalAmount);
  const currency = cleanCurrency(raw.currency);
  if (!supplier && !invoiceNumber && !documentDate && totalAmount === null) return null;
  return {
    supplier,
    invoiceNumber,
    documentDate,
    totalAmount,
    currency,
    provenance: 'USER_ENTERED',
    monetaryInterpretation: false,
  };
}

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Missing Supabase server configuration');
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function vehicleExists(admin: ReturnType<typeof createAdminClient>, regnr: string) {
  const [vehicle, nybil, checkin, salu] = await Promise.all([
    admin.from('vehicles').select('regnr').eq('regnr', regnr).limit(1),
    admin.from('nybil_inventering').select('regnr').eq('regnr', regnr).limit(1),
    admin.from('checkins').select('regnr').eq('regnr', regnr).limit(1),
    admin.from('salu_vehicle_state').select('regnr').eq('regnr', regnr).limit(1),
  ]);
  const failed = [vehicle, nybil, checkin, salu].find((response) => response.error);
  if (failed?.error) throw failed.error;
  return [vehicle, nybil, checkin, salu].some((response) => (response.data?.length ?? 0) > 0);
}

async function resolveDocumentContext(
  admin: ReturnType<typeof createAdminClient>,
  regnr: string,
  rawType: unknown,
  rawId: unknown,
): Promise<ContextResolution> {
  const contextType = cleanContextType(rawType);
  if (!contextType) return { ok: false, status: 400, error: 'Invalid document context type' };

  const emptyLinks = {
    damage_id: null,
    salu_flag_id: null,
    salu_checkpoint_id: null,
    salu_child_process_id: null,
  };

  if (contextType === 'VEHICLE') {
    return {
      ok: true,
      links: emptyLinks,
      payload: { type: 'VEHICLE', id: null, label: 'Bilen' },
    };
  }

  const contextId = cleanContextId(rawId);
  if (!contextId) return { ok: false, status: 400, error: 'Invalid document context id' };

  if (contextType === 'DAMAGE') {
    const { data: damage, error } = await admin
      .from('damages')
      .select('id,damage_type_raw,legacy_damage_source_text,damage_date,source')
      .eq('id', contextId)
      .eq('regnr', regnr)
      .maybeSingle();
    if (error) {
      console.error('[vehicle-documents] Could not verify damage context:', error);
      return { ok: false, status: 500, error: 'Could not verify document context' };
    }
    if (!damage) return { ok: false, status: 400, error: 'Damage does not belong to vehicle' };

    const damageName = damage.damage_type_raw || damage.legacy_damage_source_text || 'Skada';
    const damageDate = damage.damage_date ? ` ${damage.damage_date}` : '';
    return {
      ok: true,
      links: { ...emptyLinks, damage_id: damage.id },
      payload: {
        type: 'DAMAGE',
        id: damage.id,
        label: `${damageName}${damageDate}`,
      },
    };
  }

  if (contextType === 'SALU_CHECKPOINT') {
    const { data: checkpoint, error } = await admin
      .from('salu_checkpoints')
      .select('checkpoint_id,flag_id,checkpoint_code,status')
      .eq('checkpoint_id', contextId)
      .maybeSingle();
    if (error) {
      console.error('[vehicle-documents] Could not verify SALU checkpoint context:', error);
      return { ok: false, status: 500, error: 'Could not verify document context' };
    }
    if (!checkpoint) return { ok: false, status: 400, error: 'SALU checkpoint not found' };

    const { data: flag, error: flagError } = await admin
      .from('salu_flags')
      .select('flag_id,regnr')
      .eq('flag_id', checkpoint.flag_id)
      .maybeSingle();
    if (flagError) {
      console.error('[vehicle-documents] Could not verify SALU flag:', flagError);
      return { ok: false, status: 500, error: 'Could not verify document context' };
    }
    if (!flag || flag.regnr !== regnr) {
      return { ok: false, status: 400, error: 'SALU checkpoint does not belong to vehicle' };
    }

    return {
      ok: true,
      links: {
        ...emptyLinks,
        salu_flag_id: flag.flag_id,
        salu_checkpoint_id: checkpoint.checkpoint_id,
      },
      payload: {
        type: 'SALU_CHECKPOINT',
        id: checkpoint.checkpoint_id,
        label: `SALU ${checkpoint.checkpoint_code} · ${checkpoint.status}`,
      },
    };
  }

  const { data: childProcess, error } = await admin
    .from('salu_child_processes')
    .select('child_process_id,flag_id,process_type,source_checkpoint,status')
    .eq('child_process_id', contextId)
    .maybeSingle();
  if (error) {
    console.error('[vehicle-documents] Could not verify SALU child process context:', error);
    return { ok: false, status: 500, error: 'Could not verify document context' };
  }
  if (!childProcess) return { ok: false, status: 400, error: 'SALU action not found' };

  const { data: flag, error: flagError } = await admin
    .from('salu_flags')
    .select('flag_id,regnr')
    .eq('flag_id', childProcess.flag_id)
    .maybeSingle();
  if (flagError) {
    console.error('[vehicle-documents] Could not verify SALU child-process flag:', flagError);
    return { ok: false, status: 500, error: 'Could not verify document context' };
  }
  if (!flag || flag.regnr !== regnr) {
    return { ok: false, status: 400, error: 'SALU action does not belong to vehicle' };
  }

  const checkpointLabel = childProcess.source_checkpoint ? ` · ${childProcess.source_checkpoint}` : '';
  return {
    ok: true,
    links: {
      ...emptyLinks,
      salu_flag_id: flag.flag_id,
      salu_child_process_id: childProcess.child_process_id,
    },
    payload: {
      type: 'SALU_CHILD_PROCESS',
      id: childProcess.child_process_id,
      label: `${childProcess.process_type}${checkpointLabel} · ${childProcess.status}`,
    },
  };
}

export async function POST(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) {
    return NextResponse.json({ error: verification.error }, { status: verification.status });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const action = body.action;
  const regnr = cleanRegnr(body.regnr);
  if (!REGNR_RE.test(regnr)) {
    return NextResponse.json({ error: 'Invalid regnr' }, { status: 400 });
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (error) {
    console.error('[vehicle-documents] Missing server configuration:', error);
    return NextResponse.json({ error: 'Document service unavailable' }, { status: 503 });
  }

  try {
    if (!(await vehicleExists(admin, regnr))) {
      return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 });
    }

    if (action === 'prepare') {
      const fileName = cleanFileName(body.fileName);
      const sizeBytes = Number(body.sizeBytes);
      if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_FILE_SIZE) {
        return NextResponse.json({ error: 'File must be between 1 byte and 50 MB' }, { status: 400 });
      }

      const now = new Date();
      const year = String(now.getUTCFullYear());
      const month = String(now.getUTCMonth() + 1).padStart(2, '0');
      const path = `${regnr}/${year}/${month}/${crypto.randomUUID()}-${fileName}`;
      const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: false });
      if (error || !data?.token) {
        console.error('[vehicle-documents] Could not create signed upload URL:', error);
        return NextResponse.json({ error: 'Could not prepare upload' }, { status: 500 });
      }

      return NextResponse.json({ data: { bucket: BUCKET, path, token: data.token } });
    }

    if (action === 'complete') {
      const path = typeof body.path === 'string' ? body.path.trim() : '';
      const fileName = cleanFileName(body.fileName);
      const documentType = cleanDocumentType(body.documentType);
      const title = cleanText(body.title);
      const mimeType = cleanText(body.mimeType);
      const expectedSize = Number(body.sizeBytes);
      const sourceFacts = cleanSourceFacts(body.sourceFacts);
      const context = await resolveDocumentContext(admin, regnr, body.contextType, body.contextId);
      if (!context.ok) {
        return NextResponse.json({ error: context.error }, { status: context.status });
      }

      if (!path.startsWith(`${regnr}/`) || path.includes('..')) {
        return NextResponse.json({ error: 'Invalid storage path' }, { status: 400 });
      }

      const slash = path.lastIndexOf('/');
      const folder = slash >= 0 ? path.slice(0, slash) : '';
      const storedName = slash >= 0 ? path.slice(slash + 1) : path;
      const { data: storedObjects, error: listError } = await admin.storage
        .from(BUCKET)
        .list(folder, { limit: 10, search: storedName });
      if (listError) {
        console.error('[vehicle-documents] Could not verify uploaded object:', listError);
        return NextResponse.json({ error: 'Could not verify upload' }, { status: 500 });
      }
      const storedObject = storedObjects?.find((item) => item.name === storedName);
      if (!storedObject) {
        return NextResponse.json({ error: 'Uploaded file not found' }, { status: 409 });
      }

      const storedSize = Number(storedObject.metadata?.size ?? expectedSize);
      if (Number.isFinite(expectedSize) && expectedSize > 0 && Number.isFinite(storedSize) && storedSize !== expectedSize) {
        return NextResponse.json({ error: 'Uploaded file size mismatch' }, { status: 409 });
      }

      const contentFingerprint = cleanFingerprint(storedObject.metadata?.eTag);
      if (contentFingerprint) {
        const { data: duplicate, error: duplicateError } = await admin
          .from('vehicle_documents')
          .select('document_id,file_name,document_type,uploaded_at')
          .eq('regnr', regnr)
          .contains('metadata', { contentFingerprint })
          .order('uploaded_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (duplicateError) {
          console.error('[vehicle-documents] Duplicate lookup failed:', duplicateError);
          return NextResponse.json({ error: 'Could not verify document uniqueness' }, { status: 500 });
        }
        if (duplicate) {
          const { error: cleanupError } = await admin.storage.from(BUCKET).remove([path]);
          if (cleanupError) console.error('[vehicle-documents] Could not remove duplicate upload:', cleanupError);
          return NextResponse.json({
            error: `Exakt samma fil finns redan på Vagnkortet som ${duplicate.file_name}.`,
            duplicate: {
              documentId: duplicate.document_id,
              fileName: duplicate.file_name,
              documentType: duplicate.document_type,
              uploadedAt: duplicate.uploaded_at,
            },
          }, { status: 409 });
        }
      }

      const metadata = {
        uploadedVia: 'VAGNKORT',
        context: context.payload,
        ...(contentFingerprint ? { contentFingerprint, fingerprintSource: 'SUPABASE_STORAGE_ETAG' } : {}),
        ...(sourceFacts ? { sourceFacts } : {}),
      };

      const { data: document, error: documentError } = await admin
        .from('vehicle_documents')
        .insert({
          regnr,
          document_type: documentType,
          title,
          storage_bucket: BUCKET,
          storage_path: path,
          file_name: fileName,
          mime_type: mimeType,
          size_bytes: Number.isFinite(storedSize) ? storedSize : null,
          ...context.links,
          source_system: 'VAGNKORT',
          source_record_id: path,
          metadata,
          uploaded_by: verification.user.id,
          uploaded_by_email: verification.user.email,
        })
        .select('document_id,document_type,title,file_name,mime_type,size_bytes,storage_bucket,storage_path,damage_id,salu_flag_id,salu_checkpoint_id,salu_child_process_id,metadata,uploaded_at')
        .single();

      if (documentError || !document) {
        if (documentError?.code === '23505') {
          return NextResponse.json({ error: 'Document is already registered' }, { status: 409 });
        }
        console.error('[vehicle-documents] Could not register document:', documentError);
        return NextResponse.json({ error: 'Could not register document' }, { status: 500 });
      }

      const { data: event, error: eventError } = await admin
        .from('vehicle_journey_events')
        .insert({
          regnr,
          event_type: 'DOCUMENT_UPLOADED',
          event_key: `vehicle-document:${document.document_id}`,
          occurred_at: document.uploaded_at,
          source_system: 'VAGNKORT',
          source_entity: 'vehicle_documents',
          source_record_id: document.document_id,
          actor_id: verification.user.id,
          actor_source: 'MANUELL',
          actor_email: verification.user.email,
          payload: {
            documentType,
            title,
            fileName,
            mimeType,
            sizeBytes: document.size_bytes,
            context: context.payload,
            contentFingerprint,
            sourceFacts,
          },
        })
        .select('event_id')
        .single();

      if (eventError || !event) {
        console.error('[vehicle-documents] Document registered but journey event failed:', eventError);
      } else {
        const { error: linkError } = await admin
          .from('vehicle_documents')
          .update({ journey_event_id: event.event_id })
          .eq('document_id', document.document_id);
        if (linkError) console.error('[vehicle-documents] Could not link journey event:', linkError);
      }

      return NextResponse.json({ data: document }, { status: 201 });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('[vehicle-documents] Unexpected error:', error);
    return NextResponse.json({ error: 'Document operation failed' }, { status: 500 });
  }
}

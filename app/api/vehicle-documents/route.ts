import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyApiUser } from '@/lib/server-auth';

const REGNR_RE = /^[A-Z]{3}[0-9]{2}[0-9A-Z]$/;
const BUCKET = 'vehicle-documents';
const MAX_FILE_SIZE = 50 * 1024 * 1024;

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
      const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 200) : null;
      const mimeType = typeof body.mimeType === 'string' && body.mimeType.trim() ? body.mimeType.trim().slice(0, 200) : null;
      const expectedSize = Number(body.sizeBytes);

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
          source_system: 'VAGNKORT',
          source_record_id: path,
          metadata: { uploadedVia: 'VAGNKORT' },
          uploaded_by: verification.user.id,
          uploaded_by_email: verification.user.email,
        })
        .select('document_id,document_type,title,file_name,mime_type,size_bytes,storage_bucket,storage_path,uploaded_at')
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

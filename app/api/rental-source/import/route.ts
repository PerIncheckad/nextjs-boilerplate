import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyApiUser } from '@/lib/server-auth';
import {
  RENTAL_BASELINE_HEADERS,
  parseRentalSourceReport,
  type ParsedRentalSourceRow,
} from '@/lib/rental-source-report';

export const runtime = 'nodejs';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const CHUNK_SIZE = 250;
const SOURCE_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const BASELINE_HEADER_SET = new Set<string>(RENTAL_BASELINE_HEADERS);

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Missing Supabase server configuration');
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function getImportAllowedEmails(): Set<string> {
  return new Set(
    (process.env.RENTAL_IMPORT_ALLOWED_EMAILS ?? '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

function formString(form: FormData, name: string): string | null {
  const value = form.get(name);
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized === '' ? null : normalized;
}

function validateGeneratedAt(value: string | null): string | null {
  if (value === null) return null;
  if (!SOURCE_TIMESTAMP_RE.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error('sourceGeneratedAt måste vara ISO 8601 med tid och tidszon');
  }
  return value;
}

function toRpcRow(row: ParsedRentalSourceRow) {
  return {
    sourceRowNumber: row.sourceRowNumber,
    raw: row.raw,
    closeMonth: row.operational.closeMonth,
    stationNo: row.operational.stationNo,
    outStation: row.operational.outStation,
    closeYear: row.operational.closeYear,
    closedDate: row.operational.closedDate,
    agreementNo: row.operational.agreementNo,
    outAt: row.operational.outAt,
    inAt: row.operational.inAt,
    regnr: row.operational.regnr,
  };
}

export async function POST(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) {
    return NextResponse.json({ error: verification.error }, { status: verification.status });
  }

  const allowedEmails = getImportAllowedEmails();
  if (allowedEmails.size === 0) {
    console.error('[rental-source-import] RENTAL_IMPORT_ALLOWED_EMAILS is not configured');
    return NextResponse.json({ error: 'Rental import is not configured' }, { status: 503 });
  }
  if (!allowedEmails.has(verification.user.email)) {
    return NextResponse.json({ error: 'Rental import access denied' }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'file is empty' }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: 'file exceeds 10 MiB import limit' }, { status: 413 });
  }

  const sourceSystem = formString(form, 'sourceSystem');
  const reportName = formString(form, 'reportName');
  if (!sourceSystem || !reportName) {
    return NextResponse.json({ error: 'sourceSystem and reportName are required' }, { status: 400 });
  }

  let sourceGeneratedAt: string | null;
  try {
    sourceGeneratedAt = validateGeneratedAt(formString(form, 'sourceGeneratedAt'));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid sourceGeneratedAt' }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  let parsed;
  try {
    parsed = parseRentalSourceReport(bytes);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Invalid rental source report' },
      { status: 422 },
    );
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (error) {
    console.error('[rental-source-import] Missing server configuration:', error);
    return NextResponse.json({ error: 'Rental import unavailable' }, { status: 503 });
  }

  const { data: batchId, error: batchError } = await admin.rpc('create_rental_source_import_batch', {
    p_source_system: sourceSystem,
    p_source_report_name: reportName,
    p_source_generated_at: sourceGeneratedAt,
    p_source_file_name: file.name || null,
    p_source_file_hash: parsed.sha256,
    p_row_count: parsed.rows.length,
    p_metadata: {
      format: parsed.delimiter === '\t' ? 'TSV' : 'CSV',
      delimiter: parsed.delimiter,
      headerCount: parsed.headers.length,
      headers: parsed.headers,
      importedBy: verification.user.id,
    },
  });

  if (batchError || !batchId) {
    console.error('[rental-source-import] Failed to create batch:', batchError);
    return NextResponse.json({ error: 'Failed to create rental import batch' }, { status: 500 });
  }

  let seen = 0;
  let accepted = 0;
  let conflicts = 0;
  const conflictCodes: Record<string, number> = {};

  for (let offset = 0; offset < parsed.rows.length; offset += CHUNK_SIZE) {
    const chunk = parsed.rows.slice(offset, offset + CHUNK_SIZE).map(toRpcRow);
    const { data, error } = await admin.rpc('ingest_rental_source_rows', {
      p_batch_id: batchId,
      p_source_system: sourceSystem,
      p_rows: chunk,
    });

    if (error || !data || typeof data !== 'object') {
      console.error('[rental-source-import] Chunk ingestion failed:', { batchId, offset, error });
      return NextResponse.json(
        {
          error: 'Rental import stopped during ingestion; replay the same file to continue safely',
          batchId,
          fileHash: parsed.sha256,
          completedRows: seen,
        },
        { status: 500 },
      );
    }

    const summary = data as {
      seen?: number;
      accepted?: number;
      conflicts?: number;
      conflictCodes?: Record<string, number>;
    };
    seen += summary.seen ?? 0;
    accepted += summary.accepted ?? 0;
    conflicts += summary.conflicts ?? 0;
    for (const [code, count] of Object.entries(summary.conflictCodes ?? {})) {
      conflictCodes[code] = (conflictCodes[code] ?? 0) + Number(count || 0);
    }
  }

  const response = {
    batchId,
    fileHash: parsed.sha256,
    fileName: file.name,
    sourceSystem,
    reportName,
    sourceGeneratedAt,
    rows: parsed.rows.length,
    seen,
    accepted,
    conflicts,
    conflictCodes,
    extraColumns: parsed.headers.filter((header) => !BASELINE_HEADER_SET.has(header)),
  };

  if (conflicts > 0) {
    return NextResponse.json({ ...response, status: 'SOURCE_CONFLICTS' }, { status: 409 });
  }
  return NextResponse.json({ ...response, status: 'IMPORTED' });
}

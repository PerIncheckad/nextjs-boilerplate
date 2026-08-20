import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyApiUser } from '@/lib/server-auth';

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Missing Supabase server configuration');
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) {
    return NextResponse.json({ error: verification.error }, { status: verification.status });
  }

  const { id } = await context.params;
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (error) {
    console.error('[vehicle-documents] Missing server configuration:', error);
    return NextResponse.json({ error: 'Document service unavailable' }, { status: 503 });
  }

  const { data: document, error } = await admin
    .from('vehicle_documents')
    .select('document_id,storage_bucket,storage_path,external_url,file_name')
    .eq('document_id', id)
    .maybeSingle();

  if (error) {
    console.error('[vehicle-documents] Document lookup failed:', error);
    return NextResponse.json({ error: 'Could not load document' }, { status: 500 });
  }
  if (!document) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

  if (document.external_url) {
    return NextResponse.json({ data: { url: document.external_url, fileName: document.file_name } });
  }
  if (!document.storage_bucket || !document.storage_path) {
    return NextResponse.json({ error: 'Document has no file location' }, { status: 409 });
  }

  const { data, error: signedUrlError } = await admin.storage
    .from(document.storage_bucket)
    .createSignedUrl(document.storage_path, 300, { download: document.file_name });

  if (signedUrlError || !data?.signedUrl) {
    console.error('[vehicle-documents] Signed URL creation failed:', signedUrlError);
    return NextResponse.json({ error: 'Could not open document' }, { status: 500 });
  }

  return NextResponse.json({ data: { url: data.signedUrl, fileName: document.file_name } });
}

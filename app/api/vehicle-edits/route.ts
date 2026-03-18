import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

// =================================================================
// 1. INITIALIZATION
// =================================================================

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder';

// Server-side Supabase client with service role - bypasses RLS
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

// =================================================================
// 2. TYPES
// =================================================================

type EditPayload = {
  regnr: string;
  field_name: string;
  new_value: string | null;
  old_value: string | null;
  edited_by: string;
  comment?: string | null;
};

// =================================================================
// 3. API HANDLER
// =================================================================

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { edits } = body as { edits: EditPayload[] };

    // Validate payload
    if (!Array.isArray(edits) || edits.length === 0) {
      return NextResponse.json(
        { error: 'Missing or empty edits array' },
        { status: 400 }
      );
    }

    for (const edit of edits) {
      if (!edit.regnr || !edit.field_name || !edit.edited_by) {
        return NextResponse.json(
          { error: 'Each edit must have regnr, field_name, and edited_by' },
          { status: 400 }
        );
      }
    }

    // Generate a shared batch_id for all edits in this save
    const batchId = randomUUID();
    const editsWithBatch = edits.map((edit: EditPayload) => ({
      ...edit,
      batch_id: batchId,
    }));

    // Insert all edits (edited_at defaults to NOW() in DB)
    const { data, error } = await supabaseAdmin
      .from('vehicle_edits')
      .insert(editsWithBatch)
      .select();

    if (error) {
      console.error('[API /vehicle-edits] Insert error:', error);
      return NextResponse.json(
        { error: 'Failed to save edits', details: error },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });

  } catch (error) {
    console.error('[API /vehicle-edits] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
}

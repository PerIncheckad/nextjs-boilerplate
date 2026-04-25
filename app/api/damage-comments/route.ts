import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

type CommentPayload = {
  damage_id: number;
  comment: string;
  created_by: string;
};

// =================================================================
// 3. API HANDLER
// =================================================================

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { damage_id, comment, created_by } = body as CommentPayload;

    // Validate damage_id
    if (typeof damage_id !== 'number' || !Number.isInteger(damage_id) || damage_id <= 0) {
      return NextResponse.json(
        { error: 'damage_id must be a positive integer' },
        { status: 400 }
      );
    }

    // Validate comment
    if (typeof comment !== 'string' || comment.trim().length === 0) {
      return NextResponse.json(
        { error: 'comment must be a non-empty string' },
        { status: 400 }
      );
    }

    // Validate created_by
    if (typeof created_by !== 'string' || created_by.trim().length === 0) {
      return NextResponse.json(
        { error: 'created_by must be a non-empty string' },
        { status: 400 }
      );
    }

    // Insert comment (created_at defaults to NOW() in DB, id is BIGSERIAL)
    const { data, error } = await supabaseAdmin
      .from('damage_comments')
      .insert({
        damage_id,
        comment: comment.trim(),
        created_by,
      })
      .select()
      .single();

    if (error) {
      console.error('[API /damage-comments] Insert error:', error);
      return NextResponse.json(
        { error: 'Failed to save comment', details: error },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });

  } catch (error) {
    console.error('[API /damage-comments] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
}

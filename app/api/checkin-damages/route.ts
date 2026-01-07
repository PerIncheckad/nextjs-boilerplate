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
// 2. API HANDLER
// =================================================================

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const regnr = searchParams.get('regnr');
  
  if (!regnr) {
    return NextResponse.json(
      { error: 'Missing regnr parameter' },
      { status: 400 }
    );
  }
  
  const cleanedRegnr = regnr.toUpperCase().trim().replace(/\s/g, '');
  
  // Debug logging for specific regnr
  const debugRegnrs = ['NGE97D', 'ZAG53Y', 'GEU29F'];
  const shouldDebug = debugRegnrs.includes(cleanedRegnr);
  
  try {
    // First, fetch checkins for this regnr to get checkin IDs
    const checkinsResponse = await supabaseAdmin
      .from('checkins')
      .select('id')
      .eq('regnr', cleanedRegnr)
      .order('created_at', { ascending: false });
    
    if (checkinsResponse.error) {
      console.error(`[API /checkin-damages] Error fetching checkins for ${cleanedRegnr}:`, checkinsResponse.error);
      return NextResponse.json(
        { error: 'Failed to fetch checkins', details: checkinsResponse.error },
        { status: 500 }
      );
    }
    
    const checkins = checkinsResponse.data || [];
    const checkinIds = checkins.map((c: any) => c.id).filter(Boolean);
    
    if (shouldDebug) {
      console.log(`[API /checkin-damages ${cleanedRegnr}] checkinIds:`, checkinIds);
    }
    
    // If no checkins, return empty array
    if (checkinIds.length === 0) {
      if (shouldDebug) {
        console.log(`[API /checkin-damages ${cleanedRegnr}] No checkins found`);
      }
      return NextResponse.json({ data: [], checkinIds: [] });
    }
    
    // Fetch checkin_damages using service role (bypasses RLS)
    const checkinDamagesResponse = await supabaseAdmin
      .from('checkin_damages')
      .select('*')
      .in('checkin_id', checkinIds)
      .order('created_at', { ascending: true });
    
    if (checkinDamagesResponse.error) {
      console.error(`[API /checkin-damages ${cleanedRegnr}] Error fetching checkin_damages:`, checkinDamagesResponse.error);
      return NextResponse.json(
        { error: 'Failed to fetch checkin_damages', details: checkinDamagesResponse.error },
        { status: 500 }
      );
    }
    
    const data = checkinDamagesResponse.data || [];
    
    if (shouldDebug) {
      console.log(`[API /checkin-damages ${cleanedRegnr}] Service role fetch:`, {
        checkinIds,
        dataLength: data.length,
        error: null,
      });
    }
    
    return NextResponse.json({
      data,
      checkinIds,
    });
    
  } catch (error) {
    console.error(`[API /checkin-damages] Unexpected error for ${cleanedRegnr}:`, error);
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
}

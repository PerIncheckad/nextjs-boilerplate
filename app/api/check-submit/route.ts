import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// =================================================================
// INITIALIZATION & CONFIGURATION
// =================================================================
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder';
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

// =================================================================
// HELPER FUNCTIONS
// =================================================================

// Helper to combine the raw text fields from a legacy damage object
function getLegacyDamageText(damageTypeRaw: string | null, noteCustomer: string | null, noteInternal: string | null): string {
    const parts = [
      damageTypeRaw,
      noteCustomer,
      noteInternal,
    ].filter(p => p && p.trim() !== '' && p.trim() !== '-');
    const uniqueParts = [...new Set(parts)];
    return uniqueParts.join(' - ');
}

// Check if a damage text matches the standardized app pattern
// Pattern: "Skadetyp - Placering - Position" (e.g., "Repa - Dörr - Höger fram")
function isStandardizedAppText(text: string): boolean {
    if (!text) return false;
    const pattern = /^[^-]+ - [^-]+ - [^-]+$/;
    return pattern.test(text.trim());
}

// =================================================================
// MAIN API FUNCTION
// =================================================================
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { regnr, dokumenterade_skador, nya_skador, dry_run } = body;

    if (!regnr) {
      return NextResponse.json({ error: 'Missing regnr' }, { status: 400 });
    }

    const cleanedRegnr = regnr.toUpperCase().trim();
    const results: any = {
      regnr: cleanedRegnr,
      dry_run: dry_run || false,
      dokumenterade_inserted: 0,
      nya_skador_inserted: 0,
      errors: [],
    };

    // NEW: Validation - Check for undokumenterade BUHS damages
    // Fetch all BUHS import rows for this regnr
    const { data: buhsRows, error: buhsError } = await supabaseAdmin
      .from('damages')
      .select('id, regnr, damage_type_raw, note_customer, note_internal, damage_date')
      .eq('regnr', cleanedRegnr)
      .not('damage_type_raw', 'is', null);

    if (buhsError) {
      console.error('Error fetching BUHS rows:', buhsError);
      return NextResponse.json({ error: 'Failed to validate BUHS damages' }, { status: 500 });
    }

    // Fetch all documented damages for this regnr
    const { data: documentedRows, error: docError } = await supabaseAdmin
      .from('damages')
      .select('legacy_damage_source_text, legacy_loose_key')
      .eq('regnr', cleanedRegnr)
      .or('legacy_damage_source_text.not.is.null,legacy_loose_key.not.is.null');

    if (docError) {
      console.error('Error fetching documented rows:', docError);
      return NextResponse.json({ error: 'Failed to validate documented damages' }, { status: 500 });
    }

    // Build lookup sets for documented damages
    const documentedTextSet = new Set<string>();
    const documentedLooseKeySet = new Set<string>();
    
    if (documentedRows) {
      for (const row of documentedRows) {
        if (row.legacy_damage_source_text) {
          documentedTextSet.add(row.legacy_damage_source_text);
        }
        if (row.legacy_loose_key) {
          documentedLooseKeySet.add(row.legacy_loose_key);
        }
      }
    }

    // Check for undokumenterade BUHS damages
    const undokumenteradeRows: any[] = [];
    
    if (buhsRows) {
      for (const row of buhsRows) {
        // Skip if standardized app pattern
        const combinedText = getLegacyDamageText(row.damage_type_raw, row.note_customer, row.note_internal);
        if (isStandardizedAppText(combinedText) || 
            isStandardizedAppText(row.note_customer || '') ||
            isStandardizedAppText(row.note_internal || '')) {
          continue;
        }

        // Check if documented by text or loose key
        const looseKey = row.damage_date ? `${cleanedRegnr}|${row.damage_date}` : null;
        const isDocumented = documentedTextSet.has(combinedText) || 
                            (looseKey && documentedLooseKeySet.has(looseKey));

        if (!isDocumented) {
          undokumenteradeRows.push(row);
        }
      }
    }

    // NEW: Enforce documentation - reject if there are undokumenterade damages
    // that are not being documented in this submission
    if (undokumenteradeRows.length > 0) {
      const dokumenteradeInSubmission = new Set<string>();
      
      if (dokumenterade_skador && Array.isArray(dokumenterade_skador)) {
        for (const damage of dokumenterade_skador) {
          if (damage.originalDamageDate) {
            const looseKey = `${cleanedRegnr}|${damage.originalDamageDate}`;
            dokumenteradeInSubmission.add(looseKey);
          }
        }
      }

      // Check if all undokumenterade are being documented now
      const stillUndokumenterade = undokumenteradeRows.filter(row => {
        const looseKey = row.damage_date ? `${cleanedRegnr}|${row.damage_date}` : null;
        return looseKey && !dokumenteradeInSubmission.has(looseKey);
      });

      if (stillUndokumenterade.length > 0) {
        return NextResponse.json({
          error: 'All BUHS damages must be documented before submission',
          undokumenterade_count: stillUndokumenterade.length,
          undokumenterade: stillUndokumenterade.map(r => ({
            damage_date: r.damage_date,
            text: getLegacyDamageText(r.damage_type_raw, r.note_customer, r.note_internal)
          }))
        }, { status: 400 });
      }
    }

    // If dry_run mode, skip DB writes
    if (dry_run) {
      console.log('[DRY RUN] Would insert documented damages:', dokumenterade_skador?.length || 0);
      console.log('[DRY RUN] Would insert new damages:', nya_skador?.length || 0);
      results.message = 'Dry run mode - no DB writes performed';
      return NextResponse.json(results);
    }

    // NEW: Idempotent documentation - Insert documented BUHS damages
    if (dokumenterade_skador && Array.isArray(dokumenterade_skador)) {
      for (const damage of dokumenterade_skador) {
        try {
          // Build legacy_damage_source_text from original BUHS text
          const legacySourceText = damage.fullText || '';
          const originalDamageDate = damage.originalDamageDate || null;
          const legacyLooseKey = originalDamageDate ? `${cleanedRegnr}|${originalDamageDate}` : null;

          const insertData: any = {
            regnr: cleanedRegnr,
            legacy_damage_source_text: legacySourceText,
            original_damage_date: originalDamageDate,
            legacy_loose_key: legacyLooseKey,
            user_type: damage.userType,
            user_positions: damage.userPositions || [],
            description: damage.userDescription || null,
            damage_date: new Date().toISOString().split('T')[0], // Current date in YYYY-MM-DD
            photo_urls: damage.uploads?.photo_urls || [],
            video_urls: damage.uploads?.video_urls || [],
            folder_path: damage.uploads?.folder || '',
            created_at: new Date().toISOString(),
          };

          // Idempotent insert using ON CONFLICT with legacy_loose_key
          const { error: insertError } = await supabaseAdmin
            .from('damages')
            .upsert(insertData, {
              onConflict: 'legacy_loose_key',
              ignoreDuplicates: true, // Skip if already exists
            });

          if (insertError) {
            console.error('Error inserting documented damage:', insertError);
            results.errors.push({
              type: 'dokumenterad',
              damage_date: originalDamageDate,
              error: insertError.message
            });
          } else {
            results.dokumenterade_inserted++;
          }
        } catch (e) {
          console.error('Exception inserting documented damage:', e);
          results.errors.push({
            type: 'dokumenterad',
            error: e instanceof Error ? e.message : 'Unknown error'
          });
        }
      }
    }

    // NEW: Insert new damages (not BUHS, created by user)
    if (nya_skador && Array.isArray(nya_skador)) {
      for (const damage of nya_skador) {
        try {
          const insertData: any = {
            regnr: cleanedRegnr,
            user_type: damage.type,
            user_positions: damage.positions || [],
            description: damage.text || null,
            damage_date: new Date().toISOString().split('T')[0], // Current date
            photo_urls: damage.uploads?.photo_urls || [],
            video_urls: damage.uploads?.video_urls || [],
            folder_path: damage.uploads?.folder || '',
            created_at: new Date().toISOString(),
          };

          const { error: insertError } = await supabaseAdmin
            .from('damages')
            .insert(insertData);

          if (insertError) {
            console.error('Error inserting new damage:', insertError);
            results.errors.push({
              type: 'new_damage',
              damage_type: damage.type,
              error: insertError.message
            });
          } else {
            results.nya_skador_inserted++;
          }
        } catch (e) {
          console.error('Exception inserting new damage:', e);
          results.errors.push({
            type: 'new_damage',
            error: e instanceof Error ? e.message : 'Unknown error'
          });
        }
      }
    }

    console.log('Check submission results:', results);
    return NextResponse.json(results);

  } catch (error) {
    console.error('FATAL: Uncaught error in check-submit API:', error);
    if (error instanceof Error) {
      console.error(error.message);
    }
    return NextResponse.json({ error: 'Failed to process submission' }, { status: 500 });
  }
}

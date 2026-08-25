import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyApiUser } from '@/lib/server-auth';

const ALLOWED_WINDOWS = new Set([24, 72, 168]);

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Missing Supabase server configuration');
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function GET(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) {
    return NextResponse.json({ error: verification.error }, { status: verification.status });
  }

  const requestedWindow = Number(new URL(request.url).searchParams.get('hours') ?? '168');
  const hours = ALLOWED_WINDOWS.has(requestedWindow) ? requestedWindow : 168;
  const now = new Date();
  const since = new Date(now.getTime() - hours * 3_600_000).toISOString();

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (error) {
    console.error('[operator-fuel-evidence] Missing server configuration:', error);
    return NextResponse.json({ error: 'Fuel evidence unavailable' }, { status: 503 });
  }

  try {
    const [checkinsRes, receiptsRes] = await Promise.all([
      admin.from('checkins')
        .select('id,regnr,completed_at,current_station,station,fuel_level,fuel_liters,fuel_price_per_liter,fuel_currency,fuel_receipt_status,fuel_receipt_missing_reason')
        .eq('status', 'COMPLETED')
        .eq('fuel_level', 'tankad_nu')
        .gte('completed_at', since)
        .order('completed_at', { ascending: false })
        .limit(5000),
      admin.from('vehicle_receipts')
        .select('checkin_id,regnr,file_url,uploaded_at')
        .eq('receipt_type', 'tankning')
        .gte('uploaded_at', since)
        .order('uploaded_at', { ascending: false })
        .limit(5000),
    ]);

    if (checkinsRes.error) throw checkinsRes.error;
    if (receiptsRes.error) throw receiptsRes.error;

    const receiptsByCheckin = new Map<string, { url: string; uploadedAt: string | null }>();
    for (const receipt of receiptsRes.data ?? []) {
      if (!receipt.checkin_id || !receipt.file_url || receiptsByCheckin.has(receipt.checkin_id)) continue;
      receiptsByCheckin.set(receipt.checkin_id, {
        url: receipt.file_url,
        uploadedAt: receipt.uploaded_at ?? null,
      });
    }

    const rows = (checkinsRes.data ?? []).map((checkin) => {
      const receipt = receiptsByCheckin.get(checkin.id) ?? null;
      const liters = typeof checkin.fuel_liters === 'number' ? checkin.fuel_liters : Number(checkin.fuel_liters);
      const pricePerLiter = typeof checkin.fuel_price_per_liter === 'number'
        ? checkin.fuel_price_per_liter
        : Number(checkin.fuel_price_per_liter);
      const total = Number.isFinite(liters) && Number.isFinite(pricePerLiter)
        ? Math.round(liters * pricePerLiter * 100) / 100
        : null;
      const receiptStatus = checkin.fuel_receipt_status === 'DOCUMENTED' || checkin.fuel_receipt_status === 'MISSING_WITH_REASON'
        ? checkin.fuel_receipt_status
        : null;
      return {
        checkinId: checkin.id,
        regnr: checkin.regnr,
        completedAt: checkin.completed_at,
        station: checkin.current_station ?? checkin.station ?? null,
        liters: Number.isFinite(liters) ? liters : null,
        pricePerLiter: Number.isFinite(pricePerLiter) ? pricePerLiter : null,
        currency: checkin.fuel_currency ?? 'SEK',
        calculatedTotal: total,
        hasReceipt: Boolean(receipt),
        receipt,
        receiptStatus,
        receiptMissingReason: receiptStatus === 'MISSING_WITH_REASON' ? checkin.fuel_receipt_missing_reason ?? null : null,
        classification: receiptStatus === 'DOCUMENTED'
          ? 'VERIFIED_EVIDENCE'
          : receiptStatus === 'MISSING_WITH_REASON'
            ? 'VERIFIED_DEVIATION'
            : 'LEGACY_UNCLASSIFIED',
        vagnkort: `/vagnkort?reg=${encodeURIComponent(checkin.regnr)}`,
      };
    });

    const withReceipt = rows.filter((row) => row.hasReceipt).length;
    const withoutReceipt = rows.length - withReceipt;
    const documentedEvidence = rows.filter((row) => row.classification === 'VERIFIED_EVIDENCE').length;
    const verifiedDeviations = rows.filter((row) => row.classification === 'VERIFIED_DEVIATION').length;
    const legacyUnclassified = rows.filter((row) => row.classification === 'LEGACY_UNCLASSIFIED').length;
    const coveragePercent = rows.length ? Math.round((withReceipt / rows.length) * 1000) / 10 : null;

    return NextResponse.json({
      data: {
        generatedAt: now.toISOString(),
        hours,
        since,
        summary: {
          tankedCheckins: rows.length,
          withReceipt,
          withoutReceipt,
          documentedEvidence,
          verifiedDeviations,
          legacyUnclassified,
          coveragePercent,
        },
        interpretation: {
          receiptRequiredForNewTankings: true,
          missingReceiptRequiresReason: true,
          monetaryInterpretation: false,
          message: 'Ny tankning klassas som verifierad evidens när kvittobild finns, eller verifierad avvikelse när kvitto saknas och obligatorisk orsak har registrerats. Äldre rader utan den nya klassificeringen lämnas historiskt oklassificerade.',
        },
        rows,
      },
    });
  } catch (error) {
    console.error('[operator-fuel-evidence] Read failed:', error);
    return NextResponse.json({ error: 'Could not load fuel evidence' }, { status: 500 });
  }
}

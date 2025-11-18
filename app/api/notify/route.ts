import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';
import { normalizeDamageType } from './normalizeDamageType';
import { buildHuvudstationEmail, buildBilkontrollEmail } from './emailBuilders';

// =================================================================
// 1. INITIALIZATION & CONFIGURATION
// =================================================================
const resend = new Resend(process.env.RESEND_API_KEY || 'placeholder');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder';
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

// --- E-postmottagare ---
const bilkontrollAddress = ['per@incheckad.se', 'latif@incheckad.se'];
const defaultHuvudstationAddress = 'per@incheckad.se';

const stationEmailMapping: { [ort: string]: string } = {
  Helsingborg: 'helsingborg@incheckad.se',
  Ängelholm: 'helsingborg@incheckad.se',
};

const getSiteUrl = (request: Request): string => {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  const host = request.headers.get('host');
  const protocol = request.headers.get('x-forwarded-proto') || 'https';
  return host ? `${protocol}://${host}` : 'https://nextjs-boilerplate-eight-zeta-15.vercel.app';
};

// Helper functions have been moved to emailHelpers.ts
// Email builders have been moved to emailBuilders.ts

// =================================================================
// 2. MAIN API FUNCTION
// =================================================================
export async function POST(request: Request) {
  try {
    const fullRequestPayload = await request.json();
    const { meta: payload } = fullRequestPayload;
    const region = payload.region || null;

    // dryRun (skippa endast DB-skrivningar, skicka fortfarande mejl)
    const url = new URL(request.url);
    const dryRunParam = url.searchParams.get('dryRun');
    const isDryRun = dryRunParam === '1' || dryRunParam === 'true' || payload.dryRun === true;

    const siteUrl = getSiteUrl(request);

    // Media counts (logg)
    const countMedia = (damages: any[] = []) => {
      let photos = 0;
      let videos = 0;
      damages.forEach(d => {
        if (d.uploads?.photo_urls) photos += d.uploads.photo_urls.length;
        if (d.uploads?.video_urls) videos += d.uploads.video_urls.length;
      });
      return { photos, videos };
    };

    console.log('Media counts received:', {
      nya_skador: countMedia(payload.nya_skador || []),
      dokumenterade_skador: countMedia(payload.dokumenterade_skador || []),
      rekond: payload.rekond?.hasMedia ? 'yes' : 'no',
      husdjur: payload.husdjur?.hasMedia ? 'yes' : 'no',
      rokning: payload.rokning?.hasMedia ? 'yes' : 'no',
    });

    // Datum/tid (SE)
    const now = new Date();
    const stockholmDate = now
      .toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' })
      .replace(/(\d{4})-(\d{2})-(\d{2})/, '$1-$2-$3');

    const stockholmTime = now.toLocaleTimeString('sv-SE', {
      timeZone: 'Europe/Stockholm',
      hour: '2-digit',
      minute: '2-digit',
    });

    const date = stockholmDate;
    const time = stockholmTime;

    const regNr = payload.regnr || '';

    // Mottagare/ämnen
    const finalOrt = payload.bilen_star_nu?.ort || payload.ort;
    const huvudstationTo = [defaultHuvudstationAddress];
    const stationSpecificEmail = stationEmailMapping[finalOrt];
    if (stationSpecificEmail && !huvudstationTo.includes(stationSpecificEmail)) {
      huvudstationTo.push(stationSpecificEmail);
    }

    const stationForSubject = payload.bilen_star_nu?.station || payload.station;
    const cleanStation = stationForSubject?.includes(' / ')
      ? stationForSubject.split(' / ').pop()?.trim()
      : stationForSubject;

    const showChargeWarning = payload.drivmedel === 'elbil' && parseInt(payload.laddning?.laddniva, 10) < 95;
    const notRefueled = payload.drivmedel === 'bensin_diesel' && payload.tankning?.tankniva === 'ej_upptankad';
    const hasFarligaConditions =
      payload.rental?.unavailable ||
      payload.varningslampa?.lyser ||
      payload.rekond?.behoverRekond ||
      notRefueled ||
      showChargeWarning ||
      payload.status?.insynsskyddSaknas ||
      (payload.nya_skador && payload.nya_skador.length > 0) ||
      payload.husdjur?.sanerad ||
      payload.rokning?.sanerad;

    const testMarker = hasFarligaConditions ? ' - !!! - ' : ' - ';
    const huvudstationSubject = `INCHECKAD: ${regNr} - ${cleanStation}${testMarker}HUVUDSTATION`;
    const bilkontrollSubject = `INCHECKAD: ${regNr} - ${cleanStation}${testMarker}BILKONTROLL`;

    // =================================================================
    // DATABASE PERSISTENCE (normaliserad damage_type)
    // =================================================================
    if (!isDryRun) {
      try {
        // Checkin
        const checkinData = {
          regnr: regNr,
          region: region || payload.region || null,
          city: payload.ort || null,
          station: payload.station || null,
          current_city: payload.bilen_star_nu?.ort || payload.ort || null,
          current_station: payload.bilen_star_nu?.station || payload.station || null,
          current_location_note: payload.bilen_star_nu?.kommentar || null,
          checker_name: payload.fullName || payload.full_name || payload.incheckare || null,
          checker_email: payload.email || null,
          completed_at: now.toISOString(),
          status: 'complete',
          user_type: payload.user_type || null,
          // has_new_damages: Array.isArray(payload.nya_skador) && payload.nya_skador.length > 0, // (valfritt)
        };

        const { data: checkinRecord, error: checkinError } = await supabaseAdmin
          .from('checkins')
          .insert([checkinData])
          .select()
          .single();

        if (checkinError) {
          console.error('Error inserting checkin record:', checkinError);
          throw checkinError;
        }

        const checkinId = checkinRecord.id;

        // damages + checkin_damages
        const damageInserts: any[] = [];
        const checkinDamageInserts: any[] = [];

        // Nya skador
        (payload.nya_skador || []).forEach((skada: any) => {
          const rawType = skada.type || skada.userType || null;
          const normalized = normalizeDamageType(rawType);

          damageInserts.push({
            regnr: regNr,
            damage_date: now.toISOString().split('T')[0], // YYYY-MM-DD (behåll enligt #120)
            region: region || payload.region || null,
            ort: payload.ort || null,
            station_namn: payload.station || null,
            damage_type: normalized.typeCode,
            damage_type_raw: rawType,
            user_type: rawType,
            description: skada.text || skada.userDescription || null,
            inchecker_name: checkinData.checker_name,
            inchecker_email: checkinData.checker_email,
            status: 'complete',
            uploads: skada.uploads || null,
            created_at: now.toISOString(),
          });

          const positions = skada.positions || skada.userPositions || [];
          if (positions.length > 0) {
            positions.forEach((pos: any) => {
              checkinDamageInserts.push({
                checkin_id: checkinId,
                type: 'new',
                damage_type: normalized.typeCode,
                car_part: pos.carPart || null,
                position: pos.position || null,
                description: skada.text || skada.userDescription || null,
                photo_urls: skada.uploads?.photo_urls || [],
                video_urls: skada.uploads?.video_urls || [],
                positions: [pos],
                created_at: now.toISOString(),
              });
            });
          } else {
            checkinDamageInserts.push({
              checkin_id: checkinId,
              type: 'new',
              damage_type: normalized.typeCode,
              car_part: null,
              position: null,
              description: skada.text || skada.userDescription || null,
              photo_urls: skada.uploads?.photo_urls || [],
              video_urls: skada.uploads?.video_urls || [],
              positions: [],
              created_at: now.toISOString(),
            });
          }
        });

        // Dokumenterade BUHS
        (payload.dokumenterade_skador || []).forEach((skada: any) => {
          const rawType = skada.userType || skada.type || null;
          const normalized = normalizeDamageType(rawType);

          damageInserts.push({
            regnr: regNr,
            damage_date: now.toISOString().split('T')[0],
            region: region || payload.region || null,
            ort: payload.ort || null,
            station_namn: payload.station || null,
            damage_type: normalized.typeCode,
            damage_type_raw: rawType,
            user_type: rawType,
            description: skada.userDescription || skada.text || null,
            inchecker_name: checkinData.checker_name,
            inchecker_email: checkinData.checker_email,
            status: 'complete',
            uploads: skada.uploads || null,
            legacy_damage_source_text: skada.fullText || null,
            // original_damage_date: skada.damage_date || null,                // (valfritt för idempotens)
            // legacy_loose_key: skada.damage_date ? `${regNr}|${skada.damage_date}` : null, // (valfritt)
            created_at: now.toISOString(),
          });

          const positions = skada.userPositions || skada.positions || [];
          if (positions.length > 0) {
            positions.forEach((pos: any) => {
              checkinDamageInserts.push({
                checkin_id: checkinId,
                type: 'documented',
                damage_type: normalized.typeCode,
                car_part: pos.carPart || null,
                position: pos.position || null,
                description: skada.userDescription || skada.text || null,
                photo_urls: skada.uploads?.photo_urls || [],
                video_urls: skada.uploads?.video_urls || [],
                positions: [pos],
                created_at: now.toISOString(),
              });
            });
          } else {
            checkinDamageInserts.push({
              checkin_id: checkinId,
              type: 'documented',
              damage_type: normalized.typeCode,
              car_part: null,
              position: null,
              description: skada.userDescription || skada.text || null,
              photo_urls: skada.uploads?.photo_urls || [],
              video_urls: skada.uploads?.video_urls || [],
              positions: [],
              created_at: now.toISOString(),
            });
          }
        });

        console.debug(`Inserting ${damageInserts.length} damage records and ${checkinDamageInserts.length} checkin_damage records`);

        if (damageInserts.length > 0) {
          const { error: damagesError } = await supabaseAdmin.from('damages').insert(damageInserts);
          if (damagesError) {
            console.error('Error inserting damages:', damagesError);
            throw damagesError;
          }
        }

        if (checkinDamageInserts.length > 0) {
          const { error: checkinDamagesError } = await supabaseAdmin.from('checkin_damages').insert(checkinDamageInserts);
          if (checkinDamagesError) {
            console.error('Error inserting checkin_damages:', checkinDamagesError);
            throw checkinDamagesError;
          }
        }

        console.debug('Database persistence completed successfully');
      } catch (dbError) {
        console.error('Database persistence failed:', dbError);
        // Fortsätt med mejl även om DB-skrivning faller
      }
    } else {
      console.log('DryRun mode: Skipping database persistence');
    }

    // =================================================================
    // E-posthantering
    // =================================================================
    const emailPromises: Promise<any>[] = [];

    const huvudstationHtml = buildHuvudstationEmail(payload, date, time, siteUrl);
    emailPromises.push(
      resend.emails.send({
        from: 'incheckning@incheckad.se',
        to: huvudstationTo,
        subject: huvudstationSubject,
        html: huvudstationHtml,
      })
    );

    const bilkontrollHtml = buildBilkontrollEmail(payload, date, time, siteUrl);
    emailPromises.push(
      resend.emails.send({
        from: 'incheckning@incheckad.se',
        to: bilkontrollAddress,
        subject: bilkontrollSubject,
        html: bilkontrollHtml,
      })
    );

    await Promise.all(emailPromises);

    return NextResponse.json({ message: 'Notifications processed successfully.' });
  } catch (error) {
    console.error('FATAL: Uncaught error in API route:', error);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}
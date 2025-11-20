// =================================================================
// EMAIL BUILDERS
// =================================================================
import {
  formatCheckerName,
  createAlertBanner,
  createAdminBanner,
  formatDamagesToHtml,
  formatTankning,
  buildBilagorSection,
  createBaseLayout,
} from './emailHelpers';

/**
 * Builds the email HTML for Huvudstation recipients
 * This email contains detailed information about the vehicle check-in
 */
export function buildHuvudstationEmail(payload: any, date: string, time: string, siteUrl: string): string {
  const regnr = payload.regnr || '---';
  const checkerName = formatCheckerName(payload);
  
  // Calculate conditions for banners
  const showChargeWarning = payload.drivmedel === 'elbil' && parseInt(payload.laddning?.laddniva, 10) < 95;
  const notRefueled = payload.drivmedel === 'bensin_diesel' && payload.tankning?.tankniva === 'ej_upptankad';
  const nyaSkadorCount = Array.isArray(payload.nya_skador) ? payload.nya_skador.length : 0;

  // Build banner sections
  const banners = [
    createAdminBanner(
      payload.vehicleStatus === 'UNKNOWN',
      'Reg.nr saknas i registret'
    ),
    createAlertBanner(
      payload.rental?.unavailable,
      'Går inte att hyra ut',
      payload.rental?.comment || ''
    ),
    createAlertBanner(
      payload.varningslampa?.lyser,
      'Varningslampa lyser',
      payload.varningslampa?.beskrivning || ''
    ),
    createAlertBanner(
      payload.rekond?.behoverRekond,
      'Behöver rekond',
      `${payload.rekond?.utvandig ? 'Utvändig' : ''}${payload.rekond?.utvandig && payload.rekond?.invandig ? ' & ' : ''}${payload.rekond?.invandig ? 'Invändig' : ''}${payload.rekond?.text ? ': ' + payload.rekond?.text : ''}`,
      payload.rekond?.folder,
      siteUrl
    ),
    createAlertBanner(
      notRefueled,
      'Ej upptankad',
      payload.tankning?.tankniva === 'ej_upptankad' ? 'Bilen lämnades inte fulltankad' : ''
    ),
    createAlertBanner(
      showChargeWarning,
      'Laddningsnivå under 95%',
      `Laddniva: ${payload.laddning?.laddniva || '---'}%`
    ),
    createAlertBanner(
      payload.status?.insynsskyddSaknas,
      'Insynsskydd saknas'
    ),
    createAlertBanner(
      nyaSkadorCount > 0,
      'Nya skador dokumenterade',
      undefined,
      undefined,
      undefined,
      nyaSkadorCount
    ),
    createAlertBanner(
      payload.husdjur?.sanerad,
      'Husdjur sanerad',
      payload.husdjur?.text || '',
      payload.husdjur?.folder,
      siteUrl
    ),
    createAlertBanner(
      payload.rokning?.sanerad,
      'Rökning sanerad',
      payload.rokning?.text || '',
      payload.rokning?.folder,
      siteUrl
    ),
  ].join('');

  // Build main content sections
  const basicInfo = `
    <tr><td style="padding-bottom:20px;">
      <h1 style="font-size:24px;font-weight:700;margin:0 0 20px;">Incheckning ${regnr}</h1>
      <div style="background:#f9fafb;padding:15px;border-radius:6px;font-size:14px;">
        <p style="margin:5px 0;"><strong>Datum:</strong> ${date}</p>
        <p style="margin:5px 0;"><strong>Tid:</strong> ${time}</p>
        <p style="margin:5px 0;"><strong>Incheckad av:</strong> ${checkerName}</p>
        <p style="margin:5px 0;"><strong>Bilmodell:</strong> ${payload.carModel || '---'}</p>
      </div>
    </td></tr>
  `;

  // Location info
  const locationInfo = `
    <tr><td style="padding:10px 0;">
      <h2 style="font-size:16px;font-weight:600;margin-bottom:10px;">Plats</h2>
      <p style="margin:5px 0;font-size:14px;"><strong>Ort:</strong> ${payload.ort || '---'}</p>
      <p style="margin:5px 0;font-size:14px;"><strong>Station:</strong> ${payload.station || '---'}</p>
      ${
        payload.bilen_star_nu?.ort || payload.bilen_star_nu?.station
          ? `<p style="margin:5px 0;font-size:14px;"><strong>Bilen står nu:</strong> ${payload.bilen_star_nu?.ort || '---'} / ${payload.bilen_star_nu?.station || '---'}</p>`
          : ''
      }
      ${
        payload.bilen_star_nu?.kommentar
          ? `<p style="margin:5px 0;font-size:14px;"><strong>Kommentar:</strong> ${payload.bilen_star_nu?.kommentar}</p>`
          : ''
      }
    </td></tr>
  `;

  // Vehicle details
  const vehicleDetails = `
    <tr><td style="padding:10px 0;border-top:1px solid #e5e7eb;">
      <h2 style="font-size:16px;font-weight:600;margin-bottom:10px;">Fordonsdetaljer</h2>
      <p style="margin:5px 0;font-size:14px;"><strong>Mätarställning:</strong> ${payload.matarstallning || '---'} km</p>
      <p style="margin:5px 0;font-size:14px;"><strong>Hjultyp:</strong> ${payload.hjultyp || '---'}</p>
      <p style="margin:5px 0;font-size:14px;"><strong>Drivmedel:</strong> ${payload.drivmedel || '---'}</p>
      ${
        payload.drivmedel === 'bensin_diesel'
          ? `<p style="margin:5px 0;font-size:14px;"><strong>Tankning:</strong> ${formatTankning(payload.tankning)}</p>`
          : ''
      }
      ${
        payload.drivmedel === 'elbil'
          ? `<p style="margin:5px 0;font-size:14px;"><strong>Laddningsnivå:</strong> ${payload.laddning?.laddniva || '---'}%</p>
             <p style="margin:5px 0;font-size:14px;"><strong>Antal laddkablar:</strong> ${payload.laddning?.antal_laddkablar || '---'}</p>`
          : ''
      }
      <p style="margin:5px 0;font-size:14px;"><strong>Tvättad:</strong> ${payload.washed ? 'Ja' : 'Nej'}</p>
    </td></tr>
  `;

  // Damages section
  const nyaSkadorHtml = formatDamagesToHtml(payload.nya_skador || [], 'Nya skador', siteUrl);
  const dokumenteradeSkadorHtml = formatDamagesToHtml(
    payload.dokumenterade_skador || [],
    'Dokumenterade skador (BUHS)',
    siteUrl,
    'Inga tidigare kända skador'
  );
  const atgardadeSkadorHtml = formatDamagesToHtml(
    payload.åtgärdade_skador || [],
    'Åtgärdade skador',
    siteUrl
  );

  const damagesSection = `
    <tr><td style="padding:10px 0;border-top:1px solid #e5e7eb;">
      ${nyaSkadorHtml}
      ${dokumenteradeSkadorHtml}
      ${atgardadeSkadorHtml}
    </td></tr>
  `;

  // Attachments
  const bilagorHtml = buildBilagorSection(
    payload.rekond || {},
    payload.husdjur || {},
    payload.rokning || {},
    siteUrl
  );

  const attachmentsSection = bilagorHtml
    ? `<tr><td style="padding:10px 0;border-top:1px solid #e5e7eb;">${bilagorHtml}</td></tr>`
    : '';

  // Notes
  const notesSection = payload.notering
    ? `<tr><td style="padding:10px 0;border-top:1px solid #e5e7eb;">
        <h2 style="font-size:16px;font-weight:600;margin-bottom:10px;">Noteringar</h2>
        <p style="margin:0;font-size:14px;">${payload.notering}</p>
      </td></tr>`
    : '';

  // Combine all sections
  const content = banners + basicInfo + locationInfo + vehicleDetails + damagesSection + attachmentsSection + notesSection;

  return createBaseLayout(regnr, content);
}

/**
 * Builds the email HTML for Bilkontroll recipients
 * This email focuses on vehicle condition and damages for control purposes
 */
export function buildBilkontrollEmail(payload: any, date: string, time: string, siteUrl: string): string {
  const regnr = payload.regnr || '---';
  const checkerName = formatCheckerName(payload);
  
  // Calculate conditions for banners
  const showChargeWarning = payload.drivmedel === 'elbil' && parseInt(payload.laddning?.laddniva, 10) < 95;
  const notRefueled = payload.drivmedel === 'bensin_diesel' && payload.tankning?.tankniva === 'ej_upptankad';
  const nyaSkadorCount = Array.isArray(payload.nya_skador) ? payload.nya_skador.length : 0;

  // Build banner sections (more focused on operational issues)
  const banners = [
    createAdminBanner(
      payload.vehicleStatus === 'UNKNOWN',
      'Reg.nr saknas i registret'
    ),
    createAlertBanner(
      payload.rental?.unavailable,
      'Går inte att hyra ut',
      payload.rental?.comment || ''
    ),
    createAlertBanner(
      payload.varningslampa?.lyser,
      'Varningslampa lyser',
      payload.varningslampa?.beskrivning || ''
    ),
    createAlertBanner(
      payload.rekond?.behoverRekond,
      'Behöver rekond',
      `${payload.rekond?.utvandig ? 'Utvändig' : ''}${payload.rekond?.utvandig && payload.rekond?.invandig ? ' & ' : ''}${payload.rekond?.invandig ? 'Invändig' : ''}${payload.rekond?.text ? ': ' + payload.rekond?.text : ''}`,
      payload.rekond?.folder,
      siteUrl
    ),
    createAlertBanner(
      notRefueled,
      'Ej upptankad',
      payload.tankning?.tankniva === 'ej_upptankad' ? 'Bilen lämnades inte fulltankad' : ''
    ),
    createAlertBanner(
      showChargeWarning,
      'Laddningsnivå under 95%',
      `Laddniva: ${payload.laddning?.laddniva || '---'}%`
    ),
    createAlertBanner(
      nyaSkadorCount > 0,
      'Nya skador dokumenterade',
      undefined,
      undefined,
      undefined,
      nyaSkadorCount
    ),
  ].join('');

  // Build main content sections
  const basicInfo = `
    <tr><td style="padding-bottom:20px;">
      <h1 style="font-size:24px;font-weight:700;margin:0 0 20px;">Bilkontroll ${regnr}</h1>
      <div style="background:#f9fafb;padding:15px;border-radius:6px;font-size:14px;">
        <p style="margin:5px 0;"><strong>Datum:</strong> ${date}</p>
        <p style="margin:5px 0;"><strong>Tid:</strong> ${time}</p>
        <p style="margin:5px 0;"><strong>Incheckad av:</strong> ${checkerName}</p>
        <p style="margin:5px 0;"><strong>Bilmodell:</strong> ${payload.carModel || '---'}</p>
        <p style="margin:5px 0;"><strong>Station:</strong> ${payload.station || '---'}</p>
      </div>
    </td></tr>
  `;

  // Vehicle condition
  const conditionInfo = `
    <tr><td style="padding:10px 0;border-top:1px solid #e5e7eb;">
      <h2 style="font-size:16px;font-weight:600;margin-bottom:10px;">Fordonstillstånd</h2>
      <p style="margin:5px 0;font-size:14px;"><strong>Mätarställning:</strong> ${payload.matarstallning || '---'} km</p>
      <p style="margin:5px 0;font-size:14px;"><strong>Tvättad:</strong> ${payload.washed ? 'Ja' : 'Nej'}</p>
      ${
        payload.status?.insynsskyddSaknas
          ? `<p style="margin:5px 0;font-size:14px;color:#b91c1c;"><strong>⚠️ Insynsskydd saknas</strong></p>`
          : ''
      }
      ${
        payload.drivmedel === 'bensin_diesel'
          ? `<p style="margin:5px 0;font-size:14px;"><strong>Tankning:</strong> ${formatTankning(payload.tankning)}</p>`
          : ''
      }
      ${
        payload.drivmedel === 'elbil'
          ? `<p style="margin:5px 0;font-size:14px;"><strong>Laddningsnivå:</strong> ${payload.laddning?.laddniva || '---'}%</p>`
          : ''
      }
    </td></tr>
  `;

  // Damages section (more detailed for control)
  const nyaSkadorHtml = formatDamagesToHtml(payload.nya_skador || [], 'Nya skador', siteUrl);
  const dokumenteradeSkadorHtml = formatDamagesToHtml(
    payload.dokumenterade_skador || [],
    'Dokumenterade skador (BUHS)',
    siteUrl
  );
  const atgardadeSkadorHtml = formatDamagesToHtml(
    payload.åtgärdade_skador || [],
    'Åtgärdade skador',
    siteUrl
  );

  const damagesSection = `
    <tr><td style="padding:10px 0;border-top:1px solid #e5e7eb;">
      ${nyaSkadorHtml || '<p style="font-size:14px;color:#059669;">Inga nya skador rapporterade</p>'}
      ${dokumenteradeSkadorHtml}
      ${atgardadeSkadorHtml}
    </td></tr>
  `;

  // Checklist status
  const checklistSection = `
    <tr><td style="padding:10px 0;border-top:1px solid #e5e7eb;">
      <h2 style="font-size:16px;font-weight:600;margin-bottom:10px;">Checklista</h2>
      <p style="margin:5px 0;font-size:14px;"><strong>Övriga checkpunkter OK:</strong> ${payload.otherChecklistItemsOK ? 'Ja' : 'Nej'}</p>
    </td></tr>
  `;

  // Combine all sections
  const content = banners + basicInfo + conditionInfo + damagesSection + checklistSection;

  return createBaseLayout(regnr, content);
}

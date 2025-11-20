import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';
import { normalizeDamageType } from './normalizeDamageType';
// =================================================================
// 1. INITIALIZATION & CONFIGURATION
// =================================================================
const resend = new Resend(process.env.RESEND_API_KEY || 'placeholder');
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseServiceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder';
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);
// --- E-postmottagare ---
const defaultBilkontrollAddress = 'per@incheckad.se';
const latifBilkontrollAddress = 'latif@incheckad.se';
const defaultHuvudstationAddress = 'per@incheckad.se';
const stationEmailMapping: { [ort: string]: string } = {
  Helsingborg: 'helsingborg@mabi.se',
  Ängelholm: 'helsingborg@mabi.se',
};
const getSiteUrl = (request: Request): string => {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  const host = request.headers.get('host');
  const protocol = request.headers.get('x-forwarded-proto') || 'https';
  return host
    ? `${protocol}://${host}`
    : 'https://nextjs-boilerplate-eight-zeta-15.vercel.app';
};
const LOGO_URL =
  'https://ufioaijcmaujlvmveyra.supabase.co/storage/v1/object/public/MABI%20Syd%20logga/MABI%20Syd%20logga%202.png';
// =================================================================
// 2. HELPERS
// =================================================================
const formatCheckerName = (payload: any): string => {
  if (payload.fullName) return payload.fullName;
  if (payload.full_name) return payload.full_name;
  const firstName =
    payload.firstName || payload.first_name || payload.incheckare;
  const lastName = payload.lastName || payload.last_name;
  if (firstName && lastName) return `${firstName} ${lastName}`;
  return firstName || payload.incheckare || '---';
};
const createStorageLink = (
  folderPath: string | undefined,
  siteUrl: string,
): string | null => {
  if (!folderPath) return null;
  return `${siteUrl}/public-media/${folderPath}`;
};
const hasAnyFiles = (damage: any): boolean => {
  const uploads = damage?.uploads;
  if (!uploads) return false;
  const hasPhotos =
    Array.isArray(uploads.photo_urls) && uploads.photo_urls.length > 0;
  const hasVideos =
    Array.isArray(uploads.video_urls) && uploads.video_urls.length > 0;
  return hasPhotos || hasVideos;
};
const createAlertBanner = (
  condition: boolean,
  text: string,
  details?: string,
  folderPath?: string,
  siteUrl?: string,
  count?: number,
): string => {
  if (!condition) return '';
  const storageLink = siteUrl ? createStorageLink(folderPath, siteUrl) : null;
  let bannerText = text;
  if (count !== undefined && count > 0 && Number.isInteger(count))
    bannerText += ` (${count})`;
  let fullText = `⚠️ ${bannerText}`;
  if (details) fullText += `<br>${details}`;
  const bannerContent = `<div style="background-color:#FFFBEB!important;border:1px solid #FDE68A;padding:12px;text-align:center;font-weight:bold;color:#92400e!important;border-radius:6px;">${fullText}</div>`;
  return `<tr><td style="padding:6px 0;">${
    storageLink
      ? `<a href="${storageLink}" target="_blank" style="text-decoration:none;color:#92400e!important;">${bannerContent}</a>`
      : bannerContent
  }</td></tr>`;
};
const createAdminBanner = (condition: boolean, text: string): string => {
  if (!condition) return '';
  const bannerContent = `<div style="background-color:#DBEAFE!important;border:1px solid #93C5FD;padding:12px;text-align:center;font-weight:bold;color:#1E40AF!important;border-radius:6px;">${text}</div>`;
  return `<tr><td style="padding:6px 0;">${bannerContent}</td></tr>`;
};
const getDamageString = (damage: any): string => {
  let baseString =
    damage.fullText || damage.type || damage.userType || 'Okänd skada';
  const positions = (damage.positions || damage.userPositions || [])
    .map((p: any) => {
      if (p.carPart && p.position) return `${p.carPart} (${p.position})`;
      if (p.carPart) return p.carPart;
      return '';
    })
    .filter(Boolean)
    .join(', ');
  if (positions) baseString += `: ${positions}`;
  const comment =
    damage.text || damage.userDescription || damage.resolvedComment;
  if (comment)
    baseString += `<br><small><strong>Kommentar:</strong> ${comment}</small>`;
  return baseString;
};
const formatDamagesToHtml = (
  damages: any[],
  title: string,
  siteUrl: string,
  fallbackText?: string,
): string => {
  if (!damages || damages.length === 0) {
    if (fallbackText) {
      return `<h3 style="margin:20px 0 10px;font-size:14px;text-transform:uppercase;letter-spacing:.5px;">${title}</h3><p style="margin-top:0;font-size:14px;">${fallbackText}</p>`;
    }
    return '';
  }
  const items = damages
    .map(d => {
      const text = getDamageString(d);
      const storageLink = hasAnyFiles(d)
        ? createStorageLink(d.uploads?.folder, siteUrl)
        : null;
      return `<li style="margin-bottom:8px;">${text}${
        storageLink
          ? ` <a href="${storageLink}" target="_blank" style="text-decoration:none;color:#2563eb!important;font-weight:bold;">(Visa media 🔗)</a>`
          : ''
      }</li>`;
    })
    .join('');
  return `<h3 style="margin:20px 0 10px;font-size:14px;text-transform:uppercase;letter-spacing:.5px;">${title}</h3><ul style="padding-left:20px;margin-top:0;font-size:14px;">${items}</ul>`;
};
const formatTankning = (tankning: any): string => {
  if (!tankning) return '---';
  if (tankning.tankniva === 'återlämnades_fulltankad')
    return 'Återlämnades fulltankad';
  if (tankning.tankniva === 'tankad_nu') {
    const parts = [
      'Tankad nu av MABI',
      tankning.liters ? `(${tankning.liters}L` : null,
      tankning.bransletyp ? `${tankning.bransletyp}` : null,
      tankning.literpris ? `@ ${tankning.literpris} kr/L)` : null,
    ]
      .filter(Boolean)
      .join(' ');
    return parts;
  }
  if (tankning.tankniva === 'ej_upptankad')
    return '<span style="font-weight:bold;color:#b91c1c;">Ej upptankad</span>';
  return '---';
};
const buildBilagorSection = (
  rekond: any,
  husdjur: any,
  rokning: any,
  siteUrl: string,
): string => {
  const bilagor: string[] = [];
  if (rekond.folder && rekond.hasMedia)
    bilagor.push(
      `<li><a href="${siteUrl}/public-media/${rekond.folder}" target="_blank">Rekond 🔗</a></li>`,
    );
  if (husdjur.folder && husdjur.hasMedia)
    bilagor.push(
      `<li><a href="${siteUrl}/public-media/${husdjur.folder}" target="_blank">Husdjur 🔗</a></li>`,
    );
  if (rokning.folder && rokning.hasMedia)
    bilagor.push(
      `<li><a href="${siteUrl}/public-media/${rokning.folder}" target="_blank">Rökning 🔗</a></li>`,
    );
  if (bilagor.length === 0) return '';
  return `<div style="border-bottom:1px solid #e5e7eb;padding-bottom:10px;margin-bottom:20px;">
    <h2 style="font-size:16px;font-weight:600;margin-bottom:15px;">Bilagor</h2>
    <ul style="padding-left:20px;margin:0;">${bilagor.join('')}</ul>
  </div>`;
};
const createBaseLayout = (regnr: string, content: string): string => `<!DOCTYPE html>
<html lang="sv">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<style>
:root { color-scheme: light only; }
body { font-family: ui-sans-serif, system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;
  background:#f9fafb!important;color:#000;margin:0;padding:20px; }
.container { max-width:600px;margin:0 auto;background:#fff!important;border-radius:8px;
  padding:30px;border:1px solid #e5e7eb; }
a { color:#2563eb!important; }
</style>
</head>
<body>
  <div class="container">
    <div style="text-align:center;border-bottom:1px solid #e5e7eb;padding-bottom:20px;margin-bottom:20px;">
      <img src="${LOGO_URL}" alt="MABI Logo" width="150" style="margin-left:6px;">
    </div>
    <table width="100%"><tbody>${content}</tbody></table>
    <div style="margin-top:20px;padding-top:15px;border-top:1px solid #e5e7e...
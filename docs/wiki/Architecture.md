# Arkitektur och komponenter

## Översikt
- Next.js (App Router) för UI och routes
- Supabase för Auth/Storage/DB
- Resend för e‑post
- Vercel för hosting/deploy
- Två media‑routes:
  - `/media`: inloggningsskyddad, intern
  - `/public-media`: publik, för e‑postlänkar

## Nyckelkomponenter
- `app/check/...`: Incheckningsformulär
- `app/api/notify/route.ts`: Serverroute som:
  - Skriver checkin + skador till DB (PR #105)
  - Bygger och skickar mejl (Resend)
  - Loggar sammanfattningar
- `app/public-media/[...path]/page.tsx`: Publikt galleri
- `app/media/[...path]/media-viewer.tsx`: Gemensam gallerikomponent
  - Känner av om den körs under `/public-media` eller `/media` och bygger breadcrumbs därefter

## Säkerhet
- Preview: Vercel Authentication kan vara på (kräver Vercel‑inloggning)
- Produktion: `/public-media` är öppen, `/media` kräver inloggning (LoginGate)
- Supabase RLS: bucket är publik; åtkomst kontrolleras via appens routes

## E‑postmottagare
- Huvudstation: primär + ortspecifik via mappning
- Bilkontroll: lista av mottagare

# UPPDATERING 2025-12-05

## Datakällor

| Tabell/Källa | Beskrivning | Används av |
|--------------|-------------|------------|
| `vehicles` | Bilkontroll-filen (CSV-import) | `/status` |
| `damages` | Skador (BUHS + nya från /check) | `/status`, `/check` |
| `nybil_inventering` | Nybilsregistreringar | `/status`, `/nybil` |
| `checkins` | Incheckningar | `/status`, `/check` |
| RPC `get_damages_by_trimmed_regnr` | BUHS-skador (legacy) | `/status`, `/check` |

## Mejlrouting

### /nybil
| Fabrikat | Mejladress |
|----------|------------|
| Opel | opel@incheckad.se → opel@mabi.se |
| Peugeot, Citroën, DS | peugeot@incheckad. se → peugeot@mabi. se |
| Övriga | info@incheckad.se → per. andersson@mabi. se |

### /check (baserat på "Var är bilen nu?")
| Ort | Mejladress |
|-----|------------|
| Helsingborg, Ängelholm | helsingborg@incheckad.se |
| Varberg | varberg@incheckad.se |
| Malmö, Trelleborg, Lund | malmo@incheckad.se |

## Godkända användare

Definieras i `components/LoginGate.tsx`


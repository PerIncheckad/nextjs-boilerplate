# Media och e‑post

## Publik vs intern media
- Intern: `/media` (inloggning krävs)
- Publik: `/public-media` (öppen, för e‑postlänkar)

Breadcrumbs håller sig inom rätt kontext:
- Startar du i `/public-media/...` → "uppåt" stannar i `/public-media`

## E‑post
- Generator: `app/api/notify/route.ts`
- Viktigt:
  - Länka alltid till `/public-media`
  - Rendera "(Visa media 🔗)" enbart när photo/video finns
  - Visa banners för viktiga tillstånd

## Preview‑skydd på Vercel
- När "Standard Protection" är aktiv måste du logga in i Vercel för att se preview – även `/public-media`
- Produktion påverkas inte av detta

# Flöde: Incheckning och notifiering

1. Användare fyller i `/check`
   - Mätarställning, hjultyp, drivmedel, "Plats för incheckning" och "Bilen står nu"
   - Nya skador (obligatoriskt foto)
   - Dokumenterar ev. BUHS‑skador (foto krävs hos oss)

2. Submit
   - Klienten laddar upp media till Supabase Storage (med retrier och tydliga fel)
   - Klienten postar payload till `/api/notify`

3. Server (API)
   - Skriver till DB:
     - `public.checkins`: en rad per incheckning
     - `public.damages`: 
       - Nya skador: `legacy_damage_source_text = NULL`, `damage_date = dagens datum`
       - Dokumenterad BUHS: `legacy_damage_source_text = original BUHS‑text`, `original_damage_date = BUHS‑datum`, `legacy_loose_key = REGNR|datum`
     - `public.checkin_damages`: en rad per position för nya skador
   - Skickar mejl (Resend)
   - Loggar sammanfattningar (Vercel Logs)

4. E‑post
   - Länkar till `/public-media/...`
   - "(Visa media)" visas endast om filer finns
   - Banners för viktiga tillstånd (tankning, laddning, varningslampa etc.)

5. Laddning av `/check` vid senare tillfälle
   - "Befintliga skador" = union av BUHS + tidigare sparade nya skador
   - Dokumenterad BUHS förblir dokumenterad även om BUHS‑text ändras (via `legacy_loose_key`)

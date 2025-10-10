# Skiftet från test till skarpt läge - Incheckad.se

---

## **1. Plan för skiftet**

- **Testmiljö vs. produktionsmiljö**
  - Säkerställ att all testdata är borttagen eller separerad från produktionsdata.
  - Använd separata Supabase-projekt för test och produktion, med egna URL/anon-key.
  - Vercel-miljövariabler ska peka på rätt Supabase-instans.

- **Legacy-filer och -data**
  - Identifiera eventuella legacy-filer från tidigare tester eller versioner (t.ex. gamla buckets, tabeller, exports).
  - Bestäm om dessa ska arkiveras, migreras eller raderas.
  - Spara all dokumentation om testdata och testflöden för framtida referens (gärna i `/docs/`).

- **Feature-toggle och fallback**
  - Vid större förändringar: använd feature-toggle för att gradvis rulla ut nya funktioner.
  - Ha fallback-plan: om skarp läge misslyckas, kunna återgå till testversion eller tidigare release.

## **2. Must-know för produktionssättning**

- Dubbelkolla miljövariabler innan deploy.
- Testa i staging/preview innan skarp deploy.
- Sätt upp automatisk backup av Supabase-data.
- Informera användare (incheckare, admin) om övergången och eventuella down-times.
- Logga alla produktionsincidenter och buggar för analys.

## **3. Nice-to-know och tips till efterträdare**

- Dokumentera all kod som har med test vs. skarpt läge att göra.
- Håll koll på bucket-namn i Supabase – undvik mix av test/skarpt (ex: `damage-photos-test` vs. `damage-photos`)
- Gör en checklista för “Go Live”:
  - Alla API:er, exports, buckets, tabeller pekar på produktion
  - Inga testanvändare är aktiva
  - UI för rapport och incheckning är testad med skarp data
  - Export/PDF-funktion fungerar även med stor datamängd
- Spara en README i `/docs/` som beskriver exakt hur skiftet gick till, ev. lessons learned.

## **4. Extra tips**

- Skapa en “release log” eller changelog för varje större deploy.
- Sätt upp monitorering (t.ex. Supabase logs, Vercel monitoring) för att snabbt kunna agera vid fel.
- Ha en plan för rollback om något går fel – dokumentera exakt hur du återställer till föregående version.

---

**Dagens datum: 2025-10-10**
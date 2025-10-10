# INcheckad.se - DEV LOGG / Från Copilot & Företrädare
#### Skapad: 2025-10-10
#### Process-status: **Före bugfix av rapportflöde och mediabibliotek**
---

## **1. Filens syfte**
Denna fil samlar upp all kritisk information, best practice, QA och edge-cases som har framkommit i dialog mellan nuvarande Copilot och tidigare bot/utvecklare, utöver det som redan finns i `/docs` i repot.  
**Snapshot:** Systemet är under test. Formulärdata syns ännu inte alltid i rapporten, mediabiblioteket är inte klart, och ingen full automatisk QA/logik är implementerad.

---

## **2. Systemstatus / Flöden**

### **Incheckning**
- Incheckningsformulär på /check skriver direkt till Supabase-tabellen `damages` (via Supabase-klienten, ingen RPC).
- Varje incheckning skapar en rad i `checkins` och en eller flera i `damages`, kopplas via `checkin_id`.
- Fältet `status` sätts till `"complete"` direkt vid submit, endast dessa visas i rapporten.
- Minsta datamängd: `regnr`, `damage_type`, `damage_date` behövs för rapporten.

### **Mediahantering**
- Bilder/video laddas till `damage_photos` (Supabase Storage).
- Metadata för varje bild/video sparas i `damage_media` (`damage_id` FK).
- Fältet `media_url` i `damages` sätts till **första uppladdade bilden** vid submit.  
  - Vid manuell uppladdning/radering krävs manuell uppdatering av `media_url`!
- Ingen frontend-edit för media finns idag; all extra media/radering görs i Supabase.
- Rapporten visar endast `media_url` (första bildens url).
- Ingen automatisk cleanup för trasiga länkar – manual update krävs.
- **Galleri/modal:** Ej implementerat, men kodskiss finns (se nedan).

### **CSV-import / dubblettlogik**
- Vid CSV-import sätts `media_url` om fältet finns, annars måste koppling till `damage_media` göras separat.
- Best practice: Efter import, koppla media och kör script som uppdaterar `media_url` med första bildens url från `damage_media`.
- Ingen automatisk dubblettkontroll – plan är att bygga varning/blockering på:  
  - `regnr`, `damage_date`, `damage_type`
- Vid dubblett: popup/varning till användare, logg/systemmeddelande till admin.

### **Rollstyrning**
- Roller och rättigheter styrs via tabellen `employees` (`email`, `is_active`, `role`).
- Rolländring kräver utloggning/inloggning för att slå igenom (session/JWT-cache).
- Live-uppdatering av roll kan byggas genom att hämta roll från backend vid sidladdning.

### **Mobilvänlighet**
- Formuläret ska primärt användas på mobil/padda.
- Viktigt: touchvänliga knappar, tydlig layout, enkel navigation, inputs/dropdowns anpassade för mobil.
- Rapporten används främst på desktop, men bör testas på mobil (tabell/rullmenyer kan ha buggar).

---

## **3. QA / Edge-cases att testa**

- Skador utan regnr eller damage_type
- Skador utan media men media utlovats
- Trasiga media-url (bild borttagen, url kvar)
- Okända stationsnummer/regioner (ej match i `stationer.json`)
- Dubbletter av skador på samma bil/dag
- Skador på bilar som saknas i `vehicles`
- Rolländring som inte slår igenom direkt
- Raderade media som fortfarande visas som länk
- Långsam autocomplete vid stor datamängd
- Mobilbuggar (rapporttabell/rullmeny/input)
- Felaktiga mejladresser vid regionmejl
- “Draft”-skador som syns/inte syns i rapporten
- CSV-import med trasiga fält

---

## **4. Kodskiss: Media-galleri/modal**

```typescript
function MediaGallery({ damageId }) {
  const [media, setMedia] = useState([]);
  useEffect(() => {
    supabase.from('damage_media').select().eq('damage_id', damageId).then(({data}) => setMedia(data));
  }, [damageId]);
  return (
    <div>
      {media.map(m => (
        <div>
          <img src={m.media_url} style={{width:60}} />
          <div>
            <span>{m.created_at}</span>
            <span>{m.comment}</span>
            <span>{m.type}</span>
            {/* station, regnr, kategori kan visas om datan finns */}
          </div>
        </div>
      ))}
      {/* Modal/carousel vid klick */}
    </div>
  );
}
```

- Metadata som bör visas under bild: uppladdningsdatum, kommentar, typ, incheckare, skadekategori, station, regnr.
- Visa äldsta bild först (kan byggas om till “senaste först” vid behov).

---

## **5. Rekommenderad process för dubblettkontroll**

```typescript
const exists = await supabase.from('damages')
  .select()
  .eq('regnr', regnr)
  .eq('damage_date', date)
  .eq('damage_type', type);
if (exists.length > 0) {
  // Visa varning i frontend
  // Logga dubblett till admin/system
}
```
- Admin beslutar om dubblett ska tillåtas eller tas bort.

---

## **6. Best practice: CSV-import och media-koppling**

- Importera skador till `damages` (med ev. `media_url`)
- Importera bilder till bucket, skapa `damage_media`-poster (koppla till rätt `damage_id`)
- Script för att uppdatera `media_url` i `damages` med första bildens url i `damage_media`

---

## **7. Rollstyrning mot tabell**

- Roller: `"admin"`, `"bilkontroll"`, `"biluthyrare"`, `"incheckare"`
- Rollhämtning sker vid login/sessionstart
- Ändring kräver utloggning/inloggning om ingen live-uppdatering byggs

---

## **8. Mobilvänlig design – checklist**

- Touchvänliga knappar
- Inputs/dropdowns tillräckligt stora
- Sticky meny eller “Tillbaka”-knapp
- Rapporttabell och rullmenyer testade på mobil/padda

---

## **9. Systemstatus – vid denna logg**

- Input från formulär syns inte alltid i rapporten – **bugg kvarstår**
- Mediabibliotek/galleri ej implementerat
- Automatisk QA/cleanup saknas
- Rollstyrning fungerar, men kräver utloggning/inloggning
- Mobiltest ej slutfört

---

## **10. Att göra (nästa steg)**
- Felsöka varför formulärdata inte syns i rapporten
- Implementera mediabibliotek/galleri/modal
- Bygga dubblettkontroll vid incheckning/import
- Bygga automatisk QA/cleanup för media-url
- Förbättra autocomplete för stor datamängd
- Testa mobilvänlighet och layout

---

**För frågor, kontakta PerIncheckad eller relevant utvecklare.  
Uppdatera denna logg vid varje större teknisk förändring eller QA-runda.**
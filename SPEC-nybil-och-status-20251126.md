# Komplett Specifikation: /nybil och /status

**Datum:** 2025-11-26
**Författare:** GitHub Copilot i samarbete med Per Andersson
**Version:** 1. 0
**Status:** Godkänd för implementation

---

## 1.  Övergripande syfte och dataflöde

### 1.1 Syfte

- **/nybil**: Formulär för att registrera nya bilar som kommer in i MABI Syds vagnpark.  Samlar in komplett information om fordonet, utrustning, avtalsvillkor och leveransstatus.

- **/status**: Läs-sida för att visa aktuell status för varje fordon. Möjliggör redigering och komplettering av information.  Fungerar även som ingång för att manuellt lägga till befintliga bilar som inte gått via /nybil.

- **/check**: Incheckningsformulär som vid återlämning av fordon läser data från /status (eller Bilkontroll-filen som fallback under övergångsperioden).

### 1.2 Dataflöde

```
┌─────────────────────────────────────────────────────────────────┐
│                         NYA BILAR                               │
│  /nybil → Supabase (nybil_inventering + övriga tabeller)       │
│              ↓                                                  │
│         /status (läser och visar)                              │
│              ↓                                                  │
│         /check (läser vid incheckning)                         │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     BEFINTLIGA BILAR                            │
│  Bilkontroll-filen ──→ /status (manuell inmatning möjlig)      │
│              ↓                                                  │
│         /check (läser vid incheckning)                         │
└─────────────────────────────────────────────────────────────────┘
```

**Viktigt:**
- /check läser **aldrig direkt** från /nybil
- All data från /nybil hamnar i den underliggande databasen som /status vilar på
- Under övergångsperioden fortsätter /check att läsa från Bilkontroll-filen parallellt
- Skadefilen används fortfarande för skadehistorik

---

## 2. Formulärstruktur för /nybil

### 2.1 Sektion: FORDON

| Fält | Typ | Obligatoriskt | Detaljer |
|------|-----|---------------|----------|
| Registreringsnummer | Fritext | ✅ | Versaler, centrerad, formaterad (ABC 123) |
| Bilmärke | Rullmeny | ✅ | Se avsnitt 2.1. 1 |
| → Om "Annan" | Fritext | ✅ | Label: "Specificera bilmärke *" |
| Modell | Fritext | ✅ | Placeholder: "t.ex. T-Cross" |

#### 2.1.1 Bilmärken (rullmeny)
Alternativen i ordning:
- MB
- Ford
- BMW
- VW
- KIA
- MG
- Renault
- Peugeot
- Citroen
- Opel
- SEAT
- Annan

### 2.2 Sektion: PLATS FÖR MOTTAGNING AV NY BIL

| Fält | Typ | Obligatoriskt | Detaljer |
|------|-----|---------------|----------|
| Ort | Rullmeny | ✅ | Se avsnitt 2.2. 1 |
| Station | Rullmeny | ✅ | Beroende på vald Ort, se avsnitt 2.2.2 |

#### 2.2.1 Orter
Alfabetisk ordning:
- Falkenberg
- Halmstad
- Helsingborg
- Lund
- Malmö
- Trelleborg
- Varberg
- Ängelholm

#### 2.2.2 Stationer per Ort
```javascript
const STATIONER = {
  'Malmö': ['Ford Malmö', 'Mechanum', 'Malmö Automera', 'Mercedes Malmö', 'Werksta St Bernstorp', 'Werksta Malmö Hamn', 'Hedbergs Malmö', 'Hedin Automotive Burlöv', 'Sturup'],
  'Helsingborg': ['HBSC Helsingborg', 'Ford Helsingborg', 'Transport Helsingborg', 'S.  Jönsson', 'BMW Helsingborg', 'KIA Helsingborg', 'Euromaster Helsingborg', 'B/S Klippan', 'B/S Munka-Ljungby', 'B/S Helsingborg', 'Werksta Helsingborg', 'Båstad'],
  'Lund': ['Ford Lund', 'Hedin Lund', 'B/S Lund', 'P7 Revinge'],
  'Ängelholm': ['FORD Ängelholm', 'Mekonomen Ängelholm', 'Flyget Ängelholm'],
  'Falkenberg': ['Falkenberg'],
  'Halmstad': ['Flyget Halmstad', 'KIA Halmstad', 'FORD Halmstad'],
  'Trelleborg': ['Trelleborg'],
  'Varberg': ['Ford Varberg', 'Hedin Automotive Varberg', 'Sällstorp lack plåt', 'Finnveden plåt']
};
```

### 2.3 Sektion: PLANERAD STATION

| Fält | Typ | Obligatoriskt | Detaljer |
|------|-----|---------------|----------|
| Planerad station | Rullmeny | ✅ | Endast Huvudstationer |

#### 2.3.1 Huvudstationer (för rullmeny)
Visas som kortnamn:
- Malmö (id: 166)
- Helsingborg (id: 170)
- Ängelholm (id: 171)
- Halmstad (id: 274)
- Falkenberg (id: 282)
- Trelleborg (id: 283)
- Varberg (id: 290)
- Lund (id: 406)

### 2.4 Sektion: FORDONSSTATUS

| Fält | Typ | Obligatoriskt | Detaljer |
|------|-----|---------------|----------|
| Mätarställning vid inköp (km) | Nummer | ✅ | |

#### 2.4.1 Undersektion: Däck

| Fält | Typ | Obligatoriskt | Detaljer |
|------|-----|---------------|----------|
| Däcktyp som sitter på | Knappar | ✅ | Sommardäck / Vinterdäck |
| Hjul till förvaring | Knappar | ✅ | Vinterdäck / Sommardäck / Inga medföljande hjul |
| → Om däck valt: Förvaringsort | Rullmeny | ✅ | Samma lista som Orter (2.2.1) |
| → Om däck valt: Specificera förvaring av hjul | Fritext | ✅ | |

#### 2.4.2 Undersektion: Drivmedel

| Fält | Typ | Obligatoriskt | Detaljer |
|------|-----|---------------|----------|
| Drivmedel | Knappar | ✅ | Se 2.4.2.1 |
| → Om Bensin/Diesel: Växel | Knappar | ✅ | Automat / Manuell |
| → Om 100% el: Laddnivå (%) | Nummer | ✅ | 0-100 |
| → Om ej 100% el: Tankstatus | Knappar | ✅ | Se 2.4.2.2 |
| → Om "Tankad nu": Antal liter | Nummer | ✅ | |
| → Om "Tankad nu": Literpris (kr) | Nummer | ✅ | |

##### 2.4.2.1 Drivmedelstyper
- Bensin
- Diesel
- Hybrid (bensin)
- Hybrid (diesel)
- 100% el

**Logik för Växel:**
- Om Drivmedel = Bensin eller Diesel → Visa fråga om Växel (Automat/Manuell)
- Om Drivmedel = Hybrid eller 100% el → Sätt Växel = "Automat" automatiskt (sparas i DB men frågan visas ej)

##### 2.4.2.2 Tankstatus-alternativ
- Mottogs fulltankad
- Tankad nu av MABI
- Ej upptankad

### 2.5 Sektion: AVTALSVILLKOR

| Fält | Typ | Obligatoriskt | Detaljer |
|------|-----|---------------|----------|
| Serviceintervall | Knappar + fritext | ✅ | 1500 / 2500 / 3000 / Annat |
| → Om "Annat" | Fritext | ✅ | Ingen enhet i fältet |
| Max km/månad | Knappar + fritext | ✅ | 1200 / 3000 / Annat |
| → Om "Annat" | Fritext | ✅ | Ingen enhet i fältet |
| Avgift över-km | Knappar + fritext | ✅ | 1 kr / 2 kr / Annat |
| → Om "Annat" | Fritext | ✅ | Ingen enhet i fältet |

### 2.6 Sektion: UTRUSTNING

| Fält | Typ | Obligatoriskt | Villkor/Följdfråga |
|------|-----|---------------|-------------------|
| Antal insynsskydd | Knappar | ✅ | 0 / 1 / 2 (ingen förvaring) |
| Medföljande Instruktionsbok/Manual?  | Knappar | ✅ | Ja / Nej |
| → Om Ja: Förvaringsort | Rullmeny | ✅ | Orter |
| → Om Ja: Specificera förvaring av instruktionsbok | Fritext | ✅ | |
| Medföljande COC? | Knappar | ✅ | Ja / Nej |
| → Om Ja: Förvaringsort | Rullmeny | ✅ | Orter |
| → Om Ja: Specificera förvaring av COC | Fritext | ✅ | |
| Antal nycklar | Knappar | ✅ | 1 / 2 |
| → Om 2: Förvaringsort | Rullmeny | ✅ | Orter |
| → Om 2: Specificera förvaring av extranyckel | Fritext | ✅ | |
| Antal laddkablar | Knappar | Se 2.6.1 | Se 2.6.1 |
| Låsbultar med?  | Knappar | ✅ | Ja / Nej |
| Dragkrok | Knappar | ✅ | Ja / Nej |
| Gummimattor | Knappar | ✅ | Ja / Nej |
| Däckkompressor | Knappar | ✅ | Ja / Nej |
| Stöld GPS monterad | Knappar | ✅ | Ja / Nej |
| → Om Ja: Specificera | Fritext | ✅ | |

#### 2.6.1 Laddkablar - detaljerad logik

**Om Drivmedel = Hybrid (bensin) eller Hybrid (diesel):**
- Fråga: "Antal laddkablar *" med knappar: 0 / 1 / 2
- Alla kablar går ALLTID till förvaring
- Följdfrågor (alltid om antal ≥ 1):
  - Förvaringsort * (rullmeny)
  - Specificera förvaring av laddkabel/laddkablar * (fritext)

**Om Drivmedel = 100% el:**
- Fråga: "Antal laddkablar *" med knappar: 1 / 2
- 1 kabel ligger alltid i bilen
- Följdfrågor (endast om antal > 1):
  - Förvaringsort * (rullmeny)
  - Specificera förvaring av laddkabel/laddkablar * (fritext)

**Om Drivmedel = Bensin eller Diesel:**
- Frågan om laddkablar visas INTE

### 2.7 Sektion: UPPKOPPLING (dynamiskt baserat på Bilmärke)

| Fält | Typ | Obligatoriskt | Visas när |
|------|-----|---------------|-----------|
| MBme aktiverad | Knappar | ✅ | Bilmärke = MB |
| VW Connect aktiverad | Knappar | ✅ | Bilmärke = VW |

Båda har alternativen: Ja / Nej

### 2. 8 Sektion: FOTON

| Fält | Typ | Obligatoriskt | Detaljer |
|------|-----|---------------|----------|
| Ta bild framifrån | Foto-knapp | ✅ | Öppnar kamera |
| Ta bild bakifrån | Foto-knapp | ✅ | Öppnar kamera |
| Lägg till fler bilder | Foto-knapp | ❌ | Frivilligt, flera bilder möjligt |

**UX-detaljer:**
- Samma stil som fotografering i /check
- Förhandsvisning av taget foto
- Möjlighet att ta om foto
- Tydliga instruktioner

### 2.9 Sektion: SKADOR VID LEVERANS

| Fält | Typ | Obligatoriskt | Detaljer |
|------|-----|---------------|----------|
| Skadefråga | Knappar | ✅ | "Inga skador" / "Skador vid leverans" |

**Om "Skador vid leverans" väljs:**
- Visa skadedokumentations-UI identiskt med /check
- Kräver: Skadetyp, Placering, Position, minst ett foto
- Frivilligt: Kommentar
- Möjlighet att dokumentera flera skador

### 2.10 Sektion: VAR ÄR BILEN NU? 

| Fält | Typ | Obligatoriskt | Detaljer |
|------|-----|---------------|----------|
| Ort | Rullmeny | ✅ | Samma orter som 2.2.1 |
| Station | Rullmeny | ✅ | Beroende på Ort |
| Aktuell mätarställning (km) | Nummer | Villkorligt | Obligatoriskt om plats skiljer sig från "Plats för mottagning" |

### 2.11 Sektion: SALUINFO (ej obligatoriskt)

| Fält | Typ | Obligatoriskt | Detaljer |
|------|-----|---------------|----------|
| Saludatum | Fritext | ❌ | Format: YYYY-MM-DD eller fritext |
| Station | Rullmeny | ❌ | Endast Huvudstationer |

### 2.12 Sektion: KÖPARE (ej obligatoriskt)

| Fält | Typ | Obligatoriskt |
|------|-----|---------------|
| Köpare (företag) | Fritext | ❌ |
| Returort för fordonsförsäljning | Fritext | ❌ |
| Returadress försäljning | Fritext | ❌ |
| Attention | Fritext | ❌ |
| Notering fordonsförsäljning | Fritext (textarea) | ❌ |

### 2.13 Sektion: ÖVRIGT

| Fält | Typ | Obligatoriskt |
|------|-----|---------------|
| Anteckningar | Fritext (textarea) | ❌ |

### 2.14 Sektion: KLAR FÖR UTHYRNING

| Fält | Typ | Obligatoriskt | Detaljer |
|------|-----|---------------|----------|
| Klar för uthyrning?  | Knappar | ✅ | Ja / Nej |
| → Om Nej: Specificera varför | Fritext | ✅ | |

---

## 3. Validering och varningar

### 3.1 Registreringsnummer-validering

**Svenskt standardformat:**
- 3 bokstäver + 2 siffror + 1 siffra eller bokstav (t.ex. ABC123, ABC12A)
- Alternativt: 3 bokstäver + 3 siffror (t.ex. ABC123)

**Logik:**
1. Normalisera input (versaler, ta bort mellanslag)
2. Kontrollera mot regex: `/^[A-Z]{3}[0-9]{2}[0-9A-Z]$/`
3. Om icke-standard format (t.ex. "TTTTTT" för test):
   - Visa varningsmodal: "Är du säker?  [REG. NR] är inte i standardformat."
   - Knappar: "Avbryt" / "Fortsätt ändå"

### 3.2 Dubbletthantering

**Kontrolleras mot:** `nybil_inventering`-tabellen

**Om reg.nr redan finns:**
1. Visa varningsmodal:
   - Rubrik: "Registreringsnummer finns redan"
   - Text: "[REG.NR] är redan registrerad i systemet."
   - Knappar: "Avbryt" / "Skapa dubblett"

2. Vid "Skapa dubblett":
   - Skapa ny rad med `is_duplicate = true`
   - Sätt `duplicate_group_id` för koppling
   - Skicka mejl till Bilkontroll (se avsnitt 4.4)

**Merge av dubbletter:** Sker manuellt av Bilkontroll (ingen kod behövs)

---

## 4. E-postnotifieringar

### 4.1 Allmänt

**Under utveckling:**
- Alla mejl skickas till `per@incheckad.se`
- Tänkt mottagare anges i Subject

**I produktion:**
- Bilkontroll: `latif@incheckad.se` (eller konfigurerad adress)
- Huvudstation: Mejladress baserad på vald "Planerad station"

### 4. 2 Subject-format

| Situation | Subject |
|-----------|---------|
| Normal (utan farliga bannrar) | `NY BIL REGISTRERAD: ABC123 - VW T-Cross - till Malmö \| HUVUDSTATION` |
| Med farliga bannrar | `NY BIL REGISTRERAD: ABC123 - VW T-Cross - till Malmö - ! !!  \| HUVUDSTATION` |
| Till Bilkontroll | `NY BIL REGISTRERAD: ABC123 - VW T-Cross - till Malmö \| BILKONTROLL` |
| Dubblett | `DUBBLETT SKAPAD FÖR ABC123 - VW T-Cross \| BILKONTROLL` |

**"!! !" läggs till om minst en röd banner finns.**

### 4.3 Mejlmottagare och innehåll

| Mottagare | Villkor | Innehåll |
|-----------|---------|----------|
| Bilkontroll | Alltid | All information |
| Planerad Huvudstation | Om "Klar för uthyrning" = Ja | Reducerad/relevant information |

**Om "Klar för uthyrning" = Nej:**
- ENDAST Bilkontroll får mejl
- Röd banner: "GÅR INTE ATT HYRA UT" + kommentar

### 4.4 Bannrar

| Färg | Villkor | Text |
|------|---------|------|
| 🔴 Röd | Skador vid leverans | `⚠ SKADOR VID LEVERANS (X)` där X = antal |
| 🔴 Röd | Ej uthyrningsbar | `⚠ GÅR INTE ATT HYRA UT` + kommentar under |
| 🔵 Blå | Dubblett skapad | `DUBBLETT SKAPAD` |

### 4.5 Mejlstruktur (liknande /check)

```
[MABI Syd logga]

ABC123 registrerad

[Bannrar om tillämpligt]

┌─────────────────────────────────┐
│ Bilmärke: VW                    │
│ Modell: T-Cross                 │
│ Mätarställning: 15 km           │
│ Hjultyp: Sommardäck             │
│ Drivmedel: Bensin               │
│ Växel: Automat                  │
│ Plats för mottagning: Malmö     │
│ Planerad station: Helsingborg   │
│ Bilen står nu: Malmö            │
└─────────────────────────────────┘

[Länk till /status/ABC123]

[Skador vid leverans om tillämpligt]

Registrerad av Per Andersson kl 14:30, 2025-11-26. 

© 2025 Albarone AB – Alla rättigheter förbehållna
```

### 4.6 Länk till /status

- Format: `https://incheckad.se/status/ABC123`
- Länktext: "Visa i Status →" eller liknande
- **OBS:** /status finns inte än – använd placeholder-länk som uppdateras när /status byggs

---

## 5.  Supabase Storage

### 5.1 Bucket

**Namn:** `nybil-photos`

**OBS:** Separat från `damage-photos` som används för /check

### 5. 2 Mappstruktur

```
nybil-photos/
└── REGNR/
    └── REGNR-YYYYMMDD-NYBIL/
        ├── framifrån. jpg
        ├── bakifrån.jpg
        └── ovriga/
            ├── 1.jpg
            ├── 2.jpg
            └── ... 
```

**Exempel:**
```
nybil-photos/
└── ABC123/
    └── ABC123-20251126-NYBIL/
        ├── framifrån.jpg
        ├── bakifrån.jpg
        └── ovriga/
            └── 1.jpg
```

### 5.3 Namngivning

- Mapp innehåller `-NYBIL` för att tydligt markera ursprung
- Filnamn: beskrivande (framifrån, bakifrån) eller numrerade (övriga)
- Datum i mappnamn: YYYYMMDD-format

---

## 6. /status - Specifikation

### 6.1 Syfte

/status är **primärt en läs-sida**, inte ett formulär.  Användaren ska kunna:
1. Söka på reg.nr
2. Se all information om bilen
3. Redigera och komplettera vid behov
4. Lägga till befintliga bilar som inte gått via /nybil

### 6.2 Sökfunktion

- Sökruta liknande /check och /nybil
- Söker i: Data från /nybil + Bilkontroll-filen
- Vid träff: Visa all information om fordonet

### 6.3 Visningsläge (standard)

- All information visas i läsbart format
- Fält är INTE redigerbara
- Knappar synliga: **Redigera**

### 6.4 Redigeringsläge

**Aktiveras via:** "Redigera"-knappen

**I redigeringsläge:**
- Fält blir redigerbara
- Knappar synliga: **Spara** / **Avbryt**

**Vid "Spara":**
- Visa bekräftelsemodal med lista över ändringar
- Knappar: "Bekräfta" / "Avbryt"

**Vid "Avbryt":**
- Återställ till ursprungliga värden
- Återgå till visningsläge

### 6. 5 Manuell inmatning av befintliga bilar

- Om reg.nr inte finns i systemet: Visa meddelande "Fordon ej registrerat"
- Knapp: "Lägg till fordon"
- Öppnar formulär liknande /nybil men med **färre obligatoriska fält**
- Syftet är att kunna mata in bilar från Bilkontroll-filen manuellt

### 6.6 Fält som ska vara synliga i /status

Samma information som samlas in i /nybil, plus:
- Senast uppdaterad (datum/tid)
- Uppdaterad av (användarnamn)
- Historik av incheckningar (länk till /rapport eller inline-lista)

---

## 7. Koppling /check ↔ /nybil ↔ /status

### 7.1 Varningar vid incheckning baserat på /status-data

| Situation | Varning i /check |
|-----------|------------------|
| Laddkabel saknas | Modal: "Är du säker? [REG. NR] ska ha X laddkabel(kablar).  Kunden kommer att faktureras om laddkabel saknas." + frivillig fritext |
| Insynsskydd saknas | (Liknande varning) |
| Fel däcktyp | Modal: "Är du säker?  Vänligen dubbelkolla." |

### 7.2 Mejl-bannrar vid avvikelse

| Situation | Bannerfärg | Mottagare |
|-----------|------------|-----------|
| Laddkabel saknas | 🔴 Röd | Huvudstation + Bilkontroll |
| Insynsskydd saknas | 🔴 Röd | Huvudstation + Bilkontroll |
| "Fel däck" (avviker från /status) | 🔵 Blå | Endast Bilkontroll |

### 7.3 Framtida automatik

När /status är fullt implementerat:
- /check "vet" redan drivmedelstyp → frågan om drivmedel behövs ej
- AdBlue visas endast för Diesel / Hybrid (diesel)
- Automatisk ifyllning av känd information

---

## 8. Databas-struktur (Supabase)

### 8.1 Tabell: nybil_inventering (befintlig, utökas)

**Nya/uppdaterade kolumner:**

```sql
-- Fordon
bilmarke TEXT NOT NULL,           -- Rullmeny-val eller "Annan: [fritext]"
modell TEXT NOT NULL,
vaxel TEXT,                       -- 'Automat' / 'Manuell' / NULL (sätts auto för hybrid/el)

-- Planerad station
planerad_station TEXT NOT NULL,
planerad_station_id INTEGER,

-- Avtalsvillkor
serviceintervall TEXT,            -- '1500' / '2500' / '3000' / fritext
max_km_manad TEXT,                -- '1200' / '3000' / fritext
avgift_over_km TEXT,              -- '1' / '2' / fritext

-- Utrustning
instruktionsbok BOOLEAN,
instruktionsbok_forvaring_ort TEXT,
instruktionsbok_forvaring_spec TEXT,
coc BOOLEAN,
coc_forvaring_ort TEXT,
coc_forvaring_spec TEXT,
extranyckel_forvaring_ort TEXT,   -- Om antal_nycklar = 2
extranyckel_forvaring_spec TEXT,
laddkablar_forvaring_ort TEXT,
laddkablar_forvaring_spec TEXT,
dragkrok BOOLEAN,
gummimattor BOOLEAN,
dackkompressor BOOLEAN,
stold_gps BOOLEAN,
stold_gps_spec TEXT,

-- Uppkoppling
mbme_aktiverad BOOLEAN,           -- Endast om bilmarke = 'MB'
vw_connect_aktiverad BOOLEAN,     -- Endast om bilmarke = 'VW'

-- Skador vid leverans
har_skador_vid_leverans BOOLEAN DEFAULT FALSE,

-- Saluinfo
saludatum TEXT,
salu_station TEXT,

-- Köpare
kopare_foretag TEXT,
returort TEXT,
returadress TEXT,
attention TEXT,
notering_forsaljning TEXT,

-- Uthyrning
klar_for_uthyrning BOOLEAN NOT NULL,
ej_uthyrningsbar_anledning TEXT,

-- Dubblett
is_duplicate BOOLEAN DEFAULT FALSE,
duplicate_group_id UUID,

-- Metadata
created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
```

### 8.2 Skador vid leverans

Skador dokumenteras i befintlig `damages`-tabell med:
- `source = 'NYBIL'` för att skilja från /check-skador
- Länkning via `nybil_id` eller `regnr`

---

## 9. UI/UX-riktlinjer

### 9.1 Allmänt

- Samma visuella stil som /check
- Bakgrundsbild: MB-grill (samma som /nybil idag)
- MABI Syd-logga i header
- Inloggad användare visas

### 9.2 Knappar

- **Obligatoriska fält:** Röd kant/markering när ej ifyllt
- **Villkorliga fält:** Visas/döljs dynamiskt
- **Grön "Registrera bil"-knapp:** Endast aktiv när formuläret är komplett
- **Blå "Visa saknad information"-knapp:** Om formuläret är inkomplett

### 9.3 Modaler

- **Bekräftelsemodal:** Sammanfattning av all inmatad data före spar
- **Varningsmodaler:** För dubblett, icke-standard reg.nr, etc. 
- **Success-modal:** "Tack [Namn]! Bilen har registrerats." med grön bock

### 9.4 Mobilvänlighet

- Responsiv design (max-width: 700px som /check)
- Touch-vänliga knappar
- Kamera-integration för foton

---

## 10. Implementation - rekommenderad ordning

### Fas 1: Grundläggande /nybil-formulär
1. Uppdatera formulärstruktur enligt spec
2. Implementera alla nya fält och villkorlig logik
3. Validering (reg.nr, obligatoriska fält)
4.  Bekräftelsemodal

### Fas 2: Foton och Storage
1. Skapa bucket `nybil-photos`
2. Implementera foto-uppladdning (fram/bak/övriga)
3. Spara URLs i databasen

### Fas 3: E-post
1. Skapa mejl-templates för /nybil
2. Implementera bannrar
3. Subject-logik
4. Mottagarlogik (under dev: per@incheckad.se)

### Fas 4: Dubbletthantering
1.  Koll mot nybil_inventering
2. Varningsmodal
3. Skapa dubblett-funktion
4. Dubblett-mejl

### Fas 5: /status (separat projekt)
1. Sökfunktion
2.  Visningsläge
3.  Redigeringsläge
4. Manuell inmatning

### Fas 6: Koppling /check ↔ /status
1. Läs data från /status i /check
2. Implementera varningar (laddkabel, däck, etc.)
3. Mejl-bannrar vid avvikelse

---

## 11. Testfall

### 11.1 Grundläggande registrering
- [ ] Registrera ny bil med alla obligatoriska fält
- [ ] Verifiera data i Supabase
- [ ] Verifiera mejl (till per@incheckad.se)

### 11.2 Villkorlig logik
- [ ] Växel visas endast för Bensin/Diesel
- [ ] Laddkablar visas endast för Hybrid/El
- [ ] Förvaringsfrågor triggas korrekt
- [ ] MBme/VW Connect visas för rätt märke

### 11.3 Validering
- [ ] Icke-standard reg.nr → varning
- [ ] Dubblett → varning + möjlighet att skapa

### 11.4 Foton
- [ ] Obligatoriska foton (fram/bak) krävs
- [ ] Frivilliga foton kan läggas till
- [ ] Foton sparas i rätt bucket/mapp

### 11.5 Skador
- [ ] "Inga skador" → ingen skadesektion
- [ ] "Skador vid leverans" → skadedokumentation fungerar
- [ ] Röd banner i mejl vid skador

### 11.6 Mejl
- [ ] Korrekt subject
- [ ] Korrekt bannrar
- [ ] All information inkluderad
- [ ] Länk till /status (placeholder)

---

## 12. Öppna frågor / Framtida beslut

1. **Exakt e-postadress för Huvudstationer** - Behöver konfigureras per station
2. **/status URL-struktur** - Förslag: `/status/[regnr]`
3. **Historik-visning i /status** - Hur detaljerad? 
4. **Transition-plan för Bilkontroll** - Möte planerat när /nybil+/status fungerar

---

## 13. Ändringslogg

| Datum | Version | Ändring |
|-------|---------|---------|
| 2025-11-26 | 1.0 | Initial specifikation skapad |

---

*Denna specifikation är godkänd av Per Andersson och kan användas som underlag för implementation.*
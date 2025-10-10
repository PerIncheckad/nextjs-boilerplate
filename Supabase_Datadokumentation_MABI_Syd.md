# Supabase – Datadokumentation för skador och bilkontroll (MABI Syd)

## 1. Skadefilen (“damage file”)

- **Tabell som används:**  
  `damages`

- **Relaterade tabeller/views:**  
  - `damage_media` (lagrar bilder/video kopplat till skada)
  - Eventuella rapport-/statistik-views (namn kan variera, t.ex. damage_report_view)

- **Bucket i Supabase Storage för skadefoton/video:**  
  `damage_photos`

- **Kolumner i tabellen `damages`:**
    - id (uuid, PRIMARY KEY)
    - regnr (text)
    - damage_date (date)
    - region (text)
    - ort (text)
    - huvudstation_id (text)
    - station_id (text)
    - station_namn (text)
    - damage_type (text)
    - car_part (text)
    - position (text)
    - description (text)
    - status (text, 'draft' eller 'complete')
    - inchecker_name (text)
    - inchecker_email (text)
    - created_at (timestamp with time zone)
    - updated_at (timestamp with time zone)

- **Kolumner i tabellen `damage_media`:**
    - id (uuid, PRIMARY KEY)
    - damage_id (uuid, FOREIGN KEY till damages.id)
    - url (text)
    - type (text)
    - comment (text)
    - created_at (timestamp with time zone)

---

## 2. Bilkontroll-filen (“car registry file”)

- **Tabell som används:**  
  Kontrollera om ni använder:  
  `vehicles`  
  eller  
  `car_data`  
  (Exakt namn enligt Table Editor. Om du är osäker, dubbelkolla i Supabase.)

- **Relaterade tabeller/views:**  
  Vanligen ingen, men det kan finnas statistik- eller rapportviews (t.ex. vehicle_report_view).

- **Bucket i Supabase Storage för bilkontroll-foton:**  
  Troligen:  
  `vehicle_photos`  
  eller  
  `car_photos`  
  (Exakt namn enligt Supabase Storage.)

- **Kolumner i tabellen `vehicles` (exempel):**
    - id (uuid, PRIMARY KEY)
    - regnr (text)
    - model (text)
    - brand (text)
    - vin (text)
    - year (integer)
    - color (text)
    - station_id (text)
    - created_at (timestamp with time zone)
    - updated_at (timestamp with time zone)
  *(Justera kolumnlista enligt faktisk tabellstruktur i projektet.)*

---

## 3. Importflöde

- **Manuell import:**  
  - Skadefilen: Ladda upp till tabell `damages` (eventuellt via Excel/CSV-import), och bilder till bucket `damage_photos`.
  - Bilkontrollfilen: Ladda upp till tabell `vehicles` eller `car_data`, och bilder till bucket `vehicle_photos`.

- **Automatisk import (om relevant):**  
  - Skadefilen importeras till tabell `damages` och media till `damage_photos` via automatiserat script/integration.
  - Bilkontrollfilen importeras till tabell `vehicles`/`car_data` och media till `vehicle_photos` via script/integration.

---

## 4. Sammanfattning – för framtida utvecklare

- **Skador:**  
  - Tabell: `damages`  
  - Relaterad tabell: `damage_media`  
  - Bucket: `damage_photos`  
  - Se ovan för fullständig kolumnlista.

- **Bilkontroll:**  
  - Tabell: `vehicles` eller `car_data`  
  - Bucket: `vehicle_photos` eller `car_photos`  
  - Justera kolumnlista enligt aktuell tabell.

- **Import:**  
  - Manuellt: via Supabase Table Editor/CSV-import.
  - Automatiskt: via script/integration mot rätt tabell och bucket.

---

**ALLT ovan måste stämmas av mot faktisk tabell- och bucketstruktur i Supabase Table Editor och Storage!**

Vid minsta osäkerhet: logga in i Supabase och kontrollera exakta namn och kolumnuppsättning.

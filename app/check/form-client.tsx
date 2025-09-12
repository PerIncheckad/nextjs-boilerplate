"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

// Check if environment variables are available
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = supabaseUrl && supabaseAnonKey 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

interface DamageData {
  Regnr: string;
  Skadenr: string;
  Modell: string;
}

export default function FormClient() {
  const [data, setData] = useState<DamageData[]>([]);
  const [search, setSearch] = useState("");
  const [filtered, setFiltered] = useState<DamageData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      if (!supabase) {
        setError("Supabase konfiguration saknas. Kontrollera NEXT_PUBLIC_SUPABASE_URL och NEXT_PUBLIC_SUPABASE_ANON_KEY.");
        return;
      }

      setLoading(true);
      setError(null);
      
      try {
        // Hämta de tre kolumnerna från Supabase
        const { data, error } = await supabase
          .from("mabi_damage_data")
          .select("Regnr, Skadenr, Modell");
        
        if (error) {
          console.error("Supabase error:", error);
          setError(`Fel vid hämtning av data: ${error.message}`);
        } else if (data) {
          setData(data);
        }
      } catch (err) {
        console.error("Fetch error:", err);
        setError("Fel vid hämtning av data från Supabase.");
      } finally {
        setLoading(false);
      }
    }
    
    fetchData();
  }, []);

  useEffect(() => {
    if (search) {
      setFiltered(
        data.filter(row =>
          row.Regnr?.toUpperCase() === search.trim().toUpperCase()
        )
      );
    } else {
      setFiltered([]);
    }
  }, [search, data]);

  return (
    <div>
      {/* Felmeddelande för konfiguration eller datafel */}
      {error && (
        <div style={{
          marginBottom: '20px',
          padding: '20px',
          backgroundColor: '#fee2e2',
          borderRadius: '8px',
          border: '1px solid #fca5a5',
          color: '#dc2626'
        }}>
          <h3>Konfigurationsfel</h3>
          <p>{error}</p>
          <p style={{ marginTop: '10px', fontSize: '14px' }}>
            För att använda denna komponent behöver du konfigurera följande miljövariabler:
          </p>
          <ul style={{ marginTop: '8px', paddingLeft: '20px' }}>
            <li>NEXT_PUBLIC_SUPABASE_URL</li>
            <li>NEXT_PUBLIC_SUPABASE_ANON_KEY</li>
          </ul>
        </div>
      )}

      {/* Laddningsindikator */}
      {loading && (
        <div style={{
          marginBottom: '20px',
          padding: '20px',
          backgroundColor: '#f0f9ff',
          borderRadius: '8px',
          border: '1px solid #bdfbfe',
          textAlign: 'center'
        }}>
          <p>Laddar data från Supabase...</p>
        </div>
      )}

      {/* Sökfält för registreringsnummer - endast synligt om ingen konfigurationsfel */}
      {!error && (
        <div style={{ marginBottom: '20px' }}>
          <label htmlFor="search" style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
            Sök på registreringsnummer:
          </label>
          <input
            id="search"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ange registreringsnummer"
            disabled={loading}
            style={{
              width: '100%',
              padding: '10px',
              borderRadius: '4px',
              border: '1px solid #ccc',
              fontSize: '16px',
              opacity: loading ? 0.5 : 1
            }}
          />
        </div>
      )}

      {/* Resultat för skador */}
      {filtered.length > 0 && (
        <div style={{
          marginTop: '20px',
          padding: '20px',
          backgroundColor: '#f0f9ff',
          borderRadius: '8px',
          border: '1px solid #bdfbfe'
        }}>
          <h3>Skador för registreringsnummer: {search}</h3>
          {filtered.map((item, idx) => (
            <div key={idx} style={{
              marginBottom: '15px',
              padding: '10px',
              backgroundColor: '#ffffff',
              borderRadius: '4px',
              border: '1px solid #e0e7ff'
            }}>
              <p><strong>Registreringsnummer:</strong> {item.Regnr}</p>
              <p><strong>Skadenummer:</strong> {item.Skadenr}</p>
              <p><strong>Modell:</strong> {item.Modell}</p>
            </div>
          ))}
        </div>
      )}

      {/* Meddelande när sökning görs men inga resultat hittas */}
      {search && filtered.length === 0 && !loading && !error && (
        <div style={{
          marginTop: '20px',
          padding: '20px',
          backgroundColor: '#fef3c7',
          borderRadius: '8px',
          border: '1px solid #fbbf24'
        }}>
          <p>Inga skador hittades för registreringsnummer: {search}</p>
        </div>
      )}

      {/* Information om data när inga sökningar görs */}
      {!search && data.length > 0 && !loading && !error && (
        <div style={{
          marginTop: '20px',
          padding: '20px',
          backgroundColor: '#f0fdf4',
          borderRadius: '8px',
          border: '1px solid #86efac'
        }}>
          <p>Totalt {data.length} skador tillgängliga i databasen. Använd sökfältet för att filtrera på registreringsnummer.</p>
        </div>
      )}
    </div>
  );
}
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Damage = {
  id: string;
  regnr: string;
  damage_date: string;
  damage_type_raw: string;
  note_customer: string;
  note_internal: string;
  vehiclenote: string;
  saludatum: string;
  // ...lägg till övriga fält vid behov
};

type Vehicle = {
  regnr: string;
  brand: string;
  model: string;
  wheel_storage_location: string;
  // ...lägg till övriga fält vid behov
};

type JoinedRow = Damage & { vehicle?: Vehicle };

export default function RapportTable() {
  const [rows, setRows] = useState<JoinedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError("");
      try {
        // Hämta alla skador
        const { data: damages, error: errDam } = await supabase
          .from("damages")
          .select("*");
        if (errDam) throw errDam;

        // Hämta alla bilar
        const { data: vehicles, error: errVeh } = await supabase
          .from("vehicles")
          .select("*");
        if (errVeh) throw errVeh;

        // Matcha ihop skada + bilinfo
        const vehiclesMap: Record<string, Vehicle> = {};
        vehicles.forEach((v: Vehicle) => {
          vehiclesMap[v.regnr] = v;
        });

        const joined: JoinedRow[] = damages.map((d: Damage) => ({
          ...d,
          vehicle: vehiclesMap[d.regnr],
        }));

        setRows(joined);
      } catch (e: any) {
        setError(e.message || "Misslyckades hämta data");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) return <div>Hämtar data...</div>;
  if (error) return <div style={{ color: "red" }}>{error}</div>;
  if (!rows.length) return <div>Inga skador registrerade ännu.</div>;

  return (
    <table className="rapport-table">
      <thead>
        <tr>
          <th>Regnr</th>
          <th>Bilmodell</th>
          <th>Hjulförvaring</th>
          <th>Skadedatum</th>
          <th>Skadetyp</th>
          <th>Kundnotering</th>
          <th>Internnotering</th>
          <th>Övrigt</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td>{row.regnr}</td>
            <td>{row.vehicle?.brand} {row.vehicle?.model}</td>
            <td>{row.vehicle?.wheel_storage_location}</td>
            <td>{row.damage_date}</td>
            <td>{row.damage_type_raw}</td>
            <td>{row.note_customer}</td>
            <td>{row.note_internal}</td>
            <td>{row.vehiclenote}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

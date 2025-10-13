import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import MediaModal from "@/components/MediaModal";

// --- Befintliga typer ---
type Damage = {
  id: string;
  regnr: string;
  damage_date: string;
  damage_type_raw: string;
  note_customer: string;
  note_internal: string;
  vehiclenote: string;
  saludatum: string;
  station_namn?: string;
  station_id?: string;
  inchecker_name?: string;
  godkandAv?: string;
  notering?: string;
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

// --- Nya typer för MediaModal ---
type SupabaseMedia = {
  media_url: string;
  media_type: "image" | "video";
  created_at: string;
  comment?: string;
};

type MediaItem = {
  url: string;
  type: "image" | "video";
  metadata: {
    date: string;
    time?: string;
    damageType: string;
    station: string;
    note?: string;
    inchecker?: string;
    documentationDate?: string;
    damageDate?: string;
  };
};

export default function RapportTable() {
  // --- Befintlig state ---
  const [rows, setRows] = useState<JoinedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  // --- Ny state för MediaModal ---
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMedia, setModalMedia] = useState<MediaItem[]>([]);
  const [modalTitle, setModalTitle] = useState("");
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
  const [isModalLoading, setIsModalLoading] = useState(false);

  // --- Befintlig useEffect för att hämta tabelldata ---
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError("");
      try {
        const { data: damages, error: errDam } = await supabase
          .from("damages")
          .select("*");
        if (errDam) throw errDam;

        const { data: vehicles, error: errVeh } = await supabase
          .from("vehicles")
          .select("*");
        if (errVeh) throw errVeh;

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
  
  // --- Ny mappningsfunktion enligt specifikation ---
  function mapToMediaItem(damage: Damage, media: SupabaseMedia): MediaItem {
    const createdAtDate = new Date(media.created_at);
    const damageDate = damage.damage_date ? new Date(damage.damage_date) : null;

    return {
      url: media.media_url,
      type: media.media_type,
      metadata: {
        date: createdAtDate.toLocaleDateString("sv-SE"),
        time: createdAtDate.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" }),
        damageType: damage.damage_type_raw || "--",
        station: damage.station_namn || damage.station_id || "--",
        note: damage.notering || media.comment || "",
        inchecker: damage.inchecker_name || damage.godkandAv || "",
        documentationDate: createdAtDate.toLocaleDateString("sv-SE"),
        damageDate: damageDate ? damageDate.toLocaleDateString("sv-SE") : undefined,
      }
    };
  }

  // --- Ny funktion för att hantera klick på en rad ---
  const handleRowClick = async (damage: JoinedRow) => {
    setIsModalOpen(true);
    setIsModalLoading(true);
    setModalTitle(`Media för skada på ${damage.regnr}`);
    setCurrentMediaIndex(0); // Återställ index varje gång en ny modal öppnas

    try {
      const { data: mediaData, error: mediaError } = await supabase
        .from("damage_media")
        .select("media_url, media_type, created_at, comment")
        .eq("damage_id", damage.id);

      if (mediaError) {
        throw mediaError;
      }
      
      if (mediaData && mediaData.length > 0) {
        const mappedMedia = mediaData.map(media => mapToMediaItem(damage, media as SupabaseMedia));
        setModalMedia(mappedMedia);
      } else {
        // Hantera fallet där inga bilder finns
        setModalMedia([]);
      }

    } catch (e: any) {
      // Skriv ut fel i modalen om media inte kan hämtas
      setModalTitle("Fel vid hämtning av media");
      console.error("Fel vid hämtning av media:", e.message);
    } finally {
      setIsModalLoading(false);
    }
  };
  
  // --- Ny funktion för att stänga modalen ---
  const handleCloseModal = () => {
    setIsModalOpen(false);
    setModalMedia([]); // Rensa media när modalen stängs
    setModalTitle("");
  };

  if (loading) return <div>Hämtar data...</div>;
  if (error) return <div style={{ color: "red" }}>{error}</div>;
  if (!rows.length) return <div>Inga skador registrerade ännu.</div>;

  return (
    <>
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
            // Raden är nu klickbar
            <tr key={row.id} onClick={() => handleRowClick(row)} style={{ cursor: 'pointer' }}>
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

      {/* Nytt: Rendera MediaModal baserat på state */}
      <MediaModal
        open={isModalOpen}
        onClose={handleCloseModal}
        title={modalTitle}
        media={modalMedia}
        currentIdx={currentMediaIndex}
        onPrev={() => setCurrentMediaIndex(prev => Math.max(0, prev - 1))}
        onNext={() => setCurrentMediaIndex(prev => Math.min(modalMedia.length - 1, prev + 1))}
        hasPrev={currentMediaIndex > 0}
        hasNext={currentMediaIndex < modalMedia.length - 1}
      />
    </>
  );
}

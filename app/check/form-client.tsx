'use client';

import {
  FormEvent,
  useEffect,
  useRef,
  useState,
  ChangeEvent,
} from 'react';
import supabase from '../../lib/supabase';

type SaveStatus = 'idle' | 'saving' | 'done' | 'error';

type Station = { id: string; name: string; email?: string | null };
type Employee = { id: string; name: string; email?: string | null };
type DamageEntry = {
  text: string;
  files: File[];
  previews: string[]; // for UI
};

const BUCKET = 'damage-photos';

function cleanFileName(name: string) {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-_.]/g, '')
    .slice(0, 100);
}

export default function FormClient() {
  // --- top / header ---
  const [userName] = useState<string>('Bob'); // temporär "inloggad"
  const [thanksTo, setThanksTo] = useState<string>('');

  // --- fält ---
  const [regnr, setRegnr] = useState('');
  const [stationId, setStationId] = useState<string>('');
  const [stationOther, setStationOther] = useState('');
  const [notes, setNotes] = useState('');

  // --- krav & frågor ---
  const [odometerKm, setOdometerKm] = useState<string>(''); // ”12345”
  const [fuelFull, setFuelFull] = useState<boolean | null>(null);

  const [adBlueOk, setAdBlueOk] = useState<boolean | null>(null);
  const [washerOk, setWasherOk] = useState<boolean | null>(null);
  const [parcelOk, setParcelOk] = useState<boolean | null>(null);

  const [wheelsOn, setWheelsOn] = useState<'sommar' | 'vinter' | null>(null);
  const [chargingCables, setChargingCables] = useState<number>(0);

  const [washNeeded, setWashNeeded] = useState<boolean | null>(null);
  const [vacuumNeeded, setVacuumNeeded] = useState<boolean | null>(null);

  // nya skador
  const [hasNewDamage, setHasNewDamage] = useState<boolean | null>(null);
  const [damageList, setDamageList] = useState<DamageEntry[]>([]);
  const camInputRefs = useRef<HTMLInputElement[]>([]);
  const galInputRefs = useRef<HTMLInputElement[]>([]);

  // --- metadata / listor ---
  const [stations, setStations] = useState<Station[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState<string | null>(null); // dold – sätts automatiskt

  // auto-hämtad bilinfo
  const [brandModel, setBrandModel] = useState<string>('');
  const [existingDamages, setExistingDamages] = useState<string[]>([]);
  const [wheelStorage, setWheelStorage] = useState<string>('–'); // placeholder

  // --- status ---
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [message, setMessage] = useState('');

  // --- init: hämta stationer & anställda ---
  useEffect(() => {
    (async () => {
      // stations
      const { data: st } = await supabase
        .from('stations')
        .select('id,name,email')
        .order('name', { ascending: true });
      if (st) setStations(st as Station[]);

      // employees (välj en automatiskt – dold i UI)
      const { data: emps } = await supabase
        .from('employees')
        .select('id,name,email')
        .order('name', { ascending: true });
      if (emps && emps.length > 0) {
        setEmployees(emps as Employee[]);
        // För nu: välj första i listan (eller en som heter Bob om det finns)
        const foundBob = (emps as Employee[]).find((e) =>
          e.name?.toLowerCase().includes('bob'),
        );
        setEmployeeId((foundBob ?? (emps as Employee[])[0]).id);
      }
    })();
  }, []);

  // --- hämta bil + bef skador när regnr fyllts ---
  async function lookupVehicle(reg: string) {
    const regUpper = (reg ?? '').toUpperCase().trim();
    if (!regUpper) return;

    // view enligt din setup: public.vehicle_damage_summary
    const { data, error } = await supabase
      .from('vehicle_damage_summary')
      .select('regnr, brand_model, damages')
      .eq('regnr', regUpper)
      .maybeSingle();

    if (error) {
      // tyst felhantering: rensa och fortsätt
      setBrandModel('');
      setExistingDamages([]);
      return;
    }
    if (data) {
      setBrandModel(data.brand_model ?? '');
      setExistingDamages(
        Array.isArray(data.damages)
          ? (data.damages as string[])
          : [],
      );
      // Tillfällig placeholder för “Hjulförvaring”
      setWheelStorage('–'); // kopplas på senare
    } else {
      setBrandModel('');
      setExistingDamages([]);
      setWheelStorage('–');
    }
  }

  // --- damage helpers ---
  function addDamage() {
    setDamageList((prev) => [
      ...prev,
      { text: '', files: [], previews: [] },
    ]);
  }

  function removeDamage(index: number) {
    setDamageList((prev) => prev.filter((_, i) => i !== index));
    camInputRefs.current.splice(index, 1);
    galInputRefs.current.splice(index, 1);
  }

  function updateDamageText(index: number, text: string) {
    setDamageList((prev) => {
      const copy = [...prev];
      copy[index].text = text;
      return copy;
    });
  }

  function handleFiles(
    index: number,
    e: ChangeEvent<HTMLInputElement>,
  ) {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length === 0) return;

    setDamageList((prev) => {
      const copy = [...prev];
      const merged = [...copy[index].files, ...files];
      copy[index].files = merged.slice(0, 20); // liten gräns
      copy[index].previews = copy[index].files.map((f) =>
        URL.createObjectURL(f),
      );
      return copy;
    });
  }

  // --- validering ---
  const invalidRequired =
    !regnr.trim() ||
    !stationId && !stationOther.trim() ||
    !odometerKm.trim() ||
    fuelFull === null ||
    adBlueOk === null ||
    washerOk === null ||
    parcelOk === null ||
    wheelsOn === null ||
    washNeeded === null ||
    vacuumNeeded === null ||
    (hasNewDamage === null) ||
    (hasNewDamage === true &&
      (damageList.length === 0 ||
        damageList.some((d) => !d.text.trim())));

  // --- spara ---
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (invalidRequired) {
      setMessage('Fyll i alla obligatoriska fält.');
      setStatus('error');
      return;
    }
    setStatus('saving');
    setMessage('');

    // 1) ladda upp foton (om nya skador)
    let uploaded: { damageIndex: number; urls: string[] }[] = [];
    if (hasNewDamage) {
      for (let i = 0; i < damageList.length; i++) {
        const entry = damageList[i];
        const urls: string[] = [];
        for (const f of entry.files) {
          const key = `${regnr.toUpperCase()}/${Date.now()}-${cleanFileName(
            f.name || `foto-${Math.random().toString(36).slice(2)}.jpg`,
          )}`;
          const { error: upErr } = await supabase
            .storage
            .from(BUCKET)
            .upload(key, f, { upsert: false });
          if (!upErr) {
            const { data: pub } = supabase
              .storage
              .from(BUCKET)
              .getPublicUrl(key);
            if (pub?.publicUrl) urls.push(pub.publicUrl);
          }
        }
        uploaded.push({ damageIndex: i, urls });
      }
    }

    // 2) spara checkin
    const payload: Record<string, any> = {
      regnr: regnr.trim().toUpperCase(),
      station_id: stationId || null,
      station_other: stationOther.trim() || null,

      employee_id: employeeId, // dold, temporärt autoval

      odometer_km: Number(odometerKm.replace(/\D/g, '')) || null,
      fuel_full: fuelFull,

      adblue_ok: adBlueOk,
      washer_ok: washerOk,
      parcel_shelf_ok: parcelOk,

      wheels_on: wheelsOn,              // 'sommar' | 'vinter'
      charging_cables: chargingCables,  // 0..2

      wash_needed: washNeeded,
      vacuum_needed: vacuumNeeded,

      no_new_damage: hasNewDamage ? false : true,
      notes: notes.trim() || null,
    };

    // eventuellt spara skador i egen tabell om den finns
    // vi försöker; om tabell saknas ignorerar vi felet
    try {
      const { error: errMain } = await supabase
        .from('checkins')
        .insert(payload);
      if (errMain) throw errMain;

      if (hasNewDamage && uploaded.length > 0) {
        const toInsert = uploaded.flatMap((u) => {
          const entry = damageList[u.damageIndex];
          if (u.urls.length === 0) return [];
          return u.urls.map((url) => ({
            regnr: payload.regnr,
            comment: entry.text.trim(),
            photo_url: url,
          }));
        });

        if (toInsert.length > 0) {
          // Om tabellen inte finns kör detta i "try/catch"
          await supabase.from('checkin_damage_photos').insert(toInsert);
        }
      }

      setStatus('done');
      setThanksTo(userName || 'användaren');
      setMessage('Incheckning sparad.');
      // nollställ
      setRegnr('');
      setBrandModel('');
      setExistingDamages([]);
      setWheelStorage('–');

      setStationId('');
      setStationOther('');
      setOdometerKm('');
      setFuelFull(null);

      setAdBlueOk(null);
      setWasherOk(null);
      setParcelOk(null);

      setWheelsOn(null);
      setChargingCables(0);

      setWashNeeded(null);
      setVacuumNeeded(null);

      setHasNewDamage(null);
      setDamageList([]);
      setNotes('');
    } catch (err: any) {
      console.error(err);
      setStatus('error');
      setMessage(
        'Kunde inte spara. Kontrollera uppgifterna och försök igen.',
      );
    }
  }

  // --- UI ---
  return (
    <main className="max-w-3xl mx-auto px-4 py-6">
      {/* header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Ny incheckning</h1>
        <div className="text-sm text-gray-400">
          Inloggad: <span className="font-medium text-gray-300"> {userName}</span>
        </div>
      </div>

      {/* regnr + auto-data */}
      <form onSubmit={onSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium">
            Registreringsnummer <span className="text-pink-300">*</span>
          </label>
          <input
            value={regnr}
            onChange={(e) => setRegnr(e.target.value.toUpperCase())}
            onBlur={(e) => lookupVehicle(e.target.value)}
            className="mt-1 w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 tracking-widest uppercase"
            placeholder="ABC123"
          />

          {/* bilinfo */}
          {!!brandModel && (
            <div className="mt-2 text-sm">
              <div>
                <span className="font-medium">Bil:</span> {brandModel}
              </div>
              <div>
                <span className="font-medium">Hjulförvaring:</span> {wheelStorage}
              </div>
            </div>
          )}

          {/* befintliga skador */}
          {existingDamages.length > 0 && (
            <div className="mt-2">
              <div className="text-sm font-medium">Befintliga skador:</div>
              <ul className="list-disc pl-5 text-sm">
                {existingDamages.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* station */}
        <div>
          <label className="block text-sm font-medium">
            Station / Depå <span className="text-pink-300">*</span>
          </label>
          <select
            value={stationId}
            onChange={(e) => setStationId(e.target.value)}
            className="mt-1 w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2"
          >
            <option value="">Välj station …</option>
            {stations.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <input
            value={stationOther}
            onChange={(e) => setStationOther(e.target.value)}
            className="mt-2 w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2"
            placeholder="Ev. annan inlämningsplats."
          />
        </div>

        {/* mätare */}
        <div>
          <label className="block text-sm font-medium">
            Mätarställning <span className="text-pink-300">*</span>
          </label>
          <div className="mt-1 flex items-center gap-2">
            <input
              value={odometerKm}
              onChange={(e) =>
                setOdometerKm(e.target.value.replace(/[^0-9]/g, ''))
              }
              inputMode="numeric"
              className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2"
              placeholder="ex. 42 180"
            />
            <span className="text-sm text-gray-400">km</span>
          </div>
        </div>

        {/* tanknivå */}
        <div>
          <div className="text-sm font-medium mb-1">Tanknivå <span className="text-pink-300">*</span></div>
          <div className="flex items-center gap-6">
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                checked={fuelFull === true}
                onChange={() => setFuelFull(true)}
              />
              Fulltankad
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                checked={fuelFull === false}
                onChange={() => setFuelFull(false)}
              />
              Ej fulltankad
            </label>
          </div>
        </div>

        {/* övriga JA/NEJ – rad 1 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <div className="text-sm font-medium mb-1">AdBlue OK? <span className="text-pink-300">*</span></div>
            <div className="flex items-center gap-6">
              <label className="inline-flex items-center gap-2">
                <input type="radio" checked={adBlueOk === true} onChange={() => setAdBlueOk(true)} /> Ja
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="radio" checked={adBlueOk === false} onChange={() => setAdBlueOk(false)} /> Nej
              </label>
            </div>
          </div>

          <div>
            <div className="text-sm font-medium mb-1">Spolarvätska OK? <span className="text-pink-300">*</span></div>
            <div className="flex items-center gap-6">
              <label className="inline-flex items-center gap-2">
                <input type="radio" checked={washerOk === true} onChange={() => setWasherOk(true)} /> Ja
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="radio" checked={washerOk === false} onChange={() => setWasherOk(false)} /> Nej
              </label>
            </div>
          </div>
        </div>

        {/* övriga JA/NEJ – rad 2 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <div className="text-sm font-medium mb-1">Insynsskydd OK? <span className="text-pink-300">*</span></div>
            <div className="flex items-center gap-6">
              <label className="inline-flex items-center gap-2">
                <input type="radio" checked={parcelOk === true} onChange={() => setParcelOk(true)} /> Ja
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="radio" checked={parcelOk === false} onChange={() => setParcelOk(false)} /> Nej
              </label>
            </div>
          </div>

          <div>
            <div className="text-sm font-medium mb-1">Hjul som sitter på <span className="text-pink-300">*</span></div>
            <div className="flex items-center gap-6">
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  checked={wheelsOn === 'sommar'}
                  onChange={() => setWheelsOn('sommar')}
                /> Sommarhjul
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  checked={wheelsOn === 'vinter'}
                  onChange={() => setWheelsOn('vinter')}
                /> Vinterhjul
              </label>
            </div>
          </div>
        </div>

        {/* Antal laddsladdar */}
        <div>
          <label className="block text-sm font-medium">Antal laddsladdar</label>
          <select
            value={chargingCables}
            onChange={(e) => setChargingCables(Number(e.target.value))}
            className="mt-1 w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2"
          >
            <option value={0}>0</option>
            <option value={1}>1</option>
            <option value={2}>2</option>
          </select>
        </div>

        {/* Tvätt / Dammsugning */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <div className="text-sm font-medium mb-1">Utvändig tvätt behövs <span className="text-pink-300">*</span></div>
            <div className="flex items-center gap-6">
              <label className="inline-flex items-center gap-2">
                <input type="radio" checked={washNeeded === true} onChange={() => setWashNeeded(true)} /> Ja
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="radio" checked={washNeeded === false} onChange={() => setWashNeeded(false)} /> Nej
              </label>
            </div>
          </div>

          <div>
            <div className="text-sm font-medium mb-1">Dammsugning behövs <span className="text-pink-300">*</span></div>
            <div className="flex items-center gap-6">
              <label className="inline-flex items-center gap-2">
                <input type="radio" checked={vacuumNeeded === true} onChange={() => setVacuumNeeded(true)} /> Ja
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="radio" checked={vacuumNeeded === false} onChange={() => setVacuumNeeded(false)} /> Nej
              </label>
            </div>
          </div>
        </div>

        {/* Nya skador – frågan */}
        <div>
          <div className="text-sm font-medium mb-1">
            Nya skador på bilen? <span className="text-pink-300">*</span>
          </div>
          <div className="flex items-center gap-6">
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                checked={hasNewDamage === false}
                onChange={() => setHasNewDamage(false)}
              /> Nej
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                checked={hasNewDamage === true}
                onChange={() => {
                  setHasNewDamage(true);
                  if (damageList.length === 0) addDamage();
                }}
              /> Ja
            </label>
          </div>
        </div>

        {/* Nya skador – detaljer */}
        {hasNewDamage && (
          <div className="rounded-lg border border-zinc-700 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">Beskriv nya skador</div>
              <button
                type="button"
                onClick={addDamage}
                className="text-xs rounded-md bg-zinc-800 border border-zinc-700 px-2 py-1"
              >
                {damageList.length === 0 ? 'Lägg till skada' : 'Lägg till ytterligare skada'}
              </button>
            </div>

            {damageList.map((dmg, idx) => (
              <div key={idx} className="rounded-md bg-zinc-900 p-3 border border-zinc-700">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium">Skada {idx + 1}</div>
                  <button
                    type="button"
                    onClick={() => removeDamage(idx)}
                    className="text-xs text-red-300 hover:text-red-200"
                  >
                    Ta bort
                  </button>
                </div>

                <textarea
                  className="w-full rounded-md bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
                  placeholder="Beskrivning (obligatoriskt, t.ex. 'Buckla vänster framdörr')"
                  value={dmg.text}
                  onChange={(e) => updateDamageText(idx, e.target.value)}
                  rows={2}
                />

                <div className="mt-2 flex items-center gap-2">
                  <input
                    ref={(el) => (camInputRefs.current[idx] = el!)}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    multiple
                    className="hidden"
                    onChange={(e) => handleFiles(idx, e)}
                  />
                  <input
                    ref={(el) => (galInputRefs.current[idx] = el!)}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => handleFiles(idx, e)}
                  />

                  <button
                    type="button"
                    className="rounded-md bg-zinc-800 border border-zinc-700 px-3 py-1.5 text-sm"
                    onClick={() => camInputRefs.current[idx]?.click()}
                  >
                    Ta bilder
                  </button>
                  <button
                    type="button"
                    className="rounded-md bg-zinc-800 border border-zinc-700 px-3 py-1.5 text-sm"
                    onClick={() => galInputRefs.current[idx]?.click()}
                  >
                    Välj från galleri
                  </button>
                </div>

                {dmg.previews.length > 0 && (
                  <div className="mt-3 grid grid-cols-4 gap-2">
                    {dmg.previews.map((src, i) => (
                      <img
                        key={i}
                        src={src}
                        alt={`Skadefoto ${i + 1}`}
                        className="h-20 w-full object-cover rounded-md border border-zinc-700"
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Övriga anteckningar */}
        <div>
          <label className="block text-sm font-medium">Övriga anteckningar</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-1 w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2"
            placeholder="Övrig info…"
            rows={4}
          />
        </div>

        {/* status */}
        {status === 'error' && (
          <div className="text-sm text-red-300">{message}</div>
        )}
        {status === 'done' && (
          <div className="text-sm text-green-400">
            {message} Tack {thanksTo}!
          </div>
        )}

        {/* submit */}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={status === 'saving' || invalidRequired}
            className="rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-4 py-2 font-semibold"
          >
            {status === 'saving' ? 'Sparar…' : 'Spara incheckning'}
          </button>
          {invalidRequired && (
            <div className="text-xs text-gray-400">
              Fyll i alla *markerade fält först.
            </div>
          )}
        </div>

        <div className="pt-4 text-xs text-gray-500">
          © Albarone AB {new Date().getFullYear()}
        </div>
      </form>
    </main>
  );
}

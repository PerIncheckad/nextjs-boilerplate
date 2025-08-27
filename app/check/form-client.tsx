'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Send, LogIn } from 'lucide-react';
// (resten av din kod)
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Send, LogIn } from "lucide-react";

// MVP – Fristående mobilvy. Tailwind krävs. Ingen riktig auth/mejl ännu.
// Den här filen kan köras som en vanlig React-komponent.

export default function IncheckadApp() {
  // "inloggad" användare – visas i header och i tackmeddelande
  const [isAuthenticated, setIsAuthenticated] = useState(true);
  const [username] = useState("Bob");

  // Formfält
  const [reg, setReg] = useState("");
  const [station, setStation] = useState(""); // krävs
  const [stationOther, setStationOther] = useState("");
  const [odometer, setOdometer] = useState("");

  // Ja/Nej & val
  const [fuelFull, setFuelFull] = useState<null | boolean>(null);
  const [adBlueOk, setAdBlueOk] = useState<null | boolean>(null);
  const [washOk, setWashOk] = useState<null | boolean>(null);
  const [privacyOk, setPrivacyOk] = useState<null | boolean>(null);
  const [chargeCableCount, setChargeCableCount] = useState<0 | 1 | 2 | null>(null);
  const [wheelsOn, setWheelsOn] = useState<"sommar" | "vinter" | null>(null);

  // Nya skador
  type DamageEntry = { text: string; files: File[]; previews: string[] };
  const [hasNewDamage, setHasNewDamage] = useState(false);
  const [damages, setDamages] = useState<DamageEntry[]>([]);

  // Övrigt
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Biluppslagning (mock) + fel reg.nr-varning
  const [vehicle, setVehicle] = useState<null | { model: string; storage: string }>(null);
  const [existingDamage, setExistingDamage] = useState<string[]>([]);
  const [badReg, setBadReg] = useState(false);

  // ======= Hjälpare =======
  function classToggle(active: boolean, base = "rounded-xl border px-4 py-2") {
    return `${base} ${
      active
        ? "bg-green-100 border-green-400 text-green-900 dark:bg-green-900/30 dark:text-green-100"
        : "bg-white/5 border-zinc-300 dark:border-zinc-600"
    }`;
  }

  function classToggleNeg(active: boolean, base = "rounded-xl border px-4 py-2") {
    return `${base} ${
      active
        ? "bg-red-100 border-red-400 text-red-900 dark:bg-red-900/30 dark:text-red-100"
        : "bg-white/5 border-zinc-300 dark:border-zinc-600"
    }`;
  }

  function addDamage() {
    setDamages((d) => [...d, { text: "", files: [], previews: [] }]);
  }
  function removeDamage(i: number) {
    setDamages((d) => d.filter((_, idx) => idx !== i));
  }
  function updateDamageText(i: number, value: string) {
    setDamages((d) => {
      const copy = [...d];
      copy[i] = { ...copy[i], text: value };
      return copy;
    });
  }
  function handleDamageFiles(i: number, e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const previews = files.map((f) => URL.createObjectURL(f));
    setDamages((d) => {
      const copy = [...d];
      copy[i] = {
        ...copy[i],
        files: [...copy[i].files, ...files],
        previews: [...copy[i].previews, ...previews],
      };
      return copy;
    });
    e.target.value = ""; // tillåt välja samma fil igen
  }
  function removeDamagePhoto(i: number, pIdx: number) {
    setDamages((d) => {
      const copy = [...d];
      copy[i] = {
        ...copy[i],
        files: copy[i].files.filter((_, k) => k !== pIdx),
        previews: copy[i].previews.filter((_, k) => k !== pIdx),
      };
      return copy;
    });
  }

  // Mockat register – regnr som *finns*
  const allowedRegs = useMemo(() => ["ABC123", "DGF14H", "DRA78K", "FWK72N", "ASF567"], []);

  async function lookupVehicle() {
    const r = reg.trim().toUpperCase();
    if (!r) return;
    const exists = allowedRegs.includes(r);
    setBadReg(!exists);

    if (!exists) {
      setVehicle(null);
      setExistingDamage([]);
      return;
    }

    // simulera hämtning
    await new Promise((r) => setTimeout(r, 300));
    setVehicle({ model: "MB E‑Klass Kombi Plug‑In Hybrid", storage: "Hjulförvaring: –" });
    // exempeldata – flera rader listas som punktlista
    if (r === "DRA78K") setExistingDamage(["Repor", "Spricka"]);
    else if (r === "DGF14H") setExistingDamage(["Repa", "Lackskada"]);
    else setExistingDamage([]);
  }

  // ======= Validering =======
  const damagesValid = !hasNewDamage || (damages.length > 0 && damages.every((d) => d.text.trim().length > 0));
  const canSubmit =
    isAuthenticated &&
    reg.trim().length >= 3 &&
    !!station &&
    odometer.trim().length > 0 &&
    fuelFull !== null &&
    adBlueOk !== null &&
    washOk !== null &&
    privacyOk !== null &&
    chargeCableCount !== null &&
    wheelsOn !== null &&
    damagesValid;

  // ======= Submit (mock) =======
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 700));
    alert(`Tack ${username}! Incheckningen är sparad.`);

    // nollställ
    setReg("");
    setVehicle(null);
    setExistingDamage([]);
    setBadReg(false);
    setStation("");
    setStationOther("");
    setOdometer("");
    setFuelFull(null);
    setAdBlueOk(null);
    setWashOk(null);
    setPrivacyOk(null);
    setChargeCableCount(null);
    setWheelsOn(null);
    setHasNewDamage(false);
    setDamages([]);
    setNotes("");
    setSubmitting(false);
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-50 md:bg-zinc-100 md:text-zinc-900">
      <header className="sticky top-0 z-10 border-b border-zinc-800/60 bg-zinc-950/80 px-4 py-3 backdrop-blur md:border-zinc-200 md:bg-white/80">
        <div className="mx-auto flex max-w-md items-center justify-between">
          <h1 className="text-xl font-semibold">Ny incheckning</h1>
          {isAuthenticated && <div className="text-sm opacity-80">Inloggad: {username}</div>}
        </div>
      </header>

      <section className="mx-auto max-w-md px-4 py-4">
        <form onSubmit={onSubmit} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 shadow md:border-zinc-200 md:bg-white">
          {/* Reg.nr */}
          <label className="block text-sm font-medium">Registreringsnummer *</label>
          <input
            value={reg}
            onChange={(e) => setReg(e.target.value.toUpperCase())}
            onBlur={lookupVehicle}
            className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 tracking-widest uppercase placeholder-zinc-400 md:border-zinc-300 md:bg-white"
            placeholder="ABC123"
          />
          {badReg && <p className="mt-1 text-sm text-red-400 md:text-red-600">Fel reg.nr</p>}

          {/* Station */}
          <div className="mt-4">
            <label className="block text-sm font-medium">Station / Depå *</label>
            <select
              value={station}
              onChange={(e) => setStation(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 md:border-zinc-300 md:bg-white"
            >
              <option value="">— Välj station / depå —</option>
              <option value="MALMÖ">Malmö</option>
              <option value="HELSINGBORG">Helsingborg</option>
              <option value="HALMSTAD">Halmstad</option>
              <option value="VARBERG">Varberg</option>
              <option value="TRELLEBORG">Trelleborg</option>
              <option value="LUND">Lund</option>
            </select>
            <input
              value={stationOther}
              onChange={(e) => setStationOther(e.target.value)}
              className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 placeholder-zinc-400 md:border-zinc-300 md:bg-white"
              placeholder="Ev. annan inlämningsplats"
            />
          </div>

          {/* Bilinfo under reg.nr */}
          {vehicle && (
            <div className="mt-3 rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm md:border-zinc-200 md:bg-zinc-50">
              <div><span className="font-medium">Bil:</span> {vehicle.model}</div>
              <div className="mt-1">{vehicle.storage}</div>
              {existingDamage.length > 0 && (
                <div className="mt-2">
                  <div className="font-medium">Befintliga skador:</div>
                  <ul className="list-inside list-disc">
                    {existingDamage.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Mätarställning */}
          <div className="mt-4">
            <label className="block text-sm font-medium">Mätarställning *</label>
            <div className="mt-1 flex items-center gap-2">
              <input
                value={odometer}
                onChange={(e) => setOdometer(e.target.value.replace(/[^0-9]/g, ""))}
                inputMode="numeric"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 md:border-zinc-300 md:bg-white"
                placeholder="ex. 42 180"
              />
              <span className="text-sm opacity-70">km</span>
            </div>
          </div>

          {/* Tanknivå */}
          <div className="mt-4">
            <label className="block text-sm font-medium">Tanknivå *</label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setFuelFull(true)} className={classToggle(fuelFull === true)}>Fulltankad</button>
              <button type="button" onClick={() => setFuelFull(false)} className={classToggleNeg(fuelFull === false)}>Ej fulltankad</button>
            </div>
          </div>

          {/* AdBlue */}
          <div className="mt-4">
            <label className="block text-sm font-medium">AdBlue OK? *</label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setAdBlueOk(true)} className={classToggle(adBlueOk === true)}>Ja</button>
              <button type="button" onClick={() => setAdBlueOk(false)} className={classToggleNeg(adBlueOk === false)}>Nej</button>
            </div>
          </div>

          {/* Spolarvätska */}
          <div className="mt-4">
            <label className="block text-sm font-medium">Spolarvätska OK? *</label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setWashOk(true)} className={classToggle(washOk === true)}>Ja</button>
              <button type="button" onClick={() => setWashOk(false)} className={classToggleNeg(washOk === false)}>Nej</button>
            </div>
          </div>

          {/* Insynsskydd */}
          <div className="mt-4">
            <label className="block text-sm font-medium">Insynsskydd OK? *</label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setPrivacyOk(true)} className={classToggle(privacyOk === true)}>Ja</button>
              <button type="button" onClick={() => setPrivacyOk(false)} className={classToggleNeg(privacyOk === false)}>Nej</button>
            </div>
          </div>

          {/* Laddsladdar */}
          <div className="mt-4">
            <label className="block text-sm font-medium">Antal laddsladdar *</label>
            <div className="mt-2 flex gap-2">
              {[0, 1, 2].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setChargeCableCount(n as 0 | 1 | 2)}
                  className={`rounded-xl border px-4 py-2 ${chargeCableCount === n ? "bg-blue-600 text-white border-blue-600" : "border-zinc-300 bg-white text-zinc-900"}`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Hjul som sitter på */}
          <div className="mt-4">
            <label className="block text-sm font-medium">Hjul som sitter på *</label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setWheelsOn("sommar")} className={`rounded-xl border px-4 py-2 ${wheelsOn === "sommar" ? "bg-blue-100 border-blue-400 text-blue-900 dark:bg-blue-900/30 dark:text-blue-100" : "border-zinc-300"}`}>Sommarhjul</button>
              <button type="button" onClick={() => setWheelsOn("vinter")} className={`rounded-xl border px-4 py-2 ${wheelsOn === "vinter" ? "bg-blue-100 border-blue-400 text-blue-900 dark:bg-blue-900/30 dark:text-blue-100" : "border-zinc-300"}`}>Vinterhjul</button>
            </div>
          </div>

          {/* Nya skador */}
          <div className="mt-6">
            <label className="block text-sm font-medium">Nya skador på bilen? *</label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setHasNewDamage(true)} className={classToggle(hasNewDamage)}>Ja</button>
              <button type="button" onClick={() => setHasNewDamage(false)} className={classToggleNeg(!hasNewDamage)}>Nej</button>
            </div>

            {hasNewDamage && (
              <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50/60 p-3 dark:bg-amber-900/10">
                <div className="space-y-4">
                  {damages.map((dmg, i) => (
                    <div key={i} className="rounded-xl bg-white p-3 shadow-sm">
                      <div className="mb-2 flex items-center justify-between">
                        <div className="text-sm font-medium">Skada {i + 1}</div>
                        <button type="button" onClick={() => removeDamage(i)} className="text-sm text-zinc-600 underline">Ta bort</button>
                      </div>

                      <label className="block text-sm font-medium">Beskriv skadan kort</label>
                      <input
                        value={dmg.text}
                        onChange={(e) => updateDamageText(i, e.target.value)}
                        className="mt-1 w-full rounded-lg border px-3 py-2"
                        placeholder="Text (obligatoriskt)"
                      />

                      {/* Kamera/Galleri – ingen auto-kamera */}
                      <div className="mt-3 flex gap-2">
                        <label className="flex-1 cursor-pointer rounded-xl border px-3 py-2 text-center text-sm">
                          Ta bilder
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            multiple
                            className="sr-only"
                            onChange={(e) => handleDamageFiles(i, e)}
                          />
                        </label>
                        <label className="flex-1 cursor-pointer rounded-xl border px-3 py-2 text-center text-sm">
                          Välj från galleri
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            className="sr-only"
                            onChange={(e) => handleDamageFiles(i, e)}
                          />
                        </label>
                      </div>

                      {dmg.previews?.length > 0 && (
                        <div className="mt-3 grid grid-cols-4 gap-3">
                          {dmg.previews.map((src, pIdx) => (
                            <div key={pIdx} className="relative">
                              <img src={src} alt={`Skadefoto ${pIdx + 1}`} className="h-20 w-full rounded-lg border object-cover" />
                              <button
                                type="button"
                                onClick={() => removeDamagePhoto(i, pIdx)}
                                className="absolute -top-2 -right-2 rounded-full border bg-white px-2 py-0.5 text-xs shadow"
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={addDamage}
                  className="mt-3 w-full rounded-xl border border-amber-300 bg-white/70 px-4 py-2 text-sm font-medium hover:bg-white"
                >
                  {damages.length === 0 ? "Lägg till skada" : "Lägg till ytterligare skada"}
                </button>
              </div>
            )}
          </div>

          {/* Övriga anteckningar */}
          <div className="mt-6">
            <label className="block text-sm font-medium">Övriga anteckningar</label>
            <textarea
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 placeholder-zinc-400 md:border-zinc-300 md:bg-white"
              placeholder="Övrig info..."
            />
          </div>

          {/* Spara */}
          <button
            type="submit"
            disabled={!canSubmit || submitting}
            className="mt-6 w-full rounded-2xl bg-blue-600 px-4 py-3 font-semibold text-white shadow disabled:opacity-50"
          >
            <Send className="mr-2 inline" size={18} /> {submitting ? "Sparar..." : "Spara incheckning"}
          </button>

          <div className="mt-6 text-center text-xs opacity-70">© Albarone AB {new Date().getFullYear()}</div>
        </form>
      </section>
    </main>
  );
}

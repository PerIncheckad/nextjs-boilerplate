'use client';

import { useEffect, useState } from 'react';

type GaragePrefill = {
  garage_item_id: string;
  regnr: string;
  vin: string | null;
  model: string;
  planned_station: string | null;
  station_display_name: string | null;
  supplier: string | null;
  order_reference: string | null;
  source_kind: string;
  brand: string | null;
};

function setNativeValue(element: HTMLInputElement | HTMLSelectElement, value: string) {
  const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
  descriptor?.set?.call(element, value);
  element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
}

function findFieldSelect(labelText: string): HTMLSelectElement | null {
  const labels = Array.from(document.querySelectorAll<HTMLLabelElement>('label'));
  const field = labels.find((label) => label.textContent?.includes(labelText));
  return field?.querySelector<HTMLSelectElement>('select') ?? null;
}

function applyPrefill(data: GaragePrefill): boolean {
  const regInputs = Array.from(document.querySelectorAll<HTMLInputElement>('input.reg-input'));
  const modelInput = document.querySelector<HTMLInputElement>('input[placeholder="t.ex. T-Cross"]');
  if (regInputs.length < 2 || !modelInput) return false;

  setNativeValue(regInputs[0], data.regnr);
  setNativeValue(regInputs[1], data.regnr);
  setNativeValue(modelInput, data.model || '');

  if (data.brand) {
    const brandSelect = findFieldSelect('Bilmärke');
    const brandOption = brandSelect
      ? Array.from(brandSelect.options).find((option) => option.value.toLocaleLowerCase('sv-SE') === data.brand!.toLocaleLowerCase('sv-SE') || option.text.toLocaleLowerCase('sv-SE') === data.brand!.toLocaleLowerCase('sv-SE'))
      : null;
    if (brandSelect && brandOption) setNativeValue(brandSelect, brandOption.value);
  }

  const cards = Array.from(document.querySelectorAll<HTMLElement>('.card'));
  const plannedStationCard = cards.find((card) => card.querySelector('.section-header h2')?.textContent?.trim() === 'Planerad station');
  const plannedStationSelect = plannedStationCard?.querySelector<HTMLSelectElement>('select');
  if (plannedStationSelect && (data.station_display_name || data.planned_station)) {
    const candidates = [data.station_display_name, data.planned_station].filter(Boolean) as string[];
    const option = Array.from(plannedStationSelect.options).find((value) => candidates.includes(value.value) || candidates.includes(value.text));
    if (option) setNativeValue(plannedStationSelect, option.value);
  }

  return true;
}

export default function GarageNybilPrefillBridge() {
  const [data, setData] = useState<GaragePrefill | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const garageItemId = new URLSearchParams(window.location.search).get('garage_item_id');
    if (!garageItemId) return;

    let cancelled = false;
    void fetch(`/api/garage/nybil-handoff?garage_item_id=${encodeURIComponent(garageItemId)}`, { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error ?? 'Kunde inte läsa Garage-bilen');
        if (cancelled) return;
        setData(payload.data);

        let attempts = 0;
        const tryApply = () => {
          if (cancelled) return;
          attempts += 1;
          if (applyPrefill(payload.data)) return;
          if (attempts < 20) window.setTimeout(tryApply, 50);
          else setError('Garage-data kunde läsas men formuläret kunde inte förifyllas.');
        };
        tryApply();
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Kunde inte läsa Garage-bilen');
      });

    return () => { cancelled = true; };
  }, []);

  if (!data && !error) return null;

  return (
    <div style={{ maxWidth: 700, margin: '0 auto 12px', padding: '12px 14px', borderRadius: 10, border: `1px solid ${error ? '#d33' : '#b9c4b9'}`, background: error ? '#fff1f1' : 'rgba(247,250,247,0.97)', boxSizing: 'border-box' }}>
      {error ? <strong style={{ color: '#a40000' }}>{error}</strong> : (
        <>
          <strong>Hämtad från Garaget · UTVECKLA / IN</strong>
          <div style={{ marginTop: 5, fontSize: 14 }}>
            <span><b>Reg.nr:</b> {data?.regnr}</span>
            {data?.brand ? <span> · <b>Märke:</b> {data.brand}</span> : null}
            <span> · <b>Modell:</b> {data?.model}</span>
            {data?.vin ? <span> · <b>VIN:</b> {data.vin}</span> : null}
          </div>
          {(data?.supplier || data?.order_reference) ? <div style={{ marginTop: 3, fontSize: 13, color: '#555' }}>{data.supplier ? `Leverantör: ${data.supplier}` : ''}{data.supplier && data.order_reference ? ' · ' : ''}{data.order_reference ? `Order: ${data.order_reference}` : ''}</div> : null}
          <div style={{ marginTop: 5, fontSize: 12, color: '#666' }}>Reg.nr, bilmärke, modell och planerad station förifylls i Nybils ordinarie fält och kan ändras där. Faktisk mottagningsplats och övriga kontrollpunkter verifieras fortfarande i Nybil och sätts inte av Garaget. Övrig Planering/Garage-information speglas i den redigerbara källbilden nedan. Garaget kvitteras först när Nybil-registreringen sparas.</div>
        </>
      )}
    </div>
  );
}

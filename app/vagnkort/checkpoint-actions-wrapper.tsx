'use client';

import { useEffect, useState } from 'react';
import CheckpointActionsPanel from './checkpoint-actions-panel';

type CheckpointOption = {
  checkpoint_id: string;
  checkpoint_code: string;
  status: string;
  definition: {
    title: string;
    domain: string;
  } | null;
};

type Props = {
  regnr: string;
  refreshNonce: number;
};

export default function CheckpointActionsWrapper({ regnr, refreshNonce }: Props) {
  const [checkpoints, setCheckpoints] = useState<CheckpointOption[]>([]);
  const [localRefreshNonce, setLocalRefreshNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch(
          `/api/vehicle-checkpoints/read-model?reg=${encodeURIComponent(regnr)}`,
        );
        const body = await response.json() as {
          data?: { checkpoints?: CheckpointOption[] };
        };
        if (!cancelled && response.ok) {
          setCheckpoints(body.data?.checkpoints ?? []);
        }
      } catch {
        if (!cancelled) setCheckpoints([]);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [regnr, refreshNonce, localRefreshNonce]);

  return (
    <CheckpointActionsPanel
      regnr={regnr}
      checkpoints={checkpoints}
      refreshNonce={refreshNonce + localRefreshNonce}
      onChanged={() => setLocalRefreshNonce((value) => value + 1)}
    />
  );
}

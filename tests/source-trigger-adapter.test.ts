import assert from 'node:assert/strict';
import test from 'node:test';

import {
  matchesSourceTriggerAdapter,
  validateSourceTriggerAdapter,
  type SourceTriggerAdapterDefinition,
} from '../lib/source-trigger-adapter';

const baseDefinition: SourceTriggerAdapterDefinition = {
  adapterCode: 'TEST_LAYER1_TO_PROCESS',
  adapterVersion: 1,
  sourceLayer: 'LAYER1',
  sourceSystem: 'INCHECKAD',
  sourceEntity: 'vehicle_journey_events',
  sourceEventType: 'TEST_EVENT',
  processCode: 'SALU',
  processVersion: 1,
  routineCode: 'SALU_CYCLE',
  routineVersion: 1,
  active: true,
};

test('active adapter matches exact Layer 1 source contract', () => {
  assert.equal(
    matchesSourceTriggerAdapter(baseDefinition, {
      eventId: 'event-1',
      regnr: 'ABC123',
      eventType: 'TEST_EVENT',
      sourceSystem: 'INCHECKAD',
      sourceEntity: 'vehicle_journey_events',
    }),
    true,
  );
});

test('inactive adapter cannot emit a process trigger', () => {
  assert.equal(
    matchesSourceTriggerAdapter(
      { ...baseDefinition, active: false },
      {
        eventId: 'event-1',
        regnr: 'ABC123',
        eventType: 'TEST_EVENT',
        sourceSystem: 'INCHECKAD',
        sourceEntity: 'vehicle_journey_events',
      },
    ),
    false,
  );
});

test('source event type is exact and not inferred', () => {
  assert.equal(
    matchesSourceTriggerAdapter(baseDefinition, {
      eventId: 'event-2',
      regnr: 'ABC123',
      eventType: 'OTHER_EVENT',
      sourceSystem: 'INCHECKAD',
      sourceEntity: 'vehicle_journey_events',
    }),
    false,
  );
});

test('routine identity must be configured atomically', () => {
  assert.throws(
    () => validateSourceTriggerAdapter({ ...baseDefinition, routineVersion: null }),
    /configured together/,
  );
});

test('process-only adapter is valid when routine is intentionally omitted', () => {
  assert.doesNotThrow(() =>
    validateSourceTriggerAdapter({
      ...baseDefinition,
      routineCode: null,
      routineVersion: null,
    }),
  );
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  normalizeProcessContractCode,
  validateProcessDefinition,
  validateRoutineDefinition,
} from '../lib/process-engine';

const migration = readFileSync(
  join(process.cwd(), 'migrations/20260823153000_add_process_routine_contract_v1.sql'),
  'utf8',
);

test('process and routine codes are normalized and bounded', () => {
  assert.equal(normalizeProcessContractCode(' salu_cycle '), 'SALU_CYCLE');
  assert.throws(() => normalizeProcessContractCode('x'), /Invalid process contract code/);
  assert.throws(() => normalizeProcessContractCode('bad code'), /Invalid process contract code/);
});

test('process definitions require a version, owner and supported trigger type', () => {
  assert.doesNotThrow(() => validateProcessDefinition({
    processCode: 'SALU',
    processVersion: 1,
    domain: 'SALU',
    title: 'SALU',
    ownerFunction: 'BILKONTROLL',
    triggerType: 'SOURCE_EVENT',
    triggerConfig: {},
  }));

  assert.throws(() => validateProcessDefinition({
    processCode: 'SALU',
    processVersion: 0,
    domain: 'SALU',
    title: 'SALU',
    ownerFunction: 'BILKONTROLL',
    triggerType: 'SOURCE_EVENT',
    triggerConfig: {},
  }), /Invalid process version/);
});

test('routine definitions belong to an explicit process version and sequence', () => {
  assert.doesNotThrow(() => validateRoutineDefinition({
    routineCode: 'SALU_CYCLE',
    routineVersion: 1,
    processCode: 'SALU',
    processVersion: 1,
    title: 'SALU-cykel',
    ownerFunction: 'BILKONTROLL',
    sequenceOrder: 1,
    activationType: 'PROCESS_START',
    activationConfig: {},
  }));

  assert.throws(() => validateRoutineDefinition({
    routineCode: 'SALU_CYCLE',
    routineVersion: 1,
    processCode: 'SALU',
    processVersion: 1,
    title: 'SALU-cykel',
    ownerFunction: 'BILKONTROLL',
    sequenceOrder: 0,
    activationType: 'PROCESS_START',
    activationConfig: {},
  }), /Invalid routine sequence order/);
});

test('database contract is versioned, server-only and does not create duplicate process state', () => {
  assert.match(migration, /create table public\.process_definitions/i);
  assert.match(migration, /primary key \(process_code, process_version\)/i);
  assert.match(migration, /create table public\.routine_definitions/i);
  assert.match(migration, /primary key \(routine_code, routine_version\)/i);
  assert.match(migration, /references public\.process_definitions\(process_code, process_version\)/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all on public\.process_definitions from public, anon, authenticated/i);
  assert.match(migration, /revoke all on public\.routine_definitions from public, anon, authenticated/i);
  assert.doesNotMatch(migration, /create table public\.process_instances/i);
  assert.doesNotMatch(migration, /create table public\.routine_instances/i);
});

test('first vertical contract reuses the locked SALU source rather than duplicating it', () => {
  assert.match(migration, /'SALU'[\s\S]*'SOURCE_EVENT'/i);
  assert.match(migration, /'sourceEntity', 'salu_flags'/i);
  assert.match(migration, /'sourceRecordField', 'flag_id'/i);
  assert.match(migration, /'eventType', 'SALU_FLAG_CREATED'/i);
  assert.match(migration, /'SALU_CYCLE'/i);
  assert.match(migration, /'sourceOwner', 'SALU'/i);
  assert.doesNotMatch(migration, /insert into public\.salu_flags/i);
  assert.doesNotMatch(migration, /update public\.salu_flags/i);
  assert.doesNotMatch(migration, /vehicle_journey_periods/i);
});

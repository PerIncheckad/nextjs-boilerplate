import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const migration = read('migrations/20260821013000_create_checkpoint_actions_foundation.sql');
const transitionHardening = read('migrations/20260821013100_harden_checkpoint_action_transitions.sql');
const blockingGuard = read('migrations/20260821013200_guard_checkpoint_resolution_by_blocking_actions.sql');
const api = read('app/api/checkpoint-actions/route.ts');
const readModel = read('app/api/checkpoint-actions/read-model/route.ts');
const panel = read('app/vagnkort/checkpoint-actions-panel.tsx');
const wrapper = read('app/vagnkort/checkpoint-actions-wrapper.tsx');
const metricsPanel = read('app/vagnkort/journey-metrics-panel.tsx');

test('checkpoint actions persist current projection and immutable workflow history server-side', () => {
  assert.match(migration, /create table public\.checkpoint_actions/i);
  assert.match(migration, /create table public\.checkpoint_action_events/i);
  assert.match(migration, /'CREATED'[\s\S]*'ACCEPTED'[\s\S]*'IN_PROGRESS'[\s\S]*'READY_FOR_VERIFICATION'[\s\S]*'VERIFIED'[\s\S]*'CANCELLED'/i);
  assert.match(migration, /checkpoint_action_events is append-only/i);
  assert.match(migration, /before update on public\.checkpoint_action_events/i);
  assert.match(migration, /before delete on public\.checkpoint_action_events/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all on public\.checkpoint_actions from public, anon, authenticated/i);
  assert.match(migration, /revoke all on public\.checkpoint_action_events from public, anon, authenticated/i);
  assert.match(migration, /to service_role/i);
});

test('action creation requires a real deviation assessment and appends journey history', () => {
  assert.match(migration, /function public\.create_checkpoint_action/i);
  assert.match(migration, /v_checkpoint\.status <> 'AVVIKELSE'/i);
  assert.match(migration, /from public\.checkpoint_assessments[\s\S]*status = 'AVVIKELSE'/i);
  assert.match(migration, /source_assessment_id/i);
  assert.match(migration, /'ACTION_CREATED'/i);
  assert.match(migration, /'CHECKPOINT_ACTION_CREATED'/i);
  assert.match(migration, /insert into public\.vehicle_journey_events/i);
});

test('action status transitions are constrained and preserve the actual previous status', () => {
  assert.match(transitionHardening, /function public\.transition_checkpoint_action/i);
  assert.match(transitionHardening, /v_previous_status := v_action\.status/i);
  assert.match(transitionHardening, /'CREATED' and p_next_status in \('ACCEPTED', 'CANCELLED'\)/i);
  assert.match(transitionHardening, /'ACCEPTED' and p_next_status in \('IN_PROGRESS', 'CANCELLED'\)/i);
  assert.match(transitionHardening, /'IN_PROGRESS' and p_next_status in \('READY_FOR_VERIFICATION', 'CANCELLED'\)/i);
  assert.match(transitionHardening, /'READY_FOR_VERIFICATION' and p_next_status in \('IN_PROGRESS', 'CANCELLED'\)/i);
  assert.match(transitionHardening, /Terminal checkpoint action cannot transition/i);
  assert.match(transitionHardening, /Cancellation requires a reason/i);
  assert.match(transitionHardening, /previous_status[\s\S]*v_previous_status/i);
  assert.match(transitionHardening, /'checkpoint-action-event:' \|\| v_action_event_id::text/i);
});

test('verification requires READY_FOR_VERIFICATION and creates a new checkpoint assessment', () => {
  assert.match(migration, /function public\.verify_checkpoint_action/i);
  assert.match(migration, /v_action\.status <> 'READY_FOR_VERIFICATION'/i);
  assert.match(migration, /public\.assess_vehicle_checkpoint\(/i);
  assert.match(migration, /verification_assessment_id = v_assessment_id/i);
  assert.match(migration, /'ACTION_VERIFIED'/i);
  assert.match(migration, /'CHECKPOINT_ACTION_VERIFIED'/i);
  assert.match(migration, /when p_outcome in \('ATGARDAD', 'ACCEPTERAD_AVVIKELSE'\) then 'GODKAND'/i);
  assert.match(migration, /when p_outcome = 'EJ_RELEVANT' then 'EJ_RELEVANT'/i);
  assert.match(migration, /else 'AVVIKELSE'/i);
});

test('checkpoint resolution waits until all other blocking actions are terminal', () => {
  assert.match(blockingGuard, /function public\.verify_checkpoint_action/i);
  assert.match(blockingGuard, /v_remaining_blocking_actions integer := 0/i);
  assert.match(blockingGuard, /action_id <> p_action_id/i);
  assert.match(blockingGuard, /and blocking/i);
  assert.match(blockingGuard, /status not in \('VERIFIED', 'CANCELLED'\)/i);
  assert.match(blockingGuard, /when v_remaining_blocking_actions > 0 then 'AVVIKELSE'/i);
  assert.match(blockingGuard, /remainingBlockingActions/i);
  assert.match(blockingGuard, /checkpointResolved/i);
  assert.match(blockingGuard, /checkpoint_resolved/i);
});

test('generic actions do not duplicate SALU inline actions or child processes', () => {
  assert.doesNotMatch(migration, /insert into public\.salu_inline_actions/i);
  assert.doesNotMatch(migration, /insert into public\.salu_child_processes/i);
  assert.doesNotMatch(api, /salu_inline_actions|salu_child_processes/i);
  assert.doesNotMatch(readModel, /salu_inline_actions|salu_child_processes/i);
});

test('checkpoint action API authenticates, verifies vehicle ownership and delegates to RPCs', () => {
  assert.match(api, /verifyApiUser\(request\)/);
  assert.match(api, /vehicleExists/);
  assert.match(api, /checkpointBelongsToVehicle/);
  assert.match(api, /actionBelongsToVehicle/);
  assert.match(api, /rpc\('create_checkpoint_action'/);
  assert.match(api, /rpc\('transition_checkpoint_action'/);
  assert.match(api, /rpc\('verify_checkpoint_action'/);
  assert.match(api, /Cancellation requires a reason/);
  assert.match(api, /Selected outcome requires a comment/);
});

test('action read model exposes overdue, blocking and verification-ready work without writes', () => {
  assert.match(readModel, /verifyApiUser\(request\)/);
  assert.match(readModel, /from\('checkpoint_actions'\)/);
  assert.match(readModel, /from\('checkpoint_action_events'\)/);
  assert.match(readModel, /overdue:/);
  assert.match(readModel, /blockingOpen/);
  assert.match(readModel, /readyForVerification/);
  assert.doesNotMatch(readModel, /\.(insert|update|upsert|delete)\(/);
});

test('Vagnkort makes deviation actions operational through responsibility, deadline and re-verification', () => {
  assert.match(metricsPanel, /CheckpointActionsWrapper/);
  assert.match(wrapper, /\/api\/vehicle-checkpoints\/read-model\?reg=/);
  assert.match(wrapper, /<CheckpointActionsPanel/);
  assert.match(panel, /Åtgärder och ny verifiering/);
  assert.match(panel, /Ansvarig funktion/);
  assert.match(panel, /Ansvarig person\/referens/);
  assert.match(panel, /datetime-local/);
  assert.match(panel, /Blockerar nästa steg/);
  assert.match(panel, /Acceptera/);
  assert.match(panel, /Klar för verifiering/);
  assert.match(panel, /Verifiera utfall/);
  assert.match(panel, /Försenad/);
  assert.match(panel, /Historik/);
  assert.match(panel, /selectedCheckpointId/);
  assert.match(panel, /fetch\('\/api\/checkpoint-actions'/);
  assert.match(panel, /action: 'CREATE'/);
  assert.match(panel, /action: 'TRANSITION'/);
  assert.match(panel, /action: 'VERIFY'/);
});

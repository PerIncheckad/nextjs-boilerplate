import type { MetricContractV1 } from './contracts';

const SAKNAS = 'Missing optional dimension is grouped as SAKNAS and does not remove a legitimate base observation.';

export const METRIC_CONTRACTS_V1 = [
  {
    metricId: 'CHECKIN_COMPLETED_COUNT', version: 1, name: 'Slutförda Check-ins', metricType: 'EVENT_COUNT', unit: 'COUNT',
    businessQuestion: 'How many actual Check-ins were completed in the selected period?',
    businessDefinition: 'Counts completed Check-in observations by checkins.id using completed_at for period attribution.',
    population: 'Check-in rows with status COMPLETED and usable completed_at in requested period.', observationIdentity: 'checkins.id',
    inclusions: ['status = COMPLETED', 'completed_at within [start,end)'], exclusions: ['Non-completed Check-ins'], numerator: 'NOT_APPLICABLE', denominator: 'NOT_APPLICABLE',
    sourceOwner: 'CHECKIN', sourceEntities: ['checkins'], sourceIdentityFields: ['id'], requiredSourceFields: ['id','status','completed_at'],
    sourceTruthBoundary: ['Damage rows are never a Check-in proxy.', 'created_at is not period truth.'], timeBasis: 'COMPLETION_TIME', startTime: 'NOT_APPLICABLE', endTime: 'completed_at', periodAttribution: 'completed_at',
    dimensions: [
      { id: 'checkin_completed_station', businessMeaning: 'Station recorded for the completed Check-in observation, only if completion-time source semantics are proven.', sourceSemantic: 'checkins completion-time station snapshot', historicalSemantics: 'EVENT_SNAPSHOT', missingHandling: 'SAKNAS' },
      { id: 'checkin_completed_city', businessMeaning: 'City recorded for the completed Check-in observation, only if completion-time source semantics are proven.', sourceSemantic: 'checkins completion-time city snapshot', historicalSemantics: 'EVENT_SNAPSHOT', missingHandling: 'SAKNAS' },
      { id: 'vehicle_regnr', businessMeaning: 'Vehicle registration dimension when present.', sourceSemantic: 'checkins.regnr', historicalSemantics: 'IDENTITY', missingHandling: 'SAKNAS' },
    ],
    openCaseTreatment: 'Incomplete Check-ins are excluded.', statisticalOutputs: ['count'],
    maturityRule: 'Result maturity is evaluated per requested scope. Dimension breakdown can be blocked independently if completion-time dimension semantics are not proven.',
    tracebackContract: 'result -> checkins.id -> status/completed_at -> exact source row', knownLimitations: [SAKNAS, 'Station/city breakdown must remain blocked until source semantics are proven.'],
  },
  {
    metricId: 'LAYER1_PERIOD_DURATION_HOURS', version: 1, name: 'Layer 1 periodlängd', metricType: 'COMPLETION_COHORT_DURATION', unit: 'HOURS',
    businessQuestion: 'How long was an actual closed Layer 1 primary period?', businessDefinition: 'Full duration of closed primary periods, attributed to the cohort containing ended_at.',
    population: 'Closed Layer 1 primary periods with valid chronology.', observationIdentity: 'vehicle_journey_periods.period_id', inclusions: ['closed primary period','ended_at >= started_at'], exclusions: ['activity periods','open periods'], numerator: 'NOT_APPLICABLE', denominator: 'NOT_APPLICABLE',
    sourceOwner: 'LAYER1', sourceEntities: ['vehicle_journey_periods'], sourceIdentityFields: ['period_id'], requiredSourceFields: ['period_id','period_type','started_at','ended_at'], sourceTruthBoundary: ['Open periods never receive now as fabricated completion.'],
    timeBasis: 'START_END_DURATION', startTime: 'started_at', endTime: 'ended_at', periodAttribution: 'ended_at completion cohort',
    dimensions: [
      { id: 'period_type', businessMeaning: 'Source-owned Layer 1 primary period type.', sourceSemantic: 'vehicle_journey_periods.period_type', historicalSemantics: 'EVENT_SNAPSHOT', missingHandling: 'NOT_ALLOWED' },
      { id: 'reason_code', businessMeaning: 'Source reason code for the period.', sourceSemantic: 'vehicle_journey_periods.reason_code', historicalSemantics: 'EVENT_SNAPSHOT', missingHandling: 'SAKNAS' },
      { id: 'source_system', businessMeaning: 'Source system provenance.', sourceSemantic: 'vehicle_journey_periods.source_system', historicalSemantics: 'EVENT_SNAPSHOT', missingHandling: 'SAKNAS' },
      { id: 'source_entity', businessMeaning: 'Source entity provenance.', sourceSemantic: 'vehicle_journey_periods.source_entity', historicalSemantics: 'EVENT_SNAPSHOT', missingHandling: 'SAKNAS' },
      { id: 'vehicle_regnr', businessMeaning: 'Vehicle registration dimension.', sourceSemantic: 'vehicle_journey_periods.regnr', historicalSemantics: 'IDENTITY', missingHandling: 'SAKNAS' },
    ], openCaseTreatment: 'Excluded from completed duration; no now substitution.', statisticalOutputs: ['n','sum_hours','mean_hours','median_hours','p90_hours'],
    maturityRule: 'Specific valid periods can be VERIFIED; fleet-wide historical scope is PARTIAL where source coverage is known incomplete and coverage may be null when denominator is unknown.',
    tracebackContract: 'result -> period_id -> started_at/ended_at -> source_event/source_record', knownLimitations: ['Not fleet utilization or calendar exposure.', SAKNAS],
  },
  {
    metricId: 'AVVECKLA_CASE_LEAD_TIME_HOURS', version: 1, name: 'AVVECKLA ledtid', metricType: 'CASE_LEAD_TIME', unit: 'HOURS',
    businessQuestion: 'How long from actual AVVECKLA start to verified completion?', businessDefinition: 'Duration from started_at to completed_at for completed AVVECKLA cases.',
    population: 'Completed AVVECKLA cases with valid start/end chronology and source-owned completion.', observationIdentity: 'garage_avveckla_cases.avveckla_case_id', inclusions: ['status completed','completed_at present','completed_at >= started_at'], exclusions: ['open cases'], numerator: 'NOT_APPLICABLE', denominator: 'NOT_APPLICABLE',
    sourceOwner: 'AVVECKLA', sourceEntities: ['garage_avveckla_cases'], sourceIdentityFields: ['avveckla_case_id','garage_item_id','completion_event_id'], requiredSourceFields: ['avveckla_case_id','garage_item_id','started_at','completed_at'], sourceTruthBoundary: ['Open cases have no completion cohort and are not assigned to a period.'],
    timeBasis: 'START_END_DURATION', startTime: 'started_at', endTime: 'completed_at', periodAttribution: 'completed_at completion cohort', dimensions: [
      { id: 'vehicle_regnr', businessMeaning: 'Vehicle registration dimension when present.', sourceSemantic: 'garage_avveckla_cases.regnr', historicalSemantics: 'IDENTITY', missingHandling: 'SAKNAS' },
      { id: 'garage_item_id', businessMeaning: 'Parent Garage process identity.', sourceSemantic: 'garage_avveckla_cases.garage_item_id', historicalSemantics: 'IDENTITY', missingHandling: 'NOT_ALLOWED' },
    ], openCaseTreatment: 'Open cases are not part of completion cohort; any open context requires separate as_of snapshot contract.', statisticalOutputs: ['n','mean_hours','median_hours','p90_hours'],
    maturityRule: 'VERIFIED within established source coverage; NOT_AVAILABLE before source coverage; BLOCKED on case/completion provenance conflict.', tracebackContract: 'result -> avveckla_case_id -> garage_item_id -> timestamps -> completion event', knownLimitations: ['Free-text reason is not a KPI dimension in v1.'],
  },
  {
    metricId: 'SALU_OPEN_COUNT', version: 1, name: 'Öppna SALU', metricType: 'CURRENT_STATE_COUNT', unit: 'COUNT',
    businessQuestion: 'How many SALU processes are open right now?', businessDefinition: 'Current-state count of distinct SALU flags whose status is not STÄNGD.', population: 'Current salu_flags with status != STÄNGD.', observationIdentity: 'salu_flags.flag_id', inclusions: ['status != STÄNGD'], exclusions: ['status = STÄNGD'], numerator: 'NOT_APPLICABLE', denominator: 'NOT_APPLICABLE',
    sourceOwner: 'SALU', sourceEntities: ['salu_flags'], sourceIdentityFields: ['flag_id'], requiredSourceFields: ['flag_id','status'], sourceTruthBoundary: ['Current source must not be used to fabricate historical as_of state.'], timeBasis: 'CURRENT_SNAPSHOT', startTime: 'NOT_APPLICABLE', endTime: 'NOT_APPLICABLE', periodAttribution: 'as_of snapshot', dimensions: [
      { id: 'status', businessMeaning: 'Current SALU status.', sourceSemantic: 'salu_flags.status', historicalSemantics: 'CURRENT_ONLY', missingHandling: 'NOT_ALLOWED' },
      { id: 'escalation_status', businessMeaning: 'Current SALU escalation status.', sourceSemantic: 'salu_flags.escalation_status', historicalSemantics: 'CURRENT_ONLY', missingHandling: 'SAKNAS' },
      { id: 'owner_function', businessMeaning: 'Current SALU owner function.', sourceSemantic: 'salu_flags.owner_function', historicalSemantics: 'CURRENT_ONLY', missingHandling: 'SAKNAS' },
      { id: 'vehicle_regnr', businessMeaning: 'Vehicle registration dimension.', sourceSemantic: 'salu_flags.regnr', historicalSemantics: 'IDENTITY', missingHandling: 'SAKNAS' },
    ], openCaseTreatment: 'Open cases are the population.', statisticalOutputs: ['count'], maturityRule: 'VERIFIED for complete current source snapshot; historical as_of from current projection alone is NOT_AVAILABLE.', tracebackContract: 'result -> flag_id -> current state -> source row/events', knownLimitations: ['Current snapshot only; must carry as_of.'],
  },
  {
    metricId: 'GARAGE_OPEN_IN_OWNED_COUNT', version: 1, name: 'Garage IN ägs av Garage', metricType: 'CURRENT_OWNERSHIP_COUNT', unit: 'COUNT',
    businessQuestion: 'How many inbound Garage objects does Garage still own now?', businessDefinition: 'Current count of non-voided inbound garage_items not completed and not handed off to Nybil.', population: 'garage_items with direction IN, not voided, not completed, not handed off.', observationIdentity: 'garage_items.garage_item_id', inclusions: ['garage_direction = IN','voided_at is null','completed_at is null','handed_off_nybil_id is null'], exclusions: ['Garage UT','voided','completed','handed off'], numerator: 'NOT_APPLICABLE', denominator: 'NOT_APPLICABLE',
    sourceOwner: 'GARAGE', sourceEntities: ['garage_items'], sourceIdentityFields: ['garage_item_id'], requiredSourceFields: ['garage_item_id','garage_direction','voided_at','completed_at','handed_off_nybil_id'], sourceTruthBoundary: ['regnr is never process identity.'], timeBasis: 'CURRENT_SNAPSHOT', startTime: 'NOT_APPLICABLE', endTime: 'NOT_APPLICABLE', periodAttribution: 'as_of snapshot', dimensions: [
      { id: 'garage_planned_station', businessMeaning: 'planned_station on the Garage object.', sourceSemantic: 'garage_items.planned_station', historicalSemantics: 'CURRENT_ONLY', missingHandling: 'SAKNAS' },
      { id: 'source_kind', businessMeaning: 'Garage source kind.', sourceSemantic: 'garage_items.source_kind', historicalSemantics: 'EVENT_SNAPSHOT', missingHandling: 'SAKNAS' },
      { id: 'model', businessMeaning: 'Garage object model.', sourceSemantic: 'garage_items.model', historicalSemantics: 'CURRENT_ONLY', missingHandling: 'SAKNAS' },
      { id: 'vehicle_regnr', businessMeaning: 'Vehicle registration when available.', sourceSemantic: 'garage_items.regnr', historicalSemantics: 'IDENTITY', missingHandling: 'SAKNAS' },
    ], openCaseTreatment: 'Current owned objects are the population.', statisticalOutputs: ['count'], maturityRule: 'VERIFIED for complete current ownership snapshot; BLOCKED on contradictory ownership state.', tracebackContract: 'result -> garage_item_id -> ownership fields -> source provenance', knownLimitations: ['Current snapshot only; must carry as_of.', SAKNAS],
  },
  {
    metricId: 'PLANNED_PURCHASES_REMAINING_COUNT', version: 1, name: 'BESTÄLLT kvar att materialisera', metricType: 'CROSS_SOURCE_REMAINING_COUNT', unit: 'COUNT',
    businessQuestion: 'How many already-decided BESTÄLLT units remain to materialize into actual Garage objects for an explicit planning period?', businessDefinition: 'Per planning cell: ordered_count minus active non-voided PLANERING Garage materializations linked by exact source_planning_cell_id.', population: 'Planning cells for explicit period_code plus their exact linked PLANERING garage_items.', observationIdentity: 'fleet_planning_cells.planning_cell_id', inclusions: ['explicit period_code','ordered_count from planning cell','active non-voided PLANERING garage_items with exact source_planning_cell_id'], exclusions: ['voided Garage items','other source kinds','wrong planning cell'], numerator: 'NOT_APPLICABLE', denominator: 'NOT_APPLICABLE',
    sourceOwner: 'PLANERING+GARAGE', sourceEntities: ['fleet_planning_cells','garage_items'], sourceIdentityFields: ['planning_cell_id','garage_item_id','source_planning_cell_id'], requiredSourceFields: ['planning_cell_id','period_code','ordered_count','source_planning_cell_id'], sourceTruthBoundary: ['Never infer linkage from model, station or regnr when exact source_planning_cell_id exists.', 'materialized > ordered is a source conflict and must be BLOCKED, never clamped to zero.'], timeBasis: 'BUSINESS_PERIOD_DIMENSION', startTime: 'NOT_APPLICABLE', endTime: 'NOT_APPLICABLE', periodAttribution: 'explicit period_code plus current as_of snapshot', dimensions: [
      { id: 'period_code', businessMeaning: 'Explicit source-owned planning business period.', sourceSemantic: 'fleet_planning_cells.period_code', historicalSemantics: 'BUSINESS_PERIOD', missingHandling: 'NOT_ALLOWED' },
      { id: 'model_code', businessMeaning: 'Planning model code.', sourceSemantic: 'fleet_planning_cells.model_code', historicalSemantics: 'BUSINESS_PERIOD', missingHandling: 'SAKNAS' },
      { id: 'planning_station', businessMeaning: 'Station on the planning cell.', sourceSemantic: 'fleet_planning_cells.station', historicalSemantics: 'BUSINESS_PERIOD', missingHandling: 'SAKNAS' },
      { id: 'planning_cell_id', businessMeaning: 'Planning cell identity.', sourceSemantic: 'fleet_planning_cells.planning_cell_id', historicalSemantics: 'IDENTITY', missingHandling: 'NOT_ALLOWED' },
    ], openCaseTreatment: 'Not applicable; this is current remaining state within explicit period_code.', statisticalOutputs: ['remaining_count','ordered_count','materialized_count'], maturityRule: 'VERIFIED when planning cells and exact materialization provenance are complete and materialized <= ordered; BLOCKED on invariant violation; PARTIAL when relevant materializations lack trustworthy provenance.', tracebackContract: 'total -> planning_cell_id -> ordered_count -> linked garage_item_ids -> source_planning_cell_id', knownLimitations: ['Requires explicit period_code.', 'Current value must carry as_of.', 'No implicit active/latest planning period.'],
  },
] as const satisfies readonly MetricContractV1[];

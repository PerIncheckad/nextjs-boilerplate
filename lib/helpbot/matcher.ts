import type { KnowledgeId } from './registry-v1';

export type HelpbotRoutingContext = Readonly<{
  processType?: string;
  flow?: string;
}>;

type RouteDefinition = Readonly<{
  knowledgeId: KnowledgeId;
  phrases: readonly string[];
}>;

// Routing metadata only. It points to existing knowledge IDs and contains no business answers.
const ROUTES: readonly RouteDefinition[] = [
  { knowledgeId: 'KR-GUIDE-001', phrases: ['vad gör jag nu', 'vad gor jag nu', 'vilken modul', 'vart ska jag gå'] },
  { knowledgeId: 'KR-PLAN-001', phrases: ['beställt i planering', 'bestallt i planering', 'ordered count', 'planering klar', 'planering garage in'] },
  { knowledgeId: 'KR-GAR-001', phrases: ['garage post reg nr', 'garage post regnr', 'garage utan reg nr', 'garage utan regnr', 'garage item id', 'garage processidentitet', 'måste en garage post ha regnr', 'måste en garage post ha reg nr', 'maste en garage post ha regnr', 'maste en garage post ha reg nr'] },
  { knowledgeId: 'KR-NYB-001', phrases: ['garage till nybil', 'garage nybil', 'öppna ny bil från garage', 'oppna ny bil fran garage', 'source garage item id'] },
  { knowledgeId: 'KR-CHECK-001', phrases: ['check in klar available', 'check in available', 'incheckning klar available', 'incheckning available', 'check in downtime', 'incheckning downtime', 'klar samma sak som available'] },
  { knowledgeId: 'KR-STATUS-001', phrases: ['status mätare', 'status matare', 'mätarställning current', 'matarstallning current', 'fysisk plats current', 'senaste verifierade observation'] },
  { knowledgeId: 'KR-STATUS-002', phrases: ['saludatum i status', 'ändra saludatum i status', 'andra saludatum i status', 'aktuellt saludatum'] },
  { knowledgeId: 'KR-SALU-001', phrases: ['salu v2', 'sista incheckning', 'buhs', 'salu garage ut', 'säljas garage ut', 'saljas garage ut'] },
  { knowledgeId: 'KR-AVV-001', phrases: ['start avveckla', 'garage ut start avveckla', 'avveckla startgräns', 'avveckla startgrans'] },
  { knowledgeId: 'KR-AVV-002', phrases: ['terminalt ut', 'avveckla terminalt ut', 'avveckla completion', 'avveckla completed'] },
  { knowledgeId: 'KR-INH-001', phrases: ['inhyrd intag', 'inhyrd retur', 'inhyrd bil'] },
  { knowledgeId: 'KR-ORDER-001', phrases: ['individuell beställning', 'individuell bestallning', 'beställt betyder beställd', 'bestallt betyder bestalld', 'leverantörsavrop', 'leverantorsavrop', 'calloff at'] },
  { knowledgeId: 'KR-ORDER-002', phrases: ['beställd bekräftad på väg', 'bestalld bekraftad pa vag', 'order skickad', 'order state machine', 'order state machine ankommen', 'order transport state machine'] },
  { knowledgeId: 'KR-HIST-604-PRE', phrases: ['pre 604', 'före 604', 'fore 604', 'gap a 604', 'gap b 604', 'gap c 604', 'gamla 604 gap'] },
] as const;

export function normalizeHelpbotText(value: string): string {
  return value
    .toLocaleLowerCase('sv-SE')
    .normalize('NFKC')
    .replace(/[._/#:→–—-]+/g, ' ')
    .replace(/[^a-z0-9åäöéü\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchKnowledgeIds(question: string): readonly KnowledgeId[] {
  const normalized = normalizeHelpbotText(question);
  if (!normalized) return [];

  // SALU V2 markers are deliberately routed only to the stale Registry V1 SALU item.
  // They must never fall through to generic AVVECKLA knowledge and reconstruct missing V2 semantics.
  const saluV2Markers = ['salu v2', 'sista incheckning', 'buhs'];
  if (saluV2Markers.some((marker) => normalized.includes(marker))) return ['KR-SALU-001'];

  const matches = new Set<KnowledgeId>();
  for (const route of ROUTES) {
    if (route.phrases.some((phrase) => normalized.includes(normalizeHelpbotText(phrase)))) {
      matches.add(route.knowledgeId);
    }
  }
  return [...matches];
}

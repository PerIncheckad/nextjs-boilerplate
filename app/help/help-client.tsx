'use client';

import { FormEvent, useState } from 'react';
import { authenticatedApiFetch } from '@/lib/api-auth-client';
import type { HelpbotResponse } from '@/lib/helpbot/runtime';
import styles from './help.module.css';

const EXAMPLES = [
  'måste en Garage-post ha regnr?',
  'Är Check-in klar samma sak som AVAILABLE?',
] as const;

export default function HelpClient() {
  const [question, setQuestion] = useState('');
  const [processType, setProcessType] = useState('');
  const [flow, setFlow] = useState('');
  const [result, setResult] = useState<HelpbotResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed) return;

    setLoading(true);
    setError('');
    setResult(null);
    try {
      const routingContext: Record<string, string> = {};
      if (processType.trim()) routingContext.processType = processType.trim();
      if (flow.trim()) routingContext.flow = flow.trim();

      const response = await authenticatedApiFetch('/api/helpbot/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: trimmed,
          routingContext: Object.keys(routingContext).length ? routingContext : undefined,
        }),
      });

      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'Hjälpen kunde inte läsa frågan.');
      setResult(payload as HelpbotResponse);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Hjälpen är inte tillgänglig.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className={styles.workspace} aria-label="INCHECKAD Hjälp">
      <form className={styles.askCard} onSubmit={submit}>
        <div className={styles.labelRow}>
          <label htmlFor="helpbot-question">FRÅGA INCHECKAD</label>
          <span>READ / EXPLAIN / GUIDE</span>
        </div>
        <textarea
          id="helpbot-question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          maxLength={600}
          rows={3}
          placeholder="Skriv en fråga om hur INCHECKAD fungerar…"
        />

        <details className={styles.contextDetails}>
          <summary>Routing context vid behov</summary>
          <div className={styles.contextGrid}>
            <label>
              Process
              <input value={processType} onChange={(event) => setProcessType(event.target.value)} placeholder="t.ex. garage" />
            </label>
            <label>
              Flöde
              <input value={flow} onChange={(event) => setFlow(event.target.value)} placeholder="intag eller retur" />
            </label>
          </div>
        </details>

        <div className={styles.actions}>
          <button type="submit" disabled={loading || !question.trim()}>
            {loading ? 'Kontrollerar…' : 'Fråga'}
          </button>
          <div className={styles.examples} aria-label="Exempelfrågor">
            {EXAMPLES.map((example) => (
              <button key={example} type="button" onClick={() => setQuestion(example)}>{example}</button>
            ))}
          </div>
        </div>
      </form>

      {error ? <div className={styles.error}>{error}</div> : null}

      {result ? (
        <article className={styles.answerCard} data-outcome={result.outcome}>
          <div className={styles.answerHeader}>
            <span>{result.outcome}</span>
            <strong>{result.policy ?? 'FAIL CLOSED'}</strong>
          </div>
          <p className={styles.answer}>{result.answer ?? result.message}</p>

          {result.requiresContext.length ? (
            <div className={styles.contextNotice}>
              <strong>KRÄVER CONTEXT</strong>
              <span>{result.requiresContext.join(' · ')}</span>
            </div>
          ) : null}

          <div className={styles.evidence}>
            <div>
              <span>KNOWLEDGE ID</span>
              <strong>{result.knowledgeIds.length ? result.knowledgeIds.join(', ') : 'INGEN VERIFIERAD TRÄFF'}</strong>
            </div>
            {result.evidence.map((item) => (
              <div key={item.knowledgeId} className={styles.evidenceItem}>
                <span>KÄLLA / EVIDENS</span>
                <code>{item.authorityReference}</code>
                <small>Registry {item.registryRevision} · {item.registryStatus}</small>
              </div>
            ))}
            <div>
              <span>STATUS</span>
              <strong>{result.reasonCode}</strong>
            </div>
          </div>
        </article>
      ) : null}
    </section>
  );
}

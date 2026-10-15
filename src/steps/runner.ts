import { test, type TestInfo } from '@playwright/test';
import type { Checks } from '../utils/checks';
import { sleep } from '../utils/text';
import type { Step, StepContext, StepOutcome } from './step';

export interface StepLogEntry {
  at: string;
  step: string;
  event: 'start' | 'log' | 'pass' | 'fail' | 'error' | 'retry';
  message: string;
  data?: Record<string, unknown>;
  ms?: number;
}

/** No argument for steps without input. */
type Args<I> = [I] extends [void] ? [] : [I];

export interface StepResult<O> extends StepOutcome<O> {
  ms: number;
}

/**
 * Runs steps uniformly: one Playwright step each (visible in the report/trace), structured logs to the console
 * and to `steps.jsonl`, timing, evidence attachments, a PASS/FAIL row per step, controlled retries for
 * retryable steps, and fault isolation (an exception becomes a FAIL result instead of crashing the journey).
 */
export class StepRunner {
  readonly entries: StepLogEntry[] = [];

  constructor(
    private readonly services: Omit<StepContext, 'log'>,
    private readonly checks: Checks,
    private readonly testInfo: TestInfo,
    private readonly opts: { retries?: number; quiet?: boolean } = {},
  ) {}

  /** Runs a step; the journey continues even if it fails (soft). Steps without input take no argument. */
  async run<I, O>(step: Step<I, O>, ...[input]: Args<I>): Promise<StepResult<O>> {
    return test.step(`${step.id} — ${step.title}`, () => this.execute(step, input as I));
  }

  /** Runs a step the journey cannot continue without: stops the test if it fails. */
  async must<I, O>(step: Step<I, O>, ...args: Args<I>): Promise<StepResult<O> & { data: O }> {
    const r = await this.run(step, ...args);
    if (!r.ok || r.data === undefined) throw new Error(`Required step ${step.id} failed: ${r.detail}`);
    return r as StepResult<O> & { data: O };
  }

  private async execute<I, O>(step: Step<I, O>, input: I): Promise<StepResult<O>> {
    const ctx: StepContext = { ...this.services, log: (message, data) => this.emit(step.id, 'log', message, data) };
    this.emit(step.id, 'start', step.title, summarize(input));
    const attempts = step.retryable ? 1 + (this.opts.retries ?? 2) : 1;
    const start = Date.now();
    let outcome: StepOutcome<O> = { ok: false, detail: 'not run' };
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        outcome = await step.run(ctx, input);
      } catch (e) {
        const message = (e as Error).message.split('\n')[0];
        this.emit(step.id, 'error', message);
        outcome = { ok: false, detail: `error: ${message}` };
      }
      if (outcome.ok || attempt === attempts) break;
      this.emit(step.id, 'retry', `attempt ${attempt} failed: ${outcome.detail}`);
      await sleep(500 * attempt); // adaptive pause before retrying a read/navigation
    }
    const ms = Date.now() - start;
    const evidence: string[] = [];
    for (const ev of outcome.evidence ?? []) evidence.push(await this.checks.image(`${step.id} · ${ev.name}`, ev.png));
    this.emit(step.id, outcome.ok ? 'pass' : 'fail', outcome.detail, summarize(outcome.data), ms);
    await this.checks.check(`step.${step.id}`, step.title, outcome.ok, 'validated on screen', `${outcome.detail} (${(ms / 1000).toFixed(1)}s)`, { evidence });
    return { ...outcome, ms };
  }

  private emit(step: string, event: StepLogEntry['event'], message: string, data?: Record<string, unknown>, ms?: number) {
    const entry: StepLogEntry = { at: new Date().toISOString(), step, event, message, data, ms };
    this.entries.push(entry);
    if (this.opts.quiet) return;
    const icon = { start: '▶', log: '·', pass: '✓', fail: '✗', error: '!', retry: '↻' }[event];
    const time = entry.at.slice(11, 19);
    const extra = data && Object.keys(data).length ? ` ${JSON.stringify(data)}` : '';
    console.log(`${time} ${icon} [${step}] ${message}${ms !== undefined ? ` (${(ms / 1000).toFixed(1)}s)` : ''}${extra}`);
  }

  /** Attaches the whole structured log to the test (called by the fixture at the end). */
  async attachLog(): Promise<void> {
    if (!this.entries.length) return;
    await this.testInfo.attach('steps.jsonl', { body: this.entries.map((e) => JSON.stringify(e)).join('\n'), contentType: 'application/x-ndjson' });
  }
}

/** Loggable view of a step's input/output: numbers and short strings only (no buffers, no secrets). */
function summarize(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object') return value === undefined ? undefined : { value };
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v === null || ['number', 'boolean'].includes(typeof v)) out[k] = v;
    else if (typeof v === 'string') out[k] = v.length > 120 ? `${v.slice(0, 120)}…` : v;
    else if (v && typeof v === 'object' && 'amount' in v) {
      const m = v as { amount: number; currency?: string | null };
      out[k] = `${m.amount.toFixed(2)} ${m.currency ?? '?'}`;
    }
  }
  return Object.keys(out).length ? out : undefined;
}

import { test, type TestInfo } from '@playwright/test';
import { BLANK_PAGE_WHY, explain } from '../reporter/explain';
import { evaluateRequirements, requirementSetsFor, type RequirementSet } from '../reporter/step-requirements';
import type { Checks } from '../utils/checks';
import { sleep } from '../utils/text';
import { isBlank } from '../vision/game-screen';
import type { Step, StepContext, StepOutcome } from './step';

const ICONS = { start: '▶', log: '·', pass: '✓', fail: '✗', error: '!', retry: '↻' } as const;

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
    private readonly opts: {
      retries?: number;
      quiet?: boolean;
      /** Requirement sets per step id (tests inject their own; default: the src/reporter/requirements folder). */
      requirements?: (stepId: string) => RequirementSet[];
    } = {},
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
    const firstEntry = this.entries.length;
    this.emit(step.id, 'start', step.title, summarize(input));
    const attempts = step.retryable ? 1 + (this.opts.retries ?? 2) : 1;
    const start = Date.now();
    let outcome: StepOutcome<O> = { ok: false, detail: 'not run' };
    let error: string | undefined;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      error = undefined;
      try {
        outcome = await step.run(ctx, input);
      } catch (e) {
        const message = (e as Error).message.split('\n')[0];
        this.emit(step.id, 'error', message);
        // keep the full text (Playwright's call log says WHAT it was waiting for) for the report's "why"
        error = (e as Error).message;
        outcome = { ok: false, detail: `error: ${message}` };
      }
      if (outcome.ok || attempt === attempts) break;
      this.emit(step.id, 'retry', `attempt ${attempt} failed: ${outcome.detail}`);
      await sleep(500 * attempt); // adaptive pause before retrying a read/navigation
    }
    const ms = Date.now() - start;
    this.emit(step.id, outcome.ok ? 'pass' : 'fail', outcome.detail, summarize(outcome.data), ms);
    await this.report(step, input, outcome, ms, error, firstEntry);
    return { ...outcome, ms };
  }

  /**
   * One report row per requirement (src/reporter/requirements). Screenshots, why and log lines only for the
   * failing ones (EVIDENCE=all also attaches them on success); passing rows are just counted in the report.
   */
  private async report<I, O>(step: Step<I, O>, input: I, outcome: StepOutcome<O>, ms: number, error: string | undefined, firstEntry: number) {
    const run = { step: { id: step.id, title: step.title }, input, outcome, error, ms, market: this.services.market };
    let results = evaluateRequirements(run, this.opts.requirements ? this.opts.requirements(step.id) : requirementSetsFor(step.id));
    // safety net: a step is never left without a row (e.g. the requirements folder could not be loaded)
    if (!results.length) results = [{ what: step.title, status: outcome.ok ? 'pass' : 'fail', expected: step.title, observed: outcome.detail }];
    const failed = results.filter((r) => r.status === 'fail');
    const skipped = results.filter((r) => r.status === 'skipped');

    let evidence: string[] = [];
    let blank = false;
    if (failed.length || process.env.EVIDENCE === 'all') {
      for (const ev of outcome.evidence ?? []) evidence.push(await this.checks.image(`${step.id} · ${ev.name}`, ev.png));
      if (failed.length && !evidence.length) {
        // the step brought no screenshot: take the page as the player sees it (personal data masked)
        const shot = await this.services.site?.maskedScreenshot().catch(() => undefined);
        if (shot) {
          evidence.push(await this.checks.image(`${step.id} · pantalla`, shot));
          blank = !!(await isBlank(shot).catch(() => undefined))?.blank;
        }
      }
    }
    // a thrown error explains itself best from its full text (Playwright's call log says what it waited for)
    const whyOf = (observed: string) => (blank ? BLANK_PAGE_WHY : error ? explain(error) : (explain(observed) ?? explain(outcome.detail)));
    const log = failed.length ? this.tail(step.id, firstEntry) : undefined;
    const note = skipped.length ? `${skipped.length} requisito(s) no evaluado(s): ${skipped[0].reason}` : undefined;

    for (const [i, r] of results.entries()) {
      if (r.status === 'skipped') continue;
      const fail = r.status === 'fail';
      await this.checks.check(`${step.id}#${i + 1}`, r.what, !fail, r.expected, fail ? r.observed : `${r.observed} (${(ms / 1000).toFixed(1)}s)`, {
        step: step.id,
        ...(fail ? { evidence, why: whyOf(r.observed), log, note } : {}),
      });
      if (fail) evidence = []; // the screenshots go on the first failing card only
    }
  }

  /** Last log lines of a step's execution, formatted like the console. */
  private tail(stepId: string, from: number, lines = 6): string[] {
    return this.entries
      .slice(from)
      .filter((e) => e.step === stepId && ['log', 'error', 'retry'].includes(e.event))
      .slice(-lines)
      .map((e) => `${e.at.slice(11, 19)} ${ICONS[e.event]} ${e.message}${e.data && Object.keys(e.data).length ? ` ${JSON.stringify(e.data)}` : ''}`);
  }

  private emit(step: string, event: StepLogEntry['event'], message: string, data?: Record<string, unknown>, ms?: number) {
    const entry: StepLogEntry = { at: new Date().toISOString(), step, event, message, data, ms };
    this.entries.push(entry);
    if (this.opts.quiet) return;
    const icon = ICONS[event];
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

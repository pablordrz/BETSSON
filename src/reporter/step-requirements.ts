/**
 * Step requirements — what every step MUST satisfy, declared outside the (frozen) steps.
 *
 * Adding a check = adding ONE file to src/reporter/requirements/ that default-exports `requirementsFor(step, [...])`
 * (or `forEveryStep([...])`). The folder is discovered at runtime: no index to update, no runner or report change.
 * The runner evaluates them after each step; failures become report cards with screenshot, expected, observed, why
 * and the step's last log lines; passes only count towards "N comprobaciones correctas".
 */
import fs from 'node:fs';
import path from 'node:path';
import type { MarketConfig } from '../config/markets';
import type { Step, StepOutcome } from '../steps/step';

/** What a requirement sees of one step execution: never the step's internals, only its contract. */
export interface StepRun<I, O> {
  step: { id: string; title: string };
  input: I;
  outcome: StepOutcome<O>;
  /** Text of the exception thrown by the step, if it threw. */
  error?: string;
  ms: number;
  /** Market under test (currency, language). Absent in offline tests. */
  market?: MarketConfig;
}

/** Step-specific requirements only run when the step returned data, so `data` is always there. */
export interface StepRunWithData<I, O> extends StepRun<I, O> {
  data: O;
}

export interface Requirement<R = StepRun<unknown, unknown>> {
  /** What must hold, in player terms. Report card title. */
  what: string;
  check: (run: R) => boolean;
  /** What was actually observed (report "Observado"). Defaults to the step's detail. */
  observed?: (run: R) => string;
  /** Expected value as text (report "Esperado"). Defaults to `what`. */
  expected?: string | ((run: R) => string);
  /** If it fails, the requirements after it are not evaluated (shown as "no evaluados"). */
  blocking?: boolean;
  /** Catch-all: only reported as a failure when no other requirement of the step failed. */
  fallback?: boolean;
}

export interface RequirementSet {
  /** Step id, or '*' for every step. */
  stepId: string;
  /** Whether the requirements need the step's output data (step-specific ones do). */
  needsData: boolean;
  requirements: Requirement<any>[];
  /** File it came from (set by the registry, for error messages). */
  source?: string;
}

/** Requirements of one step. `run.data` is typed from the step's output. */
export function requirementsFor<I, O>(step: Step<I, O>, requirements: Requirement<StepRunWithData<I, O>>[]): RequirementSet {
  return { stepId: step.id, needsData: true, requirements };
}

/** Requirements every step must satisfy (they also run when the step returned no data). */
export function forEveryStep(requirements: Requirement<StepRun<unknown, unknown>>[]): RequirementSet {
  return { stepId: '*', needsData: false, requirements };
}

/** Shorthand: `must('Moneda EUR', (r) => r.data.credit.currency === 'EUR', (r) => \`leído: ${r.data.credit.currency}\`)`. */
export const must = <R>(what: string, check: (run: R) => boolean, observed?: (run: R) => string, extra: Omit<Requirement<R>, 'what' | 'check' | 'observed'> = {}): Requirement<R> => ({
  what,
  check,
  observed,
  ...extra,
});

export const REQUIREMENTS_DIR = path.join(__dirname, 'requirements');

let loaded: RequirementSet[] | undefined;

/** Loads every requirement file of the folder (*.ts / *.js, each `export default requirementsFor(...)`). */
export function loadRequirements(dir = REQUIREMENTS_DIR): RequirementSet[] {
  if (!fs.existsSync(dir)) return [];
  const files = fs
    .readdirSync(dir)
    .filter((f) => /\.(ts|js)$/.test(f) && !f.endsWith('.d.ts'))
    .sort();
  return files.map((file) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const set = require(path.join(dir, file)).default as RequirementSet | undefined;
    if (!set || typeof set.stepId !== 'string' || !Array.isArray(set.requirements)) {
      throw new Error(`${file}: must "export default requirementsFor(step, [...])" or "export default forEveryStep([...])"`);
    }
    return { ...set, source: file };
  });
}

/** Requirements that apply to a step: the ones for every step first, then its own. */
export function requirementSetsFor(stepId: string, sets: RequirementSet[] = (loaded ??= loadRequirements())): RequirementSet[] {
  return [...sets.filter((s) => s.stepId === '*'), ...sets.filter((s) => s.stepId === stepId)];
}

export type RequirementStatus = 'pass' | 'fail' | 'skipped';

export interface RequirementResult {
  what: string;
  status: RequirementStatus;
  expected: string;
  observed: string;
  /** Why it was not evaluated (status 'skipped'). */
  reason?: string;
}

/**
 * Evaluates the requirements of one step execution. Order matters: a failing `blocking` requirement skips the
 * rest, and a failing `fallback` requirement is dropped when a more specific one already explains the failure.
 */
export function evaluateRequirements(run: StepRun<unknown, unknown>, sets: RequirementSet[]): RequirementResult[] {
  const results: Array<RequirementResult & { fallback?: boolean }> = [];
  let blockedBy: string | undefined;
  for (const set of sets) {
    for (const req of set.requirements) {
      const expected = typeof req.expected === 'function' ? safe(() => (req.expected as (r: unknown) => string)(run), req.what) : (req.expected ?? req.what);
      if (blockedBy) {
        results.push({ what: req.what, status: 'skipped', expected, observed: '', reason: `no evaluado: falló «${blockedBy}»` });
        continue;
      }
      if (set.needsData && run.outcome.data === undefined) {
        results.push({ what: req.what, status: 'skipped', expected, observed: '', reason: 'no evaluado: el paso no devolvió datos' });
        continue;
      }
      const r = set.needsData ? { ...run, data: run.outcome.data } : run;
      let pass: boolean;
      let observed: string;
      try {
        pass = !!req.check(r);
        observed = req.observed ? safe(() => req.observed!(r), run.outcome.detail) : run.outcome.detail;
      } catch (e) {
        pass = false;
        observed = `la comprobación no se pudo evaluar: ${(e as Error).message}`;
      }
      results.push({ what: req.what, status: pass ? 'pass' : 'fail', expected, observed, fallback: req.fallback });
      if (!pass && req.blocking) blockedBy = req.what;
    }
  }
  const specificFailed = results.some((r) => r.status === 'fail' && !r.fallback);
  return results.filter((r) => !(r.fallback && r.status === 'fail' && specificFailed)).map(({ fallback: _f, ...r }) => r);
}

function safe(fn: () => string, fallback: string): string {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

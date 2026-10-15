import type { GameLayout } from '../config/game-layout';
import { allGameTexts, type GameText } from '../config/game-text';
import type { MarketConfig } from '../config/markets';
import { detectCurrency, moneyEq, round2, type Money } from '../utils/money';
import { normalize, sleep } from '../utils/text';
import type { Mark } from './annotate';
import type { ScreenTarget } from './controls/screen-target';
import { cropRel, type GameScreen } from './game-screen';
import { unionBox, type Box, type Ocr, type OcrResult, type OcrRow } from './ocr';

/** Pragmatic HUD text (yellow labels, white amounts) is brighter than this on any game artwork. */
const HUD_TEXT_THRESHOLD = 210;

type LabelKind = 'credit' | 'bet' | 'win';
const KINDS: LabelKind[] = ['credit', 'bet', 'win'];

export interface HudValue {
  value: Money | null;
  /** True if the label was written in the market's expected language. */
  expectedLanguage: boolean;
  labelText: string;
  box: Box;
}

export interface HudReading {
  credit: HudValue | null;
  bet: HudValue | null;
  win: HudValue | null;
  /** Full canvas screenshot this reading was taken from. */
  frame: Buffer;
  ocr: OcrResult;
  marks: Mark[];
}

const anyLabel = (kind: LabelKind) => allGameTexts.map((t) => t[kind]);
const isAnyLabel = (t: string) => KINDS.some((k) => anyLabel(k).some((re) => re.test(t)));

/**
 * Strict HUD amount: the game always paints money with exactly two decimals ("96,76 €", "0,20 €", "1.234,56 €").
 * Anything else (round ids, clock "18:45", glued digit runs) is NOT money. Tolerates two usual OCR slips:
 * ";" read for the decimal comma ("0;20") and the "€" sign read as a trailing 0/O ("95,760" = "95,76 €").
 */
export function parseHudAmount(text: string): Money | null {
  const cleaned = text.replace(/(?<=\d)[Oo](?=[\d.,;])|(?<=[\d.,;])[Oo](?=\d)/g, '0');
  const re = /(?<![\d.,;:])(\d{1,3}(?:[.,]\d{3})*|\d{1,7})[,.;] ?(\d{2})(?:([0O])(?![\d]))?(?![\d.,;:]\d)/g;
  for (const m of cleaned.matchAll(re)) {
    const amount = round2(Number(`${m[1].replace(/[.,]/g, '')}.${m[2]}`));
    if (Number.isNaN(amount)) continue;
    const currency = detectCurrency(text) ?? (m[3] ? 'EUR' : null);
    return { amount, currency, raw: text.trim() };
  }
  return null;
}

/** Finds "<LABEL> <amount>" pairs in OCR rows (value on the same row, or right below the label). */
export function parseHud(rows: OcrRow[], gameText: GameText): Record<LabelKind, HudValue | null> {
  const out: Record<LabelKind, HudValue | null> = { credit: null, bet: null, win: null };
  rows.forEach((row, r) => {
    row.words.forEach((word, i) => {
      const nw = normalize(word.text);
      for (const kind of KINDS) {
        const res = anyLabel(kind);
        const match = res.map((re) => nw.match(re)).find(Boolean);
        if (!match) continue;
        const expectedLanguage = gameText[kind].test(nw);
        // value on the same row: rest of this word + following words up to the next label
        const glued = nw.slice(match[0].length);
        const tail: typeof row.words = [];
        for (let j = i + 1; j < row.words.length; j++) {
          if (isAnyLabel(normalize(row.words[j].text))) break;
          tail.push(row.words[j]);
        }
        let valueText = [glued, ...tail.map((w) => w.text)].join(' ').trim();
        let value = parseHudAmount(valueText);
        let valueBoxes = tail.map((w) => w.box);
        // value below the label (stacked layout)
        if (!value && rows[r + 1]) {
          // the row below may be another label's row ("APUESTA 0,20 €"): its words from that label on are not ours
          const firstLabel = rows[r + 1].words.findIndex((w) => isAnyLabel(normalize(w.text)));
          const below = rows[r + 1].words.slice(0, firstLabel === -1 ? undefined : firstLabel).filter((w) => {
            const cx = w.box.x + w.box.w / 2;
            return cx > word.box.x - word.box.w && cx < word.box.x + word.box.w * 4;
          });
          valueText = below.map((w) => w.text).join(' ');
          value = parseHudAmount(valueText);
          valueBoxes = below.map((w) => w.box);
        }
        const candidate: HudValue = {
          value,
          expectedLanguage,
          labelText: word.text,
          box: unionBox([word.box, ...valueBoxes]),
        };
        const prev = out[kind];
        if (!prev || (!prev.value && value)) out[kind] = candidate;
      }
    });
  });
  return out;
}

/**
 * Fallback when the labels are not readable but the amounts are (yellow labels on light artwork, e.g. Helios Triple
 * Sun): the HUD's left block shows CREDIT on the upper row and BET on the row below, each row with ONE strict amount
 * and its currency. Rows with two amounts (labels and values on one line, as on Triple Hop Pots) are not used.
 */
export function parseHudByPosition(rows: OcrRow[]): { credit: Money; bet: Money; boxes: [Box, Box] } | null {
  const found: Array<{ money: Money; box: Box }> = [];
  for (const row of [...rows].sort((a, b) => a.box.y - b.box.y)) {
    const amounts = [...row.text.matchAll(/\d[\d.,;]* ?\d/g)].filter((m) => parseHudAmount(m[0]));
    if (amounts.length !== 1) continue;
    const money = parseHudAmount(row.text);
    if (money?.currency) found.push({ money, box: row.box });
  }
  if (found.length < 2) return null;
  const [credit, bet] = found;
  if (!(bet.money.amount > 0)) return null;
  return { credit: credit.money, bet: bet.money, boxes: [credit.box, bet.box] };
}

/** Preprocessings tried in order; the first is the one that reads Triple Hop Pots, the others only if it fails. */
const HUD_VARIANTS: Array<{ leftBlock: boolean; brightTextThreshold?: number }> = [
  { leftBlock: false, brightTextThreshold: HUD_TEXT_THRESHOLD },
  { leftBlock: false },
  { leftBlock: true, brightTextThreshold: HUD_TEXT_THRESHOLD },
  { leftBlock: true, brightTextThreshold: 170 },
  { leftBlock: true, brightTextThreshold: 150 },
  { leftBlock: true },
];

export async function readHud(
  game: GameScreen,
  ocr: Ocr,
  market: MarketConfig,
  layout: GameLayout,
  frame?: Buffer,
): Promise<HudReading> {
  const full = frame ?? (await game.capture());
  const h = layout.hud;
  const leftBlock = { x: h.x, y: h.y + h.h * 0.25, w: h.w * 0.6, h: h.h * 0.75 };
  const crops = new Map<boolean, Awaited<ReturnType<typeof cropRel>>>();
  let result!: OcrResult;
  // each value is kept from the first preprocessing that reads it with its label: CREDIT may come from one pass
  // and BET from another (a missed label must not throw away the value that WAS read)
  const parsed: ReturnType<typeof parseHud> = { credit: null, bet: null, win: null };
  let byPosition: (ReturnType<typeof parseHudByPosition> & { result: OcrResult }) | null = null;
  const labelsSeen = { credit: false, bet: false };
  for (const v of HUD_VARIANTS) {
    if (!crops.has(v.leftBlock)) crops.set(v.leftBlock, await cropRel(full, v.leftBlock ? leftBlock : h));
    const { png, box } = crops.get(v.leftBlock)!;
    const r = await ocr.read(png, market.ocrLang, { scale: 3, offset: { x: box.x, y: box.y }, brightTextThreshold: v.brightTextThreshold });
    result ??= r;
    const p = parseHud(r.rows, market.gameText);
    for (const k of KINDS) {
      if (p[k]?.value && !parsed[k]?.value) parsed[k] = p[k];
      else if (p[k] && !parsed[k]) parsed[k] = p[k]; // label seen without a value: kept for the marks
    }
    if (parsed.credit?.value && parsed.bet?.value) break;
    // label words seen in any preprocessing (soft evidence of the language when the amounts come by position)
    for (const k of ['credit', 'bet'] as const) {
      if (r.words.some((w) => market.gameText[k].test(normalize(w.text)))) labelsSeen[k] = true;
    }
    if (v.leftBlock && !byPosition) {
      const pos = parseHudByPosition(r.rows);
      if (pos) byPosition = { ...pos, result: r };
    }
    if (byPosition && labelsSeen.credit && labelsSeen.bet) break;
  }
  // amounts still missing: CREDIT is the upper row of the left block, BET the row below
  if (byPosition && !(parsed.credit?.value && parsed.bet?.value)) {
    result = byPosition.result;
    if (!parsed.credit?.value) parsed.credit = { value: byPosition.credit, expectedLanguage: labelsSeen.credit, labelText: '(upper row)', box: byPosition.boxes[0] };
    if (!parsed.bet?.value) parsed.bet = { value: byPosition.bet, expectedLanguage: labelsSeen.bet, labelText: '(row below)', box: byPosition.boxes[1] };
  }
  const { box } = crops.get(false) ?? (await cropRel(full, h));
  const marks: Mark[] = [{ box, label: 'HUD region', color: '#888888' }];
  for (const k of KINDS) {
    const v = parsed[k];
    if (v) marks.push({ box: v.box, label: `${k.toUpperCase()}: ${v.value ? v.value.amount.toFixed(2) + ' ' + (v.value.currency ?? '?') : '?'}`, color: v.value ? '#00e676' : '#ff9100' });
  }
  return { ...parsed, frame: full, ocr: result, marks };
}

/**
 * The win of a spin, when the game paints it ABOVE the HUD band instead of inside it (Triple Hop Pots shows
 * "GANANCIA 0,05 €" over the spin button). Read once, on the settled frame, only if the HUD band showed no win:
 * the band right above the HUD is OCR'd and only a WIN label with a strict amount is accepted.
 */
export async function readWinAboveHud(frame: Buffer, ocr: Ocr, market: MarketConfig, layout: GameLayout): Promise<HudValue | null> {
  const h = layout.hud;
  const band = { x: h.x, y: Math.max(0, h.y - 0.2), w: h.w, h: Math.min(0.2, h.y) };
  const { png, box } = await cropRel(frame, band);
  for (const brightTextThreshold of [HUD_TEXT_THRESHOLD, 170, undefined]) {
    const result = await ocr.read(png, market.ocrLang, { scale: 3, offset: { x: box.x, y: box.y }, brightTextThreshold });
    const win = parseHud(result.rows, market.gameText).win;
    if (win?.value) return win;
  }
  return null;
}

/** Time the intro gets to show a HUD or a recognisable continue/spin button before the checker presses SPACE. */
export const INTRO_SPIN_KEY_AFTER_MS = 5000;

/**
 * Press the spin key (SPACE) ONCE when, after INTRO_SPIN_KEY_AFTER_MS, the intro still shows no HUD label at all
 * and the continue/spin button was not recognised by image: on Pragmatic the intro continues with the spin
 * control. Never with a HUD label on screen, so it can never be a spin.
 */
export function shouldPressSpinOnIntro(alreadyTapped: boolean, hud: Pick<HudReading, 'credit' | 'bet' | 'win'>, startedAt: number, now = Date.now()): boolean {
  return !alreadyTapped && !(hud.credit || hud.bet || hud.win) && now - startedAt >= INTRO_SPIN_KEY_AFTER_MS;
}

/**
 * Gets the game from "loading / splash" to "playable": waits for CREDIT and BET to be readable,
 * pressing the visible CONTINUE button if the intro screen shows one.
 */
export async function waitForPlayableHud(
  game: GameScreen,
  ocr: Ocr,
  market: MarketConfig,
  layout: GameLayout,
  continueButton: ScreenTarget,
  timeoutMs = 120_000,
): Promise<HudReading> {
  const start = Date.now();
  let last: HudReading | undefined;
  let pressedContinue = false;
  let spinKeyPressed = false;
  while (Date.now() - start < timeoutMs) {
    const frame = await game.capture();
    last = await readHud(game, ocr, market, layout, frame);
    if (last.credit?.value && last.bet?.value) return last;
    // Intro/splash: press the continue button the player sees (text or icon) ONCE, and never once the HUD is
    // visible: on Pragmatic the same round icon is the SPIN button, so a second press could start a paid spin.
    if (!pressedContinue && !(last.credit || last.bet || last.win)) {
      const cont = await continueButton.locate(frame);
      if (cont) {
        await game.clickRel(cont.x, cont.y);
        pressedContinue = true;
      } else if (shouldPressSpinOnIntro(spinKeyPressed, last, start)) {
        // spin/continue button not recognised: press the spin key once, like a player on the keyboard
        await game.press('Space');
        spinKeyPressed = true;
      }
    }
    await sleep(700);
  }
  throw new Error(
    `Game HUD (credit/bet) not readable after ${timeoutMs / 1000}s. Last OCR of HUD:\n${last?.ocr.text ?? '(none)'}`,
  );
}

/**
 * Reads CREDIT and BET until two consecutive readings agree on BOTH (a single OCR read is never trusted with money).
 * Retries with short adaptive pauses; returns the last reading and whether it was stable.
 */
export async function readHudStable(
  game: GameScreen,
  ocr: Ocr,
  market: MarketConfig,
  layout: GameLayout,
  attempts = 5,
): Promise<{ reading: HudReading; stable: boolean }> {
  const same = (a: HudValue | null, b: HudValue | null) =>
    !!a?.value && !!b?.value && a.value.currency === b.value.currency && moneyEq(a.value.amount, b.value.amount, 0);
  let prev = await readHud(game, ocr, market, layout);
  for (let i = 1; i < attempts; i++) {
    await sleep(300 * i);
    const cur = await readHud(game, ocr, market, layout);
    if (same(prev.credit, cur.credit) && same(prev.bet, cur.bet)) return { reading: cur, stable: true };
    prev = cur;
  }
  return { reading: prev, stable: false };
}

/** Reads the HUD until two consecutive readings agree (credit counters animate up after a win). */
export async function readHudSettled(
  game: GameScreen,
  ocr: Ocr,
  market: MarketConfig,
  layout: GameLayout,
  timeoutMs = 30_000,
): Promise<HudReading> {
  const start = Date.now();
  let prev = await readHud(game, ocr, market, layout);
  while (Date.now() - start < timeoutMs) {
    await sleep(1200);
    const cur = await readHud(game, ocr, market, layout);
    const same = (a: HudValue | null, b: HudValue | null) =>
      (!a?.value && !b?.value) || (!!a?.value && !!b?.value && moneyEq(a.value.amount, b.value.amount, 0));
    if (cur.credit?.value && same(prev.credit, cur.credit) && same(prev.win, cur.win)) return cur;
    prev = cur;
  }
  return prev;
}

export interface MessageFinding {
  found: boolean;
  expectedLanguage: boolean;
  source: 'game' | 'betsson' | 'none';
  text: string;
  box?: Box;
  frame: Buffer;
}

/** Looks for a message (e.g. insufficient balance) painted inside the game canvas, or shown by Betsson in the DOM. */
export async function findMessage(
  game: GameScreen,
  ocr: Ocr,
  market: MarketConfig,
  pick: (gt: GameText) => RegExp,
): Promise<MessageFinding> {
  const frame = await game.capture();
  const result = await ocr.read(frame, market.ocrLang, { scale: 1.5 });
  const expected = pick(market.gameText);
  const others = allGameTexts.filter((t) => t !== market.gameText).map(pick);
  const whole = normalize(result.rows.map((r) => r.text).join(' '));
  const matchingRows = (re: RegExp) => result.rows.filter((r) => re.test(normalize(r.text)));
  if (expected.test(whole)) {
    const rows = matchingRows(expected);
    return { found: true, expectedLanguage: true, source: 'game', text: rows.map((r) => r.text).join(' ') || whole, box: rows.length ? unionBox(rows.map((r) => r.box)) : undefined, frame };
  }
  const other = others.find((re) => re.test(whole));
  if (other) {
    const rows = matchingRows(other);
    return { found: true, expectedLanguage: false, source: 'game', text: rows.map((r) => r.text).join(' ') || whole, box: rows.length ? unionBox(rows.map((r) => r.box)) : undefined, frame };
  }
  // Betsson may show its own message outside the game (DOM is fine there: it is Betsson's UI)
  for (const [re, isExpected] of [[expected, true], ...others.map((o) => [o, false] as const)] as const) {
    const domRe = new RegExp(re.source.replace(/\\b/g, ''), 'i');
    const loc = game.page.getByText(domRe).first();
    if (await loc.isVisible().catch(() => false)) {
      return { found: true, expectedLanguage: isExpected, source: 'betsson', text: (await loc.innerText()).trim(), frame };
    }
  }
  return { found: false, expectedLanguage: false, source: 'none', text: whole.slice(0, 300), frame };
}

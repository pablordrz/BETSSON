import type { GameLayout } from '../config/game-layout';
import { allGameTexts, type GameText } from '../config/game-text';
import type { MarketConfig } from '../config/markets';
import { moneyEq, parseMoney, type Money } from '../utils/money';
import { normalize, sleep } from '../utils/text';
import type { Mark } from './annotate';
import { cropRel, imageSize, type GameScreen } from './game-screen';
import { unionBox, type Box, type Ocr, type OcrResult, type OcrRow } from './ocr';

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
        let value = parseMoney(valueText);
        let valueBoxes = tail.map((w) => w.box);
        // value below the label (stacked layout)
        if (!value && rows[r + 1]) {
          const below = rows[r + 1].words.filter((w) => {
            const cx = w.box.x + w.box.w / 2;
            return cx > word.box.x - word.box.w && cx < word.box.x + word.box.w * 4;
          });
          valueText = below.map((w) => w.text).join(' ');
          value = parseMoney(valueText);
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

export async function readHud(
  game: GameScreen,
  ocr: Ocr,
  market: MarketConfig,
  layout: GameLayout,
  frame?: Buffer,
): Promise<HudReading> {
  const full = frame ?? (await game.capture());
  const { png, box } = await cropRel(full, layout.hud);
  const result = await ocr.read(png, market.ocrLang, { scale: 3, offset: { x: box.x, y: box.y } });
  const parsed = parseHud(result.rows, market.gameText);
  const marks: Mark[] = [{ box, label: 'HUD region', color: '#888888' }];
  for (const k of KINDS) {
    const v = parsed[k];
    if (v) marks.push({ box: v.box, label: `${k.toUpperCase()}: ${v.value ? v.value.amount.toFixed(2) + ' ' + (v.value.currency ?? '?') : '?'}`, color: v.value ? '#00e676' : '#ff9100' });
  }
  return { ...parsed, frame: full, ocr: result, marks };
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
  timeoutMs = 120_000,
): Promise<HudReading> {
  const start = Date.now();
  let blindClicks = 0;
  let last: HudReading | undefined;
  while (Date.now() - start < timeoutMs) {
    const frame = await game.capture();
    last = await readHud(game, ocr, market, layout, frame);
    if (last.credit?.value && last.bet?.value) return last;
    const sawAnyLabel = !!(last.credit || last.bet || last.win);
    const full = await ocr.read(frame, market.ocrLang, { scale: 1.5 });
    const cont = full.words.find((w) => allGameTexts.some((t) => t.continue.test(normalize(w.text))));
    const size = await imageSize(frame);
    if (cont) {
      await game.clickImagePoint(cont.box.x + cont.box.w / 2, cont.box.y + cont.box.h / 2, size.width, size.height);
    } else if (!sawAnyLabel && Date.now() - start > 25_000 && blindClicks < 1) {
      // Some intros only say "click anywhere" with a graphic. Never done once the HUD is visible.
      blindClicks++;
      await game.clickRel(0.5, 0.45);
    }
    await sleep(2000);
  }
  throw new Error(
    `Game HUD (credit/bet) not readable after ${timeoutMs / 1000}s. Last OCR of HUD:\n${last?.ocr.text ?? '(none)'}`,
  );
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

// Fits a booth's company name inside the booth on the plan: the largest size
// that fits, wrapped over up to three lines. Widths are estimated (no DOM),
// in ems of DM Sans bold, so the plan can be drawn on the server too.

export interface FittedLabel {
  size: number;
  lines: string[];
  /** Cut short with "…": the full name goes in a tooltip. */
  cut: boolean;
}

export const LINE_HEIGHT = 1.15;

const em = (ch: string) => (ch === " " ? 0.27 : /[MW]/.test(ch) ? 0.9 : /[A-Z0-9&]/.test(ch) ? 0.7 : /[iljtf.,'’:;!|]/.test(ch) ? 0.3 : /[mw]/.test(ch) ? 0.84 : 0.56);

/** Estimated width of the text, in ems. */
export function textWidth(s: string): number {
  let w = 0;
  for (const ch of s) w += em(ch);
  return w;
}

// Greedy word wrap at `max` ems a line; null when a single word is too wide.
function wrap(words: string[], max: number): string[] | null {
  const lines: string[] = [];
  for (const word of words) {
    if (textWidth(word) > max) return null;
    const last = lines[lines.length - 1];
    if (last !== undefined && textWidth(`${last} ${word}`) <= max) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines;
}

/** The text in a width × height box, from size `max` down to `min`; null when nothing readable fits. */
export function fitLabel(text: string, width: number, height: number, max: number, min = 0.5, maxLines = 3): FittedLabel | null {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const linesAt = (size: number) => Math.min(maxLines, Math.floor(height / (size * LINE_HEIGHT) + 1e-9));

  for (let size = max; size >= min - 1e-9; size = Math.round((size - 0.05) * 100) / 100) {
    const lines = linesAt(size) ? wrap(words, width / size) : null;
    if (lines && lines.length <= linesAt(size)) return { size, lines, cut: false };
  }

  // Too long even at the smallest size: as much as fits, ending in "…".
  const cap = linesAt(min);
  const room = width / min;
  if (!cap || textWidth("Ab…") > room) return null;
  const lines: string[] = [];
  let rest = words.join(" ");
  while (rest && lines.length < cap) {
    let n = rest.length;
    while (n > 1 && textWidth(rest.slice(0, n)) > room) n--;
    // Break at the last space that fits, unless the word alone is too wide.
    const space = n < rest.length ? rest.lastIndexOf(" ", n) : -1;
    const end = space > 0 ? space : n;
    lines.push(rest.slice(0, end).trimEnd());
    rest = rest.slice(end).trimStart();
  }
  if (rest) {
    let last = lines[cap - 1];
    while (last.length > 1 && textWidth(`${last}…`) > room) last = last.slice(0, -1);
    lines[cap - 1] = `${last.trimEnd()}…`;
  }
  return { size: min, lines, cut: Boolean(rest) };
}

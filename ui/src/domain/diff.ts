export interface Hunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
}
export interface DiffLine {
  kind: "hunk" | "added" | "removed" | "context" | "meta";
  text: string;
  oldLine?: number;
  newLine?: number;
  hunk?: Hunk;
}
export function parseHunk(text: string): Hunk | null {
  const m = /^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/.exec(
    text.trim(),
  );
  if (!m) return null;
  const [oldStart, oldCount, newStart, newCount] = [
    Number(m[1]),
    Number(m[2] ?? 1),
    Number(m[3]),
    Number(m[4] ?? 1),
  ];
  if (![oldStart, oldCount, newStart, newCount].every(Number.isSafeInteger))
    return null;
  return { oldStart, oldCount, newStart, newCount };
}
/** Display parser for unified hunks, not a full Git patch application engine. */
export function parseDiff(patch: string): DiffLine[] {
  let oldLine = 0,
    newLine = 0,
    hunk: Hunk | undefined;
  const input = patch.replace(/\r\n/g, "\n").split("\n");
  if (input.at(-1) === "") input.pop();
  return input.map((text) => {
    const parsed = parseHunk(text);
    if (parsed) {
      hunk = parsed;
      oldLine = hunk.oldStart;
      newLine = hunk.newStart;
      return { kind: "hunk", text, hunk };
    }
    if (text.startsWith("diff --git ") || text.startsWith("@@"))
      hunk = undefined;
    if (!hunk) return { kind: "meta", text };
    if (text.startsWith("-"))
      return { kind: "removed", text: text.slice(1), oldLine: oldLine++, hunk };
    if (text.startsWith("+"))
      return { kind: "added", text: text.slice(1), newLine: newLine++, hunk };
    if (text.startsWith(" "))
      return {
        kind: "context",
        text: text.slice(1),
        oldLine: oldLine++,
        newLine: newLine++,
        hunk,
      };
    return { kind: "meta", text };
  });
}
export function locateComment(header: string | undefined, patch: string) {
  const hunk = header ? parseHunk(header) : null;
  if (!hunk || (!hunk.newCount && !hunk.oldCount)) return null;
  const side = hunk.newCount > 0 ? "RIGHT" : "LEFT";
  const line =
    side === "RIGHT"
      ? hunk.newStart + hunk.newCount - 1
      : hunk.oldStart + hunk.oldCount - 1;
  const row = parseDiff(patch).findIndex(
    (r) =>
      r.hunk &&
      JSON.stringify(r.hunk) === JSON.stringify(hunk) &&
      (side === "RIGHT" ? r.newLine : r.oldLine) === line,
  );
  return row >= 0 ? { side, line, row } : null;
}

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseDiff, locateComment } from "../domain/diff.ts";
import { disposition, tokenTotal, parseSnapshot } from "../domain/review.ts";

const cases = JSON.parse(
  readFileSync(
    new URL("../../../docs/progress/2026-09-28/cases.json", import.meta.url),
    "utf8",
  ),
);
const records = JSON.parse(
  readFileSync(
    new URL("../../../docs/progress/2026-09-28/records.json", import.meta.url),
    "utf8",
  ),
);

test("curated snapshot has 18 unique samples and six cases; preserves nuanced grade evidence", () => {
  const data = parseSnapshot(cases, records);
  assert.equal(data.cases.length, 6);
  assert.equal(data.records.length, 18);
  assert.equal(
    data.records.find(
      (r) => r.provider === "minimax" && r.case_id === "off-by-one",
    )?.reviewer_grade?.explanation_error_count,
    1,
  );
  assert.equal(
    data.records.find(
      (r) => r.provider === "minimax" && r.case_id === "format-only",
    )?.reviewer_grade?.style_only_comment,
    true,
  );
});
test("unlinked or duplicate records fail loudly instead of showing the wrong case", () => {
  assert.throws(() =>
    parseSnapshot(cases, [{ ...records[0], case_id: "missing" }]),
  );
  assert.throws(() => parseSnapshot(cases, [records[0], records[0]]));
  assert.throws(() => parseSnapshot([cases[0], cases[0]], [records[0]]));
});
test("malformed data fails validation; zero token usage remains distinct from unknown", () => {
  assert.throws(() =>
    parseSnapshot(cases, [{ ...records[0], total_ms: "fast" }]),
  );
  const data = parseSnapshot(cases, [{ ...records[0], total_tokens: null }]);
  assert.equal(data.records[0].total_tokens, null);
  assert.equal(tokenTotal(data.records), null);
  assert.equal(tokenTotal([{ ...data.records[0], total_tokens: 0 }]), 0);
});
test("transport failure and empty responses never become LGTM", () => {
  const record = parseSnapshot(cases, [records[0]]).records[0];
  assert.equal(
    disposition({ ...record, status: "http_error", reviews: [] }),
    "error",
  );
  assert.equal(disposition({ ...record, reviews: [] }), "empty");
  assert.equal(
    disposition({ ...record, reviews: [{ lgtm: true, review_comment: "" }] }),
    "lgtm",
  );
});
test("replacement lines use separate old/new line numbers", () => {
  const patch = "@@ -10,3 +10,4 @@\n a\n-b\n+c\n+d\n e\n";
  const lines = parseDiff(patch);
  assert.deepEqual(
    lines.map((r) => [r.oldLine, r.newLine]),
    [
      [undefined, undefined],
      [10, 10],
      [11, undefined],
      [undefined, 11],
      [undefined, 12],
      [12, 13],
    ],
  );
  assert.deepEqual(locateComment("@@ -10,3 +10,4 @@", patch), {
    side: "RIGHT",
    line: 13,
    row: 5,
  });
});
test("pure deletion anchors on the old file and never on new line 19", () => {
  const patch = "@@ -20,3 +19,0 @@\n-a\n-b\n-c\n";
  assert.deepEqual(locateComment("@@ -20,3 +19,0 @@", patch), {
    side: "LEFT",
    line: 22,
    row: 3,
  });
});
test("omitted counts, CRLF and no-newline metadata preserve line numbers", () => {
  const patch = "@@ -1 +1 @@\r\n-a\r\n+b\r\n\\ No newline at end of file\r\n";
  assert.deepEqual(locateComment("@@ -1,1 +1,1 @@", patch), {
    side: "RIGHT",
    line: 1,
    row: 2,
  });
  assert.equal(parseDiff(patch).at(-1)?.kind, "meta");
});
test("multiple hunks reset coordinates; unverified headers cannot highlight unrelated lines", () => {
  const patch = "@@ -1 +1 @@\n-a\n+b\n@@ -20 +20,2 @@\n x\n+y\n";
  assert.deepEqual(locateComment("@@ -20 +20,2 @@", patch), {
    side: "RIGHT",
    line: 21,
    row: 5,
  });
  assert.equal(locateComment("@@ -19 +20,2 @@", patch), null);
  assert.equal(locateComment("@@ -1,0 +1,0 @@", patch), null);
  assert.equal(locateComment(undefined, patch), null);
});
test("truncated patch does not invent a comment anchor", () => {
  assert.equal(
    locateComment("@@ -1,3 +1,4 @@", "@@ -1,3 +1,4 @@\n a\n+b\n"),
    null,
  );
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRecorder, inspectCompletion, usageFields, redact, csvCell, jsonResponse } from './core.mjs';
import { Chat } from '../src/chat.ts';

const patch = '@@ -1,2 +1,1 @@\n- check();\n run();';
const raw = (content, finish_reason = 'stop') => ({ choices: [{ message: { content }, finish_reason }] });

test('valid array and legacy single-review responses are distinguished', () => {
  const review = { lgtm: false, review_comment: 'Guard removed', hunk_header: '@@ -1,2 +1,1 @@' };
  const a = inspectCompletion(raw(JSON.stringify({ reviews: [review] })), patch);
  assert.equal(a.status, 'valid');
  assert.equal(a.finding_count, 1);
  assert.deepEqual(a.headers_exactly_present, [true]);
  assert.equal(inspectCompletion(raw(JSON.stringify(review)), patch).response_shape, 'single_review');
});

test('one complete Markdown JSON fence is valid, but surrounding prose is not', () => {
  const body = '{"reviews":[{"lgtm":false,"review_comment":"Guard removed","hunk_header":"@@ -1,2 +1,1 @@"}]}';
  assert.equal(inspectCompletion(raw(`\`\`\`json\n${body}\n\`\`\``), patch).status, 'valid');
  assert.equal(inspectCompletion(raw(`Here is the review:\n\`\`\`json\n${body}\n\`\`\``), patch).status, 'invalid_json');
});

test('valid JSON without review schema is not success', () => {
  for (const content of ['{}', 'null', '{"lgtm":"false","review_comment":"x"}', '{"lgtm":false,"review_comment":""}']) {
    assert.equal(inspectCompletion(raw(content), patch).status, 'invalid_schema');
  }
});

test('invalid JSON, empty response, missing choices, and truncation remain distinct', () => {
  assert.equal(inspectCompletion(raw('not JSON'), patch).status, 'invalid_json');
  assert.equal(inspectCompletion(raw(''), patch).status, 'empty_content');
  assert.equal(inspectCompletion({ choices: [] }, patch).status, 'missing_choice');
  assert.equal(inspectCompletion(raw('{"reviews":[]}', 'length'), patch).status, 'truncated');
});

test('refusals are not marked valid even if they have content', () => {
  assert.equal(inspectCompletion({ choices: [{ message: { refusal: 'blocked', content: '{}' } }] }, patch).status, 'refused');
});

test('missing usage is unknown; explicit zero remains zero', () => {
  assert.equal(usageFields({}).input_tokens, null);
  assert.equal(usageFields({ usage: { prompt_tokens: 0 } }).input_tokens, 0);
  assert.equal(usageFields({ usage: { prompt_cache_hit_tokens: 9 } }).cached_input_tokens, 9);
});

test('credentials are redacted recursively and spreadsheet formulas escaped', () => {
  assert.deepEqual(redact({ nested: ['token-secret'] }, ['token-secret']), { nested: ['[REDACTED]'] });
  assert.equal(csvCell('=1+1'), '"\'=1+1"');
});

test('recorder captures one request and does not store Authorization', async () => {
  let calls = 0;
  const endpoint = 'https://example.invalid/chat/completions';
  const rec = makeRecorder({ endpoint, timeoutMs: 1000, secrets: ['private-key'], transport: async () => {
    calls++; return jsonResponse({ message: 'private-key' }, 429);
  } });
  const options = { method: 'POST', headers: { Authorization: 'Bearer private-key' }, body: '{"model":"m"}' };
  const response = await rec.fetch(endpoint, options);
  assert.equal(response.headers.get('x-should-retry'), 'false');
  await rec.fetch(endpoint, options);
  assert.equal(calls, 1);
  assert.equal(rec.trace.raw_response.message, '[REDACTED]');
  assert.equal(JSON.stringify(rec.trace).includes('private-key'), false);
});

test('unexpected endpoint is blocked before network', async () => {
  let calls = 0;
  const rec = makeRecorder({ endpoint: 'https://example.invalid/chat/completions', timeoutMs: 1000,
    transport: async () => { calls++; return jsonResponse({}); } });
  await rec.fetch('https://other.invalid', { method: 'POST', body: '{}' });
  assert.equal(calls, 0);
  assert.equal(rec.trace.transport_error, 'unexpected_endpoint');
});

test('network errors are captured and disable SDK retry', async () => {
  const rec = makeRecorder({ endpoint: 'https://example.invalid/chat/completions', timeoutMs: 1000,
    transport: async () => { throw new TypeError('network unavailable'); } });
  const response = await rec.fetch('https://example.invalid/chat/completions', { method: 'POST', body: '{}' });
  assert.equal(response.status, 504);
  assert.match(rec.trace.transport_error, /network unavailable/);
});

test('timeout signal reaches transport', async () => {
  const rec = makeRecorder({ endpoint: 'https://example.invalid/chat/completions', timeoutMs: 5,
    transport: async (_request, { signal }) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve(jsonResponse({})), 100);
      signal.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
    }) });
  const response = await rec.fetch('https://example.invalid/chat/completions', { method: 'POST', body: '{}' });
  assert.equal(response.status, 504);
  assert.match(rec.trace.transport_error, /Timeout/);
});

test('actual project Chat: SDK error never causes another transport request; malformed JSON remains a failure', async () => {
  const names = ['OPENAI_API_ENDPOINT', 'MODEL', 'AZURE_API_VERSION', 'AZURE_DEPLOYMENT', 'USE_GITHUB_MODELS'];
  const old = Object.fromEntries(names.map(n => [n, process.env[n]]));
  const originalFetch = globalThis.fetch;
  try {
    for (const n of names) delete process.env[n];
    process.env.OPENAI_API_ENDPOINT = 'https://example.invalid';
    process.env.MODEL = 'test';
    let calls = 0;
    let rec = makeRecorder({ endpoint: 'https://example.invalid/chat/completions', timeoutMs: 1000,
      transport: async () => { calls++; return jsonResponse({ error: { message: 'rate limited' } }, 429); } });
    globalThis.fetch = rec.fetch;
    await assert.rejects(() => new Chat('not-a-real-key').codeReview(patch));
    console.timeEnd('code-review cost'); // Original Chat does not end this timer on API errors.
    assert.equal(calls, 1);
    assert.equal(rec.trace.attempts, 1);
    rec = makeRecorder({ endpoint: 'https://example.invalid/chat/completions', timeoutMs: 1000,
      transport: async () => jsonResponse(raw('not JSON')) });
    globalThis.fetch = rec.fetch;
    const result = await new Chat('not-a-real-key').codeReview(patch);
    assert.equal(result.lgtm, false); // Project fallback returns an opinion instead of throwing.
    assert.equal(inspectCompletion(rec.trace.raw_response, patch).status, 'invalid_json');
  } finally {
    globalThis.fetch = originalFetch;
    for (const n of names) { if (old[n] === undefined) delete process.env[n]; else process.env[n] = old[n]; }
  }
});

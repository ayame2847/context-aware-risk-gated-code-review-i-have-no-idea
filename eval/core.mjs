// Experiment helpers. No network or file writes on import.
export function redact(value, secrets = []) {
  let text = typeof value === 'string' ? value : JSON.stringify(value);
  for (const secret of secrets.filter(Boolean).sort((a, b) => b.length - a.length)) {
    text = text.split(secret).join('[REDACTED]');
  }
  return typeof value === 'string' ? text : JSON.parse(text);
}

export function inspectCompletion(raw, patch) {
  const choice = raw?.choices?.[0];
  const content = choice?.message?.content;
  const base = { finish_reason: choice?.finish_reason ?? null, reviews: null };
  if (!choice) return { ...base, status: 'missing_choice' };
  if (choice.message?.refusal || ['content_filter', 'safety'].includes(choice.finish_reason)) {
    return { ...base, status: 'refused' };
  }
  if (choice.finish_reason === 'length') return { ...base, status: 'truncated' };
  if (typeof content !== 'string' || !content.trim()) return { ...base, status: 'empty_content' };
  let parsed;
  try {
    const fenced = content.trim().match(/^```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n```$/i);
    parsed = JSON.parse(fenced ? fenced[1] : content);
  } catch { return { ...base, status: 'invalid_json' }; }
  // The project also accepts a single review; record this compatibility explicitly.
  const reviews = Array.isArray(parsed?.reviews) ? parsed.reviews : [parsed];
  const valid = reviews.every(r => r && typeof r === 'object' &&
    typeof r.lgtm === 'boolean' && typeof r.review_comment === 'string' &&
    (r.hunk_header === undefined || typeof r.hunk_header === 'string') &&
    (r.lgtm || r.review_comment.trim().length > 0));
  if (!valid) return { ...base, status: 'invalid_schema' };
  const headers = patch.split('\n').filter(x => x.startsWith('@@'));
  const findings = reviews.filter(r => !r.lgtm && r.review_comment.trim());
  return {
    ...base, status: 'valid', reviews,
    response_shape: Array.isArray(parsed?.reviews) ? 'reviews_array' : 'single_review',
    finding_count: findings.length,
    // Diagnostic only: actual GitHub positioning uses normalized ranges, not string equality.
    headers_exactly_present: findings.map(r => headers.includes(r.hunk_header)),
  };
}

export function usageFields(raw) {
  const u = raw?.usage;
  return {
    input_tokens: u?.prompt_tokens ?? null,
    output_tokens: u?.completion_tokens ?? null,
    total_tokens: u?.total_tokens ?? null,
    cached_input_tokens: u?.prompt_cache_hit_tokens ?? u?.prompt_tokens_details?.cached_tokens ?? null,
    reasoning_tokens: u?.completion_tokens_details?.reasoning_tokens ?? null,
  };
}

export function csvCell(value) {
  let text = value == null ? '' : String(value);
  if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json', 'x-should-retry': 'false' },
  });
}

// Installed before constructing Chat so the existing OpenAI SDK uses this recorder.
// Only the exact selected chat endpoint is permitted. No GitHub requests are made.
export function makeRecorder({ endpoint, transport, timeoutMs, secrets = [], mock = false }) {
  const trace = { attempts: 0, request: null, raw_response: null, http_status: null,
    transport_error: null, http_ms: null, request_id: null };
  const fetch = async (input, init) => {
    trace.attempts++;
    if (trace.attempts > 1) return jsonResponse({ error: { message: 'Retry blocked by eval runner' } }, 409);
    const request = new Request(input, init);
    if (request.url !== endpoint || request.method !== 'POST') {
      trace.transport_error = 'unexpected_endpoint';
      return jsonResponse({ error: { message: 'Unexpected endpoint blocked' } }, 400);
    }
    trace.request = redact(JSON.parse(await request.clone().text()), secrets);
    const start = performance.now();
    try {
      const signal = AbortSignal.any([request.signal, AbortSignal.timeout(timeoutMs)]);
      const res = await transport(request, { signal });
      trace.http_status = res.status;
      trace.request_id = res.headers.get('x-request-id') ?? res.headers.get('x-goog-request-id');
      const body = await res.text();
      try { trace.raw_response = redact(JSON.parse(body), secrets); }
      catch { trace.raw_response = redact(body, secrets); }
      // Prevent hidden SDK retries: a failed sample must remain one failed request.
      const headers = new Headers(res.headers);
      headers.set('x-should-retry', 'false');
      return new Response(body, { status: res.status, headers });
    } catch (error) {
      trace.transport_error = redact(`${error.name}: ${error.message}`, secrets);
      return jsonResponse({ error: { message: 'Transport failed; see local record' } }, 504);
    } finally {
      trace.http_ms = Math.round(performance.now() - start);
      trace.mode = mock ? 'mock' : 'live';
    }
  };
  return { fetch, trace };
}

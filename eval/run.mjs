#!/usr/bin/env node
// Node 24+: native TypeScript stripping loads the project's Chat without a separate build.
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { parseEnv } from 'node:util';
import { parseArgs } from 'node:util';
import { makeRecorder, inspectCompletion, usageFields, csvCell, redact, jsonResponse } from './core.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const DIR = path.join(ROOT, 'eval');
const hash = text => createHash('sha256').update(text).digest('hex');
const readJSON = async p => JSON.parse(await fs.readFile(p, 'utf8'));
const git = args => { try { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return null; } };
const integer = (v, min, max, label) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${label} 必须在 ${min}–${max} 之间`);
  return n;
};
const HELP = `本地代码审查评测（默认只预览，不发送请求）
node eval/run.mjs --provider deepseek --case auth-delete
node eval/run.mjs --mock --provider deepseek,minimax --all
node eval/run.mjs --live --provider deepseek --case auth-delete
node eval/run.mjs --live --provider minimax --models
node eval/run.mjs --live --provider deepseek,minimax --all --repeat 3 --max-requests 36

选项：--model 模型ID（仅单一provider） --max-tokens 4096 --timeout 120（秒）
      --temperature 1 --repeat 1 --max-requests 12 --out 输出目录
      --dry-run（与默认一样，无网络） --mock（模拟数据，无网络） --live（真实请求，可能计费）
输出：manifest.json、records.jsonl、summary.csv、REPORT.md、每条记录的 JSON。
失败请求不重试，遇到任何失败即停止。成功后也必须人工判断评论质量。`;

async function main() {
  if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('请先切换到 Node.js 24');
  const { values: a } = parseArgs({ options: {
    provider: { type: 'string', default: 'deepseek' }, case: { type: 'string', default: 'auth-delete' },
    all: { type: 'boolean' }, repeat: { type: 'string', default: '1' }, model: { type: 'string' },
    'max-requests': { type: 'string', default: '12' }, 'max-tokens': { type: 'string', default: '4096' },
    timeout: { type: 'string', default: '120' }, temperature: { type: 'string', default: '1' },
    live: { type: 'boolean' }, mock: { type: 'boolean' }, 'dry-run': { type: 'boolean' },
    models: { type: 'boolean' }, out: { type: 'string' }, help: { type: 'boolean' },
  } });
  if (a.help) { console.log(HELP); return; }
  if ([a.live, a.mock, a['dry-run']].filter(Boolean).length > 1) throw new Error('live/mock/dry-run 只能选一个');
  if (a.models && a.mock) throw new Error('模型列表不支持 mock；使用 --live 查询真实列表');
  const repeat = integer(a.repeat, 1, 20, 'repeat');
  const cap = integer(a['max-requests'], 1, 500, 'max-requests');
  const maxTokens = integer(a['max-tokens'], 256, 32768, 'max-tokens');
  const timeoutMs = integer(a.timeout, 1, 600, 'timeout') * 1000;
  const temperature = Number(a.temperature);
  if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) throw new Error('temperature 必须为 0–2');
  const config = await readJSON(path.join(DIR, 'providers.json'));
  const names = [...new Set(a.provider.split(',').map(s => s.trim()))];
  if (a.model && names.length !== 1) throw new Error('--model 只能搭配一个 provider');
  const providers = names.map(name => {
    const p = config.providers[name];
    if (!p) throw new Error(`未知 provider: ${name}`);
    const u = new URL(p.base_url);
    if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash) throw new Error('base_url 必须是无凭据、无查询参数的 HTTPS 地址');
    return { ...p, name, model: a.model || p.model, base_url: p.base_url.replace(/\/$/, '') };
  });
  const dataset = await readJSON(path.join(DIR, 'cases.json'));
  const cases = a.all ? dataset : dataset.filter(c => c.id === a.case);
  if (!cases.length) throw new Error(`案例不存在: ${a.case}`);
  const count = a.models ? providers.length : providers.length * cases.length * repeat;
  if (count > cap) throw new Error(`计划 ${count} 次请求，超过上限 ${cap}；确认后显式增加 --max-requests`);
  const mode = a.live ? 'live' : a.mock ? 'mock' : 'dry-run';
  console.log(`模式=${mode}；模型=${providers.map(p => p.model).join(', ')}；计划请求=${count}`);
  if (!a.models) console.log(`案例=${cases.map(c => c.id).join(', ')}；max_tokens=${maxTokens}；temperature=${temperature}`);
  if (temperature === 0) console.log('注意：现有 Chat 会把 temperature=0 转成 1；以保存的实际请求为准。');
  if (mode === 'dry-run') { console.log('仅预览完成：未读取密钥、未调用 API。加 --mock 可演练，加 --live 才发送真实请求。'); return; }

  let env = {};
  if (a.live) {
    try { env = parseEnv(await fs.readFile(path.join(DIR, '.env'), 'utf8')); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  // Only keys named in the selected provider config are read; root .env is not loaded.
  const keys = Object.fromEntries(providers.map(p => [p.name, a.mock ? 'offline-placeholder' : process.env[p.key_env] || env[p.key_env]]));
  if (a.live && providers.some(p => !keys[p.name]?.trim() || /填|your[_-]?key|placeholder/i.test(keys[p.name]))) {
    throw new Error('缺少 API Key。请只在本地 eval/.env 填入对应密钥，或设置同名环境变量。');
  }
  const secrets = Object.values(keys);
  const id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${mode}-${randomUUID().slice(0, 8)}`;
  const out = path.resolve(a.out || path.join(DIR, 'results', id));
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.mkdir(out); // Refuse to overwrite any existing experiment.
  const save = async (name, value) => fs.writeFile(path.join(out, name), JSON.stringify(redact(value, secrets), null, 2) + '\n', { mode: 0o600 });
  const source = await fs.readFile(path.join(ROOT, 'src/chat.ts'), 'utf8');
  const manifest = {
    run_id: id, created_at: new Date().toISOString(), mode, planned_requests: count,
    project_commit: git(['rev-parse', 'HEAD']), branch: git(['branch', '--show-current']),
    working_tree_status: git(['status', '--porcelain']), chat_source_sha256: hash(source),
    runner_sha256: hash(await fs.readFile(fileURLToPath(import.meta.url))),
    core_sha256: hash(await fs.readFile(new URL('./core.mjs', import.meta.url))),
    package_lock_sha256: hash(await fs.readFile(path.join(ROOT, 'package-lock.json'))),
    node_version: process.version, providers, configuration: { repeat, maxTokens, timeoutMs, temperature },
    evaluation_layer: 'existing Chat.codeReview only; no bot filtering or GitHub publishing',
    thinking_policy: 'MiniMax-M3 thinking disabled for JSON compatibility; other configured models use provider default',
    cases: cases.map(c => ({ ...c, patch_sha256: hash(c.patch) })),
  };
  await save('manifest.json', manifest);
  const realFetch = globalThis.fetch;
  if (a.models) {
    for (const p of providers) {
      const res = await realFetch(`${p.base_url}/models`, { headers: { Authorization: `Bearer ${keys[p.name]}` }, signal: AbortSignal.timeout(timeoutMs) });
      const text = await res.text();
      let raw; try { raw = JSON.parse(text); } catch { raw = { text }; }
      await save(`${p.name}-models.json`, { http_status: res.status, raw });
      if (!res.ok) throw new Error(`模型列表 HTTP ${res.status}，详见 ${out}`);
      console.log(`${p.name}: ${(raw.data || []).map(m => m.id).join(', ') || '列表已保存，请查看 JSON'}`);
    }
    console.log(`模型列表目录：${out}`);
    return;
  }
  const { Chat } = await import('../src/chat.ts');
  const envNames = ['AZURE_API_VERSION', 'AZURE_DEPLOYMENT', 'USE_GITHUB_MODELS', 'MODEL', 'OPENAI_API_ENDPOINT', 'LANGUAGE', 'PROMPT', 'temperature', 'top_p', 'max_tokens', 'REASONING_EFFORT'];
  const previousEnv = Object.fromEntries(envNames.map(k => [k, process.env[k]]));
  const records = [];
  let stopped = false;
  try {
    for (let rep = 1; rep <= repeat && !stopped; rep++) {
      for (const c of cases) {
        if (stopped) break;
        // Alternate provider order between repetitions to reduce simple ordering bias.
        for (const p of rep % 2 ? providers : [...providers].reverse()) {
          for (const k of envNames) delete process.env[k];
          Object.assign(process.env, { MODEL: p.model, OPENAI_API_ENDPOINT: p.base_url,
            LANGUAGE: 'Chinese', temperature: String(temperature), top_p: '1', max_tokens: String(maxTokens) });
          const transport = a.mock ? async () => jsonResponse({
            id: 'MOCK-NOT-A-MODEL-RESULT', model: 'mock-only',
            choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify({ reviews: [{ lgtm: true, review_comment: '' }] }) } }],
          }) : realFetch;
          const recorder = makeRecorder({ endpoint: `${p.base_url}/chat/completions`, transport, timeoutMs, secrets, mock: !!a.mock });
          globalThis.fetch = recorder.fetch;
          const started = new Date().toISOString();
          const start = performance.now();
          let result = null, exception = null;
          try { result = await new Chat(keys[p.name]).codeReview(c.patch); }
          catch (e) { exception = { name: e.name, message: redact(e.message, secrets), status: e.status ?? null }; }
          finally { globalThis.fetch = realFetch; }
          const t = recorder.trace;
          const inspection = inspectCompletion(t.raw_response, c.patch);
          const status = t.transport_error ? 'transport_error' : t.http_status !== 200 ? 'http_error' : exception ? 'project_error' : inspection.status;
          const record = {
            record_id: String(records.length + 1).padStart(3, '0'), run_id: id, mode,
            provider: p.name, requested_model: p.model, returned_model: t.raw_response?.model ?? null,
            case_id: c.id, repetition: rep, started_at: started, total_ms: Math.round(performance.now() - start),
            status, ...t, ...usageFields(t.raw_response), inspection, project_result: result, exception,
            prompt_sha256: hash(JSON.stringify(t.request?.messages ?? null)),
            cost_usd: null, cost_note: 'Unknown; reconcile usage/cache/thinking/time-of-day with provider billing.',
            human_grade: null,
          };
          records.push(record);
          await save(`${record.record_id}-${p.name}-${c.id}.json`, record);
          await fs.appendFile(path.join(out, 'records.jsonl'), JSON.stringify(redact(record, secrets)) + '\n', { mode: 0o600 });
          console.log(`${record.record_id} ${p.name}/${c.id}: ${status} (${record.total_ms} ms)${a.mock ? ' [模拟，不能用于评分]' : ''}`);
          if (status !== 'valid') { stopped = true; break; }
        }
      }
    }
  } finally {
    globalThis.fetch = realFetch;
    for (const k of envNames) { if (previousEnv[k] === undefined) delete process.env[k]; else process.env[k] = previousEnv[k]; }
  }
  const columns = ['record_id', 'mode', 'provider', 'requested_model', 'returned_model', 'case_id', 'repetition', 'status', 'http_ms', 'total_ms', 'input_tokens', 'output_tokens', 'cached_input_tokens', 'reasoning_tokens', 'cost_usd'];
  const manual = ['hit_expected_issue', 'false_positive_count', 'actionability_0_to_2', 'notes'];
  const csv = [columns.concat(manual).map(csvCell).join(','), ...records.map(r => columns.map(k => csvCell(r[k])).concat(manual.map(() => '""')).join(','))].join('\n') + '\n';
  await fs.writeFile(path.join(out, 'summary.csv'), csv);
  const report = [
    '# 本地代码审查实验', '', `模式：**${mode}**。${a.mock ? '所有内容均为模拟，绝非真实模型成绩。' : '调用成功与审查质量需分别判断。'}`,
    `计划 ${count} 条；已完成 ${records.length} 条；${stopped ? '遇到错误后停止，剩余未执行。' : '计划已完成。'}`,
    '', '|记录|服务|案例|技术状态|总耗时 ms|', '|---|---|---|---|---|',
    ...records.map(r => `|${r.record_id}|${r.provider}|${r.case_id}|${r.status}|${r.total_ms}|`),
    '', '## 如何人工评分', '',
    '打开 manifest.json 查看每个案例的 expected 与 rubric，然后在 summary.csv 的最后四列填分。',
    'hit_expected_issue：有缺陷案例填 yes/no；无缺陷和上下文不足案例填 N/A。',
    'false_positive_count：数出没有代码证据支持的具体缺陷指控；不是按评论数量自动评分。',
    'actionability_0_to_2：0 无法操作；1 方向正确但笼统；2 指出具体原因和可行修复。notes 写依据。',
    '技术失败保留在可用性统计中，不自动计作漏报或安全通过；单独报告覆盖率。',
    'context-boundary 单独评估不确定性表达，不计入普通缺陷检出率。',
    '模型给出 LGTM 不代表代码安全。该工具不经过 bot 的文件筛选，也不发布 GitHub 评论。',
    'cost_usd 为空表示未知，不表示免费；以服务商账单为准。',
    '', '## 记录文件', '',
    '每条 JSON 保存实际请求（不含认证头）、原始响应、项目解析结果、格式检查、用量和错误；records.jsonl 是合并版本。',
    'manifest.json 保存案例与答案、源码哈希、Git 提交、运行参数及服务商信息；答案不会发送给模型。',
  ].join('\n');
  await fs.writeFile(path.join(out, 'REPORT.md'), report + '\n');
  console.log(`\n记录目录：${out}\n请打开 REPORT.md 和 summary.csv。`);
  if (stopped) process.exitCode = 1;
}

main().catch(e => { console.error(`评测停止：${e.message}`); process.exitCode = 1; });

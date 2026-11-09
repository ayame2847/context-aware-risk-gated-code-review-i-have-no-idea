/** Offline D demonstration. Scripted analysis inputs, no model/GitHub calls. */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildSync } = require('esbuild');
const root = path.resolve(__dirname, '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'inspector-d-demo-'));
try {
  buildSync({
    stdin: { contents: "export { calculateRisk } from './src/review/risk'; export { decideGate } from './src/review/gate';", resolveDir: root },
    outfile: path.join(temporary, 'd.cjs'), bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent',
  });
  const { calculateRisk, decideGate } = require(path.join(temporary, 'd.cjs'));
  const base = path.join(root, 'test/fixtures/sprint1');
  const manifest = JSON.parse(fs.readFileSync(path.join(base, 'manifest.json'), 'utf8'));
  console.log('OFFLINE D DEMO: analysis inputs are scripted; no live model or GitHub gate.');
  for (const id of ['clean-context', 'context-bug', 'high-approved', 'approval-author', 'approval-dismissed', 'unknown-human-override', 'stale-run']) {
    const entry = manifest.scenarios.find(item => item.id === id);
    const f = JSON.parse(fs.readFileSync(path.join(base, entry.file), 'utf8'));
    const risk = calculateRisk(f.input, f.expected.result, f.config);
    const gate = decideGate(f.expected.result, risk, f.gateContext, f.config);
    console.log(JSON.stringify({ scenario: id, analysis: f.expected.result.analysisStatus, risk: risk.level, gate }));
  }
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}

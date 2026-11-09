/** D 模块：纯函数。只计算风险，不调用模型、不写 GitHub、不改变输入。 */
import { minimatch } from 'minimatch';
import type { AnalysisResult, CalculateRisk, ReviewInput } from './contracts.js';
import { validateReviewConfig } from './config.js';

/** COMPLETE 还必须有实际覆盖，不能仅相信一个状态字符串。 */
export function hasCompleteCoverage(analysis: AnalysisResult): boolean {
  const supported = new Set(analysis.scope.supportedFiles);
  const analyzed = new Set(analysis.scope.analyzedFiles);
  return analysis.analysisStatus === 'COMPLETE' && supported.size > 0
    && analyzed.size === supported.size && [...supported].every(file => analyzed.has(file))
    && !analysis.omissions.some(item => item.required)
    && analysis.findings.every(item => item.validation === 'VERIFIED');
}

function validateInput(input: ReviewInput): void {
  const seen = new Set<string>();
  for (const file of input.changedFiles) {
    const paths = [file.path, ...(file.previousPath === undefined ? [] : [file.previousPath])];
    if (paths.some(path => !path || path.startsWith('/') || path.includes('\\')
      || path.split('/').some(part => part === '.' || part === '..' || part === ''))
      || seen.has(file.path)
      || !Number.isSafeInteger(file.additions) || file.additions < 0
      || !Number.isSafeInteger(file.deletions) || file.deletions < 0) {
      throw new Error('Invalid risk input');
    }
    seen.add(file.path);
  }
}

/** 全 PR 的规模与敏感路径都参与计算，包括未支持、删除、重命名前的路径。 */
export const calculateRisk: CalculateRisk = (input, analysis, config) => {
  validateReviewConfig(config);
  validateInput(input);
  const factors: string[] = [];
  const high = analysis.findings.filter(item => item.severity === 'high');
  const medium = analysis.findings.some(item => item.severity === 'medium' && item.validation === 'VERIFIED');
  const unavailable = analysis.analysisStatus !== 'NOT_APPLICABLE' && !hasCompleteCoverage(analysis);
  if (unavailable) factors.push('ANALYSIS_UNAVAILABLE');
  const sensitive = input.changedFiles.some(file =>
    [file.path, ...(file.previousPath ? [file.previousPath] : [])].some(path =>
      config.sensitivePaths.some(pattern => minimatch(path, pattern, {
        dot: true, nonegate: true, nocomment: true,
      }))));
  if (sensitive) factors.push('SENSITIVE_PATH');
  if (high.length) factors.push(high.some(item => item.validation === 'VERIFIED')
    ? 'VERIFIED_HIGH_FINDING' : 'RETAINED_HIGH_FINDING');
  if (medium) factors.push('VERIFIED_MEDIUM_FINDING');
  const changedLines = input.changedFiles.reduce((sum, file) => sum + file.additions + file.deletions, 0);
  if (!Number.isSafeInteger(changedLines)) throw new Error('Invalid total change size');
  const large = changedLines >= config.mediumChangedLines || input.changedFiles.length >= config.mediumChangedFiles;
  if (large) factors.push('CHANGE_SIZE');
  // 已知 HIGH 优先于 UNKNOWN；检查失败不能抹去已保留的高风险意见。
  const level = sensitive || high.length ? 'HIGH' : unavailable ? 'UNKNOWN' : medium || large ? 'MEDIUM' : 'LOW';
  if (!factors.length) factors.push(analysis.analysisStatus === 'NOT_APPLICABLE'
    ? 'NO_SUPPORTED_FILES' : 'NO_ESCALATION');
  return { level, factors, ruleVersion: config.ruleVersion };
};

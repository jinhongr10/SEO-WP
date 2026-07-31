import path from 'node:path';

const UI_PATTERNS = [
  /^(App|index)\.tsx$/,
  /^components\//,
  /^design-system\//,
  /^src\/.*\.css$/,
  /^tests\/(ui-layout|app-interactions)\//,
  /^playwright\.(ui-layout|app-interactions)\.config\.ts$/,
];

const DESKTOP_PATTERNS = [
  /^desktop\//,
  /^scripts\/(build|prepare)-.*(?:\.sh|\.ps1|\.mjs|\.cjs)$/,
  /^electron-builder(?:\.release)?\.json$/,
  /^\.github\/workflows\/(?:windows-desktop-build|desktop-stage-release)\.yml$/,
];

const TOOLING_PATTERNS = [
  /^scripts\//,
  /^desktop\//,
  /^package(?:-lock)?\.json$/,
  /^electron-builder(?:\.release)?\.json$/,
  /^playwright\..*\.config\.ts$/,
  /^\.github\/workflows\//,
];

const normalizePath = value => String(value || '').trim().replaceAll('\\', '/').replace(/^\.\//, '');

const matchesAny = (file, patterns) => patterns.some(pattern => pattern.test(file));

export const classifyChangedFiles = (files) => {
  const normalized = [...new Set(files.map(normalizePath).filter(Boolean))];
  const ui = normalized.some(file => matchesAny(file, UI_PATTERNS));
  const backend = normalized.some(file => file.startsWith('backend/') || file.endsWith('.py'));
  const desktop = normalized.some(file => matchesAny(file, DESKTOP_PATTERNS));
  const tooling = normalized.some(file => matchesAny(file, TOOLING_PATTERNS));
  const frontend = ui || normalized.some(file => (
    file.endsWith('.ts')
    || file.endsWith('.tsx')
    || file.endsWith('.js')
    || file.endsWith('.jsx')
    || file.startsWith('services/')
    || file.startsWith('src/')
  ));

  return { frontend, ui, backend, desktop, tooling };
};

export const resolveNpmInvocation = (
  args,
  {
    platform = process.platform,
    nodeExecutable = process.execPath,
    npmExecPath = process.env.npm_execpath,
  } = {},
) => platform === 'win32'
  ? {
      executable: nodeExecutable,
      args: [npmExecPath || path.join(path.dirname(nodeExecutable), 'node_modules', 'npm', 'bin', 'npm-cli.js'), ...args],
    }
  : { executable: 'npm', args };

const check = (id, label, args, phase = 0) => ({
  id,
  label,
  command: ['npm', ...args].join(' '),
  ...resolveNpmInvocation(args),
  phase,
});

const FAST_CHECKS = [
  check('neutrality-guard', 'Legacy company neutrality guard', ['run', 'test:neutrality']),
  check('typecheck', 'TypeScript typecheck', ['run', 'typecheck']),
  check('frontend-tests', 'Frontend unit tests', ['run', 'test:frontend']),
];

export const buildCheckDefinitions = (mode, changedFiles = []) => {
  if (mode === 'fast') return FAST_CHECKS.map(item => ({ ...item }));

  if (mode === 'release') {
    return [
      check('neutrality-guard', 'Legacy company neutrality guard', ['run', 'test:neutrality']),
      check('typecheck', 'TypeScript typecheck', ['run', 'typecheck']),
      check('backend-tests', 'Backend unit tests', ['run', 'test:backend']),
      check('ui-verification', 'Full UI verification', ['run', 'verify:ui']),
      check('tooling-tests', 'Developer tooling tests', ['run', 'test:tooling']),
      check('desktop-smoke', 'Desktop startup smoke', ['run', 'desktop:smoke']),
    ];
  }

  if (mode !== 'changed') throw new Error(`Unsupported verification mode: ${mode}`);

  const scopes = classifyChangedFiles(changedFiles);
  const checks = FAST_CHECKS.map(item => ({ ...item }));
  if (scopes.backend) checks.push(check('backend-tests', 'Backend unit tests', ['run', 'test:backend'], 1));
  if (scopes.ui) checks.push(check('ui-verification', 'Full UI verification', ['run', 'verify:ui'], 1));
  if (scopes.desktop) checks.push(check('desktop-smoke', 'Desktop startup smoke', ['run', 'desktop:smoke'], 1));
  if (scopes.tooling) checks.push(check('tooling-tests', 'Developer tooling tests', ['run', 'test:tooling'], 1));
  return checks;
};

export const redactSecrets = (input) => String(input ?? '')
  .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/gi, '[REDACTED PRIVATE KEY]')
  .replace(/(Authorization\s*:\s*Bearer\s+)[^\s"']+/gi, '$1[REDACTED]')
  .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi, '$1[REDACTED]')
  .replace(/\b(gh[pousr]_[A-Za-z0-9_]{8,})\b/g, '[REDACTED]')
  .replace(
    /\b((?:WINDOWS_)?CSC_LINK|[A-Z0-9_]*(?:TOKEN|PASSWORD|SECRET|API_KEY|PRIVATE_KEY)[A-Z0-9_]*)\s*=\s*([^\r\n]+)/gi,
    '$1=[REDACTED]',
  )
  .replace(
    /("(?:[^"]*(?:token|password|secret|api[_-]?key|private[_-]?key|csc[_-]?link)[^"]*)"\s*:\s*")[^"]*"/gi,
    '$1[REDACTED]"',
  )
  .replace(
    /([?&](?:access_token|token|password|secret|api[_-]?key|key|consumer_key|consumer_secret)=)[^&#\s]*/gi,
    '$1[REDACTED]',
  )
  .replace(/(https?:\/\/)[^\s/@:]+:[^\s/@]+@/gi, '$1[REDACTED]@');

const nextActionFor = (mode, result) => {
  if (result === 'failed') return 'Inspect the first failed check and its redacted log before continuing.';
  if (mode === 'fast') return 'Run npm run verify:changed before handing off the change.';
  if (mode === 'changed') return 'Open the development App with npm run desktop:dev.';
  return 'The release gate passed; use npm run release:stage only when publishing is explicitly intended.';
};

export const buildVerificationReport = ({
  mode,
  startedAt,
  durationMs,
  changedFiles = [],
  checks = [],
}) => {
  const result = checks.every(item => item.status === 'passed') ? 'passed' : 'failed';
  return {
    schemaVersion: 1,
    mode,
    startedAt,
    durationMs,
    changedFiles: [...changedFiles],
    checks: checks.map(item => ({ ...item })),
    result,
    artifacts: [...new Set(checks.flatMap(item => item.artifacts || []))],
    nextAction: nextActionFor(mode, result),
  };
};

const markdownCell = value => String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', '<br>');

export const formatMarkdownReport = (report) => {
  const lines = [
    `# Verification report: ${report.mode}`,
    '',
    `- Result: **${report.result}**`,
    `- Duration: ${(report.durationMs / 1000).toFixed(2)}s`,
    `- Started: ${report.startedAt}`,
    `- Changed files: ${report.changedFiles.length}`,
    '',
    '| Check | Status | Duration | Evidence |',
    '| --- | --- | ---: | --- |',
  ];

  for (const checkResult of report.checks) {
    const evidence = checkResult.logPath ? `[log](${checkResult.logPath})` : '';
    lines.push(`| ${markdownCell(checkResult.label)} | ${checkResult.status} | ${(checkResult.durationMs / 1000).toFixed(2)}s | ${evidence} |`);
  }

  lines.push('', `Next: ${report.nextAction}`, '');
  return lines.join('\n');
};

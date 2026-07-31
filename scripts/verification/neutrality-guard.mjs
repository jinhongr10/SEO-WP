import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const marker = (...parts) => parts.join('');

const FORBIDDEN_MARKERS = [
  { category: 'brand', value: marker('AO', 'LQ') },
  { category: 'domain', value: marker('sza', 'olq') },
  ...[
    marker('A1', '-15A'), marker('S', '912'), marker('BQ', '-2067'), marker('SBF', '-169'),
    marker('A1', '-19'), marker('AQ', '-2063D'), marker('BQ', '-6010'), marker('AQ', '-2101'),
    marker('EQ', '-2408'), marker('BQ', '-2243S'), marker('EQ', '-2201B'),
  ].map(value => ({ category: 'model', value })),
  ...[
    marker('paper', ' towel', ' dis', 'penser'), marker('ur', 'inal', ' screen'),
    marker('shower', ' gel', ' bracket'), marker('sanitary', ' pad and tam', 'pon dis', 'penser'),
    marker('so', 'ap'), marker('disp', 'enser'), marker('ur', 'inal'), marker('wash', 'room'),
    marker('scent', ' diffuser'), marker('aroma', ' diffuser'), marker('essential', ' oil'),
    marker('hand', ' dryer'), marker('paper', ' towel'), marker('sanitary', ' pad'),
    marker('tam', 'pon dis', 'penser'), marker('shower', ' gel'),
    marker('ho', 'tel'), marker('hosp', 'ital'), marker('distri', 'butor'),
    marker('request an ', 'r', 'fq'), marker('r', 'fq ', 'cta'), marker('quota', 'tion'),
    marker('皂', '液器'), marker('小便', '斗'), marker('香', '薰'), marker('卫', '浴'),
  ].map(value => ({ category: 'phrase', value })),
];

const TEXT_EXTENSIONS = new Set([
  '.cjs', '.css', '.csv', '.html', '.js', '.json', '.md', '.mjs', '.py', '.ps1',
  '.sh', '.ts', '.tsx', '.txt', '.yml', '.yaml',
]);

const normalizePath = value => String(value || '').replaceAll('\\', '/').replace(/^\.\//, '');

const isScannableFile = file => {
  const normalized = normalizePath(file);
  if (!normalized || normalized.startsWith('.git/')) return false;
  if (/^(?:build|dist|dist-cli|node_modules|test-results)\//.test(normalized)) return false;
  if (normalized.startsWith('desktop/resources/')) return false;
  return TEXT_EXTENSIONS.has(path.extname(normalized).toLowerCase());
};

export const scanTextForForbiddenMarkers = (text, file = '') => {
  const source = String(text || '');
  const findings = [];
  const domainMarker = FORBIDDEN_MARKERS.find(item => item.category === 'domain')?.value || '';
  const domainRanges = domainMarker
    ? [...source.matchAll(new RegExp(domainMarker, 'gi'))].map(match => [match.index, match.index + match[0].length])
    : [];
  for (const item of FORBIDDEN_MARKERS) {
    const pattern = new RegExp(item.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    for (const match of source.matchAll(pattern)) {
      if (item.category === 'brand' && domainRanges.some(([start, end]) => match.index >= start && match.index < end)) {
        continue;
      }
      findings.push({
        file,
        line: source.slice(0, match.index).split('\n').length,
        category: item.category,
        marker: match[0],
      });
    }
  }
  return findings.sort((a, b) => a.line - b.line || a.category.localeCompare(b.category));
};

export const scanRepositoryNeutrality = (cwd = process.cwd()) => {
  const output = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  const files = output.split('\0').map(normalizePath).filter(isScannableFile);
  return files.flatMap(file => {
    const content = readFileSync(path.join(cwd, file), 'utf8');
    return content.includes('\0') ? [] : scanTextForForbiddenMarkers(content, file);
  });
};

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectRun) {
  const findings = scanRepositoryNeutrality();
  if (findings.length) {
    process.stderr.write('Legacy company markers found in the current source tree:\n');
    for (const finding of findings) {
      process.stderr.write(`- ${finding.file}:${finding.line} [${finding.category}] ${finding.marker}\n`);
    }
    process.exitCode = 1;
  } else {
    process.stdout.write('Neutrality guard passed: no legacy brand, domain, model, or business markers found.\n');
  }
}

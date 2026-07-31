const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

const parseSemver = value => {
  const match = SEMVER.exec(String(value || '').trim());
  if (!match) throw new Error(`Expected a semantic version (x.y.z), received: ${value || '<empty>'}`);
  return match.slice(1).map(Number);
};

const compareVersions = (left, right) => {
  const a = parseSemver(left);
  const b = parseSemver(right);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
};

export const parseReleaseArgs = (args) => {
  const valueAfter = flag => {
    const index = args.indexOf(flag);
    return index >= 0 ? String(args[index + 1] || '').trim() : '';
  };
  const parsed = {
    platform: valueAfter('--platform') || 'all',
    bump: valueAfter('--bump') || 'patch',
    version: valueAfter('--version'),
    dryRun: args.includes('--dry-run'),
  };
  if (!['all', 'mac', 'windows'].includes(parsed.platform)) throw new Error(`Unsupported release platform: ${parsed.platform}`);
  if (!['patch', 'minor', 'major'].includes(parsed.bump)) throw new Error(`Unsupported release bump: ${parsed.bump}`);
  return parsed;
};

export const nextVersion = (currentVersion, { bump = 'patch', version = '' }) => {
  if (version) {
    parseSemver(version);
    return version;
  }
  const [major, minor, patch] = parseSemver(currentVersion);
  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
};

export const validateReleasePreconditions = ({
  porcelain,
  currentVersion,
  targetVersion,
  tags,
  dryRun,
}) => {
  const warnings = [];
  if (String(porcelain || '').trim()) {
    if (!dryRun) throw new Error('A real desktop release requires a clean worktree. Commit or stash all changes first.');
    warnings.push('Dry-run warning: a real release requires a clean worktree.');
  }
  if (tags.includes(`v${targetVersion}`)) throw new Error(`Release tag v${targetVersion} already exists.`);
  if (compareVersions(targetVersion, currentVersion) <= 0) {
    throw new Error(`Target version ${targetVersion} must be greater than current version ${currentVersion}.`);
  }
  return warnings;
};

export const validateReleaseSourceState = ({ branch, head, upstreamHead, dryRun }) => {
  const warnings = [];
  if (branch !== 'main') {
    if (!dryRun) throw new Error(`A real desktop release must run from main; current branch is ${branch || '<detached>'}.`);
    warnings.push('Dry-run warning: a real release must run from main.');
  }
  if (!head || !upstreamHead || head !== upstreamHead) {
    if (!dryRun) throw new Error('A real desktop release requires main to match origin/main exactly.');
    warnings.push('Dry-run warning: main must match origin/main before release.');
  }
  return warnings;
};

const macAssets = version => [
  `独立站 AI-${version}-arm64.dmg`,
  `独立站 AI-${version}-arm64.dmg.blockmap`,
  `独立站 AI-${version}-arm64.zip`,
  `独立站 AI-${version}-arm64.zip.blockmap`,
  'latest-mac.yml',
];

const windowsAssets = version => [
  `seo-wp-sync-setup-${version}.exe`,
  `seo-wp-sync-setup-${version}.exe.blockmap`,
  'latest.yml',
];

export const requiredReleaseAssets = (platform, version) => [
  ...(platform === 'all' || platform === 'mac' ? macAssets(version) : []),
  ...(platform === 'all' || platform === 'windows' ? windowsAssets(version) : []),
];

export const validateReleaseAssets = (assetNames, platform, version) => {
  const available = new Set(assetNames);
  return requiredReleaseAssets(platform, version).filter(name => !available.has(name));
};

export const buildReleaseNotes = (platform, version) => {
  const lines = [
    `## 独立站 AI ${version}`,
    '',
    '- 生成内容改为证据驱动的跨行业中性默认值。',
    '- 更新首次设置、站点管理、后台任务和桌面稳定性。',
    '- 新增遗留业务信息与安装产物自动扫描。',
  ];
  if (platform === 'windows' || platform === 'all') {
    lines.push(
      '',
      '## Windows',
      '',
      '- 支持 Windows 10/11 x64。',
      '- 正式发布门禁要求安装包通过 Authenticode 签名验证。',
    );
  }
  if (platform === 'mac' || platform === 'all') {
    lines.push('', '## macOS 安装包', '', '- 支持 Apple Silicon。');
  }
  return `${lines.join('\n')}\n`;
};

export const shouldRestoreVersionFiles = ({ result, versionUpdated, versionFilesStaged }) => (
  result === 'failed' && versionUpdated === true && versionFilesStaged !== true
);

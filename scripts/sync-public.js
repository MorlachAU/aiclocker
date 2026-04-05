/**
 * Sync aiclocker/ subdirectory of the parent E:\Dev repo to the standalone
 * public repo at https://github.com/MorlachAU/aiclocker.
 *
 * Runs `git subtree split` to extract a history branch containing only the
 * commits that touched aiclocker/, then pushes that branch to the public
 * remote as `main`, then cleans up.
 *
 * Usage:
 *   node scripts/sync-public.js          # push to public repo
 *   node scripts/sync-public.js --dry    # show what would be pushed without pushing
 *   node scripts/sync-public.js --quiet  # suppress non-error output (for hook)
 *
 * This script is safe to run from anywhere — it always operates on the
 * parent repo (E:\Dev). It exits 0 on success, non-zero on failure.
 *
 * Setup pre-requisites (one-time):
 *   cd E:\Dev
 *   git remote add aiclocker https://github.com/MorlachAU/aiclocker.git
 */
const { execSync, spawnSync } = require('child_process');
const path = require('path');

const PARENT_REPO = path.resolve(__dirname, '..', '..');  // E:\Dev
const SUBTREE_PREFIX = 'aiclocker';
const SPLIT_BRANCH = 'aiclocker-public';
const REMOTE = 'aiclocker';
const REMOTE_BRANCH = 'main';

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const quiet = args.includes('--quiet');

function log(...msgs) {
  if (!quiet) console.log('[sync-public]', ...msgs);
}
function warn(...msgs) {
  console.warn('[sync-public]', ...msgs);
}
function err(...msgs) {
  console.error('[sync-public]', ...msgs);
}

function git(args, options = {}) {
  const result = spawnSync('git', args, {
    cwd: PARENT_REPO,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
  if (result.status !== 0 && !options.allowFail) {
    err(`git ${args.join(' ')} failed:\n${result.stderr || result.stdout}`);
    process.exit(result.status || 1);
  }
  return result;
}

function gitOk(args) {
  return git(args, { allowFail: true }).status === 0;
}

function hasRemote() {
  const result = git(['remote'], { allowFail: true });
  return result.stdout.split(/\s+/).includes(REMOTE);
}

function ensureRemote() {
  if (!hasRemote()) {
    log(`adding remote '${REMOTE}' → https://github.com/MorlachAU/${SUBTREE_PREFIX}.git`);
    if (!dry) {
      git(['remote', 'add', REMOTE, `https://github.com/MorlachAU/${SUBTREE_PREFIX}.git`]);
    }
  }
}

function deleteSplitBranch() {
  if (gitOk(['rev-parse', '--verify', SPLIT_BRANCH])) {
    git(['branch', '-D', SPLIT_BRANCH]);
  }
}

function main() {
  log(`operating on parent repo: ${PARENT_REPO}`);

  // Sanity check — make sure we're in a repo with the aiclocker subdir
  if (!gitOk(['rev-parse', '--git-dir'])) {
    err(`${PARENT_REPO} is not a git repository`);
    process.exit(1);
  }
  const treeCheck = git(['ls-tree', '-d', 'HEAD', SUBTREE_PREFIX], { allowFail: true });
  if (treeCheck.status !== 0 || !treeCheck.stdout.trim()) {
    err(`subdirectory '${SUBTREE_PREFIX}' not found in HEAD of ${PARENT_REPO}`);
    process.exit(1);
  }

  ensureRemote();

  // Clean up any leftover split branch from a previous run
  deleteSplitBranch();

  if (dry) {
    log('DRY RUN — would run subtree split + push now');
    return;
  }

  // Extract history into split branch
  log(`running subtree split --prefix=${SUBTREE_PREFIX} -b ${SPLIT_BRANCH}`);
  const splitResult = spawnSync(
    'git', ['subtree', 'split', `--prefix=${SUBTREE_PREFIX}`, '-b', SPLIT_BRANCH],
    { cwd: PARENT_REPO, encoding: 'utf8', stdio: quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit' }
  );
  if (splitResult.status !== 0) {
    err('subtree split failed');
    process.exit(splitResult.status || 1);
  }

  // Push to public remote
  log(`pushing ${SPLIT_BRANCH} → ${REMOTE}/${REMOTE_BRANCH}`);
  const pushResult = spawnSync(
    'git', ['push', REMOTE, `${SPLIT_BRANCH}:${REMOTE_BRANCH}`],
    { cwd: PARENT_REPO, encoding: 'utf8', stdio: quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit' }
  );

  // Clean up split branch regardless of push outcome
  deleteSplitBranch();

  if (pushResult.status !== 0) {
    err('push failed — see output above');
    if (quiet && pushResult.stderr) err(pushResult.stderr);
    process.exit(pushResult.status || 1);
  }

  log(`done — https://github.com/MorlachAU/${SUBTREE_PREFIX}`);
}

try {
  main();
} catch (e) {
  err(e.message);
  deleteSplitBranch();
  process.exit(1);
}

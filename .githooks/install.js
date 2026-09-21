#!/usr/bin/env node
/**
 * Install the repository's git hooks.
 *
 *     node .githooks/install.js
 *
 * Points core.hooksPath at .githooks so `git commit` runs the credential guard.
 * core.hooksPath is a per-clone setting: run this once after cloning, and again
 * on any new machine. It is deliberately not stored in the repository, because a
 * hook cannot protect anything until the person committing opts in.
 *
 * Uninstall:  git config --unset core.hooksPath
 */
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Capture through a temp file rather than a pipe: pipes are unavailable in some
// sandboxes, and this works everywhere.
function gitCapture(args) {
  const tmp = path.join(os.tmpdir(), 'lcars-install-' + process.pid + '.tmp');
  let fd;
  try { fd = fs.openSync(tmp, 'w+'); } catch (e) { return { status: null, out: '', error: String(e.code || e.message) }; }
  try {
    const r = spawnSync('git', args, { stdio: ['ignore', fd, fd] });
    if (r.error) { return { status: null, out: '', error: r.error.code || r.error.message }; }
    let out = '';
    try { out = fs.readFileSync(tmp, 'utf8'); } catch (e) { out = ''; }
    return { status: r.status, out: out.trim(), error: null };
  } finally {
    try { fs.closeSync(fd); } catch (e) {}
    try { fs.unlinkSync(tmp); } catch (e) {}
  }
}

const root = gitCapture(['rev-parse', '--show-toplevel']);
if (root.status !== 0) {
  console.error('error: not inside a git repository.' + (root.error ? ' (' + root.error + ')' : ''));
  process.exit(1);
}
process.chdir(root.out);

const hookDir = path.join(root.out, '.githooks');
if (!fs.existsSync(path.join(hookDir, 'check-secrets.js'))) {
  console.error('error: .githooks/check-secrets.js not found.');
  process.exit(1);
}

// Best-effort exec bit for POSIX (a no-op on Windows).
try { fs.chmodSync(path.join(hookDir, 'pre-commit'), 0o755); } catch (e) {}

const set = gitCapture(['config', 'core.hooksPath', '.githooks']);
if (set.status !== 0) {
  console.error('error: could not set core.hooksPath' + (set.error ? ' (' + set.error + ')' : ''));
  process.exit(1);
}

const hookFiles = ['pre-commit', 'pre-commit.bat', 'check-secrets.js'];

console.log('Installed: core.hooksPath = .githooks');
console.log('Node: ' + process.version);
console.log('\nHook files:');
for (const f of hookFiles) {
  console.log('  ' + (fs.existsSync(path.join(hookDir, f)) ? 'ok  ' : 'MISS') + '  .githooks/' + f);
}
console.log('\nThe guard now blocks commits containing FimTale API credentials.');
console.log('Verify it:  node .githooks/test-guard.js');

#!/usr/bin/env node
/**
 * ============================================================================
 * LCARS-FimTale pre-commit credential guard
 * ============================================================================
 * Blocks a commit that would publish FimTale API credentials.
 *
 * Why this exists on top of .gitignore:
 *   .gitignore only stops UNTRACKED files from being added. It does nothing
 *   about a secret pasted into a file that is already tracked — which is the
 *   realistic accident. The FimTale API documentation is explicit:
 *     "切勿在公开仓库、前端代码或日志中明文保存 APIPass"
 *
 * Platform support:
 *   Written in Node so Windows and POSIX behave identically. Launchers:
 *     .githooks/pre-commit      POSIX sh  (git on macOS / Linux / Git Bash)
 *     .githooks/pre-commit.bat  Windows   (git for Windows prefers .bat)
 *
 * Implementation note — why git output goes through a file:
 *   Capturing a child process with a PIPE (`spawnSync(..., {encoding:'utf8'})`)
 *   fails with EPERM in some sandboxes, because pipes are disallowed there.
 *   Redirecting the child's stdout to a temporary FILE works everywhere, so
 *   `gitCapture()` below uses a file descriptor and reads the file back.
 *
 * Install:  node .githooks/install.js
 * Test:     node .githooks/test-guard.js
 * Bypass:   git commit --no-verify        (please don't)
 * ============================================================================
 */
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

/* ------------------------------------------------------------------ *
 * Running git without pipes
 * ------------------------------------------------------------------ */

let tmpSeq = 0;

/**
 * Run git and return its combined output.
 *
 * @param {Array<string>} args
 * @returns {{status: number|null, out: string, error: (string|null)}}
 */
function gitCapture(args) {
  const tmp = path.join(os.tmpdir(), 'lcars-hook-' + process.pid + '-' + (tmpSeq++) + '.tmp');
  let fd = null;
  try {
    fd = fs.openSync(tmp, 'w+');
  } catch (e) {
    return { status: null, out: '', error: 'TMPFILE:' + (e.code || e.message) };
  }

  try {
    // stdout and stderr both go to the file — no pipe is created.
    const r = spawnSync('git', args, { stdio: ['ignore', fd, fd] });
    if (r.error) {
      return { status: null, out: '', error: r.error.code || r.error.message };
    }
    let out = '';
    try { out = fs.readFileSync(tmp, 'utf8'); } catch (e) { out = ''; }
    return { status: r.status, out: out, error: null };
  } finally {
    try { fs.closeSync(fd); } catch (e) { /* ignore */ }
    try { fs.unlinkSync(tmp); } catch (e) { /* ignore */ }
  }
}

/* ------------------------------------------------------------------ *
 * Detection rules
 * ------------------------------------------------------------------ */

// The documented credential shape: APIKey = 8 lowercase hex, APIPass = 12.
// Hex alone would flag colours and hashes, so anchor on the assignment /
// parameter names the API and this codebase actually use.
const RULES = [
  {
    id: 'api-key',
    re: /(?:APIKey|api[_-]?key)["']?\s*[:=]\s*["']?([0-9a-f]{8})(?![0-9a-f])/i,
    label: 'APIKey-shaped value (8 hex chars)'
  },
  {
    id: 'api-pass',
    re: /(?:APIPass|api[_-]?pass)["']?\s*[:=]\s*["']?([0-9a-f]{12})(?![0-9a-f])/i,
    label: 'APIPass-shaped value (12 hex chars)'
  },
  {
    id: 'query-pair',
    re: /APIKey=[0-9a-f]{8}\s*&\s*APIPass=[0-9a-f]{12}/i,
    label: 'a complete APIKey=…&APIPass=… query string'
  }
];

// Must never be committed, even if force-added with `git add -f`.
const FORBIDDEN_PATHS = [
  /(^|\/)credentials\.json$/i,
  /(^|\/)secrets\.json$/i,
  /(^|\/)\.env(\..*)?$/i,
  /(^|\/)api-config\.local\.html$/i,
  /(^|\/)config\.local\.(js|json)$/i
];

/* ------------------------------------------------------------------ *
 * Scanning — also exported so the self-test can exercise the rules
 * ------------------------------------------------------------------ */

function isProbablyBinary(buf) {
  const n = Math.min(buf.length, 8192);
  for (let i = 0; i < n; i++) { if (buf[i] === 0) { return true; } }
  return false;
}

/**
 * Find credential-shaped values in one blob.
 * @param {string} text
 * @returns {Array<{line: number, rule: string, preview: string}>}
 */
function scanText(text) {
  const found = [];
  const lines = String(text).split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const rule of RULES) {
      if (!rule.re.test(line)) { continue; }
      // Never echo the secret: mask hex runs before printing.
      const masked = line.trim().replace(/[0-9a-f]{8,}/gi,
        s => s.slice(0, 2) + '*'.repeat(Math.max(0, s.length - 2)));
      found.push({ line: i + 1, rule: rule.label, preview: masked.slice(0, 120) });
      break;
    }
  }
  return found;
}

/**
 * @param {Array<string>} paths
 * @returns {Array<{file: string, line: number, rule: string, preview: string}>}
 */
function scanFiles(paths) {
  const findings = [];
  for (const p of paths) {
    let buf;
    try { buf = fs.readFileSync(p); } catch (e) { continue; }
    if (isProbablyBinary(buf)) { continue; }
    for (const hit of scanText(buf.toString('utf8'))) {
      findings.push({ file: p, line: hit.line, rule: hit.rule, preview: hit.preview });
    }
  }
  return findings;
}

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

function main() {
  // Everything currently staged for this commit.
  const names = gitCapture(['diff', '--cached', '--name-only', '--diff-filter=ACM']);
  if (names.status !== 0) {
    // Not a usable repo state (or git unavailable) — never block the user.
    if (names.error) {
      console.error('[credential-guard] skipped: could not run git (' + names.error + ')');
    }
    process.exit(0);
  }

  const files = names.out.split('\n').map(s => s.trim()).filter(Boolean)
    .filter(f => !f.startsWith('.githooks/'));

  if (!files.length) { process.exit(0); }

  const findings = [];
  const forbidden = [];

  for (const file of files) {
    if (FORBIDDEN_PATHS.some(re => re.test(file))) { forbidden.push(file); }

    // Scan the STAGED content, not the working tree: that is what gets committed.
    const blob = gitCapture(['show', ':' + file]);
    if (blob.status !== 0) { continue; }
    const buf = Buffer.from(blob.out, 'utf8');
    if (isProbablyBinary(buf)) { continue; }
    for (const hit of scanText(blob.out)) {
      findings.push({ file: file, line: hit.line, rule: hit.rule, preview: hit.preview });
    }
  }

  if (!findings.length && !forbidden.length) { process.exit(0); }

  const bar = '='.repeat(64);
  console.error('\n' + bar);
  console.error(' COMMIT BLOCKED — possible FimTale credential');
  console.error(bar);

  if (forbidden.length) {
    console.error('\nThese files look like local secrets and must not be committed:');
    forbidden.forEach(f => console.error('  ' + f));
  }

  if (findings.length) {
    console.error('\nSuspicious values in staged content:');
    for (const f of findings.slice(0, 12)) {
      console.error('  ' + f.file + ':' + f.line + '   [' + f.rule + ']');
      console.error('      ' + f.preview);
    }
    if (findings.length > 12) {
      console.error('  … and ' + (findings.length - 12) + ' more');
    }
  }

  console.error('\nThe FimTale API documentation requires that APIPass is never');
  console.error('stored in plain text in a public repository.');
  console.error('\nIf this is a false positive, commit with:');
  console.error('\n    git commit --no-verify\n');
  process.exit(1);
}

module.exports = { scanText, scanFiles, gitCapture, RULES };

if (require.main === module) { main(); }

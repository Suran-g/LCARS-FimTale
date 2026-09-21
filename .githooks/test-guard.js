#!/usr/bin/env node
/**
 * Self-test for the pre-commit credential guard.
 *
 *     node .githooks/test-guard.js
 *
 * Stages throwaway files containing credential-shaped values, asks git to make a
 * real commit, and checks the guard blocks exactly the right ones. Nothing is
 * committed: every case is unstaged and deleted afterwards, and HEAD is checked
 * at the end to prove history was not touched.
 */
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

let seq = 0;

// Temp-file capture instead of pipes: pipes are unavailable in some sandboxes.
function git(args) {
  const tmp = path.join(os.tmpdir(), 'lcars-guardtest-' + process.pid + '-' + (seq++) + '.tmp');
  let fd;
  try { fd = fs.openSync(tmp, 'w+'); } catch (e) { return { status: null, out: 'TMPERR ' + (e.code || ''), error: true }; }
  try {
    const r = spawnSync('git', args, { stdio: ['ignore', fd, fd] });
    let out = '';
    try { out = fs.readFileSync(tmp, 'utf8'); } catch (e) { out = ''; }
    return { status: r.error ? null : r.status, out: out, error: Boolean(r.error) };
  } finally {
    try { fs.closeSync(fd); } catch (e) {}
    try { fs.unlinkSync(tmp); } catch (e) {}
  }
}

const root = git(['rev-parse', '--show-toplevel']);
if (root.status !== 0) {
  console.error('not a git repository — run this from inside the project.');
  process.exit(1);
}
process.chdir(root.out.trim());

const before = git(['rev-parse', 'HEAD']).out.trim();

// Test fixtures.
//
// These MUST be obviously fake. An earlier revision used a real key pair here,
// which would have published it in the repository — the very accident this
// guard exists to prevent. The values below are deliberately self-describing:
// "deadbeef" is the classic placeholder word, so nobody can mistake it for a
// live credential, while still matching the documented shape
// (APIKey = 8 hex, APIPass = 12 hex) that the rules must detect.
const FAKE_KEY = 'deadbeef';
const FAKE_PASS = 'deadbeefcafe';

const CASES = [
  { name: 'camelCase assignment in a page',
    file: 'zz-guard-probe.html',
    body: '<script>\nvar APIKey = "' + FAKE_KEY + '";\nvar APIPass = "' + FAKE_PASS + '";\n</script>\n',
    blocked: true },
  { name: 'snake_case assignment',
    file: 'zz-guard-probe1.js',
    body: 'const api_pass = "' + FAKE_PASS + '";\n',
    blocked: true },
  { name: 'JSON blob',
    file: 'zz-guard-probe2.json',
    body: '{"apiKey":"' + FAKE_KEY + '","apiPass":"' + FAKE_PASS + '"}\n',
    blocked: true },
  { name: 'full query-string pair',
    file: 'zz-guard-probe3.js',
    body: 'fetch("https://fimtale.com/api/v1/t/4?APIKey=' + FAKE_KEY + '&APIPass=' + FAKE_PASS + '")\n',
    blocked: true },
  { name: 'colon style (yaml / properties)',
    file: 'zz-guard-probe4.yml',
    body: 'apiKey: ' + FAKE_KEY + '\napiPass: ' + FAKE_PASS + '\n',
    blocked: true },
  { name: 'APIPass only, no key',
    file: 'zz-guard-probe5.js',
    body: 'var APIPass = "' + FAKE_PASS + '";\n',
    blocked: true },
  { name: 'harmless hex-ish content',
    file: 'zz-guard-probe6.js',
    body: 'var colour = "#c9f";\nvar hash = "a1b2c3d4e5f6";\nvar pad = "0.75rem";\n// APIKey is 8 hex, APIPass is 12 hex\nvar word = "APIKey";\n',
    blocked: false },
  { name: 'the real project pattern',
    file: 'zz-guard-probe7.js',
    body: 'function getAPIEndpoint() { return "https://fimtale.com/api/v1"; }\nvar API_KEY_PATTERN = /^[0-9a-f]{8}$/;\n',
    blocked: false },
  { name: 'placeholder / help text',
    file: 'zz-guard-probe8.html',
    body: '<input placeholder="8 \u4f4d\u5341\u516d\u8fdb\u5236\uff0c\u4f8b\u5982 a1b2c3d4">\n<p>APIKey \u5e94\u4e3a 8 \u4f4d\u5c0f\u5199\u5341\u516d\u8fdb\u5236\u5b57\u7b26\uff080-9a-f\uff09</p>\n',
    blocked: false }
];

let pass = 0, fail = 0;
const created = [];

console.log('guard self-test — staging real files and attempting real commits\n');

for (const c of CASES) {
  fs.writeFileSync(c.file, c.body);
  created.push(c.file);
  git(['add', '-f', '--', c.file]);

  const r = git(['commit', '-m', 'guard self-test: ' + c.name]);
  const blocked = /COMMIT BLOCKED/.test(r.out);
  const nowHead = git(['rev-parse', 'HEAD']).out.trim();
  const madeCommit = nowHead !== before;

  const ok = blocked === c.blocked && !madeCommit;
  if (ok) { pass++; } else { fail++; }

  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' +
    (blocked ? 'BLOCKED' : 'allowed').padEnd(8) +
    'expected ' + (c.blocked ? 'BLOCKED' : 'allowed').padEnd(8) + '  ' + c.name);

  if (madeCommit) {
    console.log('       !! a commit slipped through — undoing');
    git(['reset', '--soft', 'HEAD~1']);
  }
  git(['reset', '-q', 'HEAD', '--', c.file]);
}

for (const f of created) { try { fs.unlinkSync(f); } catch (e) {} }
git(['reset', '-q']);

const after = git(['rev-parse', 'HEAD']).out.trim();
console.log('\nHEAD unchanged: ' + (before === after ? 'yes' : 'NO'));
if (before !== after) { fail++; }

const dirty = git(['status', '--porcelain']).out.trim();
console.log('working tree entries: ' + (dirty ? dirty.split('\n').length : 0));

console.log('\n>>> passed: ' + pass + '   failed: ' + fail);
process.exitCode = fail ? 1 : 0;

#!/usr/bin/env node
// Stoppar känslig data från att hamna i det publika repot.
//
//   node scripts/check-sensitive.mjs            kontrollerar det som är köat för commit (pre-commit)
//   node scripts/check-sensitive.mjs --all      kontrollerar alla filer i repot (CI, före publicering)
//   node scripts/check-sensitive.mjs --msg F    kontrollerar ett commit-meddelande (commit-msg)
//
// Personliga ord (namn, adress, kortsiffror, kontonummer …) läggs i .git/info/sensitive-words,
// ett per rad. Den filen ligger inne i .git och kan aldrig själv bli committad eller publicerad.
// En rad i koden som MÅSTE innehålla en träff kan märkas med: sensitive-check: ignore
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const gitBuf = (...args) => execFileSync('git', args, { maxBuffer: 64 * 1024 * 1024 });

// Filtyper som aldrig får finnas i repot (kontoutdrag, säkerhetskopior, nycklar)
const BLOCKED_FILE = /\.(pdf|csv|xlsx?|ods|numbers|ofx|qif|sie|pem|key|p12|pfx|sqlite|db|bak)$|(^|\/)\.env(\.|$)|(^|\/)id_(rsa|ed25519)/i;
const JSON_OK = new Set(['package.json', 'package-lock.json', 'tsconfig.json']);
const BINARY_OK = /\.(png|ico|jpe?g|gif|webp|woff2?)$/i;

const luhn = (digits) => {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = +digits[digits.length - 1 - i];
    if (i % 2) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
};

const CHECKS = [
  { name: 'personnummer', re: /\b(?:19|20)?(\d{2})(\d{2})(\d{2})[-+]?(\d{4})\b/g,
    ok: (m) => {
      const [, yy, mm, dd, last] = m;
      const day = +dd > 60 ? +dd - 60 : +dd; // samordningsnummer
      return !(+mm >= 1 && +mm <= 12 && day >= 1 && day <= 31 && luhn(yy + mm + dd + last));
    } },
  { name: 'IBAN', re: /\b(?:SE|LT|GB|IE|DE|DK|NO|FI|EE|LV|NL|FR|ES|BE|CH|AT|PL)\d{2}(?: ?[A-Z0-9]{4}){3,7}(?: ?[A-Z0-9]{1,3})?\b/g,
    ok: (m, file) => file === 'package-lock.json' || (m[0].match(/\d/g) || []).length < 12 },
  { name: 'kortnummer', re: /\b(?:\d[ -]?){13,19}\b/g, ok: (m) => !luhn(m[0].replace(/\D/g, '')) },
  { name: 'kontonummer', re: /\b[3-9]\d{3}(?:-\d)?[ ,-]+\d{1,3}[ ]?\d{3}[ ]?\d{3}(?:-\d)?\b/g },
  { name: 'e-postadress', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g,
    ok: (m, file) => file === 'package-lock.json' || /@users\.noreply\.github\.com$|@example\.(com|se|org)$/i.test(m[0]) },
  { name: 'Supabase hemlig nyckel', re: /sb_secret_[A-Za-z0-9_-]{8,}/g },
  { name: 'JWT/API-nyckel', re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
  { name: 'privat nyckel', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { name: 'API-token', re: /\b(?:sk_live_[A-Za-z0-9]{10,}|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[A-Z0-9]{16}|xox[bap]-[A-Za-z0-9-]{10,})/g },
  { name: 'lösenord', re: /(?:password|passwd|lösenord|secret)\s*[:=]\s*['"][^'"\s]{6,}['"]/gi },
];

// Personliga ord som bara finns lokalt
const wordsFile = (() => {
  try { return git('rev-parse', '--git-path', 'info/sensitive-words').trim(); } catch { return ''; }
})();
const personal = wordsFile && existsSync(wordsFile)
  ? readFileSync(wordsFile, 'utf8').split(/\r?\n/).map((w) => w.trim()).filter((w) => w && !w.startsWith('#'))
  : [];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
if (personal.length) CHECKS.push({ name: 'personligt ord', re: new RegExp(personal.map(esc).join('|'), 'gi'), personal: true });

const problems = [];
const report = (file, line, what, hit, isPersonal) =>
  problems.push(`  ${file}${line ? ':' + line : ''}  ${what}${isPersonal ? '' : `: ${hit.length > 60 ? hit.slice(0, 60) + '…' : hit}`}`);

function scanText(file, text) {
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (line.includes('sensitive-check: ignore')) return;
    for (const c of CHECKS) {
      for (const m of line.matchAll(c.re)) {
        if (c.ok && c.ok(m, file)) continue;
        report(file, i + 1, c.name, m[0], c.personal);
      }
    }
  });
}

function scanFile(file, buf) {
  const base = file.split('/').pop();
  if (BLOCKED_FILE.test(file)) return report(file, 0, 'filtypen får inte finnas i repot', '', true);
  if (/\.json$/i.test(file) && !JSON_OK.has(base)) return report(file, 0, 'JSON-filer (t.ex. säkerhetskopior) får inte finnas i repot', '', true);
  if (BINARY_OK.test(file)) return;
  if (buf.includes(0)) return report(file, 0, 'okänd binärfil – lägg till den medvetet eller ta bort den', '', true);
  scanText(file, buf.toString('utf8'));
}

const args = process.argv.slice(2);
let mode;
if (args[0] === '--msg') {
  mode = 'commit-meddelandet';
  scanText('commit-meddelande', readFileSync(args[1], 'utf8').split(/\r?\n/).filter((l) => !l.startsWith('#')).join('\n'));
} else if (args[0] === '--all') {
  mode = 'alla filer i repot';
  for (const f of git('ls-files', '-z').split('\0').filter(Boolean)) {
    if (f === 'scripts/check-sensitive.mjs') continue; // innehåller själv mönstren
    scanFile(f, readFileSync(f));
  }
} else {
  mode = 'köade ändringar';
  const staged = git('diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z').split('\0').filter(Boolean);
  for (const f of staged) {
    if (f === 'scripts/check-sensitive.mjs') continue;
    scanFile(f, gitBuf('show', `:${f}`));
  }
}

if (problems.length) {
  console.error(`\n✖ Känslig data hittad (${mode}) – inget committas/publiceras:\n${problems.join('\n')}\n`);
  console.error('Ta bort uppgifterna. Är träffen ofarlig (påhittad testdata) kan raden märkas med "sensitive-check: ignore".\n');
  process.exit(1);
}
console.log(`✓ Ingen känslig data hittad (${mode}${personal.length ? `, ${personal.length} personliga ord kontrollerade` : ''}).`);

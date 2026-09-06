"""Bounded secret-pattern scan: report locations only, never matching values."""
import hashlib
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / 'docs/reviewer-remediation-2026-09'
tracked = subprocess.check_output(
    ['git', 'ls-files', '--cached', '--others', '--exclude-standard'], cwd=ROOT
).decode('utf-8').splitlines()
paths = {ROOT / name for name in tracked}
paths.update(p for p in EVIDENCE.rglob('*') if p.is_file())
paths.update(p for p in (ROOT / 'scripts').glob('*') if p.is_file())
rules = {
    'private-key-block': re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
    'github-token': re.compile(r'\b(?:ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{70,})\b'),
    'aws-access-key': re.compile(r'\bAKIA[0-9A-Z]{16}\b'),
    'literal-private-key': re.compile(r'''(?i)(?:private[_-]?key|secret[_-]?key)\s*[=:]\s*["'](?:0x)?[a-f0-9]{64}["']'''),
}
findings = []
scanned = 0
for path in sorted(paths):
    if not path.is_file() or path.name in ('secret-scan.json', 'file-manifest.json'):
        continue
    data = path.read_bytes()
    if path.suffix.lower() in ('.png', '.jpg', '.ico'):
        continue
    text = data.decode('utf-16' if data.startswith(b'\xff\xfe') else 'utf-8-sig', errors='replace')
    scanned += 1
    for rule, pattern in rules.items():
        for match in pattern.finditer(text):
            findings.append({'file': path.relative_to(ROOT).as_posix(), 'line': text[:match.start()].count('\n')+1, 'rule': rule})
(EVIDENCE / 'secret-scan.json').write_text(json.dumps({
    'scope': 'tracked text files plus new evidence and scripts; no credential-store or untracked .env inspection',
    'files_scanned': scanned, 'rules': list(rules), 'findings': findings,
    'result': 'PASS' if not findings else 'REVIEW_REQUIRED',
    'limitation': 'Pattern scan, not proof of absence of every possible secret. Public transaction hashes, calldata, and contract source are intentionally retained.'
}, indent=2)+'\n', encoding='utf-8')
manifest = {p.relative_to(EVIDENCE).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted(EVIDENCE.rglob('*')) if p.is_file() and p.name != 'file-manifest.json'}
(EVIDENCE / 'file-manifest.json').write_text(json.dumps(manifest, indent=2)+'\n', encoding='utf-8')
print(f'{scanned} files scanned; {len(findings)} potential secret locations; {len(manifest)} evidence hashes saved.')

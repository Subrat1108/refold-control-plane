// Catches documentation drift mechanically, because the written protocol
// did not. CLAUDE.md and PROGRESS.md fell four sessions behind while
// devlog.md and decisions.md stayed current, and the owner had to notice —
// twice (D-135, then again on 2026-10-16). A rule that is only prose gets
// skipped under momentum; this fails loudly instead.
//
// Run: npm run docs:check   (and it is part of `npm run verify`)
import { readFileSync } from 'node:fs'

const read = (p: string) => readFileSync(p, 'utf8')
const problems: string[] = []
const notes: string[] = []

// ── 1. the newest devlog entry sets the expected date ─────────────────────
const devlog = read('docs/devlog.md')
const entry = devlog.match(/^## Session (\d+) — (\d{4}-\d{2}-\d{2})/m)
if (!entry) {
  problems.push('docs/devlog.md has no "## Session N — YYYY-MM-DD" entry — every session must prepend one.')
}
const [, session, date] = entry ?? []

// ── 2. CLAUDE.md's status block must agree with it ────────────────────────
if (date) {
  const claude = read('CLAUDE.md')
  const last = claude.match(/^- Last session: (\d{4}-\d{2}-\d{2})/m)
  if (!last) problems.push('CLAUDE.md has no "- Last session: YYYY-MM-DD" line in its Current status block.')
  else if (last[1] !== date) {
    problems.push(`CLAUDE.md says the last session was ${last[1]}, but devlog's newest entry is Session ${session} on ${date}. Refresh the Current status block.`)
  }

  // ── 3. PROGRESS.md's pointer too ────────────────────────────────────────
  const progress = read('PROGRESS.md')
  const pdate = progress.match(/^Date: (\d{4}-\d{2}-\d{2})/m)
  if (!pdate) problems.push('PROGRESS.md has no "Date: YYYY-MM-DD" under Last session.')
  else if (pdate[1] !== date) {
    problems.push(`PROGRESS.md's last-session date is ${pdate[1]}, but devlog's newest is ${date}. Update the Last session block.`)
  }
}

// ── 4. decisions referenced in the devlog must actually exist ─────────────
const decisions = read('docs/decisions.md')
const known = new Set([...decisions.matchAll(/^## (D-\d+)/gm)].map((m) => m[1]))
const newestEntry = devlog.slice(devlog.indexOf('## Session'), devlog.indexOf('## Session', 10) || undefined)
for (const ref of new Set([...newestEntry.matchAll(/\bD-(\d+)\b/g)].map((m) => `D-${m[1]}`))) {
  if (!known.has(ref)) problems.push(`The newest devlog entry cites ${ref}, which has no "## ${ref}" section in docs/decisions.md.`)
}

// ── 5. a reminder, not a failure: spec-level changes need the spec ────────
// There is no reliable way to detect "the domain model changed" from text,
// so this prompts rather than blocks.
notes.push('If this session changed the domain model, a screen\'s behaviour, or a contract: update docs/build-spec-v3.md and/or docs/product-overview.md too.')

if (problems.length) {
  console.error('\nDocumentation is out of step:\n')
  for (const p of problems) console.error(`  ✗ ${p}`)
  console.error('')
  process.exit(1)
}
console.log(`Docs in step — newest: Session ${session} (${date}); CLAUDE.md and PROGRESS.md agree.`)
for (const n of notes) console.log(`  note: ${n}`)

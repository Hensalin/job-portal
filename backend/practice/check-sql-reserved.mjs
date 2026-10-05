/**
 * Static check: does the migration use any PostgreSQL RESERVED WORD as a bare
 * identifier (table or column name)?
 *
 * WHY THIS EXISTS
 * ---------------
 * `current_role` is a reserved SQL function. `alter table profiles
 * add column current_role text` fails at parse time:
 *     ERROR: 42601 syntax error at or near "current_role"
 * It fails on LINE 1 of the statement, before anything runs, so the whole
 * migration aborts. This script finds that class of bug before you paste the
 * file into the Supabase SQL Editor.
 *
 * It also finds a second class of bug that is easier to miss: a reserved word
 * used as an *index* or *constraint* name.
 *
 * NO DATABASE NEEDED. Run: node backend/practice/check-sql-reserved.mjs
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const migrationDir = join(here, '..', '..', 'database', 'migrations');

/**
 * Words Postgres refuses to accept as a bare column/table name.
 * Only the truly-reserved categories are listed. Non-reserved keywords
 * (type, status, location, link, size, views, body, name, level...) are legal
 * and are deliberately absent - listing them would produce false alarms.
 */
const RESERVED = new Set([
  'all', 'analyse', 'analyze', 'array', 'asymmetric', 'both', 'case', 'cast',
  'check', 'collate', 'column', 'constraint', 'create', 'current_catalog',
  'current_date', 'current_role', 'current_schema', 'current_time',
  'current_timestamp', 'current_user', 'deallocate', 'default', 'deferrable',
  'desc', 'distinct', 'do', 'else', 'end', 'except', 'false', 'fetch', 'for',
  'foreign', 'from', 'grant', 'group', 'having', 'in', 'initially', 'intersect',
  'into', 'lateral', 'leading', 'limit', 'localtime', 'localtimestamp',
  'notnull', 'offset', 'on', 'only', 'or', 'order', 'placing', 'primary',
  'references', 'returning', 'select', 'session_user', 'some', 'symmetric',
  'table', 'then', 'to', 'trailing', 'true', 'union', 'unique', 'user',
  'using', 'variadic', 'when', 'where', 'window', 'with',
]);

/** Positions where a bare identifier IS a table or column name. */
const PATTERNS = [
  { label: 'add column', re: /\badd\s+column\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)/gi },
  { label: 'create table name', re: /\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)/gi },
  { label: 'alter table name', re: /\balter\s+table\s+(?:if\s+exists\s+)?([a-z_][a-z0-9_]*)/gi },
  { label: 'index name', re: /\bindex\s+[a-z_][a-z0-9_]*\s+on\s+([a-z_][a-z0-9_]*)/gi },
  { label: 'constraint name', re: /\bconstraint\s+([a-z_][a-z0-9_]*)/gi },
  { label: 'policy name', re: /\bpolicy\s+([a-z_][a-z0-9_]*)/gi },
  { label: 'reference target', re: /\breferences\s+([a-z_][a-z0-9_]*)/gi },
];

/** Identifiers that are legal but look suspicious - warn, never fail. */
const SOFT = { type: 'legal in Postgres, but quote it if you ever add a join alias', status: 'legal, widely used as a column name', };

const problems = [];
const notes = [];

for (const file of readdirSync(migrationDir).filter((f) => f.endsWith('.sql'))) {
  const full = join(migrationDir, file);
  const raw = readFileSync(full, 'utf8');

  // Strip comments and single-quoted literals so we only see real identifiers.
  const sql = raw
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/'[^']*'/g, "''");

  for (const { label, re } of PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(sql)) !== null) {
      const name = m[1];
      const lower = name.toLowerCase();
      // Find the real line number (comments may have shifted offsets).
      const line = sql.slice(0, m.index).split('\n').length;
      if (RESERVED.has(lower)) {
        problems.push({ file, line, label, name, kind: 'RESERVED' });
      } else if (SOFT[lower]) {
        notes.push({ file, line, label, name, why: SOFT[lower] });
      }
    }
  }
}

console.log('====================================================\n');
console.log('\n=============== SQL RESERVED WORD SCAN ===============');
console.log(`scanned: ${migrationDir}`);

if (problems.length === 0) {
  console.log('\nPASS  no reserved words used as identifiers.');
} else {
  console.log(`\nFAIL  ${problems.length} reserved word(s) will abort the migration:\n`);
  for (const p of problems) {
    console.log(`  ${p.file}:${p.line}  [${p.label}]  ${p.name}`);
    console.log(`      fix: rename to something not reserved, e.g. "${p.name}_value"`);
  }
}

if (notes.length) {
  console.log(`\nNOTE  ${notes.length} identifier(s) are legal but worth knowing:\n`);
  for (const n of notes) console.log(`  ${n.file}:${n.line}  ${n.name}  ->  ${n.why}`);
}

console.log('====================================================\n');
process.exit(problems.length ? 1 : 0);
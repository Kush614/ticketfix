// Repo snapshot: concatenate every source file into one string with path headers.
// This is the "whole codebase in context" half of the pitch — Argon reads all of it.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const IGNORE_DIRS = new Set(['node_modules', '.git', 'out', 'tickets', 'evidence', 'test-results', 'playwright-report', '.playwright']);
const IGNORE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webm', '.mp4', '.lock', '.ico', '.woff', '.woff2']);

export function listSourceFiles(root) {
  const out = [];
  (function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (IGNORE_DIRS.has(ent.name)) continue;
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (!IGNORE_EXT.has(path.extname(ent.name)) && ent.name !== 'package-lock.json') out.push(p);
    }
  })(root);
  return out.sort();
}

export function snapshot(root) {
  const files = listSourceFiles(root);
  let s = `<repo root="${path.basename(root)}" files="${files.length}">\n`;
  for (const f of files) {
    const rel = path.relative(root, f);
    s += `\n<file path="${rel}">\n${fs.readFileSync(f, 'utf8')}\n</file>\n`;
  }
  s += '</repo>\n';
  return s;
}

/** Apply full-file writes returned by the model: [{path, content}]. Returns the list written. */
export function applyWrites(root, files, { allowNew = true } = {}) {
  const written = [];
  for (const { path: rel, content } of files) {
    if (rel.includes('..') || path.isAbsolute(rel)) throw new Error(`refusing to write outside repo: ${rel}`);
    const abs = path.join(root, rel);
    if (!allowNew && !fs.existsSync(abs)) throw new Error(`model tried to create new file ${rel}`);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
    written.push(rel);
  }
  return written;
}

export function git(root, args) {
  return execSync(`git ${args}`, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

export function gitDiff(root) {
  try { return git(root, 'diff'); } catch { return ''; }
}

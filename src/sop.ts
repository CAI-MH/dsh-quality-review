/**
 * Common-task SOP folder reference standards.
 *
 * The user keeps a folder of SOP files (one file per routine task, e.g.
 * `周报.md`, `会议纪要.md`), optionally organized into sub-folders. Each file's
 * *content* is the quality standard for that task. On every turn the plugin
 * matches the user prompt against every file *name* (extension stripped,
 * case-insensitive substring); a hit means the turn belongs to that task, so
 * the *content of every file* in the folder — not just the matched one — is
 * handed to the reviewer as the reference standard (the SOP may span several
 * files). It does NOT skip the review.
 *
 * The folder is re-scanned on every turn, so editing a file — or adding /
 * removing / renaming one — takes effect on the next turn without a restart.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

const KEYWORD_EXTS = new Set(['.md', '.txt', '.markdown']);

/** One SOP standard file: its match keyword (file stem) plus its content. */
export interface SopStandard {
  keyword: string;
  path: string;
  content: string;
}

function collectStandards(dir: string, out: SopStandard[]): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    // Directory missing or unreadable — stop descending this branch.
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      collectStandards(join(dir, entry.name), out);
      continue;
    }
    if (!entry.isFile()) continue;
    const ext = extname(entry.name).toLowerCase();
    if (!KEYWORD_EXTS.has(ext)) continue;
    const stem = basename(entry.name, ext).trim();
    if (stem === '') continue;
    let content = '';
    try {
      content = readFileSync(join(dir, entry.name), 'utf8').trim();
    } catch {
      // Unreadable file — keep an empty standard; it simply won't be injected.
    }
    out.push({ keyword: stem, path: join(dir, entry.name), content });
  }
}

/** Load SOP standards from a directory tree (recursive). */
export function loadSopStandards(dir: string): SopStandard[] {
  const out: SopStandard[] = [];
  collectStandards(dir, out);
  return out;
}

/**
 * Return the standards whose keyword appears in the user prompt
 * (case-insensitive substring), deduplicated by file path. Used as the
 * "related task" trigger: callers load the full folder once any entry matches.
 */
export function matchSopStandards(userPrompt: string, standards: SopStandard[]): SopStandard[] {
  if (standards.length === 0) return [];
  const prompt = userPrompt.trim().toLowerCase();
  if (prompt === '') return [];
  const seen = new Set<string>();
  const matched: SopStandard[] = [];
  for (const standard of standards) {
    if (seen.has(standard.path)) continue;
    const keyword = standard.keyword.trim().toLowerCase();
    if (keyword !== '' && prompt.includes(keyword)) {
      seen.add(standard.path);
      matched.push(standard);
    }
  }
  return matched;
}

/**
 * Render matched standards into the reference text injected into the review
 * prompt. Content is capped so a pathological SOP file can't blow the reviewer
 * context window.
 */
export function renderSopReference(standards: SopStandard[], maxChars = 12000): string {
  const parts: string[] = [];
  let total = 0;
  for (const standard of standards) {
    if (standard.content === '') continue;
    let text = `【${standard.keyword}】\n${standard.content}`;
    const budget = maxChars - total;
    if (budget <= 0) break;
    if (text.length > budget) {
      text = `${text.slice(0, budget)}\n（内容过长已截断）`;
    }
    parts.push(text);
    total += text.length;
    if (total >= maxChars) break;
  }
  return parts.join('\n\n');
}

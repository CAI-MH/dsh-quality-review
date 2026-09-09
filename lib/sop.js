/**
 * Common-task SOP folder exemption.
 *
 * The user keeps a folder of SOP files (one file per routine task, e.g.
 * `周报.md`, `会议纪要.md`), optionally organized into sub-folders. On every
 * turn the plugin matches the user prompt against every file *name* (extension
 * stripped, case-insensitive substring) found anywhere under the folder; a hit
 * skips the review so routine workflows are never audited.
 *
 * The folder is re-scanned on every turn, so dropping a new file in — anywhere
 * in the tree — or renaming/removing one takes effect on the next turn without
 * a restart.
 */
import { readdirSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
const KEYWORD_EXTS = new Set(['.md', '.txt', '.markdown']);
function collectKeywords(dir, keywords) {
    let entries;
    try {
        entries = readdirSync(dir, { withFileTypes: true });
    }
    catch {
        // Directory missing or unreadable — stop descending this branch.
        return;
    }
    for (const entry of entries) {
        if (entry.isDirectory()) {
            collectKeywords(join(dir, entry.name), keywords);
            continue;
        }
        if (!entry.isFile())
            continue;
        const ext = extname(entry.name).toLowerCase();
        if (!KEYWORD_EXTS.has(ext))
            continue;
        const stem = basename(entry.name, ext).trim();
        if (stem !== '')
            keywords.add(stem);
    }
}
/** Load SOP keywords from a directory tree (recursive, deduplicated). */
export function loadSopKeywords(dir) {
    const keywords = new Set();
    collectKeywords(dir, keywords);
    return [...keywords];
}
/** True when the user prompt contains any keyword (case-insensitive substring). */
export function matchesSop(userPrompt, keywords) {
    if (keywords.length === 0)
        return false;
    const prompt = userPrompt.trim().toLowerCase();
    if (prompt === '')
        return false;
    return keywords.some((keyword) => {
        const k = keyword.trim().toLowerCase();
        return k !== '' && prompt.includes(k);
    });
}
//# sourceMappingURL=sop.js.map
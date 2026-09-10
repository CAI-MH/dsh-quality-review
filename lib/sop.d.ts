/** One SOP standard file: its match keyword (file stem) plus its content. */
export interface SopStandard {
    keyword: string;
    path: string;
    content: string;
}
/** Load SOP standards from a directory tree (recursive). */
export declare function loadSopStandards(dir: string): SopStandard[];
/**
 * Return the standards whose keyword appears in the user prompt
 * (case-insensitive substring), deduplicated by file path. Used as the
 * "related task" trigger: callers load the full folder once any entry matches.
 */
export declare function matchSopStandards(userPrompt: string, standards: SopStandard[]): SopStandard[];
/**
 * Render matched standards into the reference text injected into the review
 * prompt. Content is capped so a pathological SOP file can't blow the reviewer
 * context window.
 */
export declare function renderSopReference(standards: SopStandard[], maxChars?: number): string;
//# sourceMappingURL=sop.d.ts.map
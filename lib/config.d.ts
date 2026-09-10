/**
 * Plugin configuration schema (Standard-Schema via schemastery).
 *
 * Every field has a safe default so the bundle row can be inserted with no
 * `config` at all; profile layers override individual keys.
 */
import Schema from '@deepseek-ai/schemastery';
export interface QualityReviewConfig {
    /** Master switch; when false the plugin listens but never reviews. */
    enabled: boolean;
    /** Reviewer model route; empty strings mean "reuse the agent's own route". */
    reviewer: {
        provider: string;
        model: string;
    };
    /** Maximum steered review follow-ups per assistant turn (loop guard). */
    maxRounds: number;
    /** Review dimensions written into the reviewer prompt. */
    aspects: {
        factualAccuracy: boolean;
        completeness: boolean;
        logicalConsistency: boolean;
        instructionFollowing: boolean;
    };
    /** Reviewer call limits. */
    review: {
        maxTokens: number;
        temperature: number;
        timeoutMs: number;
    };
    /**
     * Minimum character length of the assistant's visible reply that makes a
     * turn worth reviewing — trivially short replies are skipped.
     */
    minReplyChars: number;
    /**
     * Common-task exemption keywords: when the user prompt contains any of these
     * (case-insensitive substring match), the turn is skipped entirely. Use it
     * to let routine SOP-style tasks through without a review, so the auditor
     * never nags on a well-understood workflow.
     */
    exemptPatterns: string[];
    /**
     * SOP folder reference standards: a directory the user can keep dropping
     * task standard files into. Each file name (extension stripped) matches a
     * related task; the matched file's *content* is handed to the reviewer as
     * the quality standard the answer is checked against. `dir` empty means the
     * default folder under DSH_HOME.
     */
    sop: {
        enabled: boolean;
        dir: string;
    };
}
declare const Config: Schema<QualityReviewConfig>;
export default Config;
//# sourceMappingURL=config.d.ts.map
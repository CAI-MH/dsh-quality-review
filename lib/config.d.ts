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
}
declare const Config: Schema<QualityReviewConfig>;
export default Config;
//# sourceMappingURL=config.d.ts.map
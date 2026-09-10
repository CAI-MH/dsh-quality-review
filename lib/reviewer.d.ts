/**
 * Reviewer core: renders the audit prompt, calls the reviewer model through
 * the host `ctx.llm` streaming service, and parses the verdict.
 *
 * The reviewer answers with a strict JSON object:
 *   { "pass": boolean, "issues": [ { "aspect", "problem", "suggestion" } ] }
 *
 * Parsing is defensive: the first JSON object in the reply wins, and any
 * malformed or missing verdict degrades to "pass" so a flaky reviewer never
 * wedges the agent loop.
 */
import type { QualityReviewConfig } from './config.js';
import type { SopStandard } from './sop.js';
export interface ReviewIssue {
    aspect: string;
    problem: string;
    suggestion: string;
}
export interface ReviewVerdict {
    pass: boolean;
    issues: ReviewIssue[];
    /** Raw reviewer text, kept for logging. */
    raw: string;
}
export interface ReviewRequest {
    /** The user's latest prompt (best effort; may be empty). */
    userPrompt: string;
    /** The assistant reply under review (visible text only). */
    assistantReply: string;
    /** Which review round this is, 1-based; fed to the prompt for context. */
    round: number;
    maxRounds: number;
    /** SOP standards (all files once a match triggers) used as the reference benchmark. */
    sopStandards?: SopStandard[];
}
export interface LlmStreamLike {
    stream(request: {
        provider: string;
        model: string;
        messages: unknown[];
        system?: string;
        maxTokens?: number;
        temperature?: number;
        signal?: AbortSignal;
    }): AsyncIterable<unknown>;
}
export interface ReviewerRoute {
    provider: string;
    model: string;
}
export declare class ReviewError extends Error {
}
export declare function renderReviewPrompt(request: ReviewRequest, config: QualityReviewConfig): string;
/** Extract the first balanced JSON object from arbitrary text. */
export declare function extractJsonObject(text: string): string | undefined;
export declare function parseVerdict(raw: string): ReviewVerdict;
export declare class Reviewer {
    private readonly llm;
    private readonly route;
    private readonly config;
    constructor(llm: LlmStreamLike, route: ReviewerRoute, config: QualityReviewConfig);
    review(request: ReviewRequest, signal?: AbortSignal): Promise<ReviewVerdict>;
}
/** Render the steered follow-up message sent back to the agent. */
export declare function renderFixRequest(verdict: ReviewVerdict, round: number, maxRounds: number): string;
//# sourceMappingURL=reviewer.d.ts.map
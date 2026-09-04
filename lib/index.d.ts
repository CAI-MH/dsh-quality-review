/**
 * dsh-quality-review bundle entry.
 *
 * Exports the Cordis plugin contract consumed by the dsh loader:
 *  - `name`   display metadata
 *  - `inject` required services (llm — part of dsh-base)
 *  - `Config` validated Standard-Schema configuration
 *  - `apply(ctx, config)` the plugin body
 *
 * Behavior: on `agent/turn-stopping` — the moment a turn is about to close —
 * take the assistant's latest visible reply, audit it with an independent
 * reviewer model, and when the verdict is "fail" steer the agent with a
 * concrete fix request so the turn stays open and the model revises. Each
 * turn allows at most `maxRounds` steered follow-ups (default 2), which is
 * the hard loop guard.
 */
import Config from './config.js';
import type { QualityReviewConfig } from './config.js';
import { type LlmStreamLike } from './reviewer.js';
export declare const name = "quality-review";
export declare const inject: string[];
export { Config };
/** Minimal structural typings for the host objects this plugin touches. */
interface ContentBlock {
    type?: string;
    text?: string;
}
interface DerivedMessage {
    role?: string;
    content?: ContentBlock[];
}
interface SessionLike {
    deriveMessages(): DerivedMessage[];
}
interface AgentLike {
    id: string;
    session: SessionLike;
    provider?: string;
    model?: string;
    steer(message: unknown): void;
}
interface CordisContextLike {
    llm: LlmStreamLike;
    logger(tag: string): {
        info(message: string): void;
        warn(message: string): void;
        error(message: string): void;
    };
    on(event: 'agent/turn-stopping', listener: (payload: {
        agent: AgentLike;
        turn: number;
        signal: AbortSignal;
    }) => unknown): unknown;
}
export declare function apply(ctx: CordisContextLike, config: QualityReviewConfig): void;
//# sourceMappingURL=index.d.ts.map
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
    on(event: 'agent/turn-stopping', listener: (payload: {
        agent: AgentLike;
        turn: number;
        signal: AbortSignal;
    }) => unknown): unknown;
}
export declare function apply(ctx: CordisContextLike, config: QualityReviewConfig): void;
//# sourceMappingURL=index.d.ts.map
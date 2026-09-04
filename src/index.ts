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
import { Reviewer, renderFixRequest, type LlmStreamLike, type ReviewerRoute } from './reviewer.js';

export const name = 'quality-review';
export const inject = ['llm'];
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
  on(event: 'agent/turn-stopping', listener: (payload: { agent: AgentLike; turn: number; signal: AbortSignal }) => unknown): unknown;
}

/** Concatenate the visible text blocks of one derived message. */
function textOf(message: DerivedMessage): string {
  if (!Array.isArray(message.content)) return '';
  return message.content
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text as string)
    .join('\n');
}

/**
 * Extract the review material from the derived history: the newest assistant
 * reply plus the newest real user prompt before it. Steered review messages
 * (source-tagged plugin notices) are skipped when looking for the user prompt
 * so round 2 audits against the original ask rather than the fix request.
 */
function extractReviewMaterial(session: SessionLike): { userPrompt: string; assistantReply: string } {
  const messages = session.deriveMessages();
  let assistantReply = '';
  let userPrompt = '';
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (assistantReply === '' && message.role === 'assistant') {
      assistantReply = textOf(message);
      continue;
    }
    if (assistantReply !== '' && message.role === 'user') {
      const text = textOf(message);
      // Skip our own steered fix requests when locating the original prompt.
      if (text.startsWith('[质量审核]')) continue;
      userPrompt = text;
      break;
    }
  }
  return { userPrompt, assistantReply };
}

/**
 * Per-agent, per-turn review bookkeeping. The counter lives outside the agent
 * loop and is keyed by (agent id, turn), so a session reload or plugin HMR
 * starts fresh while the hard cap still blocks runaway steering inside a
 * process lifetime.
 */
class RoundLedger {
  private readonly counts = new Map<string, number>();

  key(agentId: string, turn: number): string {
    return `${agentId}#${turn}`;
  }

  /** Current review round for this turn (0 = not yet reviewed). */
  get(agentId: string, turn: number): number {
    return this.counts.get(this.key(agentId, turn)) ?? 0;
  }

  /** Record one more steered review round; returns the new count. */
  bump(agentId: string, turn: number): number {
    const key = this.key(agentId, turn);
    const next = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, next);
    return next;
  }

  /** Bound memory: drop everything except the newest N turns per agent. */
  prune(maxEntries = 500): void {
    if (this.counts.size <= maxEntries) return;
    const keys = [...this.counts.keys()];
    for (const key of keys.slice(0, keys.length - maxEntries)) this.counts.delete(key);
  }
}

function resolveRoute(agent: AgentLike, config: QualityReviewConfig): ReviewerRoute | undefined {
  const provider = config.reviewer.provider !== '' ? config.reviewer.provider : agent.provider;
  const model = config.reviewer.model !== '' ? config.reviewer.model : agent.model;
  if (provider === undefined || provider === '' || model === undefined || model === '') return undefined;
  return { provider, model };
}

export function apply(ctx: CordisContextLike, config: QualityReviewConfig): void {
  const log = ctx.logger('quality-review');
  const ledger = new RoundLedger();

  ctx.on('agent/turn-stopping', async ({ agent, turn, signal }) => {
    if (!config.enabled) return;
    if (config.maxRounds === 0) return;

    const round = ledger.get(agent.id, turn);
    if (round >= config.maxRounds) {
      if (round > 0) {
        log.info(`agent "${agent.id}" turn ${turn}: review budget exhausted (${round}/${config.maxRounds}), letting the turn close`);
      }
      return;
    }

    const { userPrompt, assistantReply } = extractReviewMaterial(agent.session);
    if (assistantReply.trim() === '') return;
    if (assistantReply.length < config.minReplyChars && round === 0) return;

    const route = resolveRoute(agent, config);
    if (route === undefined) {
      log.warn(`agent "${agent.id}" turn ${turn}: no reviewer route available (agent route unknown and reviewer not configured); skipping review`);
      return;
    }

    log.info(`agent "${agent.id}" turn ${turn}: reviewing reply (${assistantReply.length} chars, round ${round + 1}/${config.maxRounds}) via ${route.provider}/${route.model}`);

    let verdict;
    try {
      const reviewer = new Reviewer(ctx.llm, route, config);
      verdict = await reviewer.review(
        { userPrompt, assistantReply, round: round + 1, maxRounds: config.maxRounds },
        signal,
      );
    } catch (error) {
      if (signal.aborted) return;
      log.warn(`agent "${agent.id}" turn ${turn}: reviewer call failed, letting the turn close: ${String(error)}`);
      return;
    }
    if (signal.aborted) return;

    if (verdict.pass) {
      log.info(`agent "${agent.id}" turn ${turn}: review passed`);
      return;
    }

    const nextRound = ledger.bump(agent.id, turn);
    ledger.prune();
    log.info(
      `agent "${agent.id}" turn ${turn}: review failed with ${verdict.issues.length} issue(s); steering fix request (round ${nextRound}/${config.maxRounds})`,
    );

    agent.steer({
      role: 'user',
      content: [{ type: 'text', text: renderFixRequest(verdict, nextRound, config.maxRounds) }],
      source: { kind: 'plugin', plugin: 'quality-review', form: 'notice', summary: '质量审核追问' },
    });
  });

  log.info('quality-review ready: auditing assistant turns on turn-stopping');
}

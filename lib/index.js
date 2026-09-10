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
import { join } from 'node:path';
import Config from './config.js';
import { Reviewer, renderFixRequest } from './reviewer.js';
import { loadSopStandards, matchSopStandards } from './sop.js';
export const name = 'quality-review';
export const inject = ['llm'];
export { Config };
/** Concatenate the visible text blocks of one derived message. */
function textOf(message) {
    if (!Array.isArray(message.content))
        return '';
    return message.content
        .filter((block) => block.type === 'text' && typeof block.text === 'string')
        .map((block) => block.text)
        .join('\n');
}
/**
 * Extract the review material from the derived history: the newest assistant
 * reply plus the newest real user prompt before it. Steered review messages
 * (source-tagged plugin notices) are skipped when looking for the user prompt
 * so round 2 audits against the original ask rather than the fix request.
 */
function extractReviewMaterial(session) {
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
            if (text.startsWith('[质量审核]'))
                continue;
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
    counts = new Map();
    key(agentId, turn) {
        return `${agentId}#${turn}`;
    }
    /** Current review round for this turn (0 = not yet reviewed). */
    get(agentId, turn) {
        return this.counts.get(this.key(agentId, turn)) ?? 0;
    }
    /** Record one more steered review round; returns the new count. */
    bump(agentId, turn) {
        const key = this.key(agentId, turn);
        const next = (this.counts.get(key) ?? 0) + 1;
        this.counts.set(key, next);
        return next;
    }
    /** Bound memory: drop everything except the newest N turns per agent. */
    prune(maxEntries = 500) {
        if (this.counts.size <= maxEntries)
            return;
        const keys = [...this.counts.keys()];
        for (const key of keys.slice(0, keys.length - maxEntries))
            this.counts.delete(key);
    }
}
function resolveRoute(agent, config) {
    const provider = config.reviewer.provider !== '' ? config.reviewer.provider : agent.provider;
    const model = config.reviewer.model !== '' ? config.reviewer.model : agent.model;
    if (provider === undefined || provider === '' || model === undefined || model === '')
        return undefined;
    return { provider, model };
}
/**
 * True when the user prompt matches a configured common-task exemption keyword
 * (case-insensitive substring match). Matching turns are skipped so routine
 * SOP-style workflows are never audited.
 */
function matchesExempt(userPrompt, patterns) {
    if (!Array.isArray(patterns) || patterns.length === 0)
        return false;
    const prompt = userPrompt.trim().toLowerCase();
    if (prompt === '')
        return false;
    return patterns.some((pattern) => {
        const p = pattern.trim().toLowerCase();
        return p !== '' && prompt.includes(p);
    });
}
/** Default SOP folder under DSH_HOME (falls back to cwd when unset). */
function defaultSopDir() {
    const home = process.env.DSH_HOME ?? process.cwd();
    return join(home, 'quality-review', 'sop');
}
/** Resolve the active SOP folder, or '' when folder exemption is disabled. */
function resolveSopDir(config) {
    if (!config.sop.enabled)
        return '';
    return config.sop.dir !== '' ? config.sop.dir : defaultSopDir();
}
export function apply(ctx, config) {
    // Log through stdout so the ready message and per-turn verdicts are visible
    // in the harness log (ctx.logger only buffers and never reaches harness.log).
    const log = {
        info: (message) => console.log(`[quality-review] ${message}`),
        warn: (message) => console.warn(`[quality-review] ${message}`),
        error: (message) => console.error(`[quality-review] ${message}`),
    };
    const ledger = new RoundLedger();
    ctx.on('agent/turn-stopping', async ({ agent, turn, signal }) => {
        if (!config.enabled)
            return;
        if (config.maxRounds === 0)
            return;
        const round = ledger.get(agent.id, turn);
        if (round >= config.maxRounds) {
            if (round > 0) {
                log.info(`agent "${agent.id}" turn ${turn}: review budget exhausted (${round}/${config.maxRounds}), letting the turn close`);
            }
            return;
        }
        const { userPrompt, assistantReply } = extractReviewMaterial(agent.session);
        if (assistantReply.trim() === '')
            return;
        if (assistantReply.length < config.minReplyChars && round === 0)
            return;
        if (matchesExempt(userPrompt, config.exemptPatterns)) {
            log.info(`agent "${agent.id}" turn ${turn}: skipped review (exempt pattern matched); letting the turn close`);
            return;
        }
        const sopDir = resolveSopDir(config);
        let sopStandards = [];
        if (sopDir !== '') {
            const standards = loadSopStandards(sopDir);
            // 命中任意一个 SOP 文件即判定为「相关任务」；SOP 可能是多个文件共同
            // 构成一份标准，因此命中后读取文件夹内全部标准文件，而不是只读命中的。
            const matched = matchSopStandards(userPrompt, standards);
            if (matched.length > 0) {
                const emptyNames = standards.filter((standard) => standard.content === '').map((standard) => standard.keyword);
                if (emptyNames.length > 0) {
                    log.warn(`agent "${agent.id}" turn ${turn}: SOP file(s) with empty content ignored: ${emptyNames.join(', ')}`);
                }
                sopStandards = standards.filter((standard) => standard.content !== '');
                log.info(`agent "${agent.id}" turn ${turn}: SOP matched (${matched.map((standard) => standard.keyword).join(', ')}), loading all ${sopStandards.length} standard file(s)`);
            }
        }
        const route = resolveRoute(agent, config);
        if (route === undefined) {
            log.warn(`agent "${agent.id}" turn ${turn}: no reviewer route available (agent route unknown and reviewer not configured); skipping review`);
            return;
        }
        log.info(`agent "${agent.id}" turn ${turn}: reviewing reply (${assistantReply.length} chars, round ${round + 1}/${config.maxRounds}) via ${route.provider}/${route.model}`);
        let verdict;
        try {
            const reviewer = new Reviewer(ctx.llm, route, config);
            verdict = await reviewer.review({ userPrompt, assistantReply, round: round + 1, maxRounds: config.maxRounds, sopStandards }, signal);
        }
        catch (error) {
            if (signal.aborted)
                return;
            log.warn(`agent "${agent.id}" turn ${turn}: reviewer call failed, letting the turn close: ${String(error)}`);
            return;
        }
        if (signal.aborted)
            return;
        if (verdict.pass) {
            log.info(`agent "${agent.id}" turn ${turn}: review passed`);
            return;
        }
        const nextRound = ledger.bump(agent.id, turn);
        ledger.prune();
        log.info(`agent "${agent.id}" turn ${turn}: review failed with ${verdict.issues.length} issue(s); steering fix request (round ${nextRound}/${config.maxRounds})`);
        agent.steer({
            role: 'user',
            content: [{ type: 'text', text: renderFixRequest(verdict, nextRound, config.maxRounds) }],
            source: { kind: 'plugin', plugin: 'quality-review', form: 'notice', summary: '质量审核追问' },
        });
    });
    log.info('quality-review ready: auditing assistant turns on turn-stopping');
}
//# sourceMappingURL=index.js.map
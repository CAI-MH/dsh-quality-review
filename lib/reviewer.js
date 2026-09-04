export class ReviewError extends Error {
}
const SYSTEM_PROMPT = `你是一名严格、挑剔但公正的 AI 回答质量审核员。你的工作是审核另一个 AI 助手对用户提问的最终回答。

只依据以下被开启的审核维度进行判定；每个维度都可能被关闭，关闭的维度不要评论。

判定标准：
- 只有当回答存在**明确的、实质性的**问题时才判不通过。风格偏好、可选的改进建议不构成不通过的理由。
- 不确定是否属实时，按通过处理——宁可漏过，不可误伤。
- 你的输出会被程序解析：只输出一个 JSON 对象，不要输出任何其他文字、解释或 Markdown 代码围栏。

输出格式（严格遵守）：
{"pass": true}
或
{"pass": false, "issues": [{"aspect": "<维度名>", "problem": "<具体问题是什么>", "suggestion": "<应该如何修改>"}]}

issues 数组只列实质问题，每条都要具体到可以直接据此修改。`;
function enabledAspects(config) {
    const labels = [
        ['factualAccuracy', '事实准确性', '回答中是否有明显的事实错误、编造的引用/数据/概念'],
        ['completeness', '回答完整性', '是否完整回答了用户提出的所有问题，有无遗漏要点'],
        ['logicalConsistency', '逻辑一致性', '推理过程是否自相矛盾，结论是否能从论据推出'],
        ['instructionFollowing', '指令遵循', '是否违反了用户明确提出的格式、语言、长度或其他约束'],
    ];
    return labels
        .filter(([key]) => config.aspects[key])
        .map(([, name, desc]) => `- ${name}：${desc}`);
}
export function renderReviewPrompt(request, config) {
    const aspects = enabledAspects(config);
    const aspectBlock = aspects.length > 0 ? aspects.join('\n') : '- 综合质量：回答是否合理、可信、有用';
    return `请审核以下 AI 助手的回答质量。

【开启的审核维度】
${aspectBlock}

【用户的提问】
${request.userPrompt.trim() === '' ? '（未能获取原文，请依据回答内容本身判断）' : request.userPrompt}

【AI 助手的回答】
${request.assistantReply}

【审核轮次】第 ${request.round} 轮 / 共 ${request.maxRounds} 轮${request.round > 1 ? '（该回答已根据上一轮审核意见修改过，请重点核对修改是否解决了问题）' : ''}

现在给出你的审核结论（只输出 JSON）：`;
}
/** Accumulate a dsh-llm stream into plain text. */
async function collectText(stream, signal) {
    let text = '';
    for await (const chunk of stream) {
        signal.throwIfAborted();
        const c = chunk;
        if (c.type === 'text-delta' && typeof c.text === 'string')
            text += c.text;
        else if (c.type === 'finish' && c.reason && (c.reason.kind === 'error' || c.reason.kind === 'aborted')) {
            throw new ReviewError(`reviewer call failed: ${c.reason.kind}: ${c.reason.failure?.message ?? 'unknown'}`);
        }
    }
    return text;
}
/** Extract the first balanced JSON object from arbitrary text. */
export function extractJsonObject(text) {
    const start = text.indexOf('{');
    if (start < 0)
        return undefined;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i++) {
        const ch = text[i];
        if (inString) {
            if (escaped)
                escaped = false;
            else if (ch === '\\')
                escaped = true;
            else if (ch === '"')
                inString = false;
            continue;
        }
        if (ch === '"')
            inString = true;
        else if (ch === '{')
            depth++;
        else if (ch === '}') {
            depth--;
            if (depth === 0)
                return text.slice(start, i + 1);
        }
    }
    return undefined;
}
function normalizeIssue(value) {
    if (typeof value !== 'object' || value === null)
        return undefined;
    const v = value;
    const problem = typeof v.problem === 'string' ? v.problem.trim() : '';
    if (problem === '')
        return undefined;
    return {
        aspect: typeof v.aspect === 'string' && v.aspect.trim() !== '' ? v.aspect.trim() : '综合',
        problem,
        suggestion: typeof v.suggestion === 'string' ? v.suggestion.trim() : '',
    };
}
export function parseVerdict(raw) {
    const json = extractJsonObject(raw);
    if (json === undefined)
        return { pass: true, issues: [], raw };
    try {
        const parsed = JSON.parse(json);
        if (parsed.pass !== false)
            return { pass: true, issues: [], raw };
        const issues = Array.isArray(parsed.issues)
            ? parsed.issues.map(normalizeIssue).filter((i) => i !== undefined)
            : [];
        // A fail verdict without any actionable issue cannot be fixed — treat as pass.
        if (issues.length === 0)
            return { pass: true, issues: [], raw };
        return { pass: false, issues, raw };
    }
    catch {
        return { pass: true, issues: [], raw };
    }
}
export class Reviewer {
    llm;
    route;
    config;
    constructor(llm, route, config) {
        this.llm = llm;
        this.route = route;
        this.config = config;
    }
    async review(request, signal) {
        const timeout = AbortSignal.timeout(this.config.review.timeoutMs);
        const combined = signal !== undefined ? AbortSignal.any([signal, timeout]) : timeout;
        const stream = this.llm.stream({
            provider: this.route.provider,
            model: this.route.model,
            messages: [
                {
                    role: 'user',
                    content: [{ type: 'text', text: renderReviewPrompt(request, this.config) }],
                },
            ],
            system: SYSTEM_PROMPT,
            maxTokens: this.config.review.maxTokens,
            temperature: this.config.review.temperature,
            signal: combined,
        });
        const raw = await collectText(stream, combined);
        return parseVerdict(raw);
    }
}
/** Render the steered follow-up message sent back to the agent. */
export function renderFixRequest(verdict, round, maxRounds) {
    const items = verdict.issues
        .map((issue, index) => {
        const suggestion = issue.suggestion === '' ? '' : `\n   修改建议：${issue.suggestion}`;
        return `${index + 1}. 【${issue.aspect}】${issue.problem}${suggestion}`;
    })
        .join('\n');
    const tail = round >= maxRounds
        ? '\n\n这是最后一次修改机会，请尽力修正；若确实无法修正某条，请简要说明原因。'
        : '';
    return `[质量审核] 你刚才的回答未通过审核（第 ${round}/${maxRounds} 轮），发现以下 ${verdict.issues.length} 个问题：\n\n${items}\n\n请针对上述问题修改你的回答：直接给出修正后的完整回答，不要辩解或复述审核意见。${tail}`;
}
//# sourceMappingURL=reviewer.js.map
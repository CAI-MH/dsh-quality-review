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

const Config: Schema<QualityReviewConfig> = Schema.object({
  enabled: Schema.boolean()
    .default(true)
    .description('总开关；关闭后插件保持加载但不做任何审核。'),
  reviewer: Schema.object({
    provider: Schema.string()
      .default('')
      .description('审核模型的 provider id；留空则复用该 agent 自己的 provider。'),
    model: Schema.string()
      .default('')
      .description('审核模型 id；留空则复用该 agent 自己的模型。'),
  })
    .default({})
    .description('独立审核模型路由；默认复用会话自身模型。'),
  maxRounds: Schema.natural()
    .max(5)
    .default(2)
    .description('每个回答最多追问修改的轮数上限（防死循环），默认 2。'),
  aspects: Schema.object({
    factualAccuracy: Schema.boolean().default(true).description('事实准确性：检查明显事实错误与编造信息。'),
    completeness: Schema.boolean().default(true).description('回答完整性：检查是否遗漏用户问题的任何部分。'),
    logicalConsistency: Schema.boolean().default(true).description('逻辑一致性：检查推理矛盾与站不住脚的结论。'),
    instructionFollowing: Schema.boolean().default(true).description('指令遵循：检查是否违反用户明确提出的格式、语言与约束。'),
  })
    .default({})
    .description('审核维度开关。'),
  review: Schema.object({
    maxTokens: Schema.natural().default(2048).description('审核请求的输出 token 上限。'),
    temperature: Schema.number().min(0).max(2).default(0.1).description('审核请求的采样温度；低温让判定更稳定。'),
    timeoutMs: Schema.natural().default(120_000).description('审核请求超时（毫秒）。'),
  })
    .default({})
    .description('审核调用限制。'),
  minReplyChars: Schema.natural()
    .default(200)
    .description('低于该字符数的简短回复不审核，避免对闲聊式回答过度反应。'),
  exemptPatterns: Schema.array(Schema.string())
    .default([])
    .description('常见任务豁免：用户提问包含任一关键词时跳过审核（用于固定 SOP 的例行任务，避免误伤）。'),
  sop: Schema.object({
    enabled: Schema.boolean()
      .default(true)
      .description('启用 SOP 标准参照：从文件夹读取文件名匹配相关任务，把命中文件的内容作为该任务的质量标准注入审核。'),
    dir: Schema.string()
      .default('')
      .description('SOP 文件夹路径；留空使用默认目录 DSH_HOME/quality-review/sop。'),
  })
    .default({})
    .description('常见任务 SOP 标准参照。'),
});

export default Config;

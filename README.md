# dsh-quality-review

English | [中文](README.zh.md)

AI response quality review for [DeepSeek Harness](https://github.com/nicepkg/dsh) (DSH): audits each finished assistant turn with an independent reviewer model and steers the agent to fix unreasonable output (up to 2 review rounds).

## How it works

On `agent/turn-stopping` — the moment a turn is about to close — the plugin takes the assistant's latest visible reply, audits it with a reviewer model, and when the verdict is **fail** it steers the agent with a concrete fix request so the turn stays open and the model revises. Each turn allows at most `maxRounds` steered follow-ups (default 2), which is the hard loop guard.

Reviewed aspects (each can be toggled):

- **Factual accuracy** — obvious factual errors and fabricated information
- **Completeness** — any part of the user's question left unanswered
- **Logical consistency** — contradictory reasoning and unsupportable conclusions
- **Instruction following** — violations of explicit user format/language/constraint requirements

## Install

```sh
dsh plugin --profile web add dsh-quality-review
```

Or add it to your profile's `package.json` dependencies and list it under `dsh.profile.bundles`, then restart `dsh web`.

## Configuration

Every field has a safe default, so the bundle row can be inserted with no `config` at all. Override individual keys from your profile's `cordis.patch.yml`:

```yaml
- id: quality-review
  config:
    enabled: true            # master switch; the plugin stays loaded but inert when false
    reviewer:
      provider: ''           # reviewer provider id; empty reuses the agent's own provider
      model: ''              # reviewer model id; empty reuses the agent's own model
    maxRounds: 2             # max steered fix rounds per turn (loop guard, max 5)
    aspects:
      factualAccuracy: true
      completeness: true
      logicalConsistency: true
      instructionFollowing: true
    minReplyChars: 200       # skip replies shorter than this
    sop:
      enabled: true          # SOP reference-standard switch (default on)
      dir: ''                # SOP folder; empty uses DSH_HOME/quality-review/sop
    exemptPatterns:          # extra static keywords: skip review on match (optional)
      - 代码 review
```

### Common-task SOP reference standards (`sop`)

For routine SOP-style tasks, reviewing against generic dimensions is noisy. The plugin reads a **SOP folder** and treats each file *name* (extension stripped) as a match keyword for the related task; when the user prompt matches any name (case-insensitive substring), it loads the content of **every file** in the folder — a SOP may span several files — and injects it into the review prompt as the task's quality standard, adding a "是否符合 SOP 规范" dimension the reviewer checks the answer against. Non-matching turns still use the generic four dimensions.

Default folder: `DSH_HOME/quality-review/sop`. Drop files in and fill them with the task's standard (what a good output must contain / avoid); no config or restart needed — the folder is re-scanned every turn. `exemptPatterns` is separate: a static keyword list that *skips* review on match.

## Development

```sh
npm install
npm run build    # tsc — compiles src/ to lib/
```

The published package ships the compiled `lib/` output; `src/` holds the TypeScript sources.

## License

[MIT](LICENSE)

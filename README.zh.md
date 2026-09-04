# dsh-quality-review

[English](README.md) | 中文

[DeepSeek Harness](https://github.com/nicepkg/dsh)(DSH)的 AI 回复质量审查插件:每轮助手回复结束时,用独立的审查模型审核该回复,发现不合理输出时引导 agent 修复(最多 2 轮追问)。

## 工作原理

在 `agent/turn-stopping` 事件(一轮对话即将关闭的时刻),插件取出助手最新一条可见回复,交给审查模型审核;当判定为 **fail** 时,生成具体的修复请求并 steer agent,让这轮对话保持打开、由模型修订输出。每轮对话最多允许 `maxRounds` 次引导追问(默认 2),这是硬性防死循环保护。

审查维度(均可单独开关):

- **事实准确性** —— 检查明显事实错误与编造信息
- **回答完整性** —— 检查是否遗漏用户问题的任何部分
- **逻辑一致性** —— 检查推理矛盾与站不住脚的结论
- **指令遵循** —— 检查是否违反用户明确提出的格式、语言与约束要求

## 安装

```sh
dsh plugin --profile web add dsh-quality-review
```

或将它加入 profile 的 `package.json` dependencies,并列入 `dsh.profile.bundles`,然后重启 `dsh web`。

## 配置

所有字段都有安全默认值,bundle 行可以不带任何 `config` 直接插入。如需覆盖,在 profile 的 `cordis.patch.yml` 中配置:

```yaml
- id: quality-review
  config:
    enabled: true            # 总开关;关闭后插件保持加载但不做任何审核
    reviewer:
      provider: ''           # 审查模型 provider id;留空复用 agent 自身 provider
      model: ''              # 审查模型 id;留空复用 agent 自身模型
    maxRounds: 2             # 每个回答最多追问修改的轮数上限(防死循环,最大 5)
    aspects:
      factualAccuracy: true
      completeness: true
      logicalConsistency: true
      instructionFollowing: true
```

## 开发

```sh
npm install
npm run build    # tsc —— 将 src/ 编译到 lib/
```

发布的包携带编译后的 `lib/` 产物;`src/` 为 TypeScript 源码。

## 许可证

[MIT](LICENSE)

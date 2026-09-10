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
    minReplyChars: 200       # 低于该字符数的简短回复不审核
    sop:
      enabled: true          # SOP 标准参照开关(默认开启)
      dir: ''                # SOP 文件夹路径;留空用默认目录 DSH_HOME/quality-review/sop
    exemptPatterns:          # 额外静态关键词:命中即跳过审核(可选)
      - 代码 review
```

### 常见任务 SOP 标准参照(sop)

对固定 SOP 的例行任务,与其用笼统的通用维度审核,不如对照该任务自己的质量标准。插件会读取一个 **SOP 文件夹**,把里面每个**文件名**(去掉扩展名)当作相关任务的匹配关键词:当用户提问命中任一文件名(大小写不敏感、子串匹配)时,即判定为相关任务,并读取文件夹内**全部标准文件**的内容作为「该任务的质量标准」注入审核 prompt——因为 SOP 可能是多个文件共同构成一份标准。审核员据此新增一个「是否符合 SOP 规范」维度来核对回答是否合规;未命中的任务仍走通用四维度审核。

默认文件夹是 `DSH_HOME/quality-review/sop`(DSH_HOME 通常是 `~/Library/Application Support/dsh-desktop/harness`)。你只需**往里放好内容**即可生效,无需改配置、无需重启:

```
quality-review/sop/
├── 周报.md          # 命中 "帮我写周报" 等提问 → 用此文件内容作为周报质量标准
├── 会议纪要.md      # 命中 "整理一下会议纪要" → 用此文件内容作为纪要质量标准
└── 日报.txt         # 命中 "今天的日报" → 用此文件内容作为日报质量标准
```

- 文件名(去掉扩展名)即匹配关键词;支持的扩展名:` .md` / `.txt` / `.markdown`。
- **文件内容才是质量标准**:请把该任务「合格产出长什么样 / 必须包含哪些要点 / 不能犯哪些错」写进去;文件名只负责匹配任务。
- **命中即读全部**:只要命中任意一个文件名,就会把文件夹里**所有**标准文件的内容一起注入审核(不是只读命中的那一个),方便你把一份 SOP 拆成多个文件(如格式、要点、禁忌各一份)。
- **支持子文件夹**,会递归遍历整个目录树;可按类别建子目录归类,例如 `工作/周报.md`、`生活/旅行计划.md`。
- 新增/删除/重命名/修改文件后,**下一轮对话立即生效**(每轮重新扫描)。
- 想换个位置,把 `sop.dir` 配成该目录绝对路径;想整体关闭,设 `sop.enabled: false`。

### 静态关键词豁免(exemptPatterns)

除了 SOP 标准参照,也可以用 `exemptPatterns` 写死一小批关键词(数组,大小写不敏感、子串匹配),命中即**跳过审核**(这是「豁免」,与 SOP 的「参照标准」是两回事)。

## 开发

```sh
npm install
npm run build    # tsc —— 将 src/ 编译到 lib/
```

发布的包携带编译后的 `lib/` 产物;`src/` 为 TypeScript 源码。

## 许可证

[MIT](LICENSE)

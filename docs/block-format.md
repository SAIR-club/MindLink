# 积木格式（MindLink#5）

状态：**已实现**。本文是贴在 MindLink#5 下的格式草案，按第 10 节每个问题的建议选项实现在 `apps/mindlink/src/blocks/`；#9、#11、#29、#30、#7、#6、#28 按本文写内容或对接。实现与草案不同的地方，在对应位置用"实现说明"标出。

依据：MindLink 产品规格（SAIR-club/Episteme#65）第 1.2 节 D7、D8，第 2.4、2.5 节；MindLink#5、#9、#11、#29、#30、#7、#10、#28 的正文；MindLink#8 的 draft PR SAIR-club/MindLink#32（`architecture.json`、`tests/architecture/check.ts`）；Anthropic Agent Skills 官方文档（Overview、Skill authoring best practices）。

文末第 10 节列出讨论过的问题；正文按每个问题的建议选项写，也按它实现。对哪一项有不同意见，请在 MindLink#5 下回复问题编号。

## 目录

1. 总览：四种文件、三个来源
2. 目录结构与位置
3. 元数据（frontmatter）
4. 正文的固定小节与按需加载
5. 引用、步骤 id、强度与参数
6. 命名空间、同名与定制
7. 格式版本与迁移
8. 校验错误清单
9. 完整例子：`guide` 与工作流 `apply`（即 #30 的 `practice`）
10. 需要确认的问题
11. 与其他 issue 的约定

---

## 1. 总览

| 级（`level`） | 秩 | 主文件 | 是什么 | 可以引用 |
| ------------- | -- | ------ | ------ | -------- |
| `primitive` 基础积木 | 1 | `BLOCK.md` | 最小的教学动作 | 工具 |
| `activity` 活动积木 | 2 | `BLOCK.md` | 一个完整的学习环节 | 基础积木、工具 |
| `fragment` 片段 | 3 | `WORKFLOW.md` | 几个活动积木组成的可复用片段 | 活动积木 |
| `workflow` 工作流 | 4 | `WORKFLOW.md` | 一次学习的安排 | 活动积木、片段 |

规则只有一条：**引用目标的秩必须严格小于引用者的秩**。工具不是积木，不参与比较，只有基础积木和活动积木可以引用工具。

- `BLOCK.md` 的正文是给 agent 看的教学说明，分 tell / hint / ask 三档。
- `WORKFLOW.md` 的 frontmatter 是步骤表，正文只有给人看的说明和（agent 编排时）编排说明，没有强度分档。
- 规格第 2.1 节写的"`.md` 和 `.yaml` 文件"，在本草案里统一成"Markdown 加 YAML frontmatter"：只有一种文件格式、一个解析器，行号也只有一种算法。没有单独的 `.yaml` 文件。

参考 Agent Skills 的做法：

| Agent Skills | 本草案 |
| ------------ | ------ |
| `SKILL.md` = YAML frontmatter（`name`、`description`）+ 正文 | `BLOCK.md` / `WORKFLOW.md` = YAML frontmatter + 正文 |
| 渐进式加载：元数据常驻 → 触发后读正文 → 按需读附件 | 元数据进积木库和编排排序 → `workflow_next` 只给当前活动、当前强度那一节 → `block_read` 按需读基础积木和附件 |
| `name` 最多 64 个字符，只能有小写字母、数字、`-` | `id` 同样的规则 |
| `description` 写"做什么、什么时候用"，最多 1024 字符 | `summary` 写"做什么、什么时候用"，最多 200 字 |
| 正文建议不超过 500 行；附件从 `SKILL.md` 直接链接，只深一层；超过 100 行的附件开头放目录 | 同样：主文件不超过 500 行（校验）；附件只能从主文件链接，附件之间不再互链（校验）；长附件放目录（建议，不校验） |
| 路径一律用 `/` | 同样 |
| 可以带脚本，由 agent 执行 | **不允许任何脚本**。积木只有声明式内容（D7），目录里出现代码文件就报错；正文里的代码块只当作文本 |

## 2. 目录结构与位置

### 2.1 一块积木的目录

```text
<id>/
├── BLOCK.md            基础积木、活动积木的主文件（或 WORKFLOW.md，二者只能有一个）
├── references/         可选。按需读取的资料，只放 .md
│   └── <name>.md
└── examples/           可选（内置积木必填，见 8.9）。示例对话，同时是测试数据，只放 .md
    └── <name>.md
```

- 目录名就是 `id`。
- 只允许上面这些文件。`references/`、`examples/` 下不能再有子目录。
- 文件名：小写字母、数字、`-`，以 `.md` 结尾。
- 文本一律 UTF-8，不带 BOM，换行 `\n`（`\r\n` 读入时规整，但行号按规整后的算）。

### 2.2 内置积木放在哪里

建议：

| 内容 | 位置 | 说明 |
| ---- | ---- | ---- |
| 积木功能的代码（L2） | `apps/mindlink/src/blocks/` | 格式解析与校验 `format/`、注册表 `registry/`（#5）；编排引擎 `engine/`（#9）；积木用到的工具 `tools/`（#11）；对外只通过 `index.ts` |
| 内置积木的内容 | `apps/mindlink/blocks/<id>/` | **平铺**，四级都在同一层，级别看 frontmatter 的 `level` |
| 检查命令 | `pnpm modules:check` | 运行 `apps/mindlink/dist/blocks/check-library.js`，校验 `apps/mindlink/blocks/` 下的全部积木；也是 `pnpm check` 的最后一步 |

为什么平铺：PR #32 的 `tests/architecture/check.ts` 把 `blocks.library` 目录下**第一层目录名**当作内置积木的 id，再检查引擎源码里有没有出现这些 id。按级别分子目录（`primitives/guide/`）会让它拿到 `primitives` 这样的假 id。平铺正好和它对上，不需要改 PR #32。

对应的 `architecture.json` 配置（由 #5 的 PR 加，不改 PR #32）：

```json
"blocks": { "engine": "apps/mindlink/src/blocks", "library": "apps/mindlink/blocks" }
```

这里 `engine` 建议填整个积木功能目录，而不只是 `engine/`：格式解析、注册表、工具也都不应该认识具体的积木。

实现说明：`architecture.json` 已按上面配置；`tests/architecture.test.ts` 除了各个包的 `src/` 和 `web/`，也读取 `blocks.library` 目录，所以内置积木一进来，规则 6 就会检查积木功能的源码。为此 YAML 解析结果的节点类型写成 `mapping` / `sequence`，避免和内置积木 `map` 撞名。

一个要留意的地方：这条规则按字符串字面量匹配。内置积木里有 `conflict`、`transfer` 这样和维度同名的 id，以及 `path`、`model`、`example` 这样常见的词。积木功能的代码里如果出现 `'conflict'` 这样的字面量（哪怕指的是维度），也会被报出来。建议的做法是代码里的维度一律从词汇表读取，不写字面量；真的冲突时再在 #20 下讨论。

### 2.3 课程和用户的积木放在哪里

课程积木和用户积木不在文件系统里，而是存在场景记录里（用户的存在 `blocks/*`，课程的等 G4）。一条记录存的是"一个虚拟目录"：

```ts
{ files: { 'BLOCK.md': '…', 'references/x.md': '…', 'examples/a.md': '…' } }
```

解析器只认这种"路径 → 文本"的映射，不碰文件系统，所以三个来源走同一个解析器，错误里的文件名也一样写（见 8.1）。导入、导出就是这个映射和 zip（或目录）之间的转换（#28）。

## 3. 元数据（frontmatter）

### 3.1 YAML

frontmatter 是文件开头两行 `---` 之间的部分，写标准的 YAML 1.2（核心模式），由 `yaml` 库解析。VS Code、Prettier 这类编辑器重排过的写法（折行的流式列表、统一成双引号、`>` `|` 多行字符串等）都可以直接用。每个值仍然带着它在文件里的行号和列号，所以问题能指到具体位置。

标量的类型由写法决定：字符串、整数（必须是安全整数）、`true` / `false`；浮点数和空值（`key:`、`~`、`null`）也能读进来，但积木没有哪个字段要它们，会在字段检查时按"应该是……，而不是浮点数 / 空值"报 `field-type`（参数的 `default`、示例里的值同理）。`yes` / `no` 在 YAML 1.2 里就是普通字符串。映射的键按写出来的文字读。`summary` 这类一行文字的字段可以写成 `>` 或 `|` 的多行字符串，末尾的换行不算文字的一部分。

遇到下面这些，报 `frontmatter-syntax`，带行号和列号：

- 锚点 `&a`、别名 `*a`、显式标签 `!x` / `!!str` / `!!python/...`、合并键 `<<`：积木会被分享，这几个特性能让文件的含义和看上去不一样，所以一律不收；
- 最外层不是"键: 值"的映射；
- 同一映射里重复的键、缩进里的制表符、多文档（`---` 或 `...` 之后还有内容）；
- 库报告的其它语法错误，写成"YAML 语法错误：……"。

理由：积木的格式不该比作者的编辑器更挑；真正要防的只有分享场景里可能出意外的那几个特性，其余按标准 YAML 来。

### 3.2 通用字段

所有积木都有。**未知字段报错**（`unknown-field`），这样拼错的字段不会被悄悄忽略。

| 字段 | 类型 | 必填 | 校验 |
| ---- | ---- | ---- | ---- |
| `format` | 整数 | 是 | 必须是本版本支持的格式号；本草案是 `1`（见第 7 节） |
| `id` | 字符串 | 是 | `^[a-z][a-z0-9-]{0,63}$`；不含 `:`（来源不写在文件里，见第 6 节）；必须等于目录名（课程和用户的积木是记录名） |
| `level` | 枚举 | 是 | `primitive` / `activity` / `fragment` / `workflow`；前两个必须在 `BLOCK.md` 里，后两个必须在 `WORKFLOW.md` 里 |
| `title` | 字符串 | 是 | 1–40 个字符，单行；简体中文 |
| `summary` | 字符串 | 是 | 1–200 个字符，单行；写"做什么、什么时候用"，积木库和 agent 编排的排序理由都用它 |
| `origin` | 字符串 | 否 | 复制来源的完整 id，例如 `builtin:guide`；只是记录，引擎不读（见 6.3） |
| `origin_digest` | 字符串 | 否 | 复制时来源内容的摘要（`sha256:` 加 64 位十六进制），用来提示"来源有更新"；有 `origin_digest` 必须有 `origin` |

### 3.3 基础积木和活动积木（`BLOCK.md`）的字段

| 字段 | 类型 | primitive | activity | 校验 |
| ---- | ---- | --------- | -------- | ---- |
| `dimensions` | 维度 id 的列表 | 可选 | **必填**（可以是 `[]`） | 每个都必须是词汇表里登记的维度（见 3.6）；不能重复 |
| `intensities` | 列表，取自 `tell` / `hint` / `ask` | 必填 | 必填 | 非空、不重复；顺序有意义：第一个是这块积木的默认强度 |
| `tools` | 工具名的列表 | 可选 | 可选 | 每个都必须是已注册的积木工具（见 3.6）；不重复 |
| `steps` | 子步骤的列表 | 不允许 | 可选 | 见 5.1；每一步只能引用基础积木 |
| `params` | 参数声明的映射 | 可选 | 可选 | 见 3.5 |
| `result` | 结果字段的映射 | 不允许 | **必填**（可以是 `{}`） | 见 3.4 |
| `cost` | 枚举 | 不允许 | 必填 | `low` / `medium` / `high`；精简模式按它跳过高成本的步骤（#9） |

- `dimensions` 写的是"主要推动的维度"（规格 2.5 节的表）。`goal`、`path` 这种不推动维度的写 `[]`。`diagnose` 的"读取全部维度"、`distill` 的"写入图谱"都不是推动某个维度，同样写 `[]`，在 `summary` 里说明。
- 结果只在活动积木上声明（建议，见 Q5）：`workflow_report` 是按活动这一步报的，一步只报一份结果；基础积木的产出由活动的结果字段汇总。

### 3.4 结果字段（`result`）

`result` 是"字段名 → 字段声明"的映射。字段名用 `^[a-z][a-z0-9_]{0,31}$`。`workflow_report` 按它校验 agent 报上来的结果，引擎按类型做通用统计。

| `type` | 其他键 | 统计 |
| ------ | ------ | ---- |
| `enum` | `values`：非空、不重复的字符串列表，每个符合 `^[a-z][a-z0-9-]*$` | 每个取值的次数和占比 |
| `boolean` | — | 为真的占比 |
| `integer` | `min`、`max`：必填，`min ≤ max`，范围不超过 100 | 平均值和每个取值的次数 |

每个字段还可以写：

- `required: true`：每次都必须报；
- `required_when: { <另一个 enum 字段>: [取值, …] }`：只有那个字段取这些值时才必须报，其他情况必须不报。引用的字段必须存在、必须是 `enum`、取值必须在它的 `values` 里。
- `required` 和 `required_when` 只能写一个；都不写就是可选。
- `label`：中文名，结果统计页显示用，1–20 个字符，可选。

**第 1 版不支持自由文本字段。** 结果只用于统计，不存对话内容；对话本身归线程（D4）。字段之间的其他约束（例如 `picked_rank ≤ offered`）第 1 版也不支持，写在正文 `## 结果` 里由 agent 遵守。

统计按"完整积木 id"分组，同时可以按"工作流 + 步骤路径"和"强度"细分，这样 `apply` 里两次 `guide` 的点选率可以分开看。

### 3.5 参数（`params`）

参数让同一块积木在不同步骤里有小的差别（例如预测几个问题），而不必复制一份积木。

```yaml
params:
  max_questions: { type: integer, min: 2, max: 5, default: 3, label: 预测几个问题 }
```

- 参数名同结果字段名的规则；类型只有 `enum`、`boolean`、`integer`，写法同 3.4；`default` 必填且必须合法。
- 正文里用 `{{max_questions}}` 引用参数，`workflow_next` / `block_read` 返回前替换成实际值。只做这一种替换，没有条件、循环或表达式。出现未声明的 `{{名字}}` 报错；代码块里的 `{{…}}` 也会替换（它就是文本）。要写字面的 `{{` 时写 `\{{`。

### 3.6 维度和工具从哪里来

解析和校验是纯函数，维度和工具的合法集合作为参数传入，不写死在格式里：

| 集合 | 服务运行时 | `pnpm modules:check` 和单元测试 |
| ---- | ---------- | ------------------------------- |
| 维度 | `StateReader.vocabulary()`（与 `GET /api/v1/vocabulary` 同源），只取当前登记的维度 | `@mindlink/domain-learn` 导出的 `learnStateDimensions` 的 id：`exposure`、`confidence`、`evidence`、`articulation`、`transfer`、`conflict`、`source` |
| 工具 | 积木功能注册的工具表（#11） | 同一张工具表（它是积木功能的公开导出） |

### 3.7 片段和工作流（`WORKFLOW.md`）的字段

| 字段 | 类型 | fragment | workflow | 校验 |
| ---- | ---- | -------- | -------- | ---- |
| `steps` | 步骤列表 | 必填 | 必填 | 非空；见 5.1 |
| `orchestration` | 枚举 | 不允许 | 必填 | `fixed`：按顺序推进；`agent`：`steps` 是候选，由引擎按维度和缺口排序（#9） |

片段只能引用活动积木；工作流可以引用活动积木和片段（建议片段不嵌套，见 Q4）。

## 4. 正文的固定小节与按需加载

### 4.1 `BLOCK.md` 的小节

正文由二级标题 `## ` 分成小节，标题文字必须**完全等于**下表之一（区分大小写）。可以有一个一级标题 `# …` 放在最前面（只给人看，不返回给 agent）。`##` 之前除了一级标题和空行不能有别的内容。

| 小节 | primitive | activity | 内容 |
| ---- | --------- | -------- | ---- |
| `## 通用` | 可选 | 可选 | 三档都适用的说明，例如要调用哪些工具、怎么展示 |
| `## tell` | 支持 tell 时必有 | 同左 | 直接讲时怎么做 |
| `## hint` | 支持 hint 时必有 | 同左 | 给提示时怎么做 |
| `## ask` | 支持 ask 时必有 | 同左 | 只提问时怎么做 |
| `## 结果` | 不允许 | `result` 非空时必有 | 告诉 agent 每个结果字段怎么填 |
| `## 结束条件` | 必有 | 必有 | 什么时候算这一步做完 |

- 每个小节最多出现一次，不能为空（`section-empty`）。
- `intensities` 里有的档必须有对应小节，没有的档不能有小节。
- 小节里面可以自由使用 `###` 及更低的标题、列表、表格、代码块。
- 判断标题时跳过围栏代码块（```` ``` ```` 或 `~~~` 开头，到同样的围栏结束）：代码块里的 `## tell` 不是小节。代码块只当作文本，从不执行，也不做任何解释（除了 3.5 的参数替换）。
- 主文件（frontmatter 加正文）不超过 500 行。

强度小节写法的约定（内容审读时看，不由校验器检查）：

- 每一档都写成**完整、可单独执行**的说明，不写"同 hint，但是……"——agent 只看得到当前这一档。
- 三档的差别只在"给多少答案"：tell 直接讲清楚；hint 给线索、让学习者自己补全；ask 只提问，**绝不给出答案**。
- 三档共同的部分写在 `## 通用`，不要重复三遍。

### 4.2 `WORKFLOW.md` 的小节

| 小节 | fragment | workflow | 内容 |
| ---- | -------- | -------- | ---- |
| `## 说明` | 可选 | 可选 | 给人看的介绍，显示在积木库和组装器里，不返回给 agent |
| `## 编排说明` | 不允许 | `orchestration: agent` 时必有，否则不允许 | 告诉 agent 怎么在候选之间取舍，随 `workflow_next` 返回 |

### 4.3 附件和链接

- 正文里用相对链接指向附件：`[同课卡点怎么用](references/hotspots.md)`。路径必须以 `references/` 开头，不能有 `..`、不能是绝对路径，文件必须存在。
- `references/` 里每个文件都必须被主文件链接到（否则报 `unlinked-reference`），附件之间不能互链（只深一层）。
- `examples/` 不从正文链接，只给测试和积木库用。
- 正文可以写网址，但只是文字：`block_read` 从不抓取网址。

### 4.4 每个接口返回什么

引擎按小节标题切片，不需要理解内容，也不认识具体积木。

| 接口 | 返回 |
| ---- | ---- |
| 积木库、编排排序 | frontmatter 里的元数据（第一级，和 skill 的 `name` / `description` 一样） |
| `workflow_next` | 当前活动的：完整 id、`title`、步骤路径、实际强度、参数值；`## 通用` + **当前强度那一节** + `## 结果` + `## 结束条件`（参数已替换）；子步骤清单（每一步的步骤 id、基础积木的完整 id、`title`、`summary`、是否可选）；附件清单（路径和链接文字）。**不返回另外两档。** |
| `block_read`（基础积木） | 那个基础积木的 `## 通用` + 当前强度（与所在活动相同）那一节 + `## 结束条件`，同样不返回另外两档 |
| `block_read`（附件） | 那个附件的全文 |

所以 #9 的验收"返回的说明里没有另外两档"在格式层面就有保证：另外两档在文件里是独立的小节，不会混在一起。

## 5. 引用、步骤 id、强度与参数

### 5.1 步骤的写法

活动积木的 `steps`、片段和工作流的 `steps` 写法相同：

```yaml
steps:
  - use: predict-questions        # 最简单的写法：只写引用
  - id: check                     # 可选：步骤 id
    use: retell-check
    optional: true                # 可选：agent 可以视情况跳过
    params: { strictness: 2 }     # 可选：给目标的参数赋值
```

| 键 | 类型 | 说明 |
| -- | ---- | ---- |
| `use` | 积木引用 | 必填。写法见第 6 节；目标的级别必须更低 |
| `id` | 字符串 | 可选。`^[a-z][a-z0-9-]{0,63}$`；省略时等于引用的名字部分（`user:my-guide` → `my-guide`） |
| `intensity` | 枚举 | 可选，只能写在片段和工作流的步骤上；必须在目标的 `intensities` 里。引用片段时，作用于片段里所有活动 |
| `params` | 映射 | 可选；键必须是目标声明过的参数，值必须合法。活动积木的子步骤里，值可以写成 `"{{活动的参数名}}"`，把活动的参数传给基础积木（类型必须一致） |
| `overrides` | 映射 | 只能用在引用片段的步骤上：`{ <片段里的步骤 id>: { intensity?, params? } }`，单独调整片段里的某一步 |
| `optional` | 布尔 | 可选，默认 `false` |

### 5.2 同一块积木出现多次

同一个 `steps` 列表里步骤 id 不能重复。所以同一块积木出现两次时，至少有一次要写 `id`：

```yaml
steps:
  - use: guide                    # 步骤 id 是 guide
  - use: practice
  - id: guide-after-practice      # 第二次 guide，必须另起 id
    use: guide
```

展开成计划时，步骤路径是从工作流到这一步的 id 用 `.` 连起来，例如引用片段的步骤 `learn` 里的 `guide` 就是 `learn.guide`。步骤路径在一个工作流里唯一，用于：

- 项目里的调整（跳过、插入、替换某一步，#9）按步骤路径定位；
- 临时切换强度、`workflow_report` 报结果都带步骤路径；
- 结果统计按步骤路径细分。

建议在会重复的积木上总是写明 `id`，这样以后插入别的步骤，已有的步骤路径也不会变。

### 5.3 强度怎么定

一步的实际强度按下面的顺序取第一个有的（#9 实现，这里定义格式里各个位置的含义）：

1. 临时切换（只影响当前这一步，#9）；
2. 项目里对这一步的调整（#9）；
3. 工作流步骤上的 `overrides.<id>.intensity`，然后是 `intensity`；
4. 片段里那一步自己写的 `intensity`；
5. 项目的默认引导强度（#10 的 `guidance`）；
6. 积木 `intensities` 的第一个。

1–4 是有人明确写下的，写了目标不支持的强度就是错误（静态的报 `intensity-not-supported`，运行时的由 #9 拒绝）。第 5 条是项目级的默认值，目标不支持时跳到第 6 条，不报错。

活动积木的子步骤不单独设强度，跟随所在活动。因此活动支持的每一档，它引用的每个基础积木也必须支持（`intensity-not-covered`）。

### 5.4 引用规则汇总

| 引用者 | 可以 `use` | 可以 `tools` |
| ------ | ---------- | ------------ |
| primitive | — | 是 |
| activity | primitive | 是 |
| fragment | activity | — |
| workflow | activity、fragment | — |

引用同级或更高级的报 `level-not-lower`。在严格降级的规则下，引用不可能成环；环检测仍然独立做一遍（`cycle`），作为第二道防线，并在报错时给出整条环。

## 6. 命名空间、同名与定制

### 6.1 三个来源和引用写法

| 来源 | 完整 id | 在引用里怎么写 | 谁能看到 |
| ---- | ------- | -------------- | -------- |
| 内置 | `builtin:guide` | `guide`（不加前缀就是内置），或 `builtin:guide` | 所有人 |
| 课程 | `course:hotspot-drill` | `course:hotspot-drill`，指当前项目所属课程里的积木 | 同课的人 |
| 用户 | `user:my-guide` | `user:my-guide`，指自己的积木 | 只有自己 |

- 文件里的 `id` 不带来源；来源由积木从哪里加载决定。这样复制、分享时文件内容不用改。
- **不加前缀只指内置**，不会先找自己的、再找课程的。引用永远指向确定的一块积木，不存在"被覆盖"。
- 可见性决定引用方向：内置只能引用内置；课程积木可以引用课程和内置，**不能引用用户积木**（同学看不到）；用户积木三者都可以引用。分享到课程时，如果引用了自己的用户积木，要么一起分享，要么报 `source-not-visible`。
- 项目设置里的 `workflowId`（#10）存完整 id，例如 `builtin:apply`。

### 6.2 同名

注册表的键是完整 id。建议（见 Q2）：

- 同一来源里两块积木 id 相同，报 `duplicate-id`，两处都列出，两块都不注册；
- 课程和用户的积木不能使用内置积木已有的 id（`shadows-builtin`），避免"我改了 guide，为什么工作流里还是旧的"这类误会；
- 课程积木和用户积木之间同名是允许的，因为引用时一定写前缀。

### 6.3 用户想定制内置积木

建议沿用之前的倾向，三种需求三种做法，**不维护 `extends` 派生关系**：

| 需求 | 做法 | 存在哪里 |
| ---- | ---- | -------- |
| 几个活动经常一起用 | 写成片段，在工作流里引用 | 积木（`WORKFLOW.md`） |
| 只在我的这个项目里改一步（跳过、插入、替换、改强度或参数） | 项目里的调整，按步骤路径打 patch | #9 的运行记录，不改任何积木 |
| 想要一块不一样的 `guide` | 复制一份成 `user:my-guide` 再改；文件里记下 `origin: builtin:guide` 和复制时的 `origin_digest` | 用户积木 |

理由：

1. **引擎保持简单、不认识积木。** 没有继承就不需要"合并父子两份 frontmatter、按小节覆盖正文"的规则，也没有"父积木的某一档被子积木删了怎么办"之类的边界情况。
2. **分享安全、自包含。** 复制出来的积木就是它自己的全部内容，分享到课程时同学看到的和作者看到的完全一样，不会因为内置积木升级而悄悄变了行为。
3. **统计不混。** 复制品有自己的完整 id，结果单独统计，正好可以和原版对比点选率。
4. **代价**：内置积木升级时复制品不会跟着变。用 `origin_digest` 和当前内置积木的摘要比较，积木库里提示"来源有更新"，并显示差异，由用户决定要不要手动合并。引擎从不读 `origin`。
5. **参数**减少了复制的需要：只是想让 `guide` 少问几个问题，用 `params` 就够了。

## 7. 格式版本与迁移

- 每个主文件必须写 `format`，整数，从 `1` 开始。附件和示例没有自己的格式号，跟随主文件。
- **任何改动都升格式号**，包括新增可选字段。因为未知字段报错，旧版本遇到新字段会报 `unknown-field`，不如直接报 `format-too-new` 说清楚。
- 每升一版，格式模块加一个纯函数 `migrate(from N to N+1)`，把旧版的解析结果在内存里升级到新版（与 PR #32 里 `RecordKind.migrate` 同一个思路）。只加字段的版本，迁移就是补默认值。
- 各来源怎么处理旧文件：

| 来源 | 遇到旧格式 |
| ---- | ---------- |
| 内置 | `pnpm modules:check` 要求内置积木都是最新格式（`format-outdated`）；升级格式的同一个 PR 里把文件改写成新格式（到时再加一个迁移命令） |
| 课程、用户 | 读的时候在内存里迁移，照常使用；编辑器提示"格式可以升级"，保存时写成最新格式。存储记录本身另有 `RecordKind` 的版本号，两者互不影响 |
| 任何来源 | 格式号比本版本新：报 `format-too-new`，这块积木不注册 |

- 正在进行的运行用的是计划快照（#9），格式升级不影响它。

## 8. 校验错误清单

### 8.1 错误的形状

错误以值的形式返回，从不抛出；一次校验尽量报出全部错误，而不是遇到第一个就停。

```ts
interface BlockIssue {
  readonly code: string          // 下表的代码
  readonly file: string          // 来源 + id + 积木内路径，例如 'builtin:guide/BLOCK.md'、'user:my-guide/examples/a.md'
  readonly line?: number         // 从 1 开始；只有标为"文件级"的错误没有行号
  readonly column?: number       // 从 1 开始，能确定时给出
  readonly message: string       // 简体中文，说清楚错在哪、应该怎么改
  readonly related?: readonly { readonly file: string; readonly line: number }[]  // 涉及的其他位置，例如另一块同名积木、环上的其他引用
}
```

内置积木的错误，CLI 输出时把 `builtin:<id>/` 换成真实路径 `apps/mindlink/blocks/<id>/`，编辑器可以直接点开。

行号指向：frontmatter 的错误指向出错的那个键或值所在的行；正文的错误指向出错的标题或链接所在的行；"缺少某个字段/小节"指向它的上一级（缺字段指向 `---` 开头那行或所属的键，缺小节指向文件最后一行）。

### 8.2 文件与目录

| 代码 | 什么时候 | 位置 |
| ---- | -------- | ---- |
| `missing-main-file` | 目录里既没有 `BLOCK.md` 也没有 `WORKFLOW.md` | 文件级（目录） |
| `both-main-files` | 两个都有 | 文件级（`WORKFLOW.md`） |
| `forbidden-file` | 不允许的文件或目录：脚本、非 `.md` 文件、`references/` 和 `examples/` 之外的目录、子目录、文件名不合规 | 文件级 |
| `file-too-large` | 主文件超过 500 行；附件或示例超过 64 KB；整块积木超过 256 KB | 文件级（主文件给出第 501 行） |
| `encoding` | 不是 UTF-8，或带 BOM | 文件级 |
| `dir-name-mismatch` | `id` 和目录名（课程和用户的积木是记录名）不同 | `id` 那行 |

### 8.3 frontmatter

| 代码 | 什么时候 |
| ---- | -------- |
| `frontmatter-missing` | 第一行不是 `---`，或找不到结尾的 `---` |
| `frontmatter-syntax` | 用了 3.1 不收的特性（锚点、别名、标签、合并键），或 YAML 语法错（含重复键、制表符） |
| `unknown-field` | 不认识的字段（任何层级，包括步骤、结果、参数里的键） |
| `field-not-allowed` | 这个级别不能有的字段，例如基础积木写了 `result`、片段写了 `orchestration` |
| `missing-field` | 缺必填字段 |
| `field-type` | 类型不对，例如 `format: "1"`、`intensities: hint` |
| `field-format` | 值不合规：`id` 的写法、`title` 的长度、`origin_digest` 的写法、列表里有重复 |
| `level-file-mismatch` | `level` 和主文件名对不上，例如 `BLOCK.md` 里写了 `level: workflow` |

### 8.4 格式版本

| 代码 | 什么时候 |
| ---- | -------- |
| `format-too-new` | `format` 比本版本支持的新 |
| `format-unsupported` | `format` 小于 1，或是本版本已经不再支持的旧版 |
| `format-outdated` | 内置积木不是最新格式（只在 `pnpm modules:check` 报） |

### 8.5 维度、工具、引用

| 代码 | 什么时候 |
| ---- | -------- |
| `unknown-dimension` | `dimensions` 里的维度不在词汇表里 |
| `unknown-tool` | `tools` 里的工具没有注册 |
| `unknown-source` | 引用前缀不是 `builtin:` / `course:` / `user:` |
| `unknown-block` | 引用的积木不存在（来源里没有这个 id） |
| `source-not-visible` | 引用方向不合 6.1 的规则，例如内置引用课程，课程引用用户 |
| `level-not-lower` | 引用了同级或更高级的积木，消息里写明双方的级别 |
| `cycle` | 引用成环；`related` 给出环上的每一处引用 |

片段或工作流写了 `tools`，报 8.3 的 `field-not-allowed`。

### 8.6 强度

| 代码 | 什么时候 |
| ---- | -------- |
| `unknown-intensity` | 不是 `tell` / `hint` / `ask` |
| `intensity-not-supported` | 步骤或 `overrides` 设置的强度不在目标的 `intensities` 里；引用片段时，逐个检查片段里的活动 |
| `intensity-not-covered` | 活动支持某一档，但它引用的基础积木不支持这一档 |
| `intensity-section-missing` | `intensities` 里有这一档，正文没有对应小节 |
| `intensity-section-extra` | 正文有这一档的小节，`intensities` 里没有 |

### 8.7 正文

| 代码 | 什么时候 |
| ---- | -------- |
| `unknown-section` | 二级标题不在 4.1 / 4.2 的表里（包括 `## Tell`、`## 提示` 这样的近似写法） |
| `duplicate-section` | 同一小节出现两次 |
| `section-missing` | 缺必有的小节（`## 结束条件`、`## 结果`、`## 编排说明`） |
| `section-not-allowed` | 不该有的小节，例如基础积木写了 `## 结果`、固定编排的工作流写了 `## 编排说明` |
| `section-empty` | 小节没有内容 |
| `content-before-section` | 第一个 `##` 之前有一级标题以外的内容 |
| `unknown-param-ref` | 正文里的 `{{名字}}` 没有在 `params` 里声明 |
| `broken-link` | 链接指向不存在的附件、`references/` 以外的路径、绝对路径或含 `..` |
| `unlinked-reference` | `references/` 里有文件没被主文件链接 |
| `nested-reference-link` | 附件里链接了另一个附件 |

### 8.8 步骤、参数、结果

| 代码 | 什么时候 |
| ---- | -------- |
| `duplicate-step-id` | 同一个 `steps` 里步骤 id 重复（包括省略 id 时默认 id 撞上） |
| `unknown-override-step` | `overrides` 里的步骤 id 在片段里不存在，或者对非片段的步骤写了 `overrides` |
| `unknown-param` | 步骤给目标没有声明的参数赋值 |
| `param-value` | 参数值的类型或范围不对；或 `"{{…}}"` 传参时，活动的参数类型和基础积木的不一致 |
| `param-default` | 参数声明的 `default` 不合法 |
| `result-field` | 结果字段声明不合法：缺 `values`、`min > max`、范围超过 100、名字不合规 |
| `required-when` | `required_when` 引用的字段不存在、不是 `enum`、取值不在 `values` 里，或与 `required` 同时出现 |

### 8.9 示例对话（`examples/`）

| 代码 | 什么时候 |
| ---- | -------- |
| `example-format` | 示例不符合 9.3 的写法 |
| `example-intensity` | 示例的 `intensity` 不在积木的 `intensities` 里 |
| `example-result` | 示例的 `result` 不符合积木的结果声明（逐字段报，`required_when` 也检查） |
| `example-tool` | 示例里调用的工具既不在这块积木的 `tools` 里，也不在它的子步骤的 `tools` 里 |
| `example-missing` | 内置积木的某个支持的强度没有一份示例（只对内置积木） |

### 8.10 注册表

| 代码 | 什么时候 |
| ---- | -------- |
| `duplicate-id` | 同一来源里有两块积木的 id 相同；`related` 给出另一处 |
| `shadows-builtin` | 课程或用户积木用了内置积木已有的 id |

一块积木只要有错误，就不注册；引用它的积木会因此报 `unknown-block`，消息里注明"该积木存在但未通过校验"，避免让人以为是拼错了名字。

## 9. 完整例子

例子里的工具名（`state_gaps`、`recent_turns`、`course_hotspots`）是暂定的，最终以 #11 为准（见第 11 节）。

### 9.1 基础积木 `predict-questions`（供 `guide` 引用，节选）

`apps/mindlink/blocks/predict-questions/BLOCK.md`：

````markdown
---
format: 1
id: predict-questions
level: primitive
title: 预测问题
summary: 根据状态缺口、最近对话和同课卡点，预测学习者接下来想问的几个问题，以选项展示。需要给学习者递一个"下一步问什么"时用。
dimensions: [articulation]
intensities: [hint, ask, tell]
tools: [state_gaps, recent_turns, course_hotspots]
params:
  count: { type: integer, min: 2, max: 5, default: 3, label: 问题个数 }
---

# 预测问题

## 通用

1. 依次调用 `state_gaps`、`recent_turns`、`course_hotspots`，拿到素材。素材只来自这三个工具，不要编造"同学们都在问"。
2. 生成 {{count}} 个问题，每个问题标注依据：状态缺口、最近对话还是同课卡点。
3. 用编号选项展示，最后一项固定是"都不是，我想问别的"。

## tell

……（略：问题后面各附一句话的答案要点）

## hint

……（略：问题后面各附一条线索，不给结论）

## ask

……（略：只给问题，不附任何答案或线索）

## 结束条件

学习者选了一项、改写了一项，或明确表示都不要。
````

### 9.2 活动积木 `guide`

`apps/mindlink/blocks/guide/BLOCK.md`：

````markdown
---
format: 1
id: guide
level: activity
title: 引导提问
summary: 预测学习者接下来想问的问题并以选项展示，按学习者的选择继续推进。讲解、练习之后，或学习者卡住、不知道问什么时用。
dimensions: [articulation]
intensities: [hint, ask, tell]
cost: low
params:
  max_questions: { type: integer, min: 2, max: 5, default: 3, label: 预测几个问题 }
steps:
  - use: predict-questions
    params: { count: "{{max_questions}}" }
  - id: check
    use: retell-check
    optional: true
result:
  offered:
    type: integer
    min: 1
    max: 5
    required: true
    label: 展示的问题数
  outcome:
    type: enum
    values: [picked, rewrote, ignored]
    required: true
    label: 学习者的反应
  picked_rank:
    type: integer
    min: 1
    max: 5
    required_when: { outcome: [picked, rewrote] }
    label: 选中第几个
  basis:
    type: enum
    values: [state-gap, recent-turn, course-hotspot]
    required_when: { outcome: [picked, rewrote] }
    label: 选中问题的依据
---

# 引导提问

## 通用

先做子步骤 `predict-questions`，把 {{max_questions}} 个预测问题展示给学习者。学习者的反应只有三种：

- 选了其中一个（picked）；
- 在某一个的基础上改写成自己的问题（rewrote）；
- 都不要，或者岔开话题（ignored）。

学习者选定或改写之后，按下面当前强度那一节回应。学习者都不要时，不要追问原因，直接结束这一步。

回应之后，如果学习者的回答里有明显说不清的地方，可以做子步骤 `check`（复述检查）；没有就跳过。

## hint

围绕学习者选定的问题，给一条线索：指出该看哪个概念、哪一步推导或哪条已有的理解，但不说出结论。学习者补全之后，确认对的部分，对不完整的部分再给一条更具体的线索，最多两轮。两轮之后仍然卡住，就告诉学习者可以把这一步换成直接讲。

## ask

围绕学习者选定的问题，只用反问推进：把问题拆成更小的一问，让学习者自己回答。**绝不直接给出答案或结论**，也不要用"其实就是……"这样的句式变相给出。学习者说"直接告诉我"时，说明当前是只提问的模式，可以把这一步换成给提示或直接讲，由学习者决定。

## tell

直接回答学习者选定的问题：先用一两句话给出结论，再按学习者的基础补上理由或例子。回答之后问一句学习者是否还有不清楚的地方。

## 结果

- `offered`：实际展示的预测问题个数，不算"都不是"那一项。
- `outcome`：picked、rewrote 或 ignored，按学习者的实际反应填。
- `picked_rank`：学习者选中或改写的是第几个问题，从 1 开始；ignored 时不填。
- `basis`：那个问题的依据；ignored 时不填。

## 结束条件

学习者对选定的问题表示明白了，或者明确选择了都不要；做了 `check` 的，要等复述检查结束。
````

要点：

- 这块积木的点选率就是 `outcome = picked` 的占比，含改写的点选率是 `picked + rewrote`，都由引擎从 `outcome` 的分布通用地算出来，引擎不认识 `guide`。按 `basis` 还能看出同课卡点带来的问题是不是更常被选中。
- `intensities` 的第一个是 `hint`：哪里都没有指定强度时，默认给提示。
- `guide` 自己不写 `tools`：工具是子步骤 `predict-questions` 声明并调用的。
- `predict-questions` 和 `retell-check` 都必须支持 `hint`、`ask`、`tell` 三档，否则报 `intensity-not-covered`。
- `retell-check` 是规格里的"复述检查"，本文没有展开。

示例对话 `apps/mindlink/blocks/guide/examples/ask-picked.md`：

````markdown
---
intensity: ask
params: { max_questions: 3 }
result:
  offered: 3
  outcome: picked
  picked_rank: 2
  basis: course-hotspot
---

### tool state_gaps

```json
{ "items": [{ "title": "贝叶斯定理中的先验", "reason": "articulation-low" }] }
```

### agent

你接下来可能想问：

1. 先验概率到底是怎么选出来的？（依据：你在"先验"上还讲不太清）
2. 为什么似然不是一个概率分布？（依据：同课很多同学卡在这里）
3. 后验和先验差很多时说明什么？（依据：你上一轮的提问）
4. 都不是，我想问别的

### learner

2

### agent

好。先想一个更小的问题：把参数固定、把数据看成变量时，似然函数对数据求和等于多少？
````

示例的写法（`example-format` 按它检查）：

- frontmatter 只有 `intensity`（必填）、`params`（可选）、`result`（活动积木必填，基础积木不允许）；
- 正文是一串三级标题：`### learner`、`### agent`、`### tool <工具名>`；工具那一节的内容是一个代码块，写工具返回的内容（只当文本）；
- 第一个标题之前不能有内容。

### 9.3 片段 `explain-then-guide`

`apps/mindlink/blocks/explain-then-guide/WORKFLOW.md`：

```markdown
---
format: 1
id: explain-then-guide
level: fragment
title: 讲解后引导
summary: 先按学习者的基础讲解概念，再引导学习者提出下一个问题。
steps:
  - use: explain
  - use: guide
---

## 说明

讲完一个概念之后马上引导提问，趁学习者还记得刚才的内容。
```

### 9.4 工作流 `apply`（即 #30 的 `practice`）

#30 里叫 `practice`，但它和活动积木 `practice`（练习应用）同名，在平铺目录和同一命名空间里放不下两个（见 Q1）。下面按建议的新名字 `apply` 写，内容就是 #30 要求的"应用"工作流：包含两次 `guide`，强度不同。

`apps/mindlink/blocks/apply/WORKFLOW.md`：

```markdown
---
format: 1
id: apply
level: workflow
title: 应用
summary: 面向要把知识用起来的学习者：讲解、练习，练习前后各引导一次提问，最后总结蒸馏。
orchestration: fixed
steps:
  - use: goal
  - use: diagnose
  - id: learn
    use: explain-then-guide
    overrides:
      guide: { intensity: hint }
  - use: practice
  - id: guide-after-practice
    use: guide
    intensity: ask
    params: { max_questions: 2 }
  - use: distill
---

## 说明

先弄清目标和已有基础，讲解之后用给提示的方式引导一次；做完练习，再用只提问的方式引导一次，逼自己把练习里的思路说清楚；最后总结成候选理解，交给自己确认。
```

展开后的计划（#9 的"解析成计划"会得到这样的扁平列表；子步骤不展开到计划里，由 `workflow_next` 作为清单返回）：

| # | 步骤路径 | 积木 | 强度从哪来 | 参数 |
| - | -------- | ---- | ---------- | ---- |
| 1 | `goal` | `builtin:goal` | 项目默认，或 `goal` 的第一档 | — |
| 2 | `diagnose` | `builtin:diagnose` | 同上 | — |
| 3 | `learn.explain` | `builtin:explain` | 同上 | — |
| 4 | `learn.guide` | `builtin:guide` | **hint**（`overrides.guide.intensity`） | `max_questions = 3`（默认） |
| 5 | `practice` | `builtin:practice` | 项目默认，或 `practice` 的第一档 | — |
| 6 | `guide-after-practice` | `builtin:guide` | **ask**（步骤的 `intensity`） | `max_questions = 2` |
| 7 | `distill` | `builtin:distill` | 项目默认，或 `distill` 的第一档 | — |

走到第 4 步时 `workflow_next` 只返回 `guide` 的 `## 通用`、`## hint`、`## 结果`、`## 结束条件`；走到第 6 步时只返回 `## 通用`、`## ask`、`## 结果`、`## 结束条件`。两步的结果分别记在 `learn.guide` 和 `guide-after-practice` 下，点选率可以分开统计，也可以合在 `builtin:guide` 下看总数。

## 10. 需要确认的问题

| # | 问题 | 选项 | 建议 |
| - | ---- | ---- | ---- |
| Q1 | 活动积木 `practice`（规格 2.5 节、#7）和工作流 `practice`（#10、#30）同名 | A. 所有级别共用一个命名空间，工作流改名 `apply`（#10、#30 跟着改）；B. 每一级各有自己的命名空间，引用写 `workflow:practice`；C. 活动积木改名（如 `exercise`） | A：一个名字只指一块积木，引用不用写级别，也和 PR #32 平铺目录的检查对得上 |
| Q2 | "同名报错"的范围 | A. 同一来源内同名报错，另外课程、用户积木不能用内置已有的名字；B. 只在同一来源内报错；C. 跨所有来源同名都报错 | A：内置名字不被"影子"积木混淆；课程和用户之间同名靠前缀区分，不妨碍复制同学的积木 |
| Q3 | frontmatter 用什么解析 | A. 自己写受限的 YAML 子集解析器（不加依赖）；B. 新增 `yaml` 依赖；C. frontmatter 改成 JSON | B（已定）：手写的子集会拒绝编辑器和 Prettier 重排过的合法 YAML；`yaml` 库读标准 YAML 1.2 并给出位置，只额外拒绝锚点、别名、标签、合并键 |
| Q4 | 片段能不能嵌套片段 | A. 不能：片段单独一级，只引用活动积木；B. 能：片段可以引用片段，靠环检测兜底 | A：一级就够写"讲解后引导""练习后检查""一次复习"；步骤路径最多两段，组装器也简单。以后需要再升格式 |
| Q5 | 结果字段放在哪、能不能有文本 | A. 只在活动积木上声明，第 1 版只有 enum / boolean / integer；B. 基础积木也能声明结果，由活动合并；C. 允许文本字段 | A：`workflow_report` 一步报一份；结果只用于统计，不存对话内容（D4） |
| Q6 | 内置积木的位置 | A. `apps/mindlink/blocks/<id>/` 平铺，`architecture.json` 的 `blocks.engine` 填整个 `apps/mindlink/src/blocks`；B. 单独一个包（如 `packages/blocks-builtin`）；C. 按级别分子目录（要改 PR #32 的检查） | A：和 PR #32 的检查直接对上，内容跟着应用走 |

## 11. 与其他 issue 的约定

- **#11 积木用到的工具**：工具名由 #11 定，本文例子里用的是暂定名 `state_gaps`（读状态缺口）、`recent_turns`（读最近对话）、`course_hotspots`（读同课卡点）、`review_due`（列出待复习条目）。#11 定名后改例子即可；格式只要求工具名符合 `^[a-z][a-z0-9_]*$` 并且已注册。
- **#9 编排引擎**：步骤路径、强度优先级（5.3）、`workflow_next` / `block_read` 返回的切片（4.4）、`cost` 和 `orchestration` 的含义在这里定义，具体推进、精简、排序、计划快照、项目里的调整由 #9 实现。项目调整的 patch 格式归 #9，只约定按步骤路径定位。
- **#10 学习项目**：`workflowId` 存完整 id；Q1 选 A 时，目标类型"应用"对应 `builtin:apply`。
- **#28 积木页面**：编辑器调用同一个校验函数，按 8.1 的 `file`、`line`、`column` 标出错误；导入、导出按 2.3 的"路径 → 文本"映射。
- **#29、#7、#6、#30 积木内容**：按本文第 3、4 节写；内置积木每一档至少一份示例对话（`example-missing`）。

实现说明（#9）：编排引擎在 `apps/mindlink/src/blocks/engine/`，MCP 工具在 `blocks/mcp.ts`，REST 在 `blocks/routes.ts`。按本文实现的约定：

- **计划**：`resolvePlan` 把工作流和片段展开成扁平的活动列表，每一步带步骤路径、强度（以及它来自 5.3 的哪一条）、参数、`optional`、`cost`、`dimensions`。子步骤不进计划，由 `workflow_next` 作为清单返回。
- **运行**：存在 `blocks/run/<项目>~<序号>`，开始时存下计划和用到的每一块积木（不含示例）的快照，之后修改工作流或积木都不影响这次运行；新开的运行用新的内容。`blocks/active/<项目>` 指向项目最近的运行。
- **项目里的调整**：存在 `blocks/adjustments/<项目>`，按顺序叠加在计划快照上，作用于当前和以后的运行。四种：`skip`（跳过某一步）、`insert`（在某一步之后插入一个活动，`after` 省略时插在开头）、`replace`（换成另一个活动）、`set`（改某一步的强度或参数）。都按步骤路径定位；计划里已经没有那一步、或积木已不存在的调整不生效，并在返回里列出。
- **临时切换强度**：只记在运行上的当前这一步，这一步做完就失效。
- **精简模式**：跳过 `cost: high` 的步骤。
- **agent 编排的排序**：缺口按项目范围内的节点算（项目属于某门课时只看带 `scope:<课程>` 标签的节点）：一个维度的缺口是"还没有任何记录"的节点占比，不看等级（各维度的等级含义不同，引擎不读）。活动的分数是它声明的各维度缺口的平均值；`dimensions: []` 的排在最后；同分按工作流里的顺序。理由用中文写出每个维度的缺口。
- **结果**：存在 `blocks/result/<运行>~<步骤路径>`，带上校验时用的结果字段声明，统计（`resultStatistics`，纯函数）按积木分组，再按"工作流 + 步骤路径"和强度细分。

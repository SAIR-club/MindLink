# 0001 — 结果的证据、评价与推断

状态：**提议**（2026-10-26）。实现于第一批（审查报告 M3）。修改 `docs/block-format.md` 第 3.4 节（结果字段）与 `workflow_report`。

## 背景

`workflow_report` 现在只校验 agent 报的字段类型（`engine/results.ts` 的 `checkResult`），存下的 `ResultEntry` 只有字段值。`recall` 报"答对 2 道"，系统既不知道题目和回答是什么，也不知道是谁判的对。所有字段都是同一种"结果值"：客观交互（选了第几个）、学习表现的评价（答对几道）、agent 的推断（听懂了）、学习者的自评，彼此不分。

第一轮审阅指出：把对话轮次挂到结果上，只能证明回答**存在**，不能证明它被**正确评价**。学习者答错、agent 判对，即使原文都在，`correct = 1` 仍然不可信。

## 决定

结果分三层，互不混同。

### 1. 表现证据：说明"有这样一段表现"

`workflow_report` 可附 `evidence`：

```json
"evidence": [
  { "turn": "<turn id>", "role": "prompt" },
  { "turn": "<turn id>", "role": "answer" }
]
```

- `turn` 是 `thread_append` 返回的轮次 id。
- `role` 取值：`prompt`（题目或追问）、`answer`（回答）、`retell`（复述）、`correction`（更正）、`question`（学习者提出的问题）。
- 引擎只检查这些轮次属于调用者自己的线程（`ThreadReader.threadView`），否则以 `invalid_evidence` 拒绝。证据**不说明对错**。

### 2. 评价：说明"谁、按什么判的"

结果字段增加性质 `kind`（在积木的 `result` 里声明）：

| `kind` | 含义 | 例子 |
|---|---|---|
| `event` | 客观交互，由行为本身决定 | `guide.outcome`（选了、改了、没要） |
| `assessment` | 对一段表现的评价 | `recall.correct`（答对几道） |
| `inference` | agent 对理解状态的推断 | `explain.outcome = understood` |
| `self_report` | 学习者的自评 | "我觉得懂了" |

报了任一 `assessment` 字段，就必须同时报 `assessment`：

```json
"assessment": { "by": "agent" | "key", "method": "<一句话说明怎么判的>", "key": "<密封答案 id>" }
```

- `by: agent`：agent 自己判的。照常记录，标为**未验证**。
- `by: key`：对照出题时**密封提交**的标准答案或判分要点。出题时 agent 调用新工具 `seal_key({ project, step, content })`，得到 `key` id；密封的内容学习者看不到，不出现在对话里。引擎检查：
  - 这个密封答案属于当前运行的当前步骤；
  - 密封时间早于证据里每一个 `answer` 轮次。
  
  不满足就以 `invalid_assessment` 拒绝。
- **学习者确认**不能由 agent 声称。学习者在网页上对某条评价点"确认"，走人的令牌（REST，agent 令牌会被以 `human_required` 拒绝）。确认后，这条评价记为 `confirmed_by_learner`。

**验证过**只有两种：`by: key`，以及学习者确认过的评价。它的含义是"对照了事先确定的标准"或"学习者本人认可"，**不是"一定正确"**：标准答案本身可能错，agent 按标准判分也可能判错。

### 3. 掌握推断：引擎不做

引擎不推断"学会了"。统计和以后的规则（ADR 0002 的 `until`）只能读到：哪几次表现、由谁评价、是否验证过。怎样算达到学习目标，由工作流或积木自己写。

## 统计

`resultStatistics` 按 `kind` 分开：`assessment` 再分"已验证 / 未验证"两栏，`inference` 和 `self_report` 单独显示，不与 `assessment` 合计。

## 写回 Episteme

只用 Episteme 已有的语义，不改 Core，不碰确认权：

| 内容 | 写法 |
|---|---|
| 学习者说过的观点 | `distill` 候选，`basis: stated` |
| agent 的判断 | `distill` 或 `propose` 候选，`basis: inferred` |
| 验证过的表现 | `propose` 一个 `evidence` 节点加 `supports` 边，附题目和回答的轮次引用与密封答案 id；**学习者确认后才生效** |
| 未验证的评价 | 不写成 evidence 节点 |

## 兼容

- `kind` 可选，缺省为 `inference`；`evidence`、`assessment` 可选。现有积木不改也能通过校验，它们的结果全部算"推断或未验证"。
- 旧的 `ResultEntry` 照常读取，视为未验证。`RESULT_RECORD` 升到版本 2，`migrate` 补上缺省值。

## 测试

- 证据：不属于调用者的轮次被拒绝。
- 评价：
  - 有 `assessment` 字段却没有 `assessment` 时被拒绝；
  - `by: key` 时，密封时间晚于回答被拒绝；
  - 密封答案属于别的步骤时被拒绝。
- 学习者确认：agent 令牌被拒绝；确认后，统计里这条移到"已验证"。
- 统计：按 `kind` 分栏，推断和自评不进入评价的合计。
- 写回：只有验证过的才生成 evidence 建议，而且是建议，不是记录。

## 不做

- 独立的评测模型或外部判题器（以后可以作为新的 `by` 来源接入）。
- 把题目和答案原文复制进结果（线程里已经有了）。

# 纵向闭环端到端记录

用真实的 agent 宿主和脚本化的学习者，跑一遍 ADR 0019 的第一个纵向闭环。脚本：[`scripts/vertical-e2e.mjs`](../../scripts/vertical-e2e.mjs)。

## 2026-11-19：OpenCode 2.3.0，只跑 day1 和 day2

**环境。** Windows 11，Node 24，分支 `scripts/vertical-e2e`，Episteme 用 `episteme.ref` 指定的 `4d88f48`。空图放在仓库外。学习材料是虚构的 `docs/research/evaluation/material/潮汐缓存协议.md`。

**宿主。** `opencode run --standalone --format json --auto`，在单独的空目录里运行，只连一个 Episteme MCP（经过记录代理），并禁用 `bash`、`edit`、`webfetch`（见 `scripts/opencode-host.mjs`）。用户的全局 OpenCode 配置只读取，不修改。服务端的模型一调用就报错，所以教学全部由宿主完成。

**模型。** `magpie/auto/deepseek-v4.1-flash`，通过用户本机 OpenCode 里已经配好的 Magpie provider 调用。

**命令。**

```bash
node scripts/vertical-e2e.mjs --out <目录> --host opencode --model magpie/auto/deepseek-v4.1-flash --skip-baselines --budget 0.1 --total 0.3 --timeout-ms 300000
```

**限额。** 每轮最多 25 步。OpenCode 估算的费用超过“本轮上限和总额剩余里较小的那个”，就结束进程；单轮超过 300 秒也结束进程。费用是 OpenCode 按自己的价格表算出的估算值，没有和 Magpie 账单核对过。最大输出 token 没有限制。

### 用量

| 轮次 | 步数 | 输入 / 输出 / 推理 token | 估算费用 |
| ---- | ---- | ---- | ---- |
| day1 × 4 | 17 / 8 / 7 / 2 | 58695 / 10821 / 15177 | $0.0280 |
| day2 × 3 | 8 / 4 / 3 | 21264 / 2747 / 5066 | $0.0090 |
| 合计 | 49 | 79959 / 13568 / 20243 | **$0.0371** |

7 轮都以退出码 0 结束，没有一轮被限额或超时打断。

### 检查结果

12 项全部通过：

| 检查 | 结果 |
| ---- | ---- |
| 开了一个空间 | 通过 |
| day1 在学懂的那部分留下了一条候选 | 通过 |
| 答错之后打开了一个缺口，此时还没有任何确认 | 通过，诊断：“把坏记录当成可以单条跳过的异常” |
| 服务端模型一次都没被调用 | 通过（0 次） |
| 新会话第一件事是读记录（第一个 `learn_` 调用是 `learn_context`） | 通过 |
| 新会话按 id 记在同一个学习目标上 | 通过（`ob_b12fe9f3bc8039fd`） |
| 记下了它选的活动和理由 | 通过（`retell`，理由是针对坏记录的误解） |
| 记下了新的回答 | 通过（2 次作答） |
| 改正后的回答没有自己变成“已确认” | 通过（`pending`） |
| 人确认过的那部分读出来是他自己的 | 通过 |
| 页面上看不到任何一轮的原话 | 通过 |
| 没有调用任何做决定的工具 | 通过 |

### 工具调用

- day1：`learn_context` ×13、`learn_observe` ×14、`distill` ×7、`thread_append` ×7、`learn_step` ×3，以及 `learn_space_open`、`learn_plan_start`、`thread_open`、`propose`、`recall` 各 1 次。
- day2：`learn_observe` ×5、`thread_append` ×4、`learn_context` ×3，以及 `recall`、`expand`、`distill` 各 1 次。

### 被拒的调用（宿主都自己恢复了）

一共 18 次，都是工具按设计拒绝，宿主随后改正了参数：

- `learn_context` 报 `unknown_space`：day1 有 9 次，是宿主在开空间之前就去读；day2 有 1 次。
- `learn_observe` 报 `unknown_suggestion` 6 次、`version_conflict` 1 次、`quote_not_found` 1 次。

day1 有 9 次是“还没开空间就去读”，说明工具说明对第一次使用的宿主不够清楚。这是可用性问题，不是正确性问题。

### 这次没有验证的

- **P0 和 P1 基线**（`--skip-baselines`），所以这次不能说明有 Episteme 比只靠提示词更好。
- **day2 之后缺口仍然是 `open`，计划仍是 `active`（第二个 `retell` 步骤没有走完）。** 改正后的回答成了一条待确认的候选，但这次没有让人去确认它，所以缺口在什么条件下关闭、计划能不能走完，都没有验证。
- 学习者是脚本化的，所以这次只证明链路接通、记录正确，不证明有人学会了什么。
- 只用了一个模型，只跑了一次。

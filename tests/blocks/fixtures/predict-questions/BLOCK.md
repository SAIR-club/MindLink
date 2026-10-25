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

每个问题后面附一句话的答案要点，让学习者一眼看出哪个问题最值得展开。

## hint

每个问题后面附一条线索，指出该从哪个概念或哪一步想起，不给结论。

## ask

只给问题，不附任何答案、要点或线索。

## 结束条件

学习者选了一项、改写了一项，或明确表示都不要。

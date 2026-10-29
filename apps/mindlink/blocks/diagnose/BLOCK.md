---
format: 1
id: diagnose
level: activity
title: 基础诊断
summary: 读学习者在本项目范围内的全部状态，问清已经会什么、缺哪些前置知识，用 project_update 写回已有基础。目标定下之后、开始讲新内容之前用。
dimensions: []
intensities: [hint, ask, tell]
tools: [state_gaps]
cost: medium
steps:
  - id: probe
    use: self-test
    optional: true
    params: { count: 2 }
result:
  start_level:
    type: enum
    values: [new, partial, solid]
    required: true
    label: 起点
  missing_prerequisites:
    type: integer
    min: 0
    max: 10
    required: true
    label: 缺的前置知识数
  probed:
    type: boolean
    required: true
    label: 做了快测
---

# 基础诊断

## 通用

### 先读已有的记录

1. 调用 `project_open`（`id`：当前项目），看目标、截止时间和已经写下的 `baseline`。已有 `baseline` 时，这一步只核对它还对不对。
2. 调用 Episteme 的 `recall`：`question` 写这次要学的主题（来自目标），`scope` 写项目的课程，即 `project_open` 返回的 `scope`；项目没有课程时不写，`depth: summary`；需要细看的条目再用 `expand`。这是学习者已经确认过的理解。
3. 调用 `state_gaps`（当前项目），看哪些条目冲突、不牢或讲不清。

记录是空的（新项目、新学习者）很正常，不要因此认定学习者什么都不会，照常往下问。

### 问清基础

围绕目标列出这次要用到的前置知识（一般三到六项，例如学贝叶斯定理要用到条件概率、全概率公式）。按当前强度那一节逐项问学习者会不会，记录里已经有确认过的理解的项，只用一句话确认，不重复考。

对学习者自称会、但记录里没有或者 `state_gaps` 显示不牢的项，可以做子步骤 `probe`（快测两道小题，用 `block_read` 读它的说明）；学习者不想做就跳过。

### 写回

用两三句话总结："已经会：……；还缺：……"，请学习者确认或修改。确认后调用 `project_update`：`id` 是当前项目，`baseline` 写确认后的总结。只写 `baseline`，不写别的字段。

## hint

逐项问前置知识时，每项附一个能自检的小问题（"你能说出 P(A|B) 和 P(B|A) 的区别吗？"），请学习者自己判断会不会；学习者说不会的项，指出补它需要看哪个概念，但不在这一步讲。

## ask

只提问，不替学习者下判断：逐项问"这个你用过吗？能举个例子吗？"，最后请学习者**自己**用一两句话总结已经会什么、还缺什么，写回的 `baseline` 用学习者自己的总结。学习者总结里漏了你看到的明显缺口，用一个问题提醒（"条件概率你刚才说不太熟，要不要写进去？"），由学习者决定。

## tell

根据记录和学习者的回答，直接告诉学习者你的判断：哪几项已经会，哪几项缺，每个缺的项用一句话说明它在这次的目标里为什么重要；然后请学习者确认。

## 结果

- `start_level`：起点。要学的内容基本没接触过填 `new`；前置知识大多会、但目标内容没学过或学了一部分填 `partial`；前置知识和大部分目标内容都会填 `solid`。
- `missing_prerequisites`：写回的总结里"还缺"的项数。
- `probed`：做了子步骤 `probe` 填 `true`，跳过填 `false`。

## 结束条件

学习者确认了已有基础的总结，并且 `project_update` 已经写回 `baseline`；做了 `probe` 的，要等快测结束。

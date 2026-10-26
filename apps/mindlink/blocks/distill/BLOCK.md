---
format: 1
id: distill
level: activity
title: 总结蒸馏
summary: 总结这一段学习，把学习者表达过的理解整理成带原文引用的候选，用 Episteme 的 distill 提交，交给学习者确认或托管；从不替学习者决定。一段学习的最后用。
dimensions: []
intensities: [hint, ask, tell]
cost: medium
steps:
  - use: submit-distill
result:
  outcome:
    type: enum
    values: [submitted, nothing, declined]
    required: true
    label: 提交情况
  submitted:
    type: integer
    min: 0
    max: 20
    required_when: { outcome: [submitted] }
    label: 提交的条数
  refused:
    type: integer
    min: 0
    max: 20
    required_when: { outcome: [submitted] }
    label: 被拒的条数
---

# 总结蒸馏

## 通用

### 先总结

用三到五句话总结这一段学了什么：讲了哪几个概念、学习者问了什么、自测怎么样、还有哪个点没想通。总结只说发生了什么，不评价学习者"掌握了"什么。

调用 Episteme 的 `recall`（`question` 写这段的主题，`scope` 写当前项目，`depth: summary`），看哪些理解已经记录过：已经记录、而且这段没有新内容的，不再提交；这段里学习者改正了之前的说法的，提成 `revises` 关系，指向原来的节点。

### 再提交

调用 `block_read`（`project`：当前项目，`block`：`submit-distill`）读子步骤的说明，照着和学习者一起定出候选清单、请学习者删改、调用 `distill` 提交。

- 这一步**从不替学习者决定**：哪条留下、怎么说，都以学习者为准；提交之后由学习者本人确认（项目开启了托管时，由服务代为确认，学习者可以随时撤回）。
- 不提交任何没有原话支撑的条目；冲突只提 `suspected` 或 `open`，从不提"已解决"。
- 对话的原文只发这一段，不发整份记录。

### 线程

如果这次对话记录在 Episteme 的线程里（之前用过 `thread_open`、`thread_append`），提交之后对候选引用到的学习者发言调用 `thread_summarize`（`quotes` 里放学习者的原话），这样之后的 `recent_turns` 能读到这一段在说什么。没有线程就跳过。

## hint

按子步骤 `submit-distill` 的给提示档做：指出这一段里值得沉淀的几处，请学习者每处用一句话说出自己的理解，提交学习者说出的句子。

## ask

按子步骤 `submit-distill` 的只提问档做：只问学习者想记住哪几条，不提示有什么可记，不给示范句；只提交学习者自己说出的条目。

## tell

按子步骤 `submit-distill` 的直接讲档做：你先起草候选清单，每条标好原话，再交给学习者删改，按学习者留下的提交。

## 结果

- `outcome`：调用了 `distill` 填 `submitted`；这一段没有可以提交的理解（没有原话支撑）填 `nothing`；学习者看过清单后表示都不要填 `declined`。
- `submitted`：`distill` 收下的条数；`outcome` 不是 `submitted` 时不填。
- `refused`：被 `distill` 拒绝、最后放弃的条数；`outcome` 不是 `submitted` 时不填。

## 结束条件

子步骤 `submit-distill` 结束：已经提交并告诉学习者结果，或者学习者明确表示这一段不提交。

---
format: 1
id: recall
level: activity
title: 自测提取
summary: 不看材料，主动回忆刚学的内容：出几道小题让学习者作答，按强度给反馈，记下答对几道。讲解和引导之后、总结蒸馏之前，或者要检验记没记住时用。
dimensions: [confidence]
intensities: [hint, ask, tell]
cost: medium
params:
  count: { type: integer, min: 1, max: 5, default: 3, label: 自测几道题 }
steps:
  - use: self-test
    params: { count: "{{count}}" }
result:
  asked:
    type: integer
    min: 1
    max: 5
    required: true
    label: 出了几道题
  correct:
    type: integer
    min: 0
    max: 5
    required: true
    label: 答对几道
  partial:
    type: integer
    min: 0
    max: 5
    required: true
    label: 部分对几道
---

# 自测提取

## 通用

### 开始之前

1. 调用 `project_open`（`id`：当前项目），读目标。题目对准目标：速通考计算题的，就出计算和判断的小题。
2. 回顾这次对话讲过的内容；拿不准时调用 Episteme 的 `recall`（`question` 写这次学的主题，`scope` 写项目的课程，即 `project_open` 返回的 `scope`；项目没有课程时不写，`depth: summary`）。注意：Episteme 的 `recall` 工具是给你查记录用的，结果**不要给学习者看**，自测时学习者不能看材料。
3. 告诉学习者：接下来 {{count}} 道小题，不翻材料、不看前面的对话，不会就说"不会"，这不是考试。

### 自测

调用 `block_read`（`project`：当前项目，`block`：`self-test`）读子步骤的说明，照着出 {{count}} 道题、判分、按当前强度给反馈。

### 收尾

全部做完，用一句话告诉学习者结果（"3 道里答对 2 道"），再指出最需要再看一眼的那一个点；不评价学习者"掌握了"或"没掌握"。

这一步不写图谱。作答的原话留在对话里，之后的总结蒸馏可以引用它们，由学习者确认要不要记下。

## hint

按子步骤 `self-test` 的给提示档做：答错或部分对时给一条线索，让学习者再答一次。收尾时指出的那一个点，也只给线索，不讲答案。

## ask

按子步骤 `self-test` 的只提问档做：不给答案和线索，只用拆小的反问让学习者再试。收尾时只说判分，问学习者要不要看答案，要看时再给。

## tell

按子步骤 `self-test` 的直接讲档做：每道题答完就给出正确答案和一句话理由。收尾时把最需要再看的那个点用两三句话讲清楚。

## 结果

- `asked`：实际出了几道题（学习者中途叫停时，只算已经作答的）。
- `correct`：判为答对的题数。给提示档里第二次才答对的，算部分对，不算答对。
- `partial`：判为部分对的题数。`correct` 加 `partial` 不能超过 `asked`。

## 结束条件

子步骤 `self-test` 结束（题都答完，或者学习者叫停），并且已经把结果告诉学习者。

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

先做子步骤 `predict-questions`，把 {{max_questions}} 个预测问题展示给学习者。同课卡点的素材怎么用，见[同课卡点怎么用](references/hotspots.md)。学习者的反应只有三种：

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

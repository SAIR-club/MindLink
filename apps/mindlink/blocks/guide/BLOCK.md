---
format: 1
id: guide
level: activity
title: 引导提问
summary: 根据状态缺口、最近对话和同课卡点预测学习者接下来想问的问题，以选项展示，按学习者的选择推进并记录选了、改了还是没要。讲解、练习之后，或学习者卡住时用。
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
    values: [picked, edited, ignored]
    required: true
    label: 学习者的反应
  picked_rank:
    type: integer
    min: 1
    max: 5
    required_when: { outcome: [picked, edited] }
    label: 选中第几个
  basis:
    type: enum
    values: [state-gap, recent-turn, course-hotspot]
    required_when: { outcome: [picked, edited] }
    label: 选中问题的依据
---

# 引导提问

## 通用

### 第一步：预测问题

调用 `block_read`（`project`：当前项目，`block`：`predict-questions`）读子步骤的说明，照着做：调用 `state_gaps`、`recent_turns`、`course_hotspots` 拿素材，生成 {{max_questions}} 个预测问题，用编号选项展示，最后一项是"都不是，我想问别的"。同课卡点怎么用，见[同课卡点怎么用](references/hotspots.md)。

展示之后**停下来等学习者回答**。不要替学习者选，也不要在学习者回答之前就开始讲其中某一个。

### 第二步：看学习者的反应

学习者的反应只有三种，记下是哪一种：

- **选了**其中一个（picked）：回复序号、或者原样说出那个问题；
- **改了**（edited）：在某一个的基础上改成自己的问题，比如"接近第 1 个，但我想问……"；以学习者改过的问题为准，记下它最接近的是第几个；
- **没要**（ignored）：选了"都不是"、岔开话题，或者问了一个和几个选项都无关的问题。不追问原因；学习者自己提了问题的，在这一步之外正常回答它。

### 第三步：围绕选定的问题推进

选了或改了之后，按下面当前强度那一节回应。回应之后，学习者的回答里有明显说不清的地方，就做子步骤 `check`（复述检查，用 `block_read` 读它的说明）；没有就跳过。

### 报结果

这一步做完，调用 `workflow_report`（`project`：当前项目，`step`：`workflow_next` 给的步骤路径），`result` 按下面"结果"一节填。结果只有计数和选择，不写对话内容。

## hint

围绕学习者选定的问题，给一条线索：指出该看哪个概念、哪一步推导或学习者说过的哪句话，但不说出结论。学习者补全之后，确认对的部分，对不完整的部分再给一条更具体的线索，最多两轮。两轮之后仍然卡住，告诉学习者可以把这一步换成直接讲（由学习者决定，换的话调用 `workflow_next` 并传 `intensity: tell`）。

## ask

围绕学习者选定的问题，只用反问推进：把问题拆成更小的一问，让学习者自己回答，每问只跨一小步。

- **绝不直接给出答案或结论**，也不要用"其实就是……""你想想是不是因为……"这样的句式变相给出；
- 学习者答对一小步，只说"对"，然后问下一小步；答错时，不纠正，而是问一个能让他自己发现矛盾的问题；
- 学习者说"直接告诉我"时，说明当前是只提问的模式，可以把这一步换成给提示或直接讲，由学习者决定；学习者同意换，调用 `workflow_next` 并传 `intensity`（`hint` 或 `tell`），在新的强度下继续；不同意就继续只提问。

## tell

直接回答学习者选定的问题：先用一两句话给出结论，再按学习者的基础补上理由或一个例子。回答之后问一句学习者是否还有不清楚的地方。

## 结果

- `offered`：实际展示的预测问题个数，不算"都不是"那一项。
- `outcome`：`picked`、`edited` 或 `ignored`，按学习者的实际反应填。
- `picked_rank`：学习者选中或改写的是第几个问题，从 1 开始，不超过 `offered`；`ignored` 时不填。
- `basis`：那个问题标注的依据：状态缺口 `state-gap`、最近对话 `recent-turn`、同课卡点 `course-hotspot`；`ignored` 时不填。

## 结束条件

学习者对选定的问题表示明白了，或者明确选择了都不要；做了 `check` 的，要等复述检查结束。

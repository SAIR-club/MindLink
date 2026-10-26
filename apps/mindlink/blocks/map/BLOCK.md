---
format: 1
id: map
level: activity
title: 领域地图
summary: 先搭出骨架：要学的领域分成哪几块、块和块之间什么关系、这次的目标需要哪几块，标出同课卡点。开始讲具体概念之前用。
dimensions: [exposure]
intensities: [hint, ask, tell]
tools: [course_hotspots]
cost: medium
steps:
  - id: check
    use: retell-check
    optional: true
result:
  parts:
    type: integer
    min: 2
    max: 12
    required: true
    label: 地图分几块
  outcome:
    type: enum
    values: [confirmed, adjusted]
    required: true
    label: 学习者的反应
  start_picked:
    type: boolean
    required: true
    label: 选了起点
---

# 领域地图

## 通用

### 素材

1. 调用 `project_open`（`id`：当前项目），读目标、截止时间和已有基础。地图的范围由目标决定：速通只画目标用得到的部分，不求全。
2. 调用 Episteme 的 `recall`（`question` 写领域名，`scope` 写当前项目，`depth: summary`），看学习者已经确认过哪些概念，地图上标成"你已经会"。
3. 调用 `course_hotspots`（当前项目）。和地图上某一块对得上的卡点，在那一块后面标"同课很多同学卡在这里"；不写人数以外的任何细节，不写是谁。

### 地图的样子

- 三到七块，每块一行：名字、一句话说它是什么。
- 块之间的关系只写最重要的几条：哪块是哪块的前提、哪两块常被混淆。
- 标出这次目标需要的块，并建议一个起点（通常是缺的前置知识或目标里最靠前的一块）。
- 用列表或缩进文字展示，不要画需要特殊渲染的图。

最后请学习者选起点：按建议的来，或者自己选一块。学习者选定后，可以做子步骤 `check`（请学习者用两三句话复述这张地图，用 `block_read` 读它的说明）；学习者急着往下走就跳过。

这一步不写图谱，地图里的内容会在之后的总结蒸馏里由学习者确认。

## hint

先只给出各块的名字，请学习者猜每块讲什么、排一下先后；再按"地图的样子"补全，学习者猜对的地方说一句"对"，猜错的地方给一条线索请学习者改，不直接替他改。

## ask

先请学习者自己说：这个领域你觉得分成哪几块？哪块要先学？不给出你的版本。再用问题帮学习者补全（"你提到了先验和后验，它们之间还缺了哪一块？"）。地图以学习者说出来的为准，你只用问题指出缺的块和顺序上的问题，不说出答案。

## tell

按"地图的样子"直接画出完整的地图，再用一句话说明为什么建议从这一块开始，请学习者确认或调整。

## 结果

- `parts`：最后确认的地图有几块。
- `outcome`：学习者原样接受填 `confirmed`；增删、合并或调整了顺序填 `adjusted`（ask 档里地图本来就由学习者说出，学习者在你的问题之后改动过就填 `adjusted`）。
- `start_picked`：学习者选了起点填 `true`，没选填 `false`。

## 结束条件

学习者确认了地图并选了起点，或者明确说不用地图、直接开始；做了 `check` 的，要等复述检查结束。

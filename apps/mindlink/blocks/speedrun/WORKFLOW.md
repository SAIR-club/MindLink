---
format: 1
id: speedrun
level: workflow
title: 速通
summary: 面向截止时间近、要尽快过一遍的学习者：定目标、摸基础、搭骨架，直接讲解，引导一次提问，自测，最后总结蒸馏。
orchestration: fixed
steps:
  - use: goal
  - use: diagnose
  - use: map
    intensity: tell
  - use: explain
    intensity: tell
  - use: guide
    intensity: hint
  - use: recall
  - use: distill
---

## 说明

速通要的是快：先用一两分钟定下目标和截止时间、摸清已有基础，然后直接给出领域骨架、直接讲解要学的概念，省下自己摸索的时间。讲完之后用给提示的方式引导一次提问，让自己把最可能卡住的那个问题想通，而不是只听不想；再不看材料自测一轮，最后把这次说清楚的理解整理成候选，交给自己确认。

目标设定、基础诊断、自测和总结蒸馏按项目的默认引导强度进行；领域地图和讲解固定为直接讲，引导提问固定为给提示。想换强度，可以在项目里调整某一步，或者在这一步临时切换。

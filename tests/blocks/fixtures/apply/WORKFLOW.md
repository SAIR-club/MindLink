---
format: 1
id: apply
level: workflow
title: 应用
summary: 面向要把知识用起来的学习者：讲解、练习，练习前后各引导一次提问，最后总结蒸馏。
orchestration: fixed
steps:
  - use: goal
  - use: diagnose
  - id: learn
    use: explain-then-guide
    overrides:
      guide: { intensity: hint }
  - use: practice
  - id: guide-after-practice
    use: guide
    intensity: ask
    params: { max_questions: 2 }
  - use: distill
---

## 说明

先弄清目标和已有基础，讲解之后用给提示的方式引导一次；做完练习，再用只提问的方式引导一次，逼自己把练习里的思路说清楚；最后总结成候选理解，交给自己确认。

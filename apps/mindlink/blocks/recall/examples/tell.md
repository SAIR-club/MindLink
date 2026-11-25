---
intensity: tell
params: { count: 1 }
result:
  asked: 1
  correct: 1
  partial: 0
---

### agent

一道小题，不翻材料：贝叶斯公式的分母是什么？

### learner

观察到的数据的总概率，用全概率公式算。

### agent

对：分母 P(D) = Σ P(D|θ)P(θ)，只负责让后验加起来等于 1。1 道答对 1 道。

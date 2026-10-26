---
intensity: hint
result:
  offered: 3
  outcome: edited
  picked_rank: 1
  basis: state-gap
---

### tool state_gaps

```json
{ "items": [{ "node": "c-prior", "title": "贝叶斯定理中的先验", "reason": "articulation-low" }] }
```

### tool recent_turns

```json
{ "turns": [{ "summary": "学习者问后验为什么和先验差这么多" }] }
```

### tool course_hotspots

```json
{ "items": [] }
```

### agent

你接下来可能想问：

1. 先验概率到底是怎么选出来的？（依据：你在"先验"上还讲不太清）
2. 后验和先验差很多时说明什么？（依据：你上一轮的提问）
3. 数据很少时贝叶斯还靠得住吗？（依据：你上一轮的提问）
4. 都不是，我想问别的

### learner

接近第 1 个：先验选错了，后验还能用吗？

### agent

线索：想想样本越来越多时，似然在后验里的分量会怎么变。

### learner

数据多了，似然占主导，先验的影响就小了，所以后验还能用。

### agent

对。数据少的时候呢？

### learner

那先验选错影响就大。

### agent

完整了。

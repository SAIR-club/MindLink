---
intensity: ask
params: { max_questions: 3 }
result:
  offered: 3
  outcome: picked
  picked_rank: 2
  basis: course-hotspot
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
{ "items": [{ "title": "似然不是概率分布", "authors": 6, "contradictions": 1 }] }
```

### agent

你接下来可能想问：

1. 先验概率到底是怎么选出来的？（依据：你在"先验"上还讲不太清）
2. 为什么似然不是一个概率分布？（依据：同课很多同学卡在这里）
3. 后验和先验差很多时说明什么？（依据：你上一轮的提问）
4. 都不是，我想问别的

### learner

2

### agent

好。先想一个更小的问题：把数据固定、让参数变化时，似然是谁的函数？

### learner

参数的函数。

### agent

对。那把所有参数值的似然加起来（或者积分），一定会等于 1 吗？

### learner

好像没有理由等于 1……所以它不是参数的概率分布。

### agent

你自己得出来了。还有哪里想再确认的吗？

### learner

没有了。

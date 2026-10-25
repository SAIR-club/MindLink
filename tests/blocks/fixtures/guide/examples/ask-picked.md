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
{ "items": [{ "title": "贝叶斯定理中的先验", "reason": "articulation-low" }] }
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

好。先想一个更小的问题：把参数固定、把数据看成变量时，似然函数对数据求和等于多少？

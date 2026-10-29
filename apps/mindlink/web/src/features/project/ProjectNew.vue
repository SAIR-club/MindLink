<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { messageOf } from '../../client.js'
import { pathOf, useApi } from '../../components/index.js'
import {
  COMING_SOON,
  GOAL_CHOICES,
  courseProblem,
  isAvailable,
  projectApi,
  type GoalType,
} from './project.js'

/**
 * `#/projects/new`: a name, an optional course and a goal type, which decides the workflow. The goal, deadline and
 * baseline are not asked here: the learning conversation asks them.
 */

const projects = projectApi(useApi())
const router = useRouter()

const title = ref('')
const course = ref('')
const goalType = ref<GoalType>('speedrun')
const message = ref('')
const busy = ref(false)
/** The workflows that can run; empty until the service answers, so nothing is selectable before then. */
const available = ref<readonly string[]>([])

onMounted(async () => {
  try {
    available.value = await projects.workflows()
    const first = GOAL_CHOICES.find((choice) => isAvailable(choice.workflowId, available.value))
    const chosen = GOAL_CHOICES.find((choice) => choice.id === goalType.value)
    if (
      first !== undefined &&
      (chosen === undefined || !isAvailable(chosen.workflowId, available.value))
    ) {
      goalType.value = first.id
    }
  } catch (error) {
    message.value = messageOf(error)
  }
})

async function create(): Promise<void> {
  if (busy.value) return
  const chosen = GOAL_CHOICES.find((choice) => choice.id === goalType.value)
  if (chosen === undefined || !isAvailable(chosen.workflowId, available.value)) {
    message.value = '请选择一个可以用的目标类型。'
    return
  }
  if (title.value.trim() === '') {
    message.value = '请填写“项目名称”。'
    return
  }
  const problem = courseProblem(course.value)
  if (problem !== undefined) {
    message.value = problem
    return
  }
  message.value = ''
  busy.value = true
  try {
    const project = await projects.create({
      title: title.value,
      course: course.value,
      goalType: goalType.value,
    })
    await router.push(pathOf('/projects/:id', { id: project.id }, { created: '1' }))
  } catch (error) {
    message.value = messageOf(error)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <h1>新建学习项目</h1>
  <p class="project-note">
    只需要名字和目标类型。学习目标、截止时间和你已有的基础，会在开始学习后的对话里问你。
  </p>
  <form class="form" novalidate @submit.prevent="create">
    <label class="field">
      <span class="field-label">项目名称</span>
      <input v-model="title" type="text" name="title" required placeholder="例如：线性代数期末" />
    </label>
    <label class="field">
      <span class="field-label">课程（可不填）</span>
      <input v-model="course" type="text" name="course" placeholder="例如：MATH101" />
      <span class="field-hint">同一门课的同学用同一个课程名，就能共用这门课的内容。</span>
    </label>
    <fieldset class="field choices">
      <legend class="field-label">目标类型</legend>
      <label
        v-for="choice in GOAL_CHOICES"
        :key="choice.id"
        class="choice"
        :class="{ 'choice-disabled': !isAvailable(choice.workflowId, available) }"
      >
        <input
          v-model="goalType"
          type="radio"
          name="goalType"
          :value="choice.id"
          :disabled="!isAvailable(choice.workflowId, available)"
        />
        <span>
          <span class="choice-label">{{ choice.label }}</span>
          <span v-if="available.length > 0 && !isAvailable(choice.workflowId, available)" class="choice-soon"
            >（{{ COMING_SOON }}）</span
          >
          <span class="choice-detail">{{ choice.description }}</span>
        </span>
      </label>
    </fieldset>
    <p class="form-error" role="alert">{{ message }}</p>
    <button type="submit" :disabled="busy">创建项目</button>
  </form>
</template>

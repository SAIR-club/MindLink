<script setup lang="ts">
import { computed, reactive, ref, shallowRef } from 'vue'
import { RouterLink } from 'vue-router'
import { messageOf } from '../../client.js'
import { useApi, useConfirm } from '../../components/index.js'
import {
  GUIDANCE_CHOICES,
  askedText,
  courseProblem,
  projectApi,
  settingsPatch,
  startPhrase,
  workflowOptions,
  type Project,
} from './project.js'

/**
 * A project's settings: what the person may change, what the learning conversation fills in, and archiving. An
 * archived project is read-only until it is restored, as the service has it.
 */

const props = defineProps<{
  readonly project: Project
  /** The full ids of the workflows that can run. */
  readonly workflows: readonly string[]
  /** Whether the project was just created, so the page says first how to start. */
  readonly created?: boolean
}>()

const projects = projectApi(useApi())
const confirm = useConfirm()

const current = shallowRef<Project>(props.project)
const values = reactive(valuesOf(props.project))
const message = ref('')
const saved = ref('')
const busy = ref(false)

const workflowChoices = computed(() => workflowOptions(current.value.workflowId, props.workflows))

function valuesOf(project: Project) {
  return {
    title: project.title,
    course: project.course ?? '',
    workflowId: project.workflowId,
    guidance: project.guidance as string,
  }
}

function show(project: Project): void {
  current.value = project
  Object.assign(values, valuesOf(project))
}

async function save(): Promise<void> {
  if (busy.value) return
  saved.value = ''
  if (values.title.trim() === '') {
    message.value = '请填写“项目名称”。'
    return
  }
  const problem = courseProblem(values.course)
  if (problem !== undefined) {
    message.value = problem
    return
  }
  const patch = settingsPatch(current.value, values)
  if (Object.keys(patch).length === 0) {
    message.value = ''
    saved.value = '没有改动。'
    return
  }
  message.value = ''
  busy.value = true
  try {
    show(await projects.update(current.value.id, patch))
    saved.value = '已保存。'
  } catch (error) {
    message.value = messageOf(error)
  } finally {
    busy.value = false
  }
}

async function archive(archived: boolean): Promise<void> {
  if (busy.value) return
  if (
    archived &&
    !(await confirm({
      message: `归档“${current.value.title}”？`,
      detail: '归档后项目不再出现在列表里，设置也不能修改；随时可以恢复。学过的内容不会删除。',
      confirmLabel: '归档',
      danger: true,
    }))
  ) {
    return
  }
  message.value = ''
  saved.value = ''
  busy.value = true
  try {
    show(await projects.archive(current.value.id, archived))
    saved.value = archived ? '已归档。' : '已恢复。'
  } catch (error) {
    message.value = messageOf(error)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <p><RouterLink to="/projects">← 学习项目</RouterLink></p>
  <h1>{{ current.title }}</h1>

  <section class="project-start" :class="{ 'project-start-new': created }">
    <h2>{{ created ? '项目已创建，接下来这样开始' : '怎么开始学习' }}</h2>
    <ol>
      <li>
        把 Claude Code 连到 MindLink：按 MindLink 仓库里 host/claude-code/README.md 的说明配置一次即可。
      </li>
      <li>
        在 Claude Code 里说：<strong class="project-phrase">{{ startPhrase(current.title) }}</strong>
      </li>
    </ol>
    <p class="project-note">MindLink 会在对话里先问你的学习目标、截止时间和已有基础，再按工作流带你学。</p>
  </section>

  <p v-if="current.archived" class="notice project-archived" role="status">
    <span>这个项目已归档，设置不能修改。恢复后可以继续使用。</span>
    <button type="button" :disabled="busy" @click="archive(false)">恢复项目</button>
  </p>

  <section>
    <h2>设置</h2>
    <form class="form" novalidate @submit.prevent="save">
      <fieldset class="project-fields" :disabled="current.archived">
        <label class="field">
          <span class="field-label">项目名称</span>
          <input v-model="values.title" type="text" name="title" required />
        </label>
        <label class="field">
          <span class="field-label">课程（可不填）</span>
          <input v-model="values.course" type="text" name="course" />
        </label>
        <label class="field">
          <span class="field-label">工作流</span>
          <select v-model="values.workflowId" name="workflowId">
            <option v-for="option in workflowChoices"
              :key="option.value"
              :value="option.value"
              :disabled="option.disabled"
            >
              {{ option.label }}
            </option>
          </select>
        </label>
        <label class="field">
          <span class="field-label">默认引导强度</span>
          <select v-model="values.guidance" name="guidance">
            <option v-for="option in GUIDANCE_CHOICES" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
          <span class="field-hint">每一步默认怎么带你：直接讲给你听、给提示让你想，或者只提问。</span>
        </label>
      </fieldset>
      <p class="form-error" role="alert">{{ message }}</p>
      <p class="form-saved" role="status">{{ saved }}</p>
      <button v-if="!current.archived" type="submit" :disabled="busy">保存设置</button>
    </form>
  </section>

  <section>
    <h2>学习对话里问到的</h2>
    <p class="project-note">这几项由学习对话填写：开始学习后，MindLink 会在对话里问你，这里只显示。</p>
    <dl class="project-asked">
      <dt>学习目标</dt>
      <dd>{{ askedText(current.goal) }}</dd>
      <dt>截止时间</dt>
      <dd>{{ askedText(current.deadline) }}</dd>
      <dt>已有基础</dt>
      <dd>{{ askedText(current.baseline) }}</dd>
    </dl>
  </section>

  <section>
    <h2>托管确认</h2>
    <p class="project-note">
      是否让服务替你确认 agent 的提议，在审阅页设置：<RouterLink to="/review/delegation"
        >前往审阅页的托管设置</RouterLink
      >
    </p>
  </section>

  <section v-if="!current.archived">
    <h2>归档</h2>
    <p class="project-note">不再学这个项目时可以归档。归档不会删除学过的内容，之后可以恢复。</p>
    <button type="button" class="danger" :disabled="busy" @click="archive(true)">归档项目</button>
  </section>
</template>

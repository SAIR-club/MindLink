<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import { AsyncView, ListView, pathOf, useApi, useLoad } from '../../components/index.js'
import { projectApi, workflowText } from './project.js'

/** `#/projects`: the person's learning projects, archived ones only when asked for. */

const projects = projectApi(useApi())
const showArchived = ref(false)
const list = useLoad(() => projects.list(showArchived.value), [showArchived])
</script>

<template>
  <div class="project-head">
    <h1>学习项目</h1>
    <RouterLink class="button-link" to="/projects/new">新建学习项目</RouterLink>
  </div>
  <label class="project-toggle">
    <input v-model="showArchived" type="checkbox" name="archived" />
    显示已归档的项目
  </label>
  <AsyncView v-slot="{ data }" :load="list">
    <ListView
      :items="data"
      label="学习项目"
      :empty="showArchived ? '还没有学习项目。' : '还没有进行中的学习项目。'"
    >
      <template #default="{ item }">
        <div class="project-row">
          <RouterLink class="project-title" :to="pathOf('/projects/:id', { id: item.id })">{{
            item.title
          }}</RouterLink>
          <span v-if="item.archived" class="tag">已归档</span>
        </div>
        <p class="project-meta">
          <span>课程：{{ item.course ?? '未选课程' }}</span>
          <span>工作流：{{ workflowText(item.workflowId) }}</span>
        </p>
      </template>
      <template #empty-action>
        <p>新建一个学习项目，选好目标类型，就可以在 Claude Code 里开始学习。</p>
        <RouterLink class="button-link" to="/projects/new">新建第一个学习项目</RouterLink>
      </template>
    </ListView>
  </AsyncView>
</template>

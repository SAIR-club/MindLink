<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { AsyncView, useApi, useLoad } from '../../components/index.js'
import ProjectEditor from './ProjectEditor.vue'
import { projectApi } from './project.js'

/** `#/projects/:id`: one project's settings. `?created=1` marks a project just made, to say how to start. */

const projects = projectApi(useApi())
const route = useRoute()
const id = () => String(route.params['id'])
const project = useLoad(() => projects.show(id()), [id])
const created = computed(() => route.query['created'] === '1')
</script>

<template>
  <AsyncView v-slot="{ data }" :load="project">
    <ProjectEditor :key="data.id" :project="data" :created="created" />
  </AsyncView>
</template>

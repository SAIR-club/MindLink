<script setup lang="ts">
import { computed } from 'vue'
import { codeOf, messageOf } from '../client.js'

/** A failure, in the person's words: a refusal's Chinese text, with its code for a report, and a retry button. */

const props = defineProps<{
  readonly error: unknown
  readonly retry?: () => unknown
}>()

const message = computed(() => messageOf(props.error))
const code = computed(() => codeOf(props.error))
</script>

<template>
  <div class="state state-error" role="alert">
    <p>{{ message }}</p>
    <p v-if="code !== undefined" class="state-code">代码：{{ code }}</p>
    <button v-if="retry !== undefined" type="button" @click="retry()">重试</button>
  </div>
</template>

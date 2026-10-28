<script setup lang="ts" generic="T">
import type { Load } from '../load.js'
import ErrorState from './ErrorState.vue'
import LoadingState from './LoadingState.vue'

/**
 * Shows a `useLoad` read: loading, then the slot with its `data`, or the failure in Chinese with a retry button.
 *
 *   <AsyncView :load="projects" v-slot="{ data }"> … </AsyncView>
 */

defineProps<{ readonly load: Load<T> }>()
defineSlots<{ default(props: { readonly data: T }): unknown }>()
</script>

<template>
  <LoadingState v-if="load.state.value.status === 'loading'" />
  <ErrorState
    v-else-if="load.state.value.status === 'error'"
    :error="load.state.value.error"
    :retry="load.reload"
  />
  <slot v-else :data="load.state.value.data" />
</template>

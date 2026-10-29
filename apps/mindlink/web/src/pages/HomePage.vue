<script setup lang="ts">
import EmptyState from '../components/EmptyState.vue'

/** What `/` shows until a feature registers a home page of its own. */

defineProps<{ readonly pages: boolean }>()
</script>

<template>
  <EmptyState :text="pages ? '欢迎使用 MindLink。' : '欢迎使用 MindLink。还没有可用的页面。'" />
</template>

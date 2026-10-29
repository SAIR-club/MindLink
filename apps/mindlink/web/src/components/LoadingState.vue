<script setup lang="ts">
/** What a page shows while it waits. */

withDefaults(defineProps<{ readonly text?: string }>(), { text: '加载中…' })
</script>

<template>
  <p class="state state-loading" role="status" aria-busy="true">{{ text }}</p>
</template>

<script setup lang="ts">
/** When there is nothing to show: what is missing, such as "还没有学习项目。", and in the slot what to do about it. */

defineProps<{ readonly text: string }>()
</script>

<template>
  <div class="state state-empty">
    <p>{{ text }}</p>
    <slot />
  </div>
</template>

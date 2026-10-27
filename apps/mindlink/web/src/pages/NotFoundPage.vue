<script setup lang="ts">
import { RouterLink } from 'vue-router'
import EmptyState from '../components/EmptyState.vue'
</script>

<template>
  <EmptyState text="找不到这个页面。">
    <RouterLink to="/">回到首页</RouterLink>
  </EmptyState>
</template>

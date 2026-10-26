<script setup lang="ts" generic="T">
import EmptyState from './EmptyState.vue'

/**
 * A list of items, or an empty state when there are none.
 *
 *   <ListView :items="projects" empty="还没有学习项目。" v-slot="{ item }">{{ item.title }}</ListView>
 *
 * The `empty-action` slot holds what to do when there is nothing, such as a link to create one.
 */

withDefaults(
  defineProps<{
    readonly items: readonly T[]
    readonly empty?: string
    readonly label?: string
  }>(),
  { empty: '这里还没有内容。' },
)
defineSlots<{
  default(props: { readonly item: T; readonly index: number }): unknown
  'empty-action'?(props: Record<string, never>): unknown
}>()
</script>

<template>
  <EmptyState v-if="items.length === 0" :text="empty">
    <slot name="empty-action" />
  </EmptyState>
  <ul v-else class="list" :aria-label="label">
    <li v-for="(item, index) in items" :key="index" class="list-item">
      <slot :item="item" :index="index" />
    </li>
  </ul>
</template>

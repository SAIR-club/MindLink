<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { ConfirmSpec } from '../confirm.js'

/**
 * The question `useConfirm()` asks, in a modal box. The shell shows it; a page only awaits the answer.
 *
 * Only the confirm button answers `true`; cancel, Escape and a click outside the box answer `false`. Focus starts
 * on cancel, so Enter alone never confirms.
 */

defineProps<{ readonly spec: ConfirmSpec }>()
const emit = defineEmits<{ answer: [answer: boolean] }>()

const cancel = ref<HTMLButtonElement | null>(null)
onMounted(() => cancel.value?.focus())
</script>

<template>
  <div class="overlay" @click.self="emit('answer', false)" @keydown.esc="emit('answer', false)">
    <div class="dialog" role="alertdialog" aria-modal="true">
      <p class="dialog-message">{{ spec.message }}</p>
      <p v-if="spec.detail !== undefined" class="dialog-detail">{{ spec.detail }}</p>
      <div class="dialog-actions">
        <button ref="cancel" type="button" @click="emit('answer', false)">
          {{ spec.cancelLabel ?? '取消' }}
        </button>
        <button
          type="button"
          :class="spec.danger === true ? 'danger' : undefined"
          @click="emit('answer', true)"
        >
          {{ spec.confirmLabel ?? '确定' }}
        </button>
      </div>
    </div>
  </div>
</template>

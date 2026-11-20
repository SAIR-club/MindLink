<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue'
import { RouterLink } from 'vue-router'
import { AsyncView, ListView, useApi, useVocabulary } from '../../components/index.js'
import type { Load, LoadState } from '../../load.js'
import { decide as sendDecision, readQueue, type Decision, type Queue } from './api.js'
import { usePolling } from './poll.js'
import { liveDelegations, scopeText, type Context } from './review.js'
import SuggestionCard from './SuggestionCard.vue'

/**
 * The review queue (`#/review`): every suggestion waiting for the person. Nothing in it is their understanding until
 * they accept or modify it. Read again every few seconds while the page is visible and nobody is editing.
 */

const api = useApi()
const vocabulary = useVocabulary()

const state = shallowRef<LoadState<Queue>>({ status: 'loading' })
const editing = ref(new Set<string>())

async function read(): Promise<void> {
  const known = state.value.status === 'ready' ? state.value.data : undefined
  const queue = await readQueue(api, {
    known: known?.nodes ?? [],
    vocabulary: known === undefined ? vocabulary : () => Promise.resolve(known.vocabulary),
  })
  state.value = { status: 'ready', data: queue }
}

/** The first read, and retry: shows loading, then the queue or the failure. */
const load: Load<Queue> = {
  state,
  async reload() {
    state.value = { status: 'loading' }
    try {
      await read()
    } catch (error) {
      state.value = { status: 'error', error }
    }
  },
}
void load.reload()

usePolling(read, { paused: () => editing.value.size > 0 || state.value.status !== 'ready' })

function contextOf(queue: Queue): Context {
  return {
    vocabulary: queue.vocabulary,
    nodes: queue.nodes,
    pending: new Map(queue.suggestions.map((suggestion) => [suggestion.id, suggestion])),
  }
}

const live = computed(() =>
  state.value.status === 'ready' ? liveDelegations(state.value.data.delegations) : [],
)

function setEditing(id: string, value: boolean): void {
  const next = new Set(editing.value)
  if (value) next.add(id)
  else next.delete(id)
  editing.value = next
}

function decider(id: string): (decision: Decision) => Promise<void> {
  return async (decision) => {
    await sendDecision(api, id, decision)
    setEditing(id, false)
    // A decision may name a node the queue did not know, and frees the suggestions that waited for it.
    await read()
  }
}
</script>

<template>
  <h1>审阅</h1>
  <p class="lead">
    这里是 agent 或你导入的材料提出、还等你决定的提议。在你接受之前，它们不会改变你的图谱和你的理解。
    每条都标出是<strong>原话</strong>（你自己说的）还是<strong>推断</strong>（agent 的读法）。
  </p>
  <p v-if="live.length > 0" class="delegation-banner" role="note">
    托管确认已开启：{{ live.map((each) => scopeText(each.scope)).join('、') }}。新的 agent 提议会由服务替你确认，
    <RouterLink to="/review/delegation">查看"已替你确认"或关闭托管</RouterLink>。
  </p>
  <p v-else class="delegation-link">
    <RouterLink to="/review/delegation">托管确认</RouterLink>：让服务替你确认 agent 的提议（默认关闭）。
  </p>
  <AsyncView v-slot="{ data }" :load="load">
    <p class="count">{{ data.suggestions.length }} 条待审阅</p>
    <ListView
      v-slot="{ item }"
      :items="data.suggestions"
      label="待审阅的提议"
      empty="没有待审阅的提议。"
    >
      <SuggestionCard
        :key="item.id"
        :suggestion="item"
        :context="contextOf(data)"
        :delegations="data.delegations"
        :decide="decider(item.id)"
        @editing="(value) => setEditing(item.id, value)"
      />
    </ListView>
  </AsyncView>
</template>

<style scoped>
.lead,
.count,
.delegation-link {
  color: var(--muted);
}

.delegation-banner {
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  background: var(--notice);
}
</style>

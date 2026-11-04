<script setup lang="ts">
import { computed, ref } from 'vue'
import { messageOf } from '../../client.js'
import FormView from '../../components/FormView.vue'
import type { Values } from '../../form.js'
import type { Decision } from './api.js'
import {
  basisOf,
  delegationNote,
  describeProposal,
  editorFields,
  modifiedProposal,
  proposerText,
  speakerText,
  timeText,
  waitingFor,
  waitingText,
  type Context,
  type Delegation,
  type Suggestion,
} from './review.js'

/**
 * One pending suggestion: what it proposes, who proposed it, the words it rests on and whether those are the
 * learner's own or an agent's reading, and the three decisions. Modifying opens an editor in place.
 */

const props = defineProps<{
  readonly suggestion: Suggestion
  readonly context: Context
  readonly delegations: readonly Delegation[]
  /** Sends a decision; throws the refusal when the service says no. */
  readonly decide: (decision: Decision) => Promise<void>
}>()
const emit = defineEmits<{ editing: [editing: boolean] }>()

const view = computed(() => describeProposal(props.suggestion.proposal, props.context))
const basis = computed(() => basisOf(props.suggestion))
const speaker = computed(() => speakerText(props.suggestion.origin))
const time = computed(() => timeText(props.suggestion.origin))
const waiting = computed(() => waitingText(waitingFor(props.suggestion, props.context.pending)))
const delegated = computed(() => delegationNote(props.delegations, props.suggestion))
const fields = computed(() => editorFields(props.suggestion.proposal, props.context.vocabulary))

const editing = ref(false)
const busy = ref(false)
const message = ref('')

function setEditing(value: boolean): void {
  editing.value = value
  message.value = ''
  emit('editing', value)
}

async function send(decision: Decision): Promise<void> {
  if (busy.value) return
  busy.value = true
  message.value = ''
  try {
    await props.decide(decision)
  } catch (error) {
    message.value = messageOf(error)
  } finally {
    busy.value = false
  }
}

async function saveEdit(values: Values): Promise<void> {
  // FormView shows a refusal itself; the editor stays open so the person can change their edit.
  await props.decide({
    action: 'modify',
    proposal: modifiedProposal(props.suggestion.proposal, values),
  })
  editing.value = false
  emit('editing', false)
}
</script>

<template>
  <article class="card" :data-suggestion="suggestion.id">
    <header class="card-head">
      <span class="kind">{{ view.kind }}</span>
      <span class="basis" :class="`basis-${basis.tone}`" :title="basis.explanation">
        {{ basis.label }}
      </span>
      <span v-if="delegated !== undefined" class="delegated">托管中</span>
    </header>
    <p class="summary">{{ view.summary }}</p>
    <p class="basis-explanation">{{ basis.explanation }}</p>
    <blockquote v-if="suggestion.origin !== undefined" class="quote">
      <p class="quote-who">
        <span>{{ speaker === undefined ? '说话人未注明' : `${speaker}说` }}</span>
        <span v-if="time !== undefined">（{{ time }}）</span>
      </p>
      <p class="quote-text">「{{ suggestion.origin.excerpt }}」</p>
      <p class="quote-source">出处：{{ suggestion.origin.sourceId }}</p>
    </blockquote>
    <p class="why">理由：{{ suggestion.rationale === '' ? '（未说明）' : suggestion.rationale }}</p>
    <p class="who">提出者：{{ proposerText(suggestion.proposedBy) }}</p>
    <p v-if="waiting !== undefined" class="waiting" role="note">{{ waiting }}</p>
    <p v-if="delegated !== undefined" class="delegated-note" role="note">{{ delegated }}</p>

    <div v-if="editing" class="editor">
      <FormView :fields="fields" submit-label="按我的修改接受" :submit="saveEdit" />
      <button type="button" class="cancel" @click="setEditing(false)">取消修改</button>
    </div>
    <div v-else class="actions">
      <button
        type="button"
        class="primary"
        :disabled="busy || waiting !== undefined"
        @click="send({ action: 'accept' })"
      >
        接受
      </button>
      <button type="button" :disabled="busy" @click="setEditing(true)">修改后接受</button>
      <button type="button" :disabled="busy" @click="send({ action: 'dismiss' })">驳回</button>
    </div>
    <p class="card-error" role="alert">{{ message }}</p>
  </article>
</template>

<style scoped>
.card {
  display: grid;
  gap: 0.4rem;
}

.card p {
  margin: 0;
}

.card-head {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}

.kind {
  font-weight: 600;
}

.basis,
.delegated {
  padding: 0 0.5rem;
  border-radius: 999px;
  font-size: 0.85em;
  border: 1px solid currentcolor;
}

.basis-stated {
  color: #1a7f37;
}

.basis-inferred,
.basis-proposed {
  color: #9a6700;
}

.delegated {
  color: var(--accent);
}

.summary {
  font-size: 1.05em;
}

.basis-explanation,
.who,
.quote-source {
  color: var(--muted);
  font-size: 0.9em;
}

.quote {
  margin: 0;
  padding: 0.4rem 0.75rem;
  border-left: 3px solid var(--line);
  background: var(--background);
}

.quote-who {
  font-size: 0.9em;
  font-weight: 500;
}

.waiting,
.delegated-note {
  padding: 0.3rem 0.6rem;
  border-radius: 6px;
  background: var(--notice);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.editor {
  display: grid;
  gap: 0.5rem;
  padding: 0.75rem;
  border: 1px dashed var(--line);
  border-radius: 6px;
}

.cancel {
  justify-self: start;
}

.card-error {
  color: var(--danger);
}

.card-error:empty {
  display: none;
}
</style>

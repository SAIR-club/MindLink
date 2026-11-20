<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { messageOf } from '../../client.js'
import { AsyncView, ListView, useApi, useConfirm, useLoad } from '../../components/index.js'
import { grant, readDelegationState, revoke, undo } from './api.js'
import {
  delegatedText,
  delegationFor,
  grantQuestion,
  liveDelegations,
  normaliseScope,
  scopeText,
  timeOf,
  type DelegatedDecision,
  type Delegation,
} from './review.js'

/**
 * Delegated confirmation (`#/review/delegation`, ADR 0016): turn it on or off per scope, a learning project's id or
 * `*` for all of them, and see and undo every decision the service took for the person. `?scope=<project id>` opens
 * it for one project, so a project's settings can link here.
 */

const api = useApi()
const confirm = useConfirm()
const route = useRoute()

const state = useLoad(() => readDelegationState(api))

const scope = ref(typeof route.query['scope'] === 'string' ? route.query['scope'] : '*')
const busy = ref(false)
const message = ref('')

const chosen = computed(() => normaliseScope(scope.value))

async function act(work: () => Promise<unknown>): Promise<void> {
  if (busy.value) return
  busy.value = true
  message.value = ''
  try {
    await work()
    await state.reload()
  } catch (error) {
    message.value = messageOf(error)
  } finally {
    busy.value = false
  }
}

async function turnOn(): Promise<void> {
  const target = chosen.value
  const question = grantQuestion(target)
  if (!(await confirm({ ...question, confirmLabel: '开启托管' }))) return
  await act(() => grant(api, target))
}

async function turnOff(delegation: Delegation): Promise<void> {
  const ok = await confirm({
    message: `关闭「${scopeText(delegation.scope)}」的托管确认？`,
    detail:
      '关闭后，新的提议回到审阅队列等你决定。已经替你确认的条目不会自动撤销，可以在下面逐条或全部撤销。',
    confirmLabel: '关闭托管',
  })
  if (ok) await act(() => revoke(api, delegation.id))
}

async function undoOne(decision: DelegatedDecision, label: string): Promise<void> {
  const ok = await confirm({
    message: `撤销对${label}的托管确认？`,
    detail: '它写入你图谱的内容会被撤回；历史里保留这次确认和这次撤销。',
    confirmLabel: '撤销',
    danger: true,
  })
  if (ok) await act(() => undo(api, decision.suggestionId))
}

async function undoAll(decisions: readonly DelegatedDecision[]): Promise<void> {
  const open = decisions.filter((decision) => !decision.undone)
  if (open.length === 0) return
  const ok = await confirm({
    message: `撤销全部 ${open.length} 条托管确认？`,
    detail: '它们写入你图谱的内容都会被撤回；历史里保留记录。',
    confirmLabel: '全部撤销',
    danger: true,
  })
  if (!ok) return
  await act(async () => {
    for (const decision of open) await undo(api, decision.suggestionId)
  })
}
</script>

<template>
  <h1>托管确认</h1>
  <p class="lead">
    默认由你本人在<RouterLink to="/review">审阅队列</RouterLink>里确认每条提议。开启托管后，服务会替你接受 agent
    在这个范围里的新提议，并记为"托管确认"；你随时可以关闭，也可以撤销它替你做的每一条确认。
  </p>
  <p class="form-error" role="alert">{{ message }}</p>
  <AsyncView v-slot="{ data }" :load="state">
    <section aria-labelledby="scopes">
      <h2 id="scopes">范围</h2>
      <div class="toggle">
        <label class="field">
          <span class="field-label">学习项目（填项目编号；填 * 表示全部）</span>
          <input v-model="scope" type="text" name="scope" placeholder="*" />
        </label>
        <p v-if="delegationFor(data.delegations, chosen) !== undefined" class="on">
          「{{ scopeText(chosen) }}」的托管确认已开启。
          <button
            type="button"
            :disabled="busy"
            @click="turnOff(delegationFor(data.delegations, chosen)!)"
          >
            关闭托管
          </button>
        </p>
        <p v-else class="off">
          「{{ scopeText(chosen) }}」的托管确认没有开启。
          <button type="button" class="primary" :disabled="busy" @click="turnOn()">开启托管</button>
        </p>
      </div>
      <h3>已开启的托管</h3>
      <ListView
        v-slot="{ item }"
        :items="liveDelegations(data.delegations)"
        label="已开启的托管"
        empty="没有开启任何托管，所有提议都等你本人确认。"
      >
        <div class="row">
          <span>{{ scopeText(item.scope) }}，{{ timeOf(item.grantedAt) }} 开启</span>
          <button type="button" :disabled="busy" @click="turnOff(item)">关闭托管</button>
        </div>
      </ListView>
    </section>

    <section aria-labelledby="delegated">
      <h2 id="delegated">已替你确认</h2>
      <p class="muted">托管期间服务替你接受的提议。撤销会撤回它写入的内容，历史里保留记录。</p>
      <ListView
        v-slot="{ item }"
        :items="data.decisions"
        label="已替你确认"
        empty="还没有替你确认过任何提议。"
      >
        <div class="row" :data-suggestion="item.suggestionId">
          <span>
            <span class="badge">托管确认</span>
            {{ delegatedText(item, data.nodes) }}
            <span class="muted">{{ timeOf(item.decidedAt) }}</span>
          </span>
          <span v-if="item.undone" class="muted">已撤销</span>
          <button
            v-else
            type="button"
            :disabled="busy"
            @click="undoOne(item, delegatedText(item, data.nodes))"
          >
            撤销
          </button>
        </div>
      </ListView>
      <p v-if="data.decisions.some((decision) => !decision.undone)">
        <button type="button" class="danger" :disabled="busy" @click="undoAll(data.decisions)">
          全部撤销
        </button>
      </p>
    </section>
  </AsyncView>
</template>

<style scoped>
.lead,
.muted {
  color: var(--muted);
}

.toggle {
  display: grid;
  gap: 0.5rem;
  max-width: 560px;
  margin-bottom: 1rem;
}

.on,
.off {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
}

.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.badge {
  padding: 0 0.5rem;
  border-radius: 999px;
  font-size: 0.85em;
  border: 1px solid currentcolor;
  color: var(--accent);
}
</style>

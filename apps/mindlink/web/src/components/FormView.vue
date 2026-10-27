<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { messageOf } from '../client.js'
import { initialValues, missingMessage, type Field, type Values } from '../form.js'

/**
 * A form: labelled fields, a submit button, and the refusal's text when the service says no.
 *
 * While `submit` runs the button is disabled, so a slow request is not sent twice. A required field left empty
 * is caught here, before anything is sent. Build a level or dimension field with `levelField` / `dimensionField`,
 * so it offers what the vocabulary lists.
 */

const props = withDefaults(
  defineProps<{
    readonly fields: readonly Field[]
    readonly submitLabel?: string
    readonly submit: (values: Values) => unknown
  }>(),
  { submitLabel: '提交' },
)

const values = reactive<Record<string, string>>(initialValues(props.fields))
const message = ref('')
const busy = ref(false)

watch(
  () => props.fields,
  (fields) => {
    for (const key of Object.keys(values)) Reflect.deleteProperty(values, key)
    Object.assign(values, initialValues(fields))
  },
)

async function send(): Promise<void> {
  if (busy.value) return
  const snapshot: Values = { ...values }
  const missing = missingMessage(props.fields, snapshot)
  if (missing !== undefined) {
    message.value = missing
    return
  }
  message.value = ''
  busy.value = true
  try {
    await props.submit(snapshot)
  } catch (error) {
    message.value = messageOf(error)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <form class="form" novalidate @submit.prevent="send">
    <label v-for="field in fields" :key="field.name" class="field">
      <span class="field-label">{{ field.label }}</span>
      <select
        v-if="field.kind === 'select'"
        v-model="values[field.name]"
        :name="field.name"
        :required="field.required === true"
        :disabled="(field.options ?? []).length === 0"
      >
        <option v-for="option in field.options ?? []" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
      <textarea
        v-else-if="field.kind === 'textarea'"
        v-model="values[field.name]"
        :name="field.name"
        :required="field.required === true"
        :placeholder="field.placeholder"
      />
      <input
        v-else
        v-model="values[field.name]"
        type="text"
        :name="field.name"
        :required="field.required === true"
        :placeholder="field.placeholder"
      />
    </label>
    <p class="form-error" role="alert">{{ message }}</p>
    <button type="submit" :disabled="busy">{{ submitLabel }}</button>
  </form>
</template>

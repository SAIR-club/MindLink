// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import FormView from '../../apps/mindlink/web/src/components/FormView.vue'
import { levelField } from '../../apps/mindlink/web/src/form.js'
import {
  dimensionOptions,
  dimensionText,
  levelOptions,
  levelText,
  vocabularyOf,
  type Vocabulary,
} from '../../apps/mindlink/web/src/vocabulary.js'

/** An answer from `GET /api/v1/vocabulary`, in the shape Episteme's `VocabularyDimension` documents. */
const ANSWER = {
  epoch: 'e1',
  revision: 3,
  dimensions: [
    {
      id: 'learn.mastery',
      label: '掌握程度',
      kind: 'ordinal',
      recordable: true,
      levels: [
        { id: 'none', legacy: false },
        { id: 'partial', legacy: false },
        { id: 'shaky', legacy: true },
        { id: 'solid', legacy: false },
      ],
    },
    {
      id: 'learn.confidence',
      label: '把握',
      kind: 'ordinal',
      recordable: false,
      levels: [{ id: 'low', legacy: false }],
    },
  ],
}

/** The level select a form offers for `learn.mastery`, holding `value`. */
function select(vocabulary: Vocabulary, value?: string): HTMLSelectElement {
  const form = mount(FormView, {
    props: {
      fields: [levelField(vocabulary, 'learn.mastery', value === undefined ? {} : { value })],
      submit: () => {},
    },
  })
  return form.get('select').element
}

/** The level options a form built from `answer` offers. */
function offered(answer: Record<string, unknown>): string[] {
  return [...select(vocabularyOf(answer)).options].map((option) => option.value)
}

describe('the vocabulary', () => {
  it('offers every registered level but the legacy ones, in registration order', () => {
    expect(levelOptions(vocabularyOf(ANSWER), 'learn.mastery')).toEqual([
      { value: 'none', label: 'none' },
      { value: 'partial', label: 'partial' },
      { value: 'solid', label: 'solid' },
    ])
  })

  it('still shows a legacy level the graph holds, marked as no longer chosen', () => {
    const vocabulary = vocabularyOf(ANSWER)
    expect(levelText(vocabulary, 'learn.mastery', 'shaky')).toBe('shaky（旧等级，不能再选）')
    expect(levelText(vocabulary, 'learn.mastery', 'solid')).toBe('solid')
  })

  it('names dimensions by their registered labels, offering only those a person records by hand', () => {
    const vocabulary = vocabularyOf(ANSWER)
    expect(dimensionOptions(vocabulary)).toEqual([{ value: 'learn.mastery', label: '掌握程度' }])
    expect(dimensionOptions(vocabulary, { recordableOnly: false })).toHaveLength(2)
    expect(dimensionText(vocabulary, 'learn.confidence')).toBe('把握')
    expect(dimensionText(vocabulary, 'gone')).toBe('gone')
  })

  it('changes what a form offers when the vocabulary changes', () => {
    expect(offered(ANSWER)).toEqual(['none', 'partial', 'solid'])
    const changed = {
      dimensions: [
        {
          id: 'learn.mastery',
          label: '掌握程度',
          kind: 'ordinal',
          recordable: true,
          levels: [
            { id: 'none', legacy: true },
            { id: 'partial', legacy: false },
            { id: 'solid', legacy: false },
            { id: 'fluent', legacy: false },
          ],
        },
      ],
    }
    expect(offered(changed)).toEqual(['partial', 'solid', 'fluent'])
    expect(offered({ dimensions: [] })).toEqual([])
  })

  it('selects a held level only when it is still offered', () => {
    const vocabulary = vocabularyOf(ANSWER)
    expect(select(vocabulary, 'solid').value).toBe('solid')
    expect(select(vocabulary, 'shaky').value).toBe('none')
  })

  it('drops what does not have the documented shape', () => {
    expect(
      vocabularyOf({
        dimensions: [
          null,
          { id: 7, levels: [] },
          { id: 'no-levels' },
          { id: 'd', levels: [{ id: 'a' }, { nope: true }, 'b'] },
        ],
      }),
    ).toEqual({
      dimensions: [
        { id: 'd', label: 'd', kind: '', recordable: false, levels: [{ id: 'a', legacy: false }] },
      ],
    })
    expect(vocabularyOf({})).toEqual({ dimensions: [] })
  })
})

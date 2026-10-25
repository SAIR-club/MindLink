/**
 * The dimensions a learner may set by hand, in the order they are offered, with their Chinese names.
 *
 * Deliberately a subset of the registered axes: the others are recorded by other means or are not yet settable by
 * hand, and offering a control whose meaning is unclear would invite the learner to record something they cannot
 * interpret later. Chinese and English sit together so they cannot drift. The levels themselves come from the
 * registered definitions, never from here.
 *
 * These moved from Episteme's deprecated built-in Learn scene (ADR 0013): the Learn vocabulary belongs to MindLink.
 */
export interface LearnPresentation {
  readonly id: string
  readonly labelZh: string
  readonly levelLabelsZh: Readonly<Record<string, string>>
  readonly description: string
  readonly descriptionZh: string
}

const LOW_MEDIUM_HIGH_ZH = { low: '低', medium: '中', high: '高' }

export const learnPresentations: readonly LearnPresentation[] = [
  {
    id: 'confidence',
    labelZh: '确信程度',
    levelLabelsZh: LOW_MEDIUM_HIGH_ZH,
    description: 'How much you would rely on this.',
    descriptionZh: '你愿意多大程度上依赖它。',
  },
  {
    id: 'articulation',
    labelZh: '表达程度',
    levelLabelsZh: LOW_MEDIUM_HIGH_ZH,
    description: 'How well you could explain it to someone else.',
    descriptionZh: '你能多好地把它讲给别人听。',
  },
  {
    id: 'evidence',
    labelZh: '证据',
    levelLabelsZh: { none: '无', anecdotal: '零散的', reproduced: '已复现', proven: '已证明' },
    description: 'What backs it up.',
    descriptionZh: '它背后有什么支撑。',
  },
  {
    id: 'conflict',
    labelZh: '冲突',
    // `suspected` is recordable so a distilled suggestion of it can be decided like any other (ADR 0011). Who
    // decides does not change: only the learner, through the one decision path.
    levelLabelsZh: { none: '无', suspected: '疑似', open: '未解决', resolved: '已解决' },
    description: 'Whether you hold something that contradicts it.',
    descriptionZh: '你是否同时持有与它矛盾的东西。',
  },
]

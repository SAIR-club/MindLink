import { refuse } from '@mindlink/platform'
import { scan } from '../markdown.js'
import type { Block, Intensity, ScalarValue } from '../types.js'
import type { BlockLookup } from './plan.js'

/**
 * What an agent is given to read (block format, 4.4): the sections of one block for one intensity, cut by heading.
 *
 * Only the current intensity's section is ever returned, never the other two; the engine needs to understand none
 * of the text to do that, because each intensity is its own section.
 */

/** The sections returned beside the intensity's own, in this order. */
const COMMON = '通用'
const RESULT = '结果'
const DONE_WHEN = '结束条件'

export interface SubStep {
  /** The step id inside the activity, which `block_read` takes. */
  readonly id: string
  readonly block: string
  readonly title: string
  readonly summary: string
  readonly optional: boolean
}

export interface ReferenceLink {
  readonly path: string
  /** The link's text where the returned sections link to it. */
  readonly text: string
}

export interface Instructions {
  readonly block: string
  readonly title: string
  readonly intensity: Intensity
  readonly params: Readonly<Record<string, ScalarValue>>
  /** `## 通用`, the intensity's section, `## 结果` and `## 结束条件`, with the parameters filled in. */
  readonly text: string
  readonly subSteps: readonly SubStep[]
  readonly references: readonly ReferenceLink[]
}

/** Replaces each `{{name}}` with its value; `\{{` is a literal `{{` (block format, 3.5). */
export function fillParams(text: string, params: Readonly<Record<string, ScalarValue>>): string {
  return text.replace(/(\\?)\{\{([^}]*)\}\}/g, (match, escape: string, name: string) => {
    if (escape === '\\') return match.slice(1)
    const value = params[name.trim()]
    return value === undefined ? match : String(value)
  })
}

const LINK = /\[([^\]]*)\]\(\s*<?(references\/[^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g

function referenceLinks(text: string): ReferenceLink[] {
  const links: ReferenceLink[] = []
  for (const line of scan(text.split('\n'), 1)) {
    if (line.code) continue
    const plain = line.text.replace(/(`+)[^`]*?\1/g, (span) => ' '.repeat(span.length))
    for (const match of plain.matchAll(LINK)) {
      const path = match[2]!
      if (!links.some((link) => link.path === path)) links.push({ path, text: match[1]! })
    }
  }
  return links
}

function sectionsFor(block: Block, titles: readonly string[]): string {
  return titles
    .map((title) => block.sections.find((section) => section.title === title))
    .filter((section) => section !== undefined)
    .map((section) => `## ${section.title}\n\n${section.text}`)
    .join('\n\n')
}

function render(
  block: Block,
  intensity: Intensity,
  params: Readonly<Record<string, ScalarValue>>,
  titles: readonly string[],
  lookup: BlockLookup,
): Instructions {
  if (!block.intensities.includes(intensity)) {
    refuse(
      'intensity_not_supported',
      `${block.key} 只支持 ${block.intensities.join('、')}，不支持 ${intensity}`,
    )
  }
  const text = fillParams(sectionsFor(block, titles), params)
  return {
    block: block.key,
    title: block.title,
    intensity,
    params,
    text,
    subSteps: block.steps.map((step) => {
      const used = lookup(step.use.key)
      return {
        id: step.id,
        block: step.use.key,
        title: used?.title ?? step.use.key,
        summary: used?.summary ?? '',
        optional: step.optional,
      }
    }),
    references: referenceLinks(text).filter((link) =>
      block.references.some((reference) => reference.path === link.path),
    ),
  }
}

/** What `workflow_next` returns for an activity at one intensity. */
export function activityInstructions(
  activity: Block,
  intensity: Intensity,
  params: Readonly<Record<string, ScalarValue>>,
  lookup: BlockLookup,
): Instructions {
  return render(activity, intensity, params, [COMMON, intensity, RESULT, DONE_WHEN], lookup)
}

/** One sub-step of an activity, at the activity's intensity, with the values the activity passes it. */
export function subStepInstructions(
  activity: Block,
  stepId: string,
  intensity: Intensity,
  activityParams: Readonly<Record<string, ScalarValue>>,
  lookup: BlockLookup,
): Instructions {
  const step = activity.steps.find((candidate) => candidate.id === stepId)
  if (step === undefined) {
    refuse(
      'unknown_sub_step',
      `${activity.key} 没有子步骤 "${stepId}"；有 ${activity.steps.map((candidate) => candidate.id).join('、') || '（无）'}`,
    )
  }
  const primitive = lookup(step.use.key)
  if (primitive === undefined) refuse('block_not_found', `没有积木 ${step.use.key}`)
  const params: Record<string, ScalarValue> = {}
  for (const spec of primitive.params) params[spec.name] = spec.default
  for (const assignment of step.params) {
    const forwarded =
      assignment.forward === undefined ? undefined : activityParams[assignment.forward]
    params[assignment.name] = forwarded ?? assignment.value
  }
  return render(primitive, intensity, params, [COMMON, intensity, DONE_WHEN], lookup)
}

/** A reference's whole text, from the block that holds it. */
export function referenceText(block: Block, path: string): string {
  const reference = block.references.find((candidate) => candidate.path === path)
  if (reference === undefined) {
    refuse(
      'unknown_reference',
      `${block.key} 没有附件 ${path}；有 ${block.references.map((candidate) => candidate.path).join('、') || '（无）'}`,
    )
  }
  return reference.text
}

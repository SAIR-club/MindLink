import { recordableDimensions, type SessionScene } from '@episteme/application'
import {
  asId,
  type DimensionId,
  type DomainPack,
  type StateDimensionDefinition,
} from '@episteme/core'
import type { DistillationPolicy } from '@episteme/distillation'

/** The scene MindLink's service runs, and the namespace every MindLink record lives in. */
export const SCENE_NAME = 'mindlink'

/** How a dimension a person may record is shown: its Chinese names and its prose. */
export interface DimensionPresentation {
  readonly id: string
  readonly labelZh: string
  /** The Chinese name of every current level, keyed by level token. */
  readonly levelLabelsZh: Readonly<Record<string, string>>
  readonly description: string
  readonly descriptionZh: string
}

export interface SceneSpec {
  readonly packs: readonly DomainPack[]
  readonly distillationPolicy: DistillationPolicy
  /** The registered dimensions, from the packs. */
  readonly dimensions: readonly StateDimensionDefinition[]
  /** The dimensions a person may set by hand, in the order offered. Each must be registered with levels. */
  readonly presentations: readonly DimensionPresentation[]
}

/**
 * The scene the service is started with.
 *
 * The levels offered come from the registered definitions, never from the presentations, so a surface cannot offer
 * a level Core would refuse. A presentation that does not match a registered dimension throws here, at start.
 */
export function sceneOf(spec: SceneSpec): SessionScene {
  return Object.freeze({
    name: SCENE_NAME,
    packs: spec.packs,
    distillationPolicy: spec.distillationPolicy,
    recordableDimensions: recordableDimensions(
      spec.dimensions,
      spec.presentations.map((presentation) => ({
        ...presentation,
        id: asId<DimensionId>(presentation.id),
      })),
    ),
  })
}

export type { SessionScene }

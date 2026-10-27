import { shallowRef, type ShallowRef } from 'vue'

/**
 * Asking a person to confirm before something that cannot be taken back, such as withdrawing a publication.
 *
 * A page calls `useConfirm()` and awaits what it returns; the shell shows the one open question in
 * `ConfirmDialog`. Only the confirm button answers `true`. Cancel, Escape, a click outside the box, and a newer
 * question all answer `false`.
 */

export interface ConfirmSpec {
  readonly message: string
  readonly detail?: string
  readonly confirmLabel?: string
  readonly cancelLabel?: string
  readonly danger?: boolean
}

export interface Confirmer {
  /** The question now open, or `undefined`. */
  readonly current: Readonly<ShallowRef<ConfirmSpec | undefined>>
  ask(spec: ConfirmSpec): Promise<boolean>
  answer(answer: boolean): void
}

export function createConfirmer(): Confirmer {
  const current = shallowRef<ConfirmSpec | undefined>()
  let resolve: ((answer: boolean) => void) | undefined

  function answer(value: boolean): void {
    const pending = resolve
    resolve = undefined
    current.value = undefined
    pending?.(value)
  }

  return {
    current,
    ask(spec) {
      answer(false)
      return new Promise<boolean>((done) => {
        resolve = done
        current.value = spec
      })
    },
    answer,
  }
}

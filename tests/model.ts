import type { ModelClient } from '@mindlink/workbench'

/** A model that fails when called: a test that only reads what the service already recorded needs none. */
export const noModel: ModelClient = {
  name: 'none',
  simulated: false,
  complete: () => {
    throw new Error('the service called its model')
  },
}

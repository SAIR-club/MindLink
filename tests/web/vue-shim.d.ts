// The front end's single-file components, as `tsc -b` sees them from these tests. vue-tsc checks them in full
// (`apps/mindlink/web/tsconfig.json`).
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent
  export default component
}

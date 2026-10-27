# 前端

MindLink 的前端：Vue 3 + Vue Router + TypeScript，用 Vite 构建。源码在 `src/`，`vite build web` 构建到 `dist/`（不进 git），`mindlink serve` 把 `dist/` 发布在 `/`（`apps/mindlink/src/app.ts` 里的 `WEB`）。

## 命令

| 命令 | 做什么 |
| ---- | ------ |
| `pnpm build` | 编译 TypeScript，并构建前端到 `web/dist/`（`pnpm check` 和 CI 都会跑） |
| `pnpm typecheck` | 包括 `vue-tsc -p apps/mindlink/web/tsconfig.json`，检查 `.ts` 和 `.vue` |
| `pnpm mindlink` | 构建后启动 `mindlink serve`，浏览器打开它打印的 `Web:` 地址 |
| `pnpm --filter @mindlink/app dev:web` | Vite 开发服务器（热更新），把 `/api` 和 `/mcp` 转发给正在运行的 `mindlink serve` |

开发时先在一个终端里 `pnpm mindlink`（默认端口 4321），再在另一个终端里 `pnpm --filter @mindlink/app dev:web`，打开 Vite 打印的地址。服务不在 4321 时用 `MINDLINK_URL=http://127.0.0.1:<端口>` 指定。本地模式下，开发服务器会把服务发给页面的会话 cookie 一并转给浏览器，所以不用另外登录。

## 目录

| 位置 | 是什么 |
| ---- | ------ |
| `index.html`、`src/main.ts`、`src/style.css` | 页面入口、启动、样式 |
| `src/app.ts` | 组装：路由（hash 路由，`#/projects/p1?tab=x`）、请求客户端、登录过期、页面标题 |
| `src/App.vue` | 外壳：顶栏与导航、登录过期提示、当前页面、确认框 |
| `src/registry.ts` | 功能注册表：`register(feature)` |
| `src/features/index.ts` | **注册文件**：每个功能一行 |
| `src/features/<功能>/` | 各功能的页面，例如 `project/`、`understanding/` |
| `src/client.ts` | 请求客户端：调用 REST，统一处理错误和登录过期 |
| `src/refusals.ts` | refusal code 的中文文案表 |
| `src/vocabulary.ts` | 词汇表：等级和维度名称的选项，从 `/api/v1/vocabulary` 读 |
| `src/services.ts` | 页面拿到的服务：`useApi()`、`useVocabulary()`、`useConfirm()` |
| `src/load.ts`、`src/form.ts`、`src/paths.ts`、`src/confirm.ts`、`src/session.ts` | 纯逻辑：加载状态、表单字段、路径、确认、登录过期 |
| `src/components/` | 通用组件：`ListView`、`FormView`、`AsyncView`、`LoadingState`、`EmptyState`、`ErrorState`、`ConfirmDialog`；`components/index.ts` 一并导出页面要用的组件和函数 |
| `src/pages/` | 外壳自己的页面：首页的欢迎、找不到页面 |

`src/` 下 `features/` 以外的都是所有页面共用的外壳；`features/<功能>/` 下是各功能自己的页面。

## 加一个功能的页面

以学习项目（`project`）为例；理解的审阅页（`understanding`）一样。

**1. 写页面 `src/features/project/ProjectList.vue`：**

```vue
<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { AsyncView, ListView, SCENE_API, pathOf, useApi, useLoad } from '../../components/index.js'

interface Project {
  readonly id: string
  readonly title: string
}

const api = useApi()
const projects = useLoad(async () => (await api.get(`${SCENE_API}/projects`))['projects'] as Project[])
</script>

<template>
  <h1>学习项目</h1>
  <AsyncView v-slot="{ data }" :load="projects">
    <ListView v-slot="{ item }" :items="data" empty="还没有学习项目。">
      <RouterLink :to="pathOf('/projects/:id', { id: item.id })">{{ item.title }}</RouterLink>
    </ListView>
  </AsyncView>
</template>
```

带参数的页面用 `useRoute().params` 读参数（已解码），把它传给 `useLoad` 的第二个参数，参数变了就重新加载：

```ts
const route = useRoute()
const id = () => String(route.params['id'])
const project = useLoad(() => api.get(`${SCENE_API}/projects/${encodeURIComponent(id())}`), [id])
```

**2. 写功能的入口 `src/features/project/index.ts`，调用一次 `register`：**

```ts
import { register } from '../../registry.js'
import ProjectList from './ProjectList.vue'

register({
  id: 'project',
  nav: [{ label: '学习项目', path: '/projects' }],
  routes: [
    { path: '/projects', title: '学习项目', component: ProjectList },
    // 不常打开的页面可以按需加载：
    { path: '/projects/:id', title: '项目设置', component: () => import('./ProjectSettings.vue') },
  ],
})
```

**3. 在 `src/features/index.ts` 里加一行（这就是全部的注册）：**

```ts
import './project/index.js'
```

导航按这些行的顺序排列。一个路由只能属于一个功能，重复注册会在启动时报错。

## 页面拿到什么

| 从哪里 | 是什么 |
| ------ | ------ |
| `useApi()` | 请求客户端：`api.get(path)`、`api.post(path, body)`，返回 JSON 对象，失败时抛出 `ApiError` |
| `useVocabulary()` | 读当前词汇表的函数，见下文 |
| `useConfirm()` | 问一句再做：`if (await confirm({ message: '撤回这条发布？', danger: true })) …` |
| `useLoad(load, sources)` | 加载状态：交给 `AsyncView` 显示"加载中…"、内容，或者错误的中文文案和"重试" |
| `useRoute()`、`useRouter()` | Vue Router：参数、查询、跳转（`router.push(pathOf('/projects/:id', { id }))`） |

## 规则

这些规则由测试检查，违反就让 CI 失败（MindLink 规格第 2.2 节，`tests/architecture.test.ts`）：

- **不写 HTML。** `src/` 里（`.vue` 和 `.ts`）不能出现 `v-html`、`innerHTML`、`outerHTML`、`insertAdjacentHTML`。文字一律用 `{{ }}` 插值，Vue 会把它当文本。
- **页面只 import 自己功能的文件和外壳**（`src/` 下 `features/` 以外的文件），不 import 别的功能的页面，也不 import `src/` 以外的文件。只有 `features/index.ts` 可以 import 各功能的 `index.ts`。
- **页面只调用自己功能的 REST**：MindLink 功能的路由在 `SCENE_API`（`/api/v1/scene/mindlink`）下。需要拼接多个功能的页面（项目首页）属于 L3。
- **等级和维度名称不写死。** 选项用 `useVocabulary()` 读到的词汇表来生成：表单里用 `levelField(vocabulary, dimensionId)`、`dimensionField(vocabulary)`，显示已有的值用 `levelText`、`dimensionText`。遗留（legacy）等级只显示（标注"旧等级"），不出现在可选项里。
- **错误只显示中文文案。** `client.ts` 把每个失败变成 `ApiError`，它的 `message` 已经是 `refusals.ts` 里的中文；`FormView` 和 `ErrorState` 会直接显示它。MindLink 自己新加一个 refusal code（`refuse(...)`）时，同时在 `refusals.ts` 里加上文案，否则 `tests/web/refusals.test.ts` 会失败。Episteme 的 code 只为学习者常见的那些写了文案，其余的显示通用的中文提示和 code。

## 登录过期

请求得到 401 时，外壳：

- 如果有功能注册了 `/sign-in` 路由（登录页，MindLink#24），就跳到 `#/sign-in?return=<原来的路由>`，登录页登录成功后跳回 `return`；
- 否则在顶栏下面提示"登录已过期"和"重新载入"按钮。本地模式下重新载入页面就会拿到新的会话。

## 测试

逻辑尽量写成 `src/` 下的纯 TypeScript 函数，直接在 Node 里测（`tests/web/paths.test.ts`、`client.test.ts`）。组件用 `@vue/test-utils` 在 happy-dom 里挂载，测试文件第一行写 `// @vitest-environment happy-dom`，参照 `tests/web/components.test.ts`；整个外壳（路由、导航、登录过期）参照 `tests/web/shell.test.ts`，它用 `createMindLink({ registry, fetch, history: createMemoryHistory() })` 换上假的请求。`tests/web/serve.test.ts` 会启动 `mindlink serve`，检查构建出来的页面和它加载的每个文件都能拿到。

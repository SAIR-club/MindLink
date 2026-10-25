# 前端

MindLink 的前端：普通的 ES module，没有构建步骤，也不用框架。`mindlink serve` 把这个目录原样发布在 `/`（`apps/mindlink/src/app.ts` 里的 `WEB`）。

## 目录

| 位置 | 是什么 |
| ---- | ------ |
| `index.html`、`style.css`、`main.js` | 页面入口、样式、启动 |
| `shell.js` | 外壳：顶栏与导航、按路由显示页面、加载和出错状态、登录过期 |
| `router.js` | 路由：`#/projects/p1?tab=x` 这样的 hash 路由，全是纯函数 |
| `client.js` | 请求客户端：调用 REST，统一处理错误和登录过期 |
| `refusals.js` | refusal code 的中文文案表 |
| `vocabulary.js` | 词汇表：等级和维度名称的选项，从 `/api/v1/vocabulary` 读 |
| `features.js` | 功能注册表 |
| `components/` | 通用组件：`el`、`list`、`form`、`levelField`、`dimensionField`、`confirm`、`loading`、`emptyState`、`errorState` |
| `<功能>/` | 各功能的页面，例如 `project/`、`understanding/` |

根目录的文件和 `components/` 是所有页面共用的外壳；`<功能>/` 下是各功能自己的页面。

## 加一个功能的页面

以学习项目（`project`）为例。

**1. 写功能的入口 `web/project/index.js`，调用一次 `register`：**

```js
import { SCENE_API } from '../client.js'
import { el, list } from '../components/index.js'
import { register } from '../features.js'
import { hrefOf } from '../router.js'

register({
  id: 'project',
  nav: [{ label: '学习项目', path: '/projects' }],
  routes: [
    {
      path: '/projects',
      title: '学习项目',
      render: async ({ document, api }) => {
        const { projects } = await api.get(`${SCENE_API}/projects`)
        return list(document, {
          items: /** @type {{ id: string, title: string }[]} */ (projects),
          render: (project) => el(document, 'a', { href: hrefOf('/projects/:id', { id: project.id }) }, project.title),
          empty: '还没有学习项目。',
        })
      },
    },
    { path: '/projects/:id', title: '项目设置', render: ({ document, params }) => el(document, 'h1', {}, params.id) },
  ],
})
```

**2. 在 `index.html` 里加一行（这就是全部的注册）：**

```html
<script type="module" src="./project/index.js"></script>
```

放在"功能页面"那行注释下面即可，脚本之间的顺序不影响启动；导航按这些行的顺序排列。外壳从不 import 任何功能，所以页面之间也就无从互相引用。

页面多了可以在 `web/project/` 下拆成几个文件，由 `index.js` import 进来。

## 页面拿到什么

`render(context)` 返回一个 DOM 节点（或它的 Promise）。返回 Promise 时外壳先显示"加载中…"；抛出错误时外壳显示错误的中文文案和"重试"。`context` 里有：

| 字段 | 是什么 |
| ---- | ------ |
| `document` | 用它建 DOM，测试里会换成假的 document |
| `api` | 请求客户端：`api.get(path)`、`api.post(path, body)`，返回 JSON 对象 |
| `params` | 路由参数，已解码，例如 `/projects/:id` 的 `id` |
| `query` | hash 里 `?` 之后的 `URLSearchParams` |
| `vocabulary()` | 读当前的词汇表，见下文 |
| `navigate(pattern, params, query)` | 跳到另一个路由，例如 `navigate('/projects/:id', { id })` |

## 规则

这些规则由测试检查，违反就让 CI 失败（MindLink 规格第 2.2 节）：

- **只用 `textContent` 建 DOM。** 前端代码里不能出现 `innerHTML`、`outerHTML`、`insertAdjacentHTML`（`tests/architecture.test.ts`）。用 `components/dom.js` 的 `el(document, tag, props, ...children)`，字符串子节点一律是文本。
- **页面只 import 自己功能的文件和外壳**（根目录的文件和 `components/`），不 import 别的功能的页面（同上）。
- **页面只调用自己功能的 REST**：MindLink 功能的路由在 `SCENE_API`（`/api/v1/scene/mindlink`）下。需要拼接多个功能的页面（项目首页）属于 L3。
- **等级和维度名称不写死。** 选项用 `vocabulary()` 读到的词汇表来生成：表单里用 `levelField(vocabulary, dimensionId)`、`dimensionField(vocabulary)`，显示已有的值用 `levelText`、`dimensionText`。遗留（legacy）等级只显示（标注"旧等级"），不出现在可选项里。
- **错误只显示中文文案。** `client.js` 把每个失败变成 `ApiError`，它的 `message` 已经是 `refusals.js` 里的中文；`form` 和 `errorState` 会直接显示它。新加一个 refusal code（Episteme 的或 MindLink 自己 `refuse(...)` 的）时，同时在 `refusals.js` 里加上文案，否则 `tests/web/refusals.test.ts` 会失败。
- **JSDoc 类型要通过检查。** `web/tsconfig.json` 按浏览器的 DOM 严格检查所有 `.js`（`tests/web/types.test.ts`）。
- **不加构建步骤，不加依赖。** import 只用相对路径，浏览器直接加载（`tests/web/serve.test.ts` 会启动 `mindlink serve`，检查页面引用的每个模块都能拿到）。

## 登录过期

请求得到 401 时，外壳：

- 如果有功能注册了 `/sign-in` 路由（登录页，MindLink#24），就跳到 `#/sign-in?return=<原来的路由>`，登录页登录成功后跳回 `return`；
- 否则在顶栏下面提示"登录已过期"和"重新载入"按钮。本地模式下重新载入页面就会拿到新的会话。

## 测试

页面的逻辑尽量写成纯函数，直接在 Node 里测。要测 DOM 时，用 `tests/web/fake-dom.ts` 封装的 `happy-dom` 测试文档，参照 `tests/web/components.test.ts` 和 `tests/web/shell.test.ts`：

```ts
import { byText, createTestDocument } from './fake-dom.js'

const node = render({ document: createTestDocument(), ... })
expect(byText(node, '还没有学习项目。')).toBeDefined()
```

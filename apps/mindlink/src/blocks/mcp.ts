import { defineTool, refuse, type SceneTool, type ToolAnswer } from '@mindlink/platform'
import type { Instructions } from './engine/instructions.js'
import type { Adjustment } from './engine/plan.js'
import {
  FEATURE,
  adjustmentsOf,
  nextStep,
  parseIntensity,
  readBlock,
  reportStep,
  unwiredProjects,
  type EngineContext,
  type RunState,
} from './engine/runs.js'
import { builtinRegistry, candidateView, runView } from './engine/view.js'

/**
 * The block engine's MCP tools (MindLink#9): `workflow_next`, `workflow_report` and `block_read`.
 *
 * Loading is by activity: `workflow_next` gives the current activity at its current intensity and the list of its
 * sub-steps, and the agent reads a sub-step or a reference with `block_read` when it gets there.
 */

export type EngineOptions = Partial<EngineContext>

function contextOf(options: EngineOptions): EngineContext {
  return {
    registry: options.registry ?? builtinRegistry,
    projects: options.projects ?? unwiredProjects,
  }
}

function text(value: unknown, name: string): string {
  if (typeof value !== 'string' || value === '')
    refuse('invalid_argument', `"${name}" 应该是非空字符串`)
  return value
}

function optionalText(value: unknown, name: string): string | undefined {
  return value === undefined ? undefined : text(value, name)
}

function optionalBoolean(value: unknown, name: string): boolean | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'boolean') refuse('invalid_argument', `"${name}" 应该是 true 或 false`)
  return value
}

const SOURCE_LABEL: Readonly<Record<string, string>> = {
  temporary: '临时切换',
  adjustment: '项目里的调整',
  step: '工作流里的设置',
  fragment: '片段里的设置',
  'project-default': '项目的默认强度',
  'block-default': '积木的默认强度',
}

function instructionsText(instructions: Instructions): string {
  const lines = [instructions.text]
  if (instructions.subSteps.length > 0) {
    lines.push(
      '',
      '子步骤（做到时用 block_read 读详细说明，block 填子步骤 id）：',
      ...instructions.subSteps.map(
        (step) =>
          `- ${step.id}${step.optional ? '（可选）' : ''}：${step.title}（${step.block}）——${step.summary}`,
      ),
    )
  }
  if (instructions.references.length > 0) {
    lines.push(
      '',
      '附件（需要时用 block_read 读，reference 填路径）：',
      ...instructions.references.map((link) => `- ${link.path}：${link.text}`),
    )
  }
  return lines.join('\n')
}

function positionLine(state: RunState): string {
  const total = state.plan.steps.filter((step) => step.skipped === undefined).length
  const done = total - state.position.remaining.length
  const mode = state.plan.orchestration === 'agent' ? '由 agent 编排' : '固定编排'
  return `工作流 ${state.plan.workflow}（${mode}${state.run.lean ? '，精简模式' : ''}），已完成 ${done}/${total} 步`
}

function nextAnswer(
  state: RunState,
  adjustments: readonly Adjustment[],
  started: boolean,
  instructions: Instructions | undefined,
  notes: string | undefined,
): ToolAnswer {
  const view = runView(state, adjustments)
  const current = state.current
  if (current === undefined || instructions === undefined) {
    return {
      text: `${positionLine(state)}。这次运行已经全部完成；要重新开始，调用 workflow_next 并传 restart: true。`,
      structured: { run: view, finished: true },
    }
  }
  const params = Object.entries(current.params)
  const lines = [
    `${started ? '开始了新的一次运行。' : ''}${positionLine(state)}。`,
    `当前步骤 ${current.path}：${instructions.title}（${current.block}），强度 ${current.intensity}（${SOURCE_LABEL[current.intensitySource]}）${
      params.length === 0
        ? ''
        : `，参数 ${params.map(([name, value]) => `${name} = ${String(value)}`).join('、')}`
    }。`,
    '',
    instructionsText(instructions),
  ]
  if (state.plan.orchestration === 'agent') {
    lines.push(
      '',
      '候选（按维度缺口排序；要换一个，调用 workflow_next 并传 step）：',
      ...state.position.candidates.map(
        (candidate, index) =>
          `${index + 1}. ${candidate.step.path}：${state.run.blocks[candidate.step.block]?.title ?? candidate.step.block}——${candidate.reason}`,
      ),
    )
    if (notes !== undefined) lines.push('', '编排说明：', notes)
  }
  if (state.plan.ignored.length > 0) {
    lines.push('', '没有生效的调整：', ...state.plan.ignored.map((line) => `- ${line}`))
  }
  lines.push(
    '',
    `这一步做完后调用 workflow_report，step 填 ${current.path}${current.optional ? '；这一步可选，不做就传 skipped: true' : ''}。`,
  )
  return {
    text: lines.join('\n'),
    structured: {
      run: view,
      finished: false,
      current: {
        path: current.path,
        block: current.block,
        title: instructions.title,
        intensity: current.intensity,
        intensitySource: current.intensitySource,
        params: current.params,
        optional: current.optional,
        instructions: instructions.text,
        subSteps: instructions.subSteps,
        references: instructions.references,
      },
      candidates: state.position.candidates.map((candidate) => candidateView(state, candidate)),
      ...(notes === undefined ? {} : { orchestrationNotes: notes }),
    },
  }
}

const PROJECT = { type: 'string', description: '学习项目的 id' } as const
const INTENSITY = { type: 'string', enum: ['tell', 'hint', 'ask'] } as const

/** The engine's tools, over the given blocks and projects. */
export function workflowTools(options: EngineOptions = {}): readonly SceneTool[] {
  const context = contextOf(options)
  return [
    defineTool(FEATURE, {
      name: 'workflow_next',
      title: '下一步学什么',
      description:
        "The current activity of a project's workflow and what to do in it, at the current intensity only, with its sub-steps and references to read on demand. Starts a run when the project has none. In agent orchestration also lists the candidates ranked by the gaps in the project's state, with reasons; pass step to pick another. Pass intensity to switch the current step's intensity for this step only.",
      inputSchema: {
        type: 'object',
        properties: {
          project: PROJECT,
          step: { type: 'string', description: '由 agent 编排时，要做的候选的步骤路径' },
          intensity: { ...INTENSITY, description: '只对当前这一步临时切换强度' },
          lean: { type: 'boolean', description: '开始新运行时：精简模式，跳过高成本的步骤' },
          restart: { type: 'boolean', description: '放下当前的运行，重新开始一次' },
        },
        required: ['project'],
        additionalProperties: false,
      },
      readOnly: false,
      handle: async (args, ports) => {
        const project = text(args['project'], 'project')
        const step = optionalText(args['step'], 'step')
        const lean = optionalBoolean(args['lean'], 'lean')
        const restart = optionalBoolean(args['restart'], 'restart')
        const answer = await nextStep(ports, context, project, {
          ...(step === undefined ? {} : { step }),
          ...(args['intensity'] === undefined
            ? {}
            : { intensity: parseIntensity(args['intensity']) }),
          ...(lean === undefined ? {} : { lean }),
          ...(restart === undefined ? {} : { restart }),
        })
        return nextAnswer(
          answer.state,
          adjustmentsOf(ports, project),
          answer.started,
          answer.instructions,
          answer.orchestrationNotes,
        )
      },
    }),
    defineTool(FEATURE, {
      name: 'workflow_report',
      title: '报告这一步的结果',
      description:
        'Records the result of the current step, checked against the result fields its activity declares, and moves the run on. A result holds counts and choices for statistics, never conversation text. Pass skipped: true instead to leave out an optional step.',
      inputSchema: {
        type: 'object',
        properties: {
          project: PROJECT,
          step: { type: 'string', description: '当前步骤的步骤路径，workflow_next 给出的' },
          result: {
            type: 'object',
            description: '按活动在 ## 结果 里说明的字段填写',
            additionalProperties: { type: ['string', 'integer', 'boolean'] },
          },
          skipped: { type: 'boolean', description: '这一步可选，没有做' },
        },
        required: ['project', 'step'],
        additionalProperties: false,
      },
      readOnly: false,
      handle: async (args, ports) => {
        const project = text(args['project'], 'project')
        const skipped = optionalBoolean(args['skipped'], 'skipped')
        const { state } = await reportStep(ports, project, {
          step: text(args['step'], 'step'),
          ...(args['result'] === undefined ? {} : { result: args['result'] }),
          ...(skipped === undefined ? {} : { skipped }),
        })
        const next = state.current
        return {
          text: `已记录 ${String(args['step'])}。${positionLine(state)}。${
            next === undefined
              ? '这次运行已经全部完成。'
              : `调用 workflow_next 看下一步${state.plan.orchestration === 'fixed' ? `（${next.path}）` : ''}。`
          }`,
          structured: {
            run: runView(state, adjustmentsOf(ports, project)),
            finished: next === undefined,
          },
        }
      },
    }),
    defineTool(FEATURE, {
      name: 'block_read',
      title: '读积木的详细说明',
      description:
        "Reads, for the current activity of a project's run, one sub-step's instructions at the activity's intensity (block: the sub-step id), or a reference's full text (reference: its path; with block, the sub-step's reference). Never fetches a URL.",
      inputSchema: {
        type: 'object',
        properties: {
          project: PROJECT,
          block: { type: 'string', description: '当前活动的子步骤 id' },
          reference: { type: 'string', description: '附件路径，例如 references/notes.md' },
        },
        required: ['project'],
        additionalProperties: false,
      },
      readOnly: true,
      handle: (args, ports) => {
        const project = text(args['project'], 'project')
        const subStep = optionalText(args['block'], 'block')
        const reference = optionalText(args['reference'], 'reference')
        const read = readBlock(ports, project, {
          ...(subStep === undefined ? {} : { subStep }),
          ...(reference === undefined ? {} : { reference }),
        })
        if (read.reference !== undefined) {
          return {
            text: read.reference,
            structured: { step: read.step.path, reference, text: read.reference },
          }
        }
        const instructions = read.instructions!
        return {
          text: `子步骤 ${subStep}：${instructions.title}（${instructions.block}），强度 ${instructions.intensity}，跟随活动 ${read.step.path}。\n\n${instructionsText(instructions)}`,
          structured: {
            step: read.step.path,
            subStep,
            block: instructions.block,
            title: instructions.title,
            intensity: instructions.intensity,
            params: instructions.params,
            instructions: instructions.text,
            references: instructions.references,
          },
        }
      },
    }),
  ]
}

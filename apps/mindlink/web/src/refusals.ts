/**
 * What a refusal says to a person, by its code.
 *
 * Episteme and MindLink refuse with a stable machine-readable `code` and an English `error` meant for developers.
 * A page shows the text below instead.
 *
 * Every code MindLink itself refuses with has its own text: `tests/web/refusals.test.ts` collects them from
 * MindLink's source and fails on any without one. Episteme's codes are not collected: the ones a learner commonly
 * meets are written out here, and any other gets the general text of `refusalText`, which still says what failed.
 */

export const REFUSAL_TEXT: Readonly<Record<string, string>> = Object.freeze({
  // Signing in and access.
  unauthenticated: '登录已过期或尚未登录，请重新登录。',
  human_required: '这一步只能由你本人操作，agent 的令牌不能代替。',
  outside_boundary: '请求来自不被允许的地址，服务拒绝了它。',
  not_available_in_local_mode: '本地模式下没有这个功能。',

  // Requests the service could not read.
  invalid_request: '请求的格式不对，没有做任何改动。',
  no_route: '找不到这个接口。',
  internal: '服务出了故障，请稍后再试。',

  // The vocabulary the graph accepts.
  invalid_dimension_value: '这个等级不在可选范围内。',
  missing_dimension: '至少要选一个理解维度。',
  not_recordable: '这个维度不能手动记录。',

  // Nodes, links and the graph.
  missing_property: '还有必填的内容没有填写。',
  missing_label: '请填写名称。',
  too_long: '内容太长了，请精简一些。',
  unknown_node: '找不到这个节点，可能已被删除或你看不到它。',
  unknown_edge: '找不到这条关系。',
  duplicate_edge: '这条关系已经存在了。',
  self_link: '一个节点不能和自己建立关系。',
  guard_rejected: '这项改动不符合规则，没有生效。',

  // Suggestions and the review queue.
  unknown_suggestion: '找不到这条提议，它可能已经被处理了。',
  already_known: '你已经记录过这项理解了。',
  already_pending: '同样的提议已经在审阅队列里了。',
  too_many_pending: '待审阅的提议太多了，请先处理一些再继续。',
  depends_on_pending: '它依赖的提议还没有处理，请先处理那一条。',
  depends_on_refused: '它依赖的提议已被拒绝，所以不能接受。',
  missing_rationale: '请说明理由。',

  // Delegated confirmation.
  unknown_delegation: '找不到这项托管。',
  not_delegated: '这条确认不是托管确认的，不能这样撤回。',

  // Distilling material.
  empty_material: '没有可以整理的内容。',
  material_too_long: '材料太长了，请分成几段再整理。',

  // Threads.
  unknown_thread: '找不到这个对话线程。',

  // Sharing.
  sharing_disabled: '这个服务没有开启共享。',
  agent_cannot_publish: '只有你本人可以发布，agent 不能代替你公开理解。',
  not_publishable: '这项内容不能发布。',
  unknown_publication: '找不到这条发布，它可能已被撤回。',
  not_live: '这条发布已经撤回或被更新了。',
  not_the_author: '只有发布者本人可以这样做。',
  own_publication: '这是你自己的发布，不需要复用。',
  outside_closure: '发布的内容依赖了没有一起发布的节点。',

  // Scene records.
  unknown_record: '找不到这条记录。',
  value_too_large: '要保存的内容太大了。',

  // MindLink's platform access layer.
  invalid_record_id: '记录的编号不正确。',
  not_available: '这个功能暂时还不能用。',

  // Learning projects.
  invalid_project: '项目设置填写得不对，请检查后再保存。',
  project_not_found: '找不到这个学习项目。',
  project_archived: '这个学习项目已经归档，不能再修改。',

  // Workflows and runs.
  block_not_found: '找不到这块积木，或者它没有通过检查。',
  invalid_block_ref: '积木的写法不对，应该像 guide、course:名字 或 user:名字。',
  not_a_workflow: '项目用的不是一个工作流，请在项目设置里换一个。',
  no_run: '这个项目还没有开始学习。',
  run_finished: '这次学习的每一步都已经做完了。',
  no_current_step: '还没有选定现在要做的这一步。',
  not_current_step: '这不是现在正在做的这一步。',
  fixed_order: '这个工作流按固定顺序进行，不能自己挑步骤。',
  unknown_step: '这一步不在剩下要做的步骤里。',
  not_optional: '这一步不是可选的，不能跳过。',
  step_done: '这一步已经做完了，不能再调整。',
  intensity_not_supported: '这一步不支持这种引导方式。',
  invalid_intensity: '引导方式只能是直接讲、给提示或只提问。',
  invalid_adjustment: '这个调整放不进当前的安排，请检查后再试。',
  unknown_adjustment: '找不到这条调整。',
  invalid_params: '参数填写得不对。',
  invalid_result: '这一步的结果填写得不对。',
  invalid_argument: '请求里的内容填写得不对。',
  invalid_read: '要读的内容没有写清楚。',
  unknown_sub_step: '这一步里没有这个小步骤。',
  unknown_reference: '找不到这份资料。',

  // Failures the front end itself names, when no answer came back to read.
  network: '连不上服务，请检查服务是否还在运行。',
  bad_response: '服务返回的内容无法识别。',
})

/**
 * What to tell a person about `code`. A code without its own text, such as one of Episteme's that a learner rarely
 * meets, says in Chinese that the service did not do it, with the code so it can be reported.
 */
export function refusalText(code: string): string {
  return Object.hasOwn(REFUSAL_TEXT, code)
    ? (REFUSAL_TEXT[code] ?? '')
    : `服务没有完成这个操作（代码：${code}）。`
}

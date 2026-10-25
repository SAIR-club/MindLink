/**
 * What a refusal says to a person, by its code.
 *
 * Episteme and MindLink refuse with a stable machine-readable `code` and an English `error` meant for developers.
 * A page shows the text below instead. `tests/web/refusals.test.ts` collects every code the Episteme checkout and
 * MindLink's own source can refuse with and fails on any that has no text here, so a new refusal comes with its
 * words.
 */

/** @type {Readonly<Record<string, string>>} */
export const REFUSAL_TEXT = Object.freeze({
  // Signing in and access.
  unauthenticated: '登录已过期或尚未登录，请重新登录。',
  human_required: '这一步只能由你本人操作，agent 的令牌不能代替。',
  outside_boundary: '请求来自不被允许的地址，服务拒绝了它。',
  unknown_token: '找不到这个令牌。',
  current_credential: '不能撤销你现在正在使用的令牌。',
  agent_tokens_only: '这里只能管理 agent 的令牌。',
  not_available_in_local_mode: '本地模式下没有这个功能。',
  elicitation_not_trusted: '这个服务不把表单里的回答当作你本人的确认，它仍然留在审阅队列里。',

  // Requests the service could not read.
  invalid_request: '请求的格式不对，没有做任何改动。',
  no_route: '找不到这个接口。',
  internal: '服务出了故障，请稍后再试。',
  malformed_response: '检索服务返回的内容无法识别。',
  provider_error: '检索服务暂时不可用。',

  // The vocabulary the graph accepts.
  unregistered_node_type: '这种节点类型没有登记，不能使用。',
  unregistered_edge_type: '这种关系类型没有登记，不能使用。',
  unregistered_dimension: '这个理解维度没有登记，不能记录。',
  unregistered_tag_namespace: '这类标签没有登记，不能使用。',
  duplicate_registration: '这个名字已经登记过了。',
  invalid_definition: '登记的定义不完整或不正确。',
  invalid_dimension_value: '这个等级不在可选范围内。',
  missing_dimension: '至少要选一个理解维度。',
  not_recordable: '这个维度不能手动记录。',

  // Nodes, links and the graph.
  missing_property: '还有必填的内容没有填写。',
  missing_label: '请填写名称。',
  too_long: '内容太长了，请精简一些。',
  unknown_node: '找不到这个节点，可能已被删除或你看不到它。',
  unknown_edge: '找不到这条关系。',
  duplicate_id: '这个编号已经被使用了。',
  duplicate_edge: '这条关系已经存在了。',
  self_link: '一个节点不能和自己建立关系。',
  invalid_edge_endpoint: '这条关系两端的节点类型不匹配。',
  guard_rejected: '这项改动不符合规则，没有生效。',

  // Suggestions and the review queue.
  unknown_suggestion: '找不到这条提议，它可能已经被处理了。',
  already_known: '你已经记录过这项理解了。',
  already_pending: '同样的提议已经在审阅队列里了。',
  too_many_pending: '待审阅的提议太多了，请先处理一些再继续。',
  kind_changed: '修改提议时不能改变它的种类。',
  depends_on_pending: '它依赖的提议还没有处理，请先处理那一条。',
  depends_on_refused: '它依赖的提议已被拒绝，所以不能接受。',
  unresolved_candidate: '有引用的内容找不到对应的条目。',
  missing_rationale: '请说明理由。',
  not_an_agent: '只能托管 agent 提出的提议。',

  // Delegated confirmation.
  unknown_delegation: '找不到这项托管。',
  not_delegated: '这条确认不是托管确认的，不能这样撤回。',

  // Distilling material.
  empty_material: '没有可以整理的内容。',
  material_too_long: '材料太长了，请分成几段再整理。',
  too_many_candidates: '一次提出的条目太多了，请分几次提交。',
  over_limit: '从这份材料里提出的条目超过了上限。',
  duplicate_candidate: '有重复的条目。',
  duplicate_ref: '有两个条目用了同一个名字。',
  invalid_candidate: '有一个条目的内容不完整或不正确。',
  invalid_proposal: '提议的内容不完整或不正确。',
  out_of_order: '要先提出节点，再提出连接它们的关系。',
  unknown_endpoint: '关系指向了一个不存在的节点。',
  not_allowed: '这门课不整理这种内容。',
  basis_mismatch: '材料里没有说明谁是学习者，所以不能当作学习者自己说的。',
  missing_basis: '每一条都要说明是学习者说的还是推断出来的。',
  submission_conflict: '这次提交和之前的一次重复但内容不同，没有做任何改动。',

  // Quotes from a conversation.
  missing_quote: '要引用学习者的原话。',
  quote_not_found: '引用的原话在对话里找不到。',
  quote_too_short: '引用的原话太短了，不足以作为依据。',
  quote_too_long: '引用的原话太长了，请只引用关键的一句。',
  quote_ambiguous: '引用的原话出现了不止一次，请说明是哪一处。',
  quote_spans_episodes: '引用的原话跨越了两段对话。',

  // Threads.
  unknown_thread: '找不到这个对话线程。',
  unknown_turn: '找不到这一轮对话。',

  // Sharing.
  sharing_disabled: '这个服务没有开启共享。',
  agent_cannot_publish: '只有你本人可以发布，agent 不能代替你公开理解。',
  not_publishable: '这项内容不能发布。',
  unknown_publication: '找不到这条发布，它可能已被撤回。',
  not_live: '这条发布已经撤回或被更新了。',
  not_the_author: '只有发布者本人可以这样做。',
  own_publication: '这是你自己的发布，不需要复用。',
  not_a_member: '这一项不在这条发布里。',
  invalid_supersedes: '要更新的发布不存在或不是你的。',
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
 * What to tell a person about `code`. A code with no text, which the test above keeps from shipping, still says
 * that nothing was done, with the code so it can be reported.
 * @param {string} code
 * @returns {string}
 */
export function refusalText(code) {
  return Object.hasOwn(REFUSAL_TEXT, code)
    ? (REFUSAL_TEXT[code] ?? '')
    : `操作没有完成（${code}）。`
}

// The release smoke test: drives an installed MindLink (its own service on 127.0.0.1:4324) through the whole
// learning loop in Edge, in two halves around a restart of the program. See docs/release/rc-verification.md.
//
//   node tests/rc-smoke.mjs before <state.json> <screenshot-dir>   create, import, ask, distill, review, save
//   (quit MindLink from the tray, or end its process, and open it again)
//   node tests/rc-smoke.mjs after <state.json> <screenshot-dir>    find it again, reuse it, follow it back
//
// Run it on a fresh install: it expects no space of its name yet.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright-core'

const [, , phase, stateFile, shots] = process.argv
const BASE = 'http://127.0.0.1:4324/'
const SPACE = 'RC 验收：Transformer'
const NOTES = `# 位置编码

自注意力本身不知道词的先后顺序，所以需要位置编码把序列的顺序告诉模型。

# 多头注意力

多头注意力让模型同时关注不同位置的不同关系。
`

function pdfOf(text) {
  const stream = `BT /F1 12 Tf 50 700 Td (${text}) Tj ET`
  const objects = [
    '',
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let body = '%PDF-1.4\n'
  const offsets = []
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = body.length
    body += `${id} 0 obj\n${objects[id]}\nendobj\n`
  }
  const xref = body.length
  body += `xref\n0 ${objects.length}\n0000000000 65535 f \n`
  for (let id = 1; id < objects.length; id += 1) {
    body += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`
  }
  body += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(body, 'latin1')
}

const log = (step, detail = '') => console.log(`✓ ${step}${detail === '' ? '' : `：${detail}`}`)
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
// A real model can take a while to answer and to distill.
page.setDefaultTimeout(120_000)

const ask = async (question) => {
  await page.getByLabel('你的问题').fill(question)
  await page.getByRole('button', { name: '提问' }).click()
}

try {
  await page.goto(BASE)
  if (phase === 'before') {
    await page.getByLabel('新空间的名字').fill(SPACE)
    await page.getByRole('button', { name: '新建', exact: true }).click()
    await page.getByRole('heading', { name: SPACE }).waitFor()
    log('创建空间', SPACE)

    await page.getByRole('button', { name: /^材料（/ }).click()
    await page.locator('.upload input').setInputFiles({
      name: '课程笔记.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from(NOTES),
    })
    await page
      .locator('.material-list')
      .getByRole('button', { name: '课程笔记.md', exact: true })
      .waitFor()
    await page.locator('.upload input').setInputFiles({
      name: 'lecture.pdf',
      mimeType: 'application/pdf',
      buffer: pdfOf('Positional encoding tells the model the order of the tokens.'),
    })
    await page
      .locator('.material-list')
      .getByRole('button', { name: 'lecture.pdf', exact: true })
      .click()
    await page
      .locator('.side .source-text', { hasText: 'Positional encoding tells the model' })
      .waitFor()
    log('导入材料', 'Markdown 与 PDF 各一份，PDF 文字已解析')

    await page.getByRole('button', { name: '学习', exact: true }).click()
    await ask('为什么需要位置编码？')
    const cite = page.getByRole('button', { name: /查看引用 1：课程笔记\.md/ })
    await cite.waitFor()
    await cite.click()
    const marked = await page.locator('mark').textContent()
    if (!marked.includes('位置编码')) throw new Error(`引用高亮的不是位置编码那段：${marked}`)
    log('提问并得到带引用的回答', `高亮：${marked.trim().slice(0, 30)}…`)
    await page.screenshot({ path: join(shots, 'rc-1-answer.png') })

    await page.getByRole('button', { name: '提炼成待确认的理解' }).first().click()
    await page.getByRole('button', { name: '待确认（1）' }).waitFor()
    log('提炼出 1 条候选理解')
    await page.getByRole('button', { name: '待确认（1）' }).click()
    await page.getByRole('button', { name: '改一改' }).click()
    const mine = '位置编码把词的先后顺序告诉模型，因为自注意力本身不区分顺序'
    await page.locator('.review .pending input, .review .pending textarea').first().fill(mine)
    await page.getByRole('button', { name: '保存为我的理解' }).click()
    await page.getByRole('button', { name: '我的理解（1）' }).waitFor()
    log('人工审阅：用自己的话改写后保存', mine)

    const state = await (await fetch(`${BASE}api/v1/state`)).json()
    const node = state.nodes.find((candidate) => candidate.label === mine)
    if (node === undefined) throw new Error('保存的理解不在内核图谱里')
    const url = page.url()
    writeFileSync(stateFile, JSON.stringify({ label: mine, nodeId: node.nodeId, url }, null, 2))
    log('保存到内核', `节点 ${node.nodeId}`)
  } else {
    const saved = JSON.parse(readFileSync(stateFile, 'utf8'))
    await page.getByRole('button', { name: SPACE }).click()
    await page.getByRole('button', { name: '我的理解（1）' }).click()
    await page.locator('.understood li', { hasText: saved.label }).waitFor()
    await page.getByRole('button', { name: '材料（2）' }).waitFor()
    log('重启后空间、2 份材料和理解都在')

    const state = await (await fetch(`${BASE}api/v1/state`)).json()
    if (!state.nodes.some((node) => node.nodeId === saved.nodeId && node.label === saved.label)) {
      throw new Error('重启后内核里找不到原来那个节点')
    }
    log('重启后内核里仍是同一个节点', saved.nodeId)

    await page.getByRole('button', { name: '开始新对话' }).click()
    await ask('位置编码有什么作用？')
    const recalled = page.locator('.recalled')
    await recalled.getByRole('button', { name: saved.label }).waitFor()
    log('新对话里找回了这条理解', '标为“你之前确认过（不是材料）”')
    await page.screenshot({ path: join(shots, 'rc-2-recalled.png') })
    const newThread = /\/threads\/([^/?]+)/.exec(page.url())?.[1]

    await recalled.getByRole('button', { name: saved.label }).click()
    await page.waitForURL(new RegExp(`/understanding/${saved.nodeId}`))
    log('点开后是内核里的同一个节点', page.url())
    await page.getByRole('button', { name: '回到当时的对话' }).click()
    await page.waitForURL((url) => /\/threads\//.test(url.href) && !url.href.includes(newThread))
    await page
      .getByRole('button', { name: /查看引用 1：课程笔记\.md/ })
      .first()
      .waitFor()
    log('从理解回到最初的对话，引用仍然有效', page.url())
  }
  if (errors.length > 0) throw new Error(`页面报错：${errors.join('; ')}`)
} catch (error) {
  await page.screenshot({ path: join(shots, `rc-failed-${phase}.png`) })
  console.error(`✗ ${error.message}`)
  process.exitCode = 1
} finally {
  await browser.close()
}

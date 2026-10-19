# Contributing to MindLink

Thanks for helping build MindLink (formerly Learner) — the reference cognitive learning application and interface built on top of Episteme.

[English](#english) · [简体中文](#简体中文)

---

## English

### Ways to contribute

- **Interactive learning UX** — improve the terminal CLI, TUI, or web learning workspace.
- **Topic files and curricula** — contribute structured topic materials (`--topic`) and reference concepts.
- **Domain packs & distillation** — enhance domain policies, host reading parsers, and inquiry scaffolds.
- **Bug reports** — session locking issues, UI glitches, or distillation discrepancies.

### Development setup

Requirements:
- Node >= 20.11 (tested on Node 20 and Node 22/24)
- pnpm >= 11

```bash
git clone -c core.autocrlf=false https://github.com/SAIR-club/learner.git mindlink
cd mindlink
node scripts/setup-episteme.mjs
pnpm install
pnpm build
pnpm test
```

### Local checks (same as CI)

Before opening a pull request, run:

```bash
pnpm check
pnpm format:check
```

Or individual checks:
- `pnpm typecheck` — TypeScript build across all workspace packages
- `pnpm lint` — ESLint code quality checks
- `pnpm format:check` — Biome formatting inspection
- `pnpm test` — Vitest test suites

### Pull requests & git workflow

1. One branch per task (`<type>/<short-topic>`).
2. Follow Conventional Commits: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`, `test:`.
3. PR title becomes the squash commit subject on merge.

---

## 简体中文

### 参与贡献方式

- **交互式学习界面**：改进 CLI 命令行、交互式 TUI 或学习工作区的前端展示。
- **主题文件与教材**：提供高质量的主题包种子文件（`--topic`）、中英文对照的概念网络。
- **领域词汇与蒸馏策略**：完善学习场景的蒸馏策略（`DistillationPolicy`）与认知脚手架。
- **缺陷反馈**：并发锁管理、状态展示偏差或多轮对话异常。

### 开发环境搭建

环境要求：
- Node >= 20.11
- pnpm >= 11

```bash
git clone -c core.autocrlf=false https://github.com/SAIR-club/learner.git mindlink
cd mindlink
node scripts/setup-episteme.mjs
pnpm install
pnpm build
pnpm test
```

### 本地检验命令

提交 PR 前确保全绿：

```bash
pnpm check
pnpm format:check
```

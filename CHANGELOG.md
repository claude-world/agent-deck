# Changelog

All notable changes to this project are documented here. This project follows [Semantic Versioning](https://semver.org/).

## [1.1.0] - 2026-10-21

### Security

- The server now listens on `127.0.0.1` only, as `SECURITY.md` always stated. It previously bound to all interfaces, so anyone on the local network could reach the unauthenticated API.
- Requests whose `Host` or `Origin` is not a loopback address now get `403`, and WebSocket upgrades are checked the same way. Before, CORS allowed every origin and the WebSocket accepted any page, so a website open in your browser could spawn agents or commit code.
- All 119 open Dependabot alerts are resolved by the dependency upgrades (3 critical, 62 high, 46 medium, 8 low). `pnpm audit` reports no known vulnerabilities.

### Changed

- **Models**: model pickers now offer Claude Haiku 5.5, Sonnet 5.5, Opus 5.5 and the new Fable 5.1 (`fable`). Cost estimates use current per-token pricing, context bars use the 1M-token window, and the LiteLLM adapter maps aliases to `claude-haiku-5-5`, `claude-sonnet-5-5`, `claude-opus-5-5` and `claude-fable-5-1` (it sent `claude-sonnet-4-6-20250514` and `claude-opus-4-6-20250514`, which never existed).
- **Requires Node.js 22.12 or later** (Node.js 18 and 20 are end-of-life; better-sqlite3 13 needs Node.js 22).
- Electron 41 → 44, Vite 5 → 8, React 18 → 19, Tailwind CSS 3 → 4, Express 4 → 5, better-sqlite3 12 → 13 (N-API prebuilt binaries for Node.js and Electron), TypeScript 5 → 7, @dagrejs/dagre 2 → 3, uuid 10 → 14, dotenv 16 → 18, and current versions of every other dependency.
- The client WebSocket hook now uses the browser `WebSocket` API (`react-use-websocket` was removed). It reconnects every 3 s as before and now handles every message, even when several arrive between renders.
- The startup banner shows the real package version and bound port.
- The project uses pnpm (`packageManager: pnpm@11.22.0`). The unused `@electron/rebuild` devDependency was removed (electron-builder ships its own).

### Fixed

- `npx agent-deck` in the README pointed at a package that does not exist; it is now `npx @claude-world/agent-deck`.
- A busy port no longer stacks extra `error` listeners on each retry.
- The desktop app no longer freezes on first launch. Started from Finder or the Dock, its working directory is `/`, and the initial project scan walked the whole disk (and could stop on macOS privacy prompts). The scanner now refuses the filesystem root.

### Added

- CI on Node.js 22, 24 and 26: typecheck, tests, web/CLI/Electron builds, CLI smoke test, package dry run and a production dependency audit.
- Test suite (`pnpm test`) covering local-only access, model pricing, the Claude Code stream parser, the project scanner and a server integration run.
- Dependabot configuration for npm and GitHub Actions (monthly, minor and patch updates grouped).

## [1.0.0] - 2026-03-15

- Initial release: AI task decomposition, DAG execution, multi-project workspaces, real-time streaming, finalize (commit/push), history, team configs, session recovery, CLI and Electron app.

[1.1.0]: https://github.com/claude-world/agent-deck/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/claude-world/agent-deck/releases/tag/v1.0.0

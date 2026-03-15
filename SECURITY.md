# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | Yes       |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do NOT** open a public GitHub issue
2. Email: security@claude-world.com or use [GitHub Security Advisories](https://github.com/claude-world/agent-deck/security/advisories/new)

## Security Design

Agent Deck is designed as a **localhost-only** developer tool:

- The server binds to `127.0.0.1` only — never expose it on a public network
- No authentication is required (localhost trust model)
- All git operations use `execFileSync` (no shell injection)
- No secrets are stored — delegates auth to your existing Claude CLI session
- SQLite database contains only local workspace metadata

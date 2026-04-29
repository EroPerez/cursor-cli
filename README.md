# cursor-cli

A lightweight coding agent CLI powered by the [Cursor SDK](https://github.com/cursor/cursor), inspired by [opencode](https://github.com/sst/opencode) and [claude-code](https://github.com/anthropics/claude-code).

Supports an interactive TUI, one-shot prompts, piped input, and structured JSON output.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

## Installation

### One-line install (Linux / macOS)

```bash
curl -fsSL https://raw.githubusercontent.com/eroperez/cursor-cli/main/install.sh | bash
```

This installs Bun if needed, builds the project, and adds `cursor-cli` to your PATH.

### Docker install

```bash
curl -fsSL https://raw.githubusercontent.com/eroperez/cursor-cli/main/docker-install.sh | bash
# or, after cloning:
bash docker-install.sh
```

Builds the Docker image, creates a persistent volume for config/sessions, and installs a `cursor-cli` wrapper in `~/.local/bin`.

Custom image name or alias:
```bash
bash docker-install.sh --image my-cursor --tag v1 --alias ca
```

### Manual install

```bash
git clone https://github.com/eroperez/cursor-cli.git
cd cursor-cli
bun install
bun run build
```

## Requirements

- [Bun](https://bun.sh) 1.3 or newer
- A Cursor API key (`crsr_...`)

## Setup

### Web login (recommended)

```bash
cursor-cli login
```

Opens `cursor.com/settings` in your browser, prompts you to paste your API key, and saves it to `~/.cursor-cli/config.json`.

### Manual setup

```bash
export CURSOR_API_KEY="crsr_..."
```

Or save it directly to the config file:

```bash
bun run dev /config apiKey crsr_...
```

## Usage

### Quick Start

```bash
# Authenticate first (one-time)
cursor-cli login

# Interactive TUI (current directory)
cursor-cli .

# One-shot prompt (current directory)
cursor-cli "Explain the auth flow"

# TUI in a different workspace
cursor-cli /path/to/project

# One-shot with a specific workspace
cursor-cli /path/to/project "Add tests for the parser"
```

### Development Mode

```bash
# Interactive TUI
bun run dev

# One-shot prompt
bun run dev "Explain the auth flow"

# With a specific workspace
bun run dev --cwd ../my-app "Add tests for the parser"
```

### All Options

```bash
# Pipe a prompt
printf "Summarize recent changes" | cursor-cli .

# Verbose tool output
cursor-cli . --verbose "Refactor UserService"

# JSON output (pipe-friendly)
cursor-cli . --json "List all API endpoints" | jq '.text'

# Override the model
cursor-cli . --model composer-2 "Review this PR"

# Override the theme
cursor-cli . --theme dracula

# Disable git context injection
cursor-cli . --no-git "What does this file do?"

# Resume a saved session
cursor-cli . --resume abc12345
```

## CLI Options

| Flag | Short | Description |
|------|-------|-------------|
| `--cwd <path>` | `-C` | Workspace directory (default: cwd) |
| `--model <id>` | `-m` | Model id (default: `CURSOR_MODEL` env or `composer-2`) |
| `--theme <name>` | | Color theme: `dark` `light` `dracula` `nord` `monokai` |
| `--verbose` | `-v` | Show tool calls and thinking output |
| `--json` | | Emit newline-delimited JSON events |
| `--no-git` | | Disable automatic git context injection |
| `--force` | | Expire a stuck local run before starting |
| `--resume <id>` | | Resume a saved session (interactive mode) |
| `--help` | `-h` | Show help |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `CURSOR_API_KEY` | API key (`crsr_...`). Optional if saved via `cursor-cli login` |
| `CURSOR_MODEL` | Optional. Default model id override |

## Interactive TUI

Launch without a prompt argument to enter the interactive TUI:

```bash
pnpm dev
```

### Slash Commands

| Command | Description |
|---------|-------------|
| `/help` | Show all commands |
| `/local` | Switch to local workspace execution |
| `/cloud` | Switch to Cursor cloud execution |
| `/model` | Open interactive model picker |
| `/models` | List all available Cursor models |
| `/mcp [list]` | List configured MCP servers |
| `/mcp add <name> --command <cmd> [args...]` | Add a stdio MCP server |
| `/mcp add <name> --url <url> [--type http\|sse]` | Add an HTTP/SSE MCP server |
| `/mcp remove <name>` | Remove an MCP server |
| `/theme [name]` | Switch color theme or open picker |
| `/reset` | Start a fresh agent, keep session |
| `/clear` | Clear the transcript |
| `/compact` | Summarize conversation to save context tokens |
| `/history` | Browse and load past sessions |
| `/export [file]` | Export transcript to a markdown file |
| `/web <query>` | Search DuckDuckGo and inject results as context |
| `/context [file]` | Add a file to the prompt context |
| `/verbose` | Toggle verbose tool output |
| `/config [key value]` | View or edit persistent configuration |
| `/exit` / `/quit` | Exit the TUI |

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Enter` | Send prompt |
| `Ctrl+C` | Cancel current run (while busy) or exit |
| `Escape` | Close picker / cancel panel |
| `↑` / `↓` | Scroll transcript / navigate selector |
| `PgUp` / `PgDn` | Scroll transcript by page |
| `Home` / `End` | Jump to top / bottom of transcript |

## Configuration

Settings are persisted to `~/.cursor-cli/config.json`.

```json
{
  "theme": "dark",
  "model": "composer-2",
  "verbose": false,
  "autoGitContext": true,
  "maxHistorySessions": 50,
  "outputFormat": "text"
}
```

Manage config from the CLI:

```bash
# View all settings
bun run dev /config

# Change theme
bun run dev /config theme nord

# Disable git auto-context
bun run dev /config autoGitContext false
```

## Themes

Five built-in color themes:

| Theme | Description |
|-------|-------------|
| `dark` | Default dark theme |
| `light` | Bright theme for light terminals |
| `dracula` | Dracula color palette |
| `nord` | Nord arctic color palette |
| `monokai` | Monokai color palette |

Switch theme interactively with `/theme` or set permanently:

```bash
bun run dev --theme nord
```

## Features

### Git Context Injection

When inside a git repository, the agent automatically receives:
- Current branch name
- Working tree status (`git status --short`)
- Recent commits (`git log --oneline -5`)

Disable with `--no-git` or `/config autoGitContext false`.

### File Context

Add local files to the prompt context:

```bash
# In interactive mode
/context src/server.ts
/context package.json

# View loaded context files
/context
```

### Web Search

Search the web and inject results as context for the next prompt:

```bash
/web latest Next.js App Router patterns
```

Results from DuckDuckGo are automatically included in the following prompt.

### Session History

Sessions are automatically saved after each exchange to `~/.cursor-cli/sessions/`.

```bash
# Browse sessions in TUI
/history

# Export current session
/export session.md

# Resume a session
cursor-cli . --resume <session-id>
```

### JSON Output

Use `--json` for structured newline-delimited JSON, suitable for piping to tools like `jq`:

```bash
cursor-cli . --json "List the main API routes" | jq 'select(.type=="delta") | .text' -r

# Event types: delta, thinking, tool, status, task, result
```

### Compact Mode

Summarize a long conversation to recover context tokens:

```bash
/compact
```

The agent summarizes the exchange and replaces the transcript with a condensed version.

## MCP Servers

cursor-cli supports the [Model Context Protocol](https://modelcontextprotocol.io) — connect any MCP-compatible tool server to extend what the agent can do.

Servers are stored in `~/.cursor-cli/mcp.json` and loaded automatically on session start.

### Add a stdio server (local process)

```bash
# npx-based server
cursor-cli mcp add filesystem --command npx -- -y @modelcontextprotocol/server-filesystem /home/user

# Custom binary
cursor-cli mcp add mytool --command /usr/local/bin/my-mcp-server --arg1 --arg2
```

### Add an HTTP / SSE server (remote)

```bash
cursor-cli mcp add myapi --url http://localhost:3000/mcp
cursor-cli mcp add remote --url https://mcp.example.com/sse --type sse
```

### Manage servers

```bash
cursor-cli mcp list          # list all configured servers
cursor-cli mcp remove myapi  # remove a server
```

Or manage inline from the TUI with `/mcp list`, `/mcp add`, `/mcp remove`.

### mcp.json format

```json
{
  "servers": {
    "filesystem": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home/user"]
    },
    "myapi": {
      "type": "http",
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

## Project Structure

```
src/
├── index.ts          # CLI entry point, argument parsing, plain/TUI modes
├── agent.ts          # CodingAgentSession — wraps @cursor/sdk
├── banner.ts         # ASCII art banner for interactive mode
├── commands.ts       # Slash command registry and parsing
├── login.ts          # Web login flow (browser + API key prompt)
├── mcp.ts            # MCP server config management (~/.cursor-cli/mcp.json)
├── config.ts         # Persistent configuration (~/.cursor-cli/config.json)
├── history.ts        # Session storage, resume, markdown export
├── search.ts         # DuckDuckGo web search integration
├── themes.ts         # Color theme definitions
├── git-context.ts    # Git repository context extraction
└── tui/
    ├── App.tsx       # Interactive terminal UI (React + OpenTUI)
    └── opentui.d.ts  # Type declarations for tui-input component
```

## Scripts

```bash
bun run dev         # Run from source with Bun
bun run build       # Compile TypeScript to dist/
bun run start       # Run compiled output with Bun
bun run typecheck   # Type-check without emitting
```

## Docker

### Build manually

```bash
docker build -t cursor-cli .
```

### Run without installing

```bash
# Interactive TUI with current directory mounted
docker run --rm -it \
  -e CURSOR_API_KEY="crsr_..." \
  -v "$(pwd):/workspace" \
  -v cursor-cli-data:/root/.cursor-cli \
  cursor-cli .

# One-shot prompt
docker run --rm -it \
  -e CURSOR_API_KEY="crsr_..." \
  -v "$(pwd):/workspace" \
  cursor-cli "Explain the auth flow"
```

### Docker Compose example

```yaml
services:
  cursor:
    build: .
    stdin_open: true
    tty: true
    environment:
      - CURSOR_API_KEY=${CURSOR_API_KEY}
      - CURSOR_MODEL=${CURSOR_MODEL:-composer-2}
    volumes:
      - .:/workspace
      - cursor-cli-data:/root/.cursor-cli
    working_dir: /workspace

volumes:
  cursor-cli-data:
```

## References

- [Cursor SDK Cookbook](https://github.com/cursor/cookbook/tree/main/sdk/coding-agent-cli)
- [Cursor SDK Docs](https://docs.cursor.com/sdk)
- [OpenTUI](https://github.com/nicholasgasior/opentui)
- [opencode](https://github.com/sst/opencode)

## License

[MIT](./LICENSE) © 2026 EroPerez

#!/usr/bin/env bun

import path from "node:path"
import { CliRenderEvents, type CliRenderer, createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import React from "react"
import {
  CodingAgentSession,
  formatDuration,
  type AgentEvent,
  type PromptContext,
} from "./agent.js"
import { isThemeName, loadConfig, saveConfig, THEME_NAMES } from "./config.js"
import { printBanner } from "./banner.js"
import { getGitContextString } from "./git-context.js"
import { loadSessionById } from "./history.js"
import { runLogin } from "./login.js"
import { runDemoMode } from "./demo.js"
import {
  addMcpServer,
  formatMcpServerList,
  loadMcpServers,
  parseMcpAddArgs,
  removeMcpServer,
} from "./mcp.js"
import { App } from "./tui/App.js"
import { webSearch, formatSearchResults } from "./search.js"

type CliOptions = {
  cwd: string
  demo: boolean
  force: boolean
  help: boolean
  login: boolean
  mcp: string[]
  model: string
  prompt: string
  verbose: boolean
  json: boolean
  noGit: boolean
  theme: string
  resume: string
}

async function main() {
  const config = loadConfig()
  const options = parseArgs(process.argv.slice(2), config.model)

  if (options.help) {
    printHelp()
    return
  }

  if (options.demo) {
    await runDemoMode(options.cwd, options.prompt)
    return
  }

  if (options.login) {
    await runLogin()
    return
  }

  if (options.mcp.length > 0) {
    runMcpCommand(options.mcp)
    return
  }

  // Apply theme flag to config without persisting
  const effectiveTheme = isThemeName(options.theme) ? options.theme : config.theme

  const apiKey = process.env.CURSOR_API_KEY ?? config.apiKey
  if (!apiKey) {
    console.error("No API key found. Run: cursor-cli login")
    process.exitCode = 1
    return
  }

  const verbose = options.verbose || config.verbose
  const useGit = !options.noGit && config.autoGitContext

  if (options.prompt) {
    const webMatch = options.prompt.match(/^\/web\s+(.+)/)
    if (webMatch) {
      await runWebSearch(webMatch[1]!.trim())
      return
    }
    const gitContext = useGit ? getGitContextString(options.cwd) : undefined
    await runPlainPrompt(apiKey, options, options.prompt, { gitContext }, verbose, options.json)
    return
  }

  if (!process.stdin.isTTY) {
    const prompt = (await readStdin()).trim()
    if (!prompt) {
      throw new Error("No prompt provided on stdin.")
    }
    const webMatch = prompt.match(/^\/web\s+(.+)/)
    if (webMatch) {
      await runWebSearch(webMatch[1]!.trim())
      return
    }
    const gitContext = useGit ? getGitContextString(options.cwd) : undefined
    await runPlainPrompt(apiKey, options, prompt, { gitContext }, verbose, options.json)
    return
  }

  if (!process.stdout.isTTY) {
    throw new Error("Interactive mode requires a TTY stdout.")
  }

  printBanner()

  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
    maxFps: 30,
    screenMode: "alternate-screen",
  })
  const root = createRoot(renderer)

  // Load a session to resume if requested
  const resumeSession = options.resume ? loadSessionById(options.resume) : undefined
  if (options.resume && !resumeSession) {
    process.stderr.write(`Warning: session "${options.resume}" not found, starting fresh.\n`)
  }

  try {
    root.render(
      React.createElement(App, {
        apiKey,
        cwd: options.cwd,
        force: options.force,
        initialModel: { id: options.model },
        initialTheme: effectiveTheme,
        verbose,
        autoGitContext: useGit,
        resumeSession,
        maxHistorySessions: config.maxHistorySessions,
      })
    )
    await waitUntilDestroyed(renderer)
  } finally {
    root.unmount()
    if (!renderer.isDestroyed) {
      renderer.destroy()
    }
  }
}

function parseArgs(argv: string[], configModel: string | undefined): CliOptions {
  const DEFAULT_MODEL = process.env.CURSOR_MODEL ?? configModel ?? "composer-2"
  const promptParts: string[] = []
  let cwd = process.cwd()
  let demo = false
  let force = false
  let help = false
  let login = false
  let mcp: string[] = []
  let model = DEFAULT_MODEL
  let verbose = false
  let json = false
  let noGit = false
  let theme = ""
  let resume = ""

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!
    if (arg === "--") {
      promptParts.push(...argv.slice(index + 1))
      break
    }
    if (arg === "--help" || arg === "-h") { help = true; continue }
    if (arg === "--demo") { demo = true; continue }
    if (arg === "login") { login = true; continue }
    if (arg === "mcp") { mcp = argv.slice(index + 1); break }
    if (arg === "--force") { force = true; continue }
    if (arg === "--verbose" || arg === "-v") { verbose = true; continue }
    if (arg === "--json") { json = true; continue }
    if (arg === "--no-git") { noGit = true; continue }

    if (arg === "--cwd" || arg === "-C") {
      cwd = readOptionValue(argv, index, arg)
      index += 1
      continue
    }
    if (arg.startsWith("--cwd=")) { cwd = arg.slice("--cwd=".length); continue }

    if (arg === "--model" || arg === "-m") {
      model = readOptionValue(argv, index, arg)
      index += 1
      continue
    }
    if (arg.startsWith("--model=")) { model = arg.slice("--model=".length); continue }

    if (arg === "--theme") {
      theme = readOptionValue(argv, index, arg)
      index += 1
      continue
    }
    if (arg.startsWith("--theme=")) { theme = arg.slice("--theme=".length); continue }

    if (arg === "--resume") {
      resume = readOptionValue(argv, index, arg)
      index += 1
      continue
    }
    if (arg.startsWith("--resume=")) { resume = arg.slice("--resume=".length); continue }

    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`)
    }
    promptParts.push(arg, ...argv.slice(index + 1))
    break
  }

  return {
    cwd: path.resolve(cwd),
    demo,
    force,
    help,
    login,
    mcp,
    model,
    prompt: promptParts.join(" ").trim(),
    verbose,
    json,
    noGit,
    theme,
    resume,
  }
}

function readOptionValue(argv: string[], index: number, option: string) {
  const value = argv[index + 1]
  if (!value || value.startsWith("-")) {
    throw new Error(`Expected a value after ${option}.`)
  }
  return value
}

async function runPlainPrompt(
  apiKey: string,
  options: CliOptions,
  prompt: string,
  context: PromptContext,
  verbose: boolean,
  jsonMode: boolean
) {
  const session = new CodingAgentSession({
    apiKey,
    cwd: options.cwd,
    force: options.force,
    model: { id: options.model },
  })

  let assistantEndedWithNewline = true

  const annotate = (message: string) => {
    if (!jsonMode) {
      if (!assistantEndedWithNewline) process.stderr.write("\n")
      process.stderr.write(`${message}\n`)
      assistantEndedWithNewline = true
    }
  }

  const emitJson = (obj: Record<string, unknown>) => {
    process.stdout.write(JSON.stringify(obj) + "\n")
  }

  try {
    await session.ensureAgentReady()
    await session.sendPrompt({
      prompt,
      context,
      onEvent: (event) => {
        if (jsonMode) {
          renderJsonEvent(event, emitJson)
        } else {
          renderPlainEvent(event, annotate, verbose, (text) => {
            process.stdout.write(text)
            assistantEndedWithNewline = text.endsWith("\n")
          })
        }
      },
    })
  } finally {
    await session.dispose()
  }
}

async function runWebSearch(query: string) {
  try {
    const result = await webSearch(query)
    process.stdout.write(formatSearchResults(result) + "\n")
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`Search failed: ${message}\n`)
    process.exitCode = 1
  }
}

function renderJsonEvent(
  event: AgentEvent,
  emit: (obj: Record<string, unknown>) => void
) {
  switch (event.type) {
    case "assistant_delta":
      emit({ type: "delta", text: event.text })
      break
    case "thinking":
      emit({ type: "thinking", text: event.text })
      break
    case "tool":
      emit({ type: "tool", name: event.name, status: event.status, params: event.params })
      break
    case "status":
      emit({ type: "status", status: event.status, message: event.message })
      break
    case "task":
      emit({ type: "task", status: event.status, text: event.text })
      break
    case "result":
      emit({
        type: "result",
        status: event.status,
        duration_ms: event.durationMs,
        usage: event.usage,
      })
      break
  }
}

function renderPlainEvent(
  event: AgentEvent,
  annotate: (message: string) => void,
  verbose: boolean,
  writeAssistant: (text: string) => void
) {
  switch (event.type) {
    case "assistant_delta":
      writeAssistant(event.text)
      break
    case "thinking": {
      const text = compactText(event.text)
      if (text && verbose) annotate(`[thinking] ${text}`)
      break
    }
    case "tool":
      if (verbose || event.status === "error") {
        const params = event.params ? ` ${event.params}` : ""
        annotate(`[tool] ${event.status} ${event.name}${params}`)
      }
      break
    case "status":
      if (event.status !== "FINISHED" && event.status !== "RUNNING") {
        annotate(`[status] ${event.status}${event.message ? ` ${event.message}` : ""}`)
      }
      break
    case "task":
      if (event.text || event.status) {
        annotate(`[task] ${compactText([event.status, event.text].filter(Boolean).join(" "))}`)
      }
      break
    case "result": {
      const details = [
        `status=${event.status}`,
        event.durationMs ? `duration=${formatDuration(event.durationMs)}` : undefined,
        event.usage?.inputTokens ? `input=${event.usage.inputTokens}` : undefined,
        event.usage?.outputTokens ? `output=${event.usage.outputTokens}` : undefined,
      ].filter(Boolean)
      annotate(`[done] ${details.join(" ")}`)
      break
    }
    default:
      break
  }
}

function compactText(text: string) {
  return text.replace(/\s+/g, " ").trim()
}

async function readStdin() {
  let input = ""
  process.stdin.setEncoding("utf8")
  for await (const chunk of process.stdin) {
    input += chunk
  }
  return input
}

function waitUntilDestroyed(renderer: CliRenderer) {
  if (renderer.isDestroyed) return Promise.resolve()
  return new Promise<void>((resolve) => {
    renderer.once(CliRenderEvents.DESTROY, () => resolve())
  })
}

function printHelp() {
  console.log(`Cursor Agent CLI — powered by @cursor/sdk

Usage:
  cursor-cli login                      Authenticate via browser and save API key.
  cursor-cli mcp list                   List configured MCP servers.
  cursor-cli mcp add <name> --command <cmd> [args...]
  cursor-cli mcp add <name> --url <url> [--type http|sse]
  cursor-cli mcp remove <name>          Remove an MCP server.
  cursor-cli [options] "task"           Run a one-shot prompt.
  cursor-cli [options]                  Start the interactive TUI.

Options:
  -C, --cwd <path>       Workspace directory. Defaults to current directory.
  -m, --model <id>       Model id. Defaults to CURSOR_MODEL env or composer-2.
  --theme <name>         Color theme: ${THEME_NAMES.join(", ")}.
  --demo                 Demo mode (simulated agent, no API key needed).
  --verbose, -v          Show tool call details and thinking output.
  --json                 Emit newline-delimited JSON events (pipe-friendly).
  --no-git               Disable automatic git context injection.
  --force                Expire a stuck local run before starting.
  --resume <id>          Resume a saved session by id in interactive mode.
  -h, --help             Show this help.

Environment:
  CURSOR_API_KEY         Required. Your Cursor API key (crsr_...).
  CURSOR_MODEL           Optional. Default model override.

Interactive slash commands:
  /help                  Show command list.
  /local                 Switch to local workspace execution.
  /cloud                 Switch to Cursor cloud execution.
  /model                 Open model picker.
  /models                List all available models.
  /mcp [list]            List configured MCP servers.
  /mcp add <name> ...    Add an MCP server.
  /mcp remove <name>     Remove an MCP server.
  /theme [name]          Switch color theme or open theme picker.
  /reset                 Fresh agent, same session.
  /clear                 Clear the transcript.
  /compact               Summarize conversation to save context.
  /history               Browse and resume past sessions.
  /export [file]         Export transcript to markdown.
  /web <query>           Search DuckDuckGo and inject results as context.
  /context [file]        Add a file to the prompt context (list if no arg).
  /verbose               Toggle verbose tool output.
  /config [key value]    View or edit persistent config.
  /exit, /quit           Exit the TUI.

Examples:
  cursor-agent --demo "How does this work?"  # Demo mode, no API key
  cursor-agent "Explain the auth flow"
  cursor-agent --cwd ../my-app "Add tests for the parser"
  cursor-agent --verbose --json "Refactor UserService"
  cursor-agent
  printf "Review recent changes" | cursor-agent
  `)
}

function runMcpCommand(args: string[]) {
  const sub = args[0]

  if (!sub || sub === "list") {
    console.log(formatMcpServerList(loadMcpServers()))
    return
  }

  if (sub === "add") {
    const result = parseMcpAddArgs(args.slice(1))
    if (typeof result === "string") {
      console.error(result)
      process.exitCode = 1
      return
    }
    addMcpServer(result.name, result.config)
    console.log(`Added MCP server "${result.name}".`)
    return
  }

  if (sub === "remove") {
    const name = args[1]
    if (!name) {
      console.error("Usage: cursor-cli mcp remove <name>")
      process.exitCode = 1
      return
    }
    const removed = removeMcpServer(name)
    console.log(removed ? `Removed MCP server "${name}".` : `No server named "${name}".`)
    return
  }

  console.error(`Unknown mcp subcommand "${sub}". Use: list | add | remove`)
  process.exitCode = 1
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`Error: ${message}`)
  process.exitCode = 1
})

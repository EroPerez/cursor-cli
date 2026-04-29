import {
  InputRenderable,
  TextAttributes,
  type KeyEvent,
  type SelectOption,
} from "@opentui/core"
import {
  extend,
  useKeyboard,
  useRenderer,
  useTerminalDimensions,
} from "@opentui/react"
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { createElement, useEffect, useMemo, useRef, useState } from "react"

import {
  CodingAgentSession,
  type ExecutionMode,
  formatDuration,
  formatModelLabel,
  type AgentEvent,
  type ContextFile,
  type ModelChoice,
  type PromptContext,
} from "../agent.js"
import {
  getCommandArg,
  getSlashCommand,
  getSlashCommandItems,
  slashCommands,
  type SlashCommandName,
} from "../commands.js"
import { CURSOR_BANNER } from "../banner.js"
import { loadConfig, saveConfig, isThemeName, THEME_NAMES } from "../config.js"
import {
  exportToMarkdown,
  formatSessionLabel,
  generateSessionId,
  listSessions,
  saveSession,
  type SessionMessage,
  type SessionRecord,
} from "../history.js"
import {
  addMcpServer,
  formatMcpServerList,
  loadMcpServers,
  parseMcpAddArgs,
  removeMcpServer,
} from "../mcp.js"
import { webSearch, formatSearchResults } from "../search.js"
import { getTheme, type ThemeColors } from "../themes.js"
import type { ModelSelection } from "@cursor/sdk"

extend({ "tui-input": InputRenderable })

type TuiInputProps = {
  focused: boolean
  placeholder: string
  value: string
  onInput: (value: string) => void
  onSubmit: (value: string) => void
}

function TuiInput(props: TuiInputProps) {
  return createElement("tui-input", props)
}

type TuiAppProps = {
  apiKey: string
  cwd: string
  force: boolean
  initialModel: ModelSelection
  initialTheme: string
  verbose: boolean
  autoGitContext: boolean
  resumeSession?: SessionRecord
  maxHistorySessions: number
}

type TranscriptEntry = {
  id: string
  kind: "assistant" | "error" | "meta" | "status" | "tool" | "user"
  label: string
  text: string
}

type SelectItem<TValue> = SelectOption & {
  key?: string
  name: string
  description: string
  value: TValue
}

type ModelSelectItem = SelectItem<ModelSelection>
type CommandSelectItem = SelectItem<SlashCommandName>
type HistorySelectItem = SelectItem<SessionRecord>
type ThemeSelectItem = SelectItem<string>

type ModelPreference = {
  fast: boolean
  thinking: boolean
}

type ViewMode = "command" | "input" | "model" | "history" | "theme"

export function App({
  apiKey,
  cwd,
  force,
  initialModel,
  initialTheme,
  verbose: initialVerbose,
  autoGitContext,
  resumeSession,
  maxHistorySessions,
}: TuiAppProps) {
  const renderer = useRenderer()
  const { width: columns, height: rows } = useTerminalDimensions()
  const sessionRef = useRef<CodingAgentSession | null>(null)
  const nextIdRef = useRef(0)

  const [busy, setBusy] = useState(false)
  const [cancelRequested, setCancelRequested] = useState(false)
  const [currentTheme, setCurrentTheme] = useState(initialTheme)
  const [executionMode, setExecutionModeState] = useState<ExecutionMode>("local")
  const [input, setInput] = useState("")
  const [mode, setMode] = useState<ViewMode>("input")
  const [model, setModel] = useState<ModelSelection>(initialModel)
  const [modelItems, setModelItems] = useState<ModelSelectItem[]>([])
  const [modelSearch, setModelSearch] = useState("")
  const [modelPreference, setModelPreference] = useState<ModelPreference>({
    fast: false,
    thinking: false,
  })
  const [loadingModels, setLoadingModels] = useState(false)
  const [scrollOffset, setScrollOffset] = useState(0)
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
  const [verboseMode, setVerboseMode] = useState(initialVerbose)
  const [contextFiles, setContextFiles] = useState<ContextFile[]>([])
  const [lastSearchContext, setLastSearchContext] = useState<string>()
  const [sessionId] = useState(generateSessionId())
  const [sessionMessages, setSessionMessages] = useState<SessionMessage[]>(
    resumeSession?.messages ?? []
  )
  const [historyItems, setHistoryItems] = useState<SessionRecord[]>([])
  const [themeItems] = useState<ThemeSelectItem[]>(
    THEME_NAMES.map((t) => ({
      key: t,
      name: t,
      description: `${t} theme`,
      value: t,
    }))
  )

  const theme = getTheme(isThemeName(currentTheme) ? currentTheme : "dark")

  if (!sessionRef.current) {
    sessionRef.current = new CodingAgentSession({
      apiKey,
      cwd,
      force,
      model: initialModel,
      mcpServers: loadMcpServers(),
    })
  }

  useEffect(() => {
    const session = sessionRef.current
    if (session) {
      void session.ensureAgentReady()
    }
    return () => {
      void session?.dispose()
    }
  }, [])

  const exitApp = () => {
    renderer.destroy()
  }

  useKeyboard((key) => {
    const character = getInputCharacter(key)

    if (key.ctrl && key.name === "c") {
      if (busy) {
        if (!cancelRequested) void cancelActiveRun()
      } else {
        exitApp()
      }
      return
    }

    if (mode === "theme" && key.name === "escape") {
      setMode("input")
      return
    }

    if (mode === "theme") {
      if (isSearchInput(character)) setModelSearch((v) => `${v}${character}`)
      else if (key.name === "backspace" || key.name === "delete") setModelSearch((v) => v.slice(0, -1))
      return
    }

    if (mode === "history" && key.name === "escape") {
      setMode("input")
      setModelSearch("")
      return
    }

    if (mode === "model" && key.name === "escape") {
      setMode("input")
      return
    }

    if (mode === "model") {
      if (key.name === "backspace" || key.name === "delete") {
        setModelSearch((v) => v.slice(0, -1))
      } else if (character === "T") {
        toggleModelPreference("thinking")
      } else if (character === "F") {
        toggleModelPreference("fast")
      } else if (isSearchInput(character)) {
        setModelSearch((v) => `${v}${character}`)
      }
      return
    }

    if (mode === "command" && key.name === "escape") {
      setInput("")
      setMode("input")
      return
    }

    if (mode === "input") {
      const pageSize = Math.max(1, transcriptViewportRows - 1)
      const maxScrollOffset = Math.max(0, transcriptLines.length - transcriptViewportRows)

      if (key.name === "up") {
        setScrollOffset((offset) => Math.min(maxScrollOffset, offset + 1))
      } else if (key.name === "down") {
        setScrollOffset((offset) => Math.max(0, offset - 1))
      } else if (key.name === "pageup") {
        setScrollOffset((offset) => Math.min(maxScrollOffset, offset + pageSize))
      } else if (key.name === "pagedown") {
        setScrollOffset((offset) => Math.max(0, offset - pageSize))
      } else if (key.name === "home") {
        setScrollOffset(maxScrollOffset)
      } else if (key.name === "end") {
        setScrollOffset(0)
      }
    }
  })

  const commandSelectRows = Math.min(6, Math.max(3, rows - 10))
  const modelSelectRows = Math.min(8, Math.max(3, rows - 10))
  const historySelectRows = Math.min(8, Math.max(3, rows - 10))
  const commandPanelRows = 2 + commandSelectRows
  const modelPanelRows = 3 + modelSelectRows
  const historyPanelRows = 3 + historySelectRows

  const transcriptViewportRows = Math.max(
    4,
    rows -
      (mode === "model"
        ? modelPanelRows + 4
        : mode === "command"
          ? commandPanelRows + 4
          : mode === "history"
            ? historyPanelRows + 4
            : mode === "theme"
              ? historyPanelRows + 4
              : 6)
  )

  const scrollableEntries = useMemo(
    () => [
      { id: "status-cwd", kind: "meta" as const, label: "cwd", text: cwd },
      {
        id: "status-mode",
        kind: "meta" as const,
        label: "mode",
        text: `${executionMode} - ${sessionRef.current?.executionTarget ?? cwd}`,
      },
      {
        id: "status-model",
        kind: "meta" as const,
        label: "model",
        text: formatModelLabel(model),
      },
      {
        id: "status-theme",
        kind: "meta" as const,
        label: "theme",
        text: currentTheme,
      },
      ...(contextFiles.length > 0
        ? [
            {
              id: "status-context",
              kind: "meta" as const,
              label: "ctx",
              text: `${contextFiles.length} file(s)`,
            },
          ]
        : []),
      ...transcript,
    ],
    [cwd, executionMode, model, currentTheme, contextFiles.length, transcript]
  )

  const transcriptLines = useMemo(
    () => buildTranscriptLines(scrollableEntries, columns, theme),
    [columns, scrollableEntries, theme]
  )

  const maxScrollOffset = Math.max(0, transcriptLines.length - transcriptViewportRows)
  const effectiveScrollOffset = Math.min(scrollOffset, maxScrollOffset)
  const visibleTranscriptLines = useMemo(() => {
    const end = transcriptLines.length - effectiveScrollOffset
    const start = Math.max(0, end - transcriptViewportRows)
    return transcriptLines.slice(start, end)
  }, [effectiveScrollOffset, transcriptLines, transcriptViewportRows])

  useEffect(() => {
    setScrollOffset((offset) => Math.min(offset, maxScrollOffset))
  }, [maxScrollOffset])

  const commandItems = useMemo<CommandSelectItem[]>(
    () =>
      getSlashCommandItems(input).map((item) => {
        const [name, ...descriptionParts] = item.label.split(/\s{2,}/)
        return {
          key: item.key,
          name: name ?? item.value,
          description: descriptionParts.join(" "),
          value: item.value,
        }
      }),
    [input]
  )

  const filteredModelItems = useMemo(
    () => filterModelItems(modelItems, modelSearch, modelPreference),
    [modelItems, modelPreference, modelSearch]
  )

  const filteredThemeItems = useMemo(
    () =>
      themeItems.filter((item) =>
        modelSearch ? item.name.toLowerCase().includes(modelSearch.toLowerCase()) : true
      ),
    [themeItems, modelSearch]
  )

  const filteredHistoryItems = useMemo(
    () =>
      historyItems.filter((item) =>
        modelSearch ? formatSessionLabel(item).toLowerCase().includes(modelSearch.toLowerCase()) : true
      ),
    [historyItems, modelSearch]
  )

  const submitInput = (value: string) => {
    const prompt = value.trim()
    setInput("")

    if (!prompt || busy) return

    if (prompt.startsWith("/")) {
      void runCommand(prompt)
      return
    }

    void sendPrompt(prompt)
  }

  const runCommand = async (rawCommand: string) => {
    const command = getSlashCommand(rawCommand)
    const arg = getCommandArg(rawCommand)
    setMode("input")
    setInput("")

    switch (command) {
      case "/help":
        setInput("/")
        setMode("command")
        break

      case "/model":
        await openModelPicker()
        break

      case "/models": {
        const modelsSession = sessionRef.current
        if (!modelsSession) break
        setBusy(true)
        try {
          const choices = await modelsSession.listModels()
          const lines = choices.map((c: ModelChoice) => `  ${c.label}${c.description ? `  — ${c.description}` : ""}`)
          addEntry("meta", "models", `Available models (${choices.length}):\n${lines.join("\n")}`)
        } catch (error) {
          addEntry("error", "models", getErrorMessage(error))
        } finally {
          setBusy(false)
        }
        break
      }

      case "/mcp": {
        const mcpArg = arg.trim()
        const parts = mcpArg.split(/\s+/)
        const sub = parts[0]

        if (!sub || sub === "list") {
          addEntry("meta", "mcp", formatMcpServerList(loadMcpServers()))
          break
        }

        if (sub === "add") {
          const result = parseMcpAddArgs(parts.slice(1))
          if (typeof result === "string") {
            addEntry("error", "mcp", result)
            break
          }
          addMcpServer(result.name, result.config)
          sessionRef.current?.setMcpServers(loadMcpServers())
          addEntry("status", "mcp", `Added MCP server "${result.name}".`)
          break
        }

        if (sub === "remove") {
          const name = parts[1]
          if (!name) { addEntry("error", "mcp", "Usage: /mcp remove <name>"); break }
          const removed = removeMcpServer(name)
          sessionRef.current?.setMcpServers(loadMcpServers())
          addEntry("status", "mcp", removed ? `Removed MCP server "${name}".` : `No server named "${name}".`)
          break
        }

        addEntry("error", "mcp", `Unknown subcommand "${sub}". Use: list | add | remove`)
        break
      }

      case "/local":
        await switchExecutionMode("local")
        break

      case "/cloud":
        await switchExecutionMode("cloud")
        break

      case "/reset":
        await resetAgent()
        break

      case "/clear":
        setTranscript([])
        setScrollOffset(0)
        addEntry("status", "clear", "Transcript cleared.")
        break

      case "/verbose":
        setVerboseMode(!verboseMode)
        addEntry("status", "verbose", `Verbose mode: ${!verboseMode}`)
        break

      case "/theme": {
        if (arg) {
          if (isThemeName(arg)) {
            setCurrentTheme(arg)
            saveConfig({ theme: arg })
            addEntry("status", "theme", `Theme set to: ${arg}`)
          } else {
            addEntry("error", "theme", `Unknown theme. Available: ${THEME_NAMES.join(", ")}`)
          }
        } else {
          setModelSearch("")
          setMode("theme")
        }
        break
      }

      case "/config": {
        if (!arg) {
          const config = loadConfig()
          const display = [
            `theme: ${config.theme}`,
            `model: ${config.model ?? "(default)"}`,
            `verbose: ${config.verbose}`,
            `autoGitContext: ${config.autoGitContext}`,
          ].join("\n")
          addEntry("status", "config", display)
        } else {
          const [key, ...valueParts] = arg.split(/\s+/)
          const value = valueParts.join(" ")
          if (!key || !value) {
            addEntry("error", "config", "Usage: /config <key> <value>")
            break
          }
          const allowed = ["model", "theme", "verbose", "autoGitContext"]
          if (!allowed.includes(key)) {
            addEntry("error", "config", `Cannot set: ${key}. Allowed: ${allowed.join(", ")}`)
            break
          }
          let parsed: unknown = value
          if (value === "true") parsed = true
          else if (value === "false") parsed = false
          else if (!isNaN(Number(value))) parsed = Number(value)
          saveConfig({ [key]: parsed })
          addEntry("status", "config", `Config updated: ${key} = ${JSON.stringify(parsed)}`)
        }
        break
      }

      case "/web": {
        if (!arg) {
          addEntry("error", "web", "Usage: /web <search query>")
          break
        }
        setBusy(true)
        addEntry("status", "web", `Searching: "${arg}"...`)
        try {
          const result = await webSearch(arg)
          const formatted = formatSearchResults(result)
          addEntry("assistant", "search", formatted)
          setLastSearchContext(formatted)
        } catch (error) {
          addEntry("error", "web", getErrorMessage(error))
        } finally {
          setBusy(false)
        }
        break
      }

      case "/context": {
        if (!arg) {
          if (contextFiles.length === 0) {
            addEntry("status", "context", "No files in context. Usage: /context <file>")
          } else {
            const list = contextFiles.map((f) => `• ${f.path}`).join("\n")
            addEntry("status", "context", `Context files:\n${list}`)
          }
          break
        }
        try {
          const resolved = path.resolve(cwd, arg)
          const content = readFileSync(resolved, "utf8")
          setContextFiles((prev) => {
            const existing = prev.findIndex((f) => f.path === resolved)
            if (existing !== -1) {
              return prev.map((f, i) => (i === existing ? { path: resolved, content } : f))
            }
            return [...prev, { path: resolved, content }]
          })
          const lines = content.split("\n").length
          addEntry("status", "context", `Added: ${arg} (${lines} lines)`)
        } catch (error) {
          addEntry("error", "context", getErrorMessage(error))
        }
        break
      }

      case "/export": {
        const filename = arg || `cursor-session-${Date.now()}.md`
        try {
          const record: SessionRecord = {
            id: sessionId,
            timestamp: Date.now(),
            cwd,
            model: model.id,
            executionMode,
            preview: sessionMessages[0]?.text?.slice(0, 50) ?? "(empty)",
            messages: sessionMessages,
          }
          const markdown = exportToMarkdown(record)
          writeFileSync(filename, markdown, "utf8")
          addEntry("status", "export", `Exported to: ${filename}`)
        } catch (error) {
          addEntry("error", "export", getErrorMessage(error))
        }
        break
      }

      case "/history": {
        const sessions = listSessions()
        if (sessions.length === 0) {
          addEntry("status", "history", "No saved sessions.")
          break
        }
        setHistoryItems(sessions)
        setModelSearch("")
        setMode("history")
        break
      }

      case "/compact": {
        if (busy || sessionMessages.length === 0) break
        setBusy(true)
        addEntry("status", "compact", "Summarizing conversation...")
        try {
          const conversation = sessionMessages
            .map((m) => `${m.role === "user" ? "User" : "Agent"}: ${m.text}`)
            .join("\n\n")
          let summary = ""
          const session = sessionRef.current
          if (session) {
            await session.sendPrompt({
              prompt: `Summarize this conversation in 2-3 key points:\n\n${conversation}`,
              onEvent: (event) => {
                if (event.type === "assistant_delta") summary += event.text
              },
            })
            setTranscript([
              {
                id: nextId(),
                kind: "status",
                label: "summary",
                text: summary,
              },
            ])
            setSessionMessages([{ role: "assistant", text: summary, timestamp: Date.now() }])
          }
        } catch (error) {
          addEntry("error", "compact", getErrorMessage(error))
        } finally {
          setBusy(false)
        }
        break
      }

      case "/exit":
      case "/quit":
        exitApp()
        break

      default:
        addEntry("error", "command", `Unknown command: ${rawCommand}. Type /help.`)
        break
    }
  }

  const openModelPicker = async () => {
    const session = sessionRef.current
    if (!session) return

    setLoadingModels(true)
    setModelSearch("")
    setModelPreference({
      fast: getSelectionPreference(model, "fast") === true,
      thinking: getSelectionPreference(model, "thinking") === true,
    })
    setMode("model")

    try {
      const choices = await session.listModels()
      setModelItems(
        choices.map((choice) => ({
          key: modelKey(choice),
          name: choice.label,
          description: choice.description ?? "",
          value: choice.value,
        }))
      )
    } catch (error) {
      setMode("input")
      addEntry("error", "model", getErrorMessage(error))
    } finally {
      setLoadingModels(false)
    }
  }

  const selectModel = (item: ModelSelectItem) => {
    const selection = findPreferredSelection(item.value, modelItems, modelPreference) ?? item.value
    sessionRef.current?.setModel(selection)
    setModel(selection)
    setMode("input")
  }

  const toggleModelPreference = (preference: keyof ModelPreference) => {
    setModelPreference((current) => {
      const next = { ...current, [preference]: !current[preference] }
      const selection = findPreferredSelection(model, modelItems, next)
      if (selection) {
        sessionRef.current?.setModel(selection)
        setModel(selection)
      }
      return next
    })
  }

  const selectCommand = (item: CommandSelectItem) => {
    const cmd = slashCommands.find((c) => c.name === item.value)
    if (cmd?.takesArg) {
      setMode("input")
      setInput(`${item.value} `)
    } else {
      void runCommand(item.value)
    }
  }

  const selectCommandOption = (_index: number, option: SelectOption | null) => {
    const item = toCommandSelectItem(option, commandItems)
    if (item) selectCommand(item)
  }

  const selectModelOption = (_index: number, option: SelectOption | null) => {
    const item = toModelSelectItem(option, filteredModelItems)
    if (item) selectModel(item)
  }

  const selectHistoryOption = (_index: number, option: SelectOption | null) => {
    const item = filteredHistoryItems.find((h) => h.id === option?.value)
    if (item) {
      setMode("input")
      addEntry("status", "history", `Loaded session: ${formatSessionLabel(item)}`)
      setSessionMessages(item.messages)
      setTranscript(
        item.messages.map((m, i) => ({
          id: String(i),
          kind: m.role === "user" ? ("user" as const) : ("assistant" as const),
          label: m.role === "user" ? "you" : "agent",
          text: m.text,
        }))
      )
    }
  }

  const selectThemeOption = (_index: number, option: SelectOption | null) => {
    const item = toThemeSelectItem(option, filteredThemeItems)
    if (item) {
      setCurrentTheme(item.value)
      saveConfig({ theme: item.value })
      setMode("input")
      addEntry("status", "theme", `Theme: ${item.value}`)
    }
  }

  const resetAgent = async () => {
    const session = sessionRef.current
    if (!session || busy) return

    setBusy(true)
    try {
      await session.reset()
      setTranscript([])
      setScrollOffset(0)
    } catch (error) {
      addEntry("error", "reset", getErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const switchExecutionMode = async (nextMode: ExecutionMode) => {
    const session = sessionRef.current
    if (!session || busy) return

    if (session.executionMode === nextMode) {
      addEntry("status", "mode", `Already using ${nextMode} execution.`)
      return
    }

    setBusy(true)
    try {
      await session.setExecutionMode(nextMode)
      setExecutionModeState(nextMode)
      addEntry("status", "mode", `Switched to ${nextMode}. Target: ${session.executionTarget}.`)
    } catch (error) {
      addEntry("error", "mode", getErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const sendPrompt = async (prompt: string) => {
    const session = sessionRef.current
    if (!session) return

    const assistantId = nextId()
    setBusy(true)
    setCancelRequested(false)
    setScrollOffset(0)

    const userEntry: TranscriptEntry = {
      id: nextId(),
      kind: "user",
      label: "you",
      text: prompt,
    }
    setTranscript((items) => [...items, userEntry])
    setSessionMessages((m) => [...m, { role: "user", text: prompt, timestamp: Date.now() }])

    const promptContext: PromptContext = {
      fileContexts: contextFiles,
      searchContext: lastSearchContext,
    }
    if (autoGitContext) {
      try {
        const { getGitContextString } = await import("../git-context.js")
        promptContext.gitContext = getGitContextString(cwd)
      } catch {}
    }

    try {
      let assistantText = ""
      await session.sendPrompt({
        prompt,
        context: promptContext,
        onEvent: (event) => {
          setTranscript((items) => applyAgentEvent(items, event, assistantId))
          if (event.type === "assistant_delta") assistantText += event.text
        },
      })
      const now = Date.now()
      if (assistantText) {
        setSessionMessages((m) => [...m, { role: "assistant", text: assistantText, timestamp: now }])
      }
      const updatedMessages = [
        ...sessionMessages,
        { role: "user" as const, text: prompt, timestamp: now },
        ...(assistantText ? [{ role: "assistant" as const, text: assistantText, timestamp: now }] : []),
      ]
      saveSession(
        {
          id: sessionId,
          timestamp: now,
          cwd,
          model: model.id,
          executionMode,
          preview: prompt.slice(0, 50),
          messages: updatedMessages,
        },
        maxHistorySessions
      )
    } catch (error) {
      addEntry("error", "run", getErrorMessage(error))
    } finally {
      setBusy(false)
      setCancelRequested(false)
    }
  }

  const cancelActiveRun = async () => {
    const session = sessionRef.current
    if (!session || cancelRequested) return

    setCancelRequested(true)
    try {
      const result = await session.cancelCurrentRun()
      if (result.cancelled) {
        addEntry("status", "run", "Cancellation requested.")
      } else {
        setCancelRequested(false)
        addEntry("error", "cancel", result.reason)
      }
    } catch (error) {
      setCancelRequested(false)
      addEntry("error", "cancel", getErrorMessage(error))
    }
  }

  const addEntry = (kind: TranscriptEntry["kind"], label: string, text: string) => {
    setTranscript((items) => [
      ...items,
      {
        id: nextId(),
        kind,
        label,
        text,
      },
    ])
  }

  const nextId = () => {
    const id = nextIdRef.current
    nextIdRef.current += 1
    return String(id)
  }

  return (
    <box flexDirection="column" height={rows} paddingX={1}>
      <box flexDirection="column" height={transcriptViewportRows}>
        {transcript.length === 0 ? (
          <text fg={theme.heading}>{CURSOR_BANNER}</text>
        ) : (
          visibleTranscriptLines.map((line) => (
            <TranscriptLine key={line.id} line={line} theme={theme} />
          ))
        )}
      </box>

      {maxScrollOffset > 0 ? (
        <text fg={theme.dim}>
          Scroll: Up/Down PgUp/PgDn Home/End -{" "}
          {effectiveScrollOffset === 0 ? "at bottom" : `${effectiveScrollOffset} lines up`}
        </text>
      ) : null}

      {mode === "command" ? (
        <box
          border
          borderStyle="single"
          borderColor={theme.border}
          flexDirection="column"
          marginTop={1}
          paddingX={1}
        >
          <text attributes={TextAttributes.BOLD} fg={theme.heading}>
            Commands
          </text>
          <text fg={theme.dim}>Use arrows and Enter, or Escape to cancel.</text>
          <select
            focused={mode === "command"}
            height={commandSelectRows}
            options={commandItems}
            onSelect={selectCommandOption}
            showDescription={false}
          />
        </box>
      ) : mode === "model" ? (
        <box
          border
          borderStyle="single"
          borderColor={theme.border}
          flexDirection="column"
          marginTop={1}
          paddingX={1}
        >
          <text attributes={TextAttributes.BOLD} fg={theme.heading}>
            Select a model
          </text>
          <text fg={theme.dim}>
            Type to search - T thinking {modelPreference.thinking ? "on" : "off"} - F fast{" "}
            {modelPreference.fast ? "on" : "off"} - Enter choose - Escape cancel
          </text>
          <text fg={theme.dim}>Search: {modelSearch || "all models"}</text>
          {loadingModels ? (
            <text fg="yellow">Loading models...</text>
          ) : filteredModelItems.length === 0 ? (
            <text fg="yellow">No matching models.</text>
          ) : (
            <select
              focused={mode === "model"}
              height={modelSelectRows}
              options={filteredModelItems}
              onSelect={selectModelOption}
              showScrollIndicator
            />
          )}
        </box>
      ) : mode === "history" ? (
        <box
          border
          borderStyle="single"
          borderColor={theme.border}
          flexDirection="column"
          marginTop={1}
          paddingX={1}
        >
          <text attributes={TextAttributes.BOLD} fg={theme.heading}>
            Session History
          </text>
          <text fg={theme.dim}>Type to search - Enter to load - Escape cancel</text>
          <text fg={theme.dim}>Search: {modelSearch || "all sessions"}</text>
          {filteredHistoryItems.length === 0 ? (
            <text fg="yellow">No matching sessions.</text>
          ) : (
            <select
              focused={mode === "history"}
              height={historySelectRows}
              options={filteredHistoryItems.map((h) => ({
                name: formatSessionLabel(h),
                description: `${h.messages.length} messages`,
                value: h.id,
              }))}
              onSelect={selectHistoryOption}
              showScrollIndicator
            />
          )}
        </box>
      ) : mode === "theme" ? (
        <box
          border
          borderStyle="single"
          borderColor={theme.border}
          flexDirection="column"
          marginTop={1}
          paddingX={1}
        >
          <text attributes={TextAttributes.BOLD} fg={theme.heading}>
            Color Theme
          </text>
          <text fg={theme.dim}>Use arrows and Enter, or Escape to cancel</text>
          <select
            focused={mode === "theme"}
            height={modelSelectRows}
            options={filteredThemeItems}
            onSelect={selectThemeOption}
          />
        </box>
      ) : (
        <box
          border
          borderStyle="single"
          borderColor={busy ? theme.borderBusy : theme.borderActive}
          marginTop={1}
          paddingX={1}
        >
          <TuiInput
            focused={!busy}
            placeholder={
              busy
                ? cancelRequested
                  ? "Cancelling the current run..."
                  : "Waiting for the current run... Ctrl+C to cancel"
                : "Ask or type /help"
            }
            value={input}
            onInput={(value) => {
              setInput(value)
              if (!busy && value.startsWith("/") && !value.includes(" ")) {
                setMode("command")
              }
            }}
            onSubmit={submitInput}
          />
        </box>
      )}
    </box>
  )
}

type TranscriptLine = {
  id: string
  kind: TranscriptEntry["kind"]
  label: string
  parts: TranscriptPart[]
}

type TranscriptPart = {
  text: string
  bold?: boolean
  color?: string
  dimColor?: boolean
}

function TranscriptLine({ line, theme }: { line: TranscriptLine; theme: ThemeColors }) {
  const color = {
    assistant: theme.assistant,
    error: theme.error,
    meta: theme.meta,
    status: theme.status,
    tool: theme.tool,
    user: theme.user,
  }[line.kind]

  return (
    <box>
      <text fg={color} attributes={TextAttributes.BOLD}>
        {line.label.padEnd(7)}
      </text>
      <text>
        {line.parts.map((part, index) => (
          <span key={index} attributes={partToAttributes(part)} fg={part.color}>
            {part.text}
          </span>
        ))}
      </text>
    </box>
  )
}

function partToAttributes(part: TranscriptPart) {
  let attributes = TextAttributes.NONE
  if (part.bold) attributes |= TextAttributes.BOLD
  if (part.dimColor) attributes |= TextAttributes.DIM
  return attributes
}

function buildTranscriptLines(entries: TranscriptEntry[], columns: number, theme: ThemeColors) {
  const labelWidth = 7
  const textWidth = Math.max(20, columns - labelWidth - 4)

  return entries.flatMap((entry) => {
    const renderedLines = trimTrailingBlankLines(
      entry.kind === "assistant"
        ? renderMarkdownLines(entry.text || "...", textWidth, theme)
        : wrapText(entry.text || "...", textWidth).map((text) => ({
            parts: [{ text }],
          }))
    )

    return renderedLines.map((line, index) => ({
      id: `${entry.id}-${index}`,
      kind: entry.kind,
      label: index === 0 ? entry.label : "",
      parts: line.parts,
    }))
  })
}

function trimTrailingBlankLines(lines: Array<{ parts: TranscriptPart[] }>) {
  let end = lines.length
  while (end > 1 && isBlankRenderedLine(lines[end - 1])) end -= 1
  return lines.slice(0, end)
}

function isBlankRenderedLine(line: { parts: TranscriptPart[] }) {
  return line.parts.every((part) => part.text.trim() === "")
}

function renderMarkdownLines(value: string, width: number, theme: ThemeColors) {
  const lines: Array<{ parts: TranscriptPart[] }> = []
  let inCodeBlock = false

  for (const rawLine of value.split("\n")) {
    const line = rawLine.trimEnd()
    const fence = line.match(/^```\s*(.*)$/)

    if (fence) {
      inCodeBlock = !inCodeBlock
      const language = fence[1]?.trim()
      lines.push({
        parts: [
          {
            text: inCodeBlock ? `--- code${language ? `: ${language}` : ""}` : "--- end code",
            color: theme.dim,
            dimColor: true,
          },
        ],
      })
      continue
    }

    if (inCodeBlock) {
      for (const text of wrapText(line || " ", width - 2)) {
        lines.push({
          parts: [{ text: `| ${text}`, color: theme.code }],
        })
      }
      continue
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/)
    if (heading) {
      for (const text of wrapText(heading[2] ?? "", width - 2)) {
        lines.push({
          parts: [{ text: `# ${text}`, bold: true, color: theme.heading }],
        })
      }
      continue
    }

    const blockquote = line.match(/^>\s?(.*)$/)
    if (blockquote) {
      for (const text of wrapText(blockquote[1] || " ", width - 2)) {
        lines.push({
          parts: [
            { text: "> ", color: theme.dim, dimColor: true },
            ...parseInlineMarkdown(text, theme),
          ],
        })
      }
      continue
    }

    const unordered = line.match(/^\s*[-*+]\s+(.+)$/)
    if (unordered) {
      for (const [index, text] of wrapText(unordered[1] ?? "", width - 2).entries()) {
        lines.push({
          parts: [
            { text: index === 0 ? "- " : "  ", color: theme.bullet },
            ...parseInlineMarkdown(text, theme),
          ],
        })
      }
      continue
    }

    const ordered = line.match(/^\s*(\d+)[.)]\s+(.+)$/)
    if (ordered) {
      const marker = `${ordered[1]}. `
      for (const [index, text] of wrapText(ordered[2] ?? "", width - marker.length).entries()) {
        lines.push({
          parts: [
            { text: index === 0 ? marker : " ".repeat(marker.length), color: theme.bullet },
            ...parseInlineMarkdown(text, theme),
          ],
        })
      }
      continue
    }

    for (const text of wrapText(line, width)) {
      lines.push({ parts: parseInlineMarkdown(text, theme) })
    }
  }

  return lines
}

function wrapText(value: string, width: number) {
  const lines: string[] = []

  for (const rawLine of value.split("\n")) {
    let line = rawLine

    if (!line) {
      lines.push("")
      continue
    }

    while (line.length > width) {
      let breakAt = line.lastIndexOf(" ", width)
      if (breakAt < width * 0.5) breakAt = width
      lines.push(line.slice(0, breakAt).trimEnd())
      line = line.slice(breakAt).trimStart()
    }

    lines.push(line)
  }

  return lines
}

function parseInlineMarkdown(value: string, theme: ThemeColors): TranscriptPart[] {
  const parts: TranscriptPart[] = []
  const pattern = /(`[^`]+`|\[([^\]]+)\]\(([^)]+)\)|(https?:\/\/\S+))/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(value))) {
    if (match.index > lastIndex) {
      parts.push({ text: value.slice(lastIndex, match.index) })
    }

    const token = match[0]!
    if (token.startsWith("`")) {
      parts.push({
        text: token.slice(1, -1),
        color: theme.code,
      })
    } else if (match[2] && match[3]) {
      parts.push({ text: match[2], color: theme.link })
      parts.push({ text: ` (${match[3]})`, color: theme.dim, dimColor: true })
    } else {
      parts.push({ text: token, color: theme.link })
    }

    lastIndex = match.index + token.length
  }

  if (lastIndex < value.length) {
    parts.push({ text: value.slice(lastIndex) })
  }

  return parts.length > 0 ? parts : [{ text: "" }]
}

function appendAssistantDelta(items: TranscriptEntry[], assistantId: string, text: string) {
  const last = items.at(-1)

  if (last?.kind === "assistant" && last.id.startsWith(`assistant-${assistantId}`)) {
    return items.map((item, index) =>
      index === items.length - 1 ? { ...item, text: item.text + text } : item
    )
  }

  const segmentCount = items.filter((item) => item.id.startsWith(`assistant-${assistantId}`)).length

  return [
    ...items,
    {
      id: `assistant-${assistantId}-${segmentCount}`,
      kind: "assistant" as const,
      label: "agent",
      text,
    },
  ]
}

function applyAgentEvent(
  items: TranscriptEntry[],
  event: AgentEvent,
  assistantId: string
): TranscriptEntry[] {
  switch (event.type) {
    case "assistant_delta":
      return appendAssistantDelta(items, assistantId, event.text)
    case "thinking": {
      const text = compactText(event.text)
      return text ? upsertEntry(items, `thinking-${assistantId}`, "status", "think", text) : items
    }
    case "tool": {
      const id = event.callId ? `tool-${event.callId}` : `tool-${assistantId}-${event.name}`
      return upsertEntry(
        items,
        id,
        "tool",
        "tool",
        [formatToolStatus(event.status), formatToolIcon(event.name), event.name, event.params]
          .filter(Boolean)
          .join(" ")
      )
    }
    case "status":
      return ["CREATING", "RUNNING", "FINISHED"].includes(event.status)
        ? items
        : upsertEntry(
            items,
            `status-${assistantId}`,
            event.status === "ERROR" ? "error" : "status",
            "run",
            `${formatRunStatus(event.status)}${event.message ? ` ${event.message}` : ""}`
          )
    case "task": {
      const text = compactText([event.status, event.text].filter(Boolean).join(" "))
      return text ? upsertEntry(items, `task-${assistantId}`, "status", "task", text) : items
    }
    case "result": {
      const details = [
        event.status !== "finished" ? `status=${event.status}` : undefined,
        event.durationMs ? `duration=${formatDuration(event.durationMs)}` : undefined,
        event.usage?.inputTokens ? `input=${event.usage.inputTokens}` : undefined,
        event.usage?.outputTokens ? `output=${event.usage.outputTokens}` : undefined,
      ].filter(Boolean)

      return details.length > 0
        ? [...items, makeEntry("meta", "done", details.join(" "))]
        : items
    }
  }
}

function upsertEntry(
  items: TranscriptEntry[],
  id: string,
  kind: TranscriptEntry["kind"],
  label: string,
  text: string
) {
  const existingIndex = items.findIndex((item) => item.id === id)
  if (existingIndex === -1) {
    return [...items, { id, kind, label, text }]
  }
  return items.map((item, index) =>
    index === existingIndex ? { ...item, kind, label, text } : item
  )
}

function makeEntry(kind: TranscriptEntry["kind"], label: string, text: string): TranscriptEntry {
  return {
    id: `${Date.now()}-${Math.random()}`,
    kind,
    label,
    text,
  }
}

function compactText(text: string) {
  return text.replace(/\s+/g, " ").trim()
}

function formatToolStatus(status: string) {
  switch (status) {
    case "requested":
      return "[ ]"
    case "running":
      return "[~]"
    case "completed":
      return "[x]"
    case "error":
      return "[!]"
    default:
      return status.toLowerCase()
  }
}

function formatToolIcon(name: string) {
  const key = name.toLowerCase()
  if (key.includes("read")) return "[R]"
  if (key.includes("glob") || key.includes("grep") || key.includes("search")) return "[S]"
  if (key.includes("shell") || key.includes("terminal") || key.includes("command")) return "$"
  if (key.includes("edit") || key.includes("write") || key.includes("patch") || key.includes("delete"))
    return "[E]"
  if (key.includes("todo") || key.includes("task")) return "[T]"
  return "[*]"
}

function formatRunStatus(status: string) {
  switch (status) {
    case "ERROR":
      return "error"
    case "CANCELLED":
      return "cancelled"
    case "EXPIRED":
      return "expired"
    default:
      return status.toLowerCase()
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function modelKey(choice: ModelChoice) {
  return modelKeyFromSelection(choice.value)
}

function filterModelItems(items: ModelSelectItem[], search: string, preference: ModelPreference) {
  const normalizedSearch = normalizeToken(search)
  return items.filter((item) => {
    const matchesSearch =
      !normalizedSearch ||
      normalizeToken(`${item.name} ${item.description} ${selectionSearchText(item.value)}`).includes(
        normalizedSearch
      )
    const matchesThinking = !preference.thinking || getSelectionPreference(item.value, "thinking") === true
    const matchesFast = !preference.fast || getSelectionPreference(item.value, "fast") === true
    return matchesSearch && matchesThinking && matchesFast
  })
}

function findPreferredSelection(
  current: ModelSelection,
  items: ModelSelectItem[],
  preference: ModelPreference
) {
  const sameModelItems = items.filter((item) => item.value.id === current.id)
  if (sameModelItems.length === 0) return undefined

  let candidates = sameModelItems
  for (const key of ["thinking", "fast"] as const) {
    if (!modelSupportsPreference(sameModelItems, key)) continue
    const desired = preference[key]
    const matching = candidates.filter((item) => {
      const value = getSelectionPreference(item.value, key)
      return desired ? value === true : value !== true
    })
    if (matching.length > 0) candidates = matching
  }

  return candidates.sort(
    (left, right) =>
      selectionOverlapScore(right.value, current) - selectionOverlapScore(left.value, current)
  )[0]?.value
}

function modelSupportsPreference(items: ModelSelectItem[], preference: keyof ModelPreference) {
  return items.some((item) => getSelectionPreference(item.value, preference) !== undefined)
}

function getSelectionPreference(selection: ModelSelection, preference: keyof ModelPreference) {
  for (const param of selection.params ?? []) {
    const key = normalizeToken(`${param.id} ${param.value}`)
    if (key.includes(preference)) return !isFalseValue(key)
  }
  const idKey = normalizeToken(selection.id)
  return idKey.includes(preference) ? !isFalseValue(idKey) : undefined
}

function selectionOverlapScore(left: ModelSelection, right: ModelSelection) {
  const rightParams = new Set((right.params ?? []).map((param) => `${param.id}=${param.value}`))
  return (left.params ?? []).filter((param) => rightParams.has(`${param.id}=${param.value}`)).length
}

function selectionSearchText(selection: ModelSelection) {
  return [selection.id, ...(selection.params ?? []).flatMap((param) => [param.id, param.value])].join(" ")
}

function toCommandSelectItem(option: SelectOption | null, items: CommandSelectItem[]) {
  if (!option) return undefined
  return items.find((item) => item.value === option.value)
}

function toModelSelectItem(option: SelectOption | null, items: ModelSelectItem[]) {
  if (!option) return undefined
  return items.find((item) => modelSelectionEquals(item.value, option.value))
}

function toHistorySelectItem(option: SelectOption | null, items: SessionRecord[]) {
  if (!option) return undefined
  return items.find((item) => item.id === option.value?.id)
}

function toThemeSelectItem(option: SelectOption | null, items: ThemeSelectItem[]) {
  if (!option) return undefined
  return items.find((item) => item.value === option.value)
}

function modelSelectionEquals(left: ModelSelection, right: unknown) {
  return isModelSelection(right) && modelKeyFromSelection(left) === modelKeyFromSelection(right)
}

function modelKeyFromSelection(selection: ModelSelection) {
  return JSON.stringify({
    id: selection.id,
    params: [...(selection.params ?? [])].sort((left, right) => left.id.localeCompare(right.id)),
  })
}

function isModelSelection(value: unknown): value is ModelSelection {
  if (!hasStringProperty(value, "id")) return false
  if (!("params" in value)) return true
  const params = value.params
  return (
    params === undefined ||
    (Array.isArray(params) &&
      params.every((param) => hasStringProperty(param, "id") && hasStringProperty(param, "value")))
  )
}

function hasStringProperty<K extends string>(value: unknown, key: K): value is Record<K, string> {
  if (typeof value !== "object" || value === null || !(key in value)) return false
  return typeof Object.getOwnPropertyDescriptor(value, key)?.value === "string"
}

function getInputCharacter(key: KeyEvent) {
  if (key.ctrl || key.meta || key.name.length !== 1) return ""
  return key.shift ? key.name.toUpperCase() : key.name
}

function isSearchInput(input: string) {
  return input.length > 0 && !/[ -]/.test(input)
}

function isFalseValue(value: string) {
  return (
    value.includes("false") ||
    value.includes("off") ||
    value.includes("disabled") ||
    value.includes("disable") ||
    value.includes("none") ||
    value.includes("no")
  )
}

function normalizeToken(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9.]+/g, "")
}

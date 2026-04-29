export type SlashCommandName =
  | "/clear"
  | "/cloud"
  | "/compact"
  | "/config"
  | "/context"
  | "/exit"
  | "/export"
  | "/help"
  | "/history"
  | "/local"
  | "/mcp"
  | "/model"
  | "/models"
  | "/quit"
  | "/reset"
  | "/theme"
  | "/verbose"
  | "/web"

export type SlashCommand = {
  name: SlashCommandName
  summary: string
  takesArg?: boolean
}

export const slashCommands: SlashCommand[] = [
  { name: "/help", summary: "Show available commands." },
  { name: "/local", summary: "Run future prompts in the local workspace." },
  { name: "/cloud", summary: "Run future prompts in Cursor cloud." },
  { name: "/mcp", summary: "Manage MCP servers (list / add / remove).", takesArg: true },
  { name: "/model", summary: "Open a picker with available Cursor models." },
  { name: "/models", summary: "List all available Cursor models." },
  { name: "/theme", summary: "Switch color theme (dark/light/dracula/nord/monokai).", takesArg: true },
  { name: "/reset", summary: "Start a fresh agent and clear context." },
  { name: "/clear", summary: "Clear the conversation transcript." },
  { name: "/compact", summary: "Summarize the conversation to save context." },
  { name: "/history", summary: "Browse past sessions." },
  { name: "/export", summary: "Export conversation to a markdown file.", takesArg: true },
  { name: "/web", summary: "Search the web with DuckDuckGo.", takesArg: true },
  { name: "/context", summary: "Add a file to the prompt context.", takesArg: true },
  { name: "/verbose", summary: "Toggle verbose tool output." },
  { name: "/config", summary: "View or set config (key value).", takesArg: true },
  { name: "/exit", summary: "Exit the TUI." },
  { name: "/quit", summary: "Exit the TUI." },
]

const commandNames = new Set<string>(slashCommands.map((c) => c.name))

export function getSlashCommand(input: string): SlashCommandName | undefined {
  const [command] = input.trim().split(/\s+/, 1)
  return commandNames.has(command ?? "") ? (command as SlashCommandName) : undefined
}

export function getSlashCommandItems(query: string) {
  const normalizedQuery = query.trim().toLowerCase()
  return slashCommands
    .filter((c) => c.name.startsWith(normalizedQuery || "/"))
    .map((c) => ({
      key: c.name,
      label: `${c.name}  ${c.summary}`,
      value: c.name,
    }))
}

export function getCommandArg(rawCommand: string): string {
  const spaceIndex = rawCommand.indexOf(" ")
  return spaceIndex === -1 ? "" : rawCommand.slice(spaceIndex + 1).trim()
}

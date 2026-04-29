import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs"
import path from "node:path"
import { homedir } from "node:os"
import type { McpServerConfig } from "@cursor/sdk"

export type { McpServerConfig }
export type McpServers = Record<string, McpServerConfig>

const MCP_FILE = path.join(homedir(), ".cursor-cli", "mcp.json")

export function loadMcpServers(): McpServers {
  if (!existsSync(MCP_FILE)) return {}
  try {
    const parsed = JSON.parse(readFileSync(MCP_FILE, "utf8"))
    return (parsed?.servers as McpServers) ?? {}
  } catch {
    return {}
  }
}

export function saveMcpServers(servers: McpServers): void {
  const dir = path.dirname(MCP_FILE)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(MCP_FILE, JSON.stringify({ servers }, null, 2), "utf8")
}

export function addMcpServer(name: string, config: McpServerConfig): void {
  const servers = loadMcpServers()
  servers[name] = config
  saveMcpServers(servers)
}

export function removeMcpServer(name: string): boolean {
  const servers = loadMcpServers()
  if (!(name in servers)) return false
  delete servers[name]
  saveMcpServers(servers)
  return true
}

export function formatMcpServerList(servers: McpServers): string {
  const entries = Object.entries(servers)
  if (entries.length === 0) return "No MCP servers configured. Use: mcp add <name> ..."
  return entries
    .map(([name, cfg]) => {
      const detail =
        "url" in cfg
          ? `${cfg.type ?? "http"}  ${cfg.url}`
          : `stdio  ${cfg.command}${cfg.args?.length ? " " + cfg.args.join(" ") : ""}`
      return `  ${name}  —  ${detail}`
    })
    .join("\n")
}

export function parseMcpAddArgs(args: string[]): { name: string; config: McpServerConfig } | string {
  const name = args[0]
  if (!name) return "Usage: mcp add <name> --command <cmd> [args...]  OR  --url <url>"

  const cmdIdx = args.indexOf("--command")
  const urlIdx = args.indexOf("--url")

  if (cmdIdx !== -1) {
    const command = args[cmdIdx + 1]
    if (!command) return "Missing value for --command"
    const rest = args.slice(cmdIdx + 2).filter((a) => !a.startsWith("--"))
    const config: McpServerConfig = { type: "stdio", command, args: rest.length ? rest : undefined }
    return { name, config }
  }

  if (urlIdx !== -1) {
    const url = args[urlIdx + 1]
    if (!url) return "Missing value for --url"
    const typeIdx = args.indexOf("--type")
    const type = (typeIdx !== -1 ? args[typeIdx + 1] : "http") as "http" | "sse"
    const config: McpServerConfig = { type, url }
    return { name, config }
  }

  return "Specify --command <cmd> for stdio or --url <url> for HTTP/SSE servers."
}

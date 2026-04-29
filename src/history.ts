import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs"
import path from "node:path"
import { ensureConfigDirs, SESSIONS_DIR } from "./config.js"

export type SessionMessage = {
  role: "user" | "assistant"
  text: string
  timestamp: number
}

export type SessionRecord = {
  id: string
  timestamp: number
  cwd: string
  model: string
  executionMode: string
  preview: string
  messages: SessionMessage[]
}

export function generateSessionId(): string {
  return Math.random().toString(36).slice(2, 10)
}

export function saveSession(record: SessionRecord, maxSessions: number) {
  ensureConfigDirs()
  const ts = String(record.timestamp).padStart(16, "0")
  const filename = `${ts}-${record.id}.json`
  writeFileSync(path.join(SESSIONS_DIR, filename), JSON.stringify(record, null, 2), "utf8")
  pruneOldSessions(maxSessions)
}

export function listSessions(): SessionRecord[] {
  ensureConfigDirs()
  if (!existsSync(SESSIONS_DIR)) return []
  return readdirSync(SESSIONS_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .reverse()
    .flatMap((file) => {
      try {
        return [JSON.parse(readFileSync(path.join(SESSIONS_DIR, file), "utf8")) as SessionRecord]
      } catch {
        return []
      }
    })
}

export function loadSessionById(id: string): SessionRecord | undefined {
  if (!existsSync(SESSIONS_DIR)) return undefined
  const files = readdirSync(SESSIONS_DIR).filter((f) => f.includes(id) && f.endsWith(".json"))
  if (files.length === 0) return undefined
  try {
    return JSON.parse(readFileSync(path.join(SESSIONS_DIR, files[0]!), "utf8")) as SessionRecord
  } catch {
    return undefined
  }
}

function pruneOldSessions(max: number) {
  if (!existsSync(SESSIONS_DIR)) return
  const files = readdirSync(SESSIONS_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
  while (files.length > max) {
    const oldest = files.shift()
    if (oldest) {
      try {
        unlinkSync(path.join(SESSIONS_DIR, oldest))
      } catch {}
    }
  }
}

export function exportToMarkdown(record: SessionRecord): string {
  const date = new Date(record.timestamp).toLocaleString()
  const lines: string[] = [
    `# Cursor Agent Session`,
    ``,
    `| Field | Value |`,
    `|-------|-------|`,
    `| Date | ${date} |`,
    `| Model | ${record.model} |`,
    `| Mode | ${record.executionMode} |`,
    `| Directory | \`${record.cwd}\` |`,
    ``,
    `---`,
    ``,
  ]

  for (const msg of record.messages) {
    if (msg.role === "user") {
      lines.push(`## You`, ``, msg.text, ``)
    } else {
      lines.push(`## Agent`, ``, msg.text, ``)
    }
  }

  return lines.join("\n")
}

export function formatSessionLabel(record: SessionRecord): string {
  const date = new Date(record.timestamp).toLocaleString()
  return `${date}  ${record.preview.slice(0, 50)}`
}

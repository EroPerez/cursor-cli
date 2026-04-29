import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"

export type ThemeName = "dark" | "light" | "dracula" | "nord" | "monokai"

export type Config = {
  apiKey?: string
  model?: string
  theme: ThemeName
  verbose: boolean
  autoGitContext: boolean
  maxHistorySessions: number
  outputFormat: "text" | "json"
}

export const CONFIG_DIR = path.join(homedir(), ".cursor-cli")
export const CONFIG_FILE = path.join(CONFIG_DIR, "config.json")
export const SESSIONS_DIR = path.join(CONFIG_DIR, "sessions")

export const DEFAULT_CONFIG: Config = {
  theme: "dark",
  verbose: false,
  autoGitContext: true,
  maxHistorySessions: 50,
  outputFormat: "text",
}

export function ensureConfigDirs() {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true })
  if (!existsSync(SESSIONS_DIR)) mkdirSync(SESSIONS_DIR, { recursive: true })
}

export function loadConfig(): Config {
  ensureConfigDirs()
  if (!existsSync(CONFIG_FILE)) return { ...DEFAULT_CONFIG }
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(CONFIG_FILE, "utf8")) }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export function saveConfig(patch: Partial<Config>) {
  ensureConfigDirs()
  const current = loadConfig()
  writeFileSync(CONFIG_FILE, JSON.stringify({ ...current, ...patch }, null, 2), "utf8")
}

export const THEME_NAMES: ThemeName[] = ["dark", "light", "dracula", "nord", "monokai"]

export function isThemeName(value: string): value is ThemeName {
  return THEME_NAMES.includes(value as ThemeName)
}

export function configSummary(config: Config): string {
  return [
    `theme: ${config.theme}`,
    `model: ${config.model ?? "(use CURSOR_MODEL or composer-2)"}`,
    `verbose: ${config.verbose}`,
    `autoGitContext: ${config.autoGitContext}`,
    `maxHistorySessions: ${config.maxHistorySessions}`,
    `outputFormat: ${config.outputFormat}`,
    `configFile: ${CONFIG_FILE}`,
  ].join("\n")
}

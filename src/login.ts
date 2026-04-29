import { createInterface } from "node:readline"
import { spawnSync } from "node:child_process"
import { saveConfig } from "./config.js"

const CURSOR_SETTINGS_URL = "https://cursor.com/settings"
const API_KEY_PATTERN = /^crsr_[A-Za-z0-9_-]{20,}$/

function openBrowser(url: string): boolean {
  const platform = process.platform
  const cmd =
    platform === "darwin" ? "open" :
    platform === "win32"  ? "cmd" :
    "xdg-open"
  const args = platform === "win32" ? ["/c", "start", url] : [url]
  const result = spawnSync(cmd, args, { stdio: "ignore" })
  return result.status === 0
}

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

export async function runLogin(): Promise<void> {
  console.log("\n  cursor-cli — web login\n")
  console.log(`  Opening ${CURSOR_SETTINGS_URL} in your browser...`)
  console.log("  Navigate to the 'API Keys' section to create or copy your key.\n")

  const opened = openBrowser(CURSOR_SETTINGS_URL)
  if (!opened) {
    console.log(`  Could not open browser automatically. Visit:\n  ${CURSOR_SETTINGS_URL}\n`)
  }

  let apiKey = ""
  for (let attempt = 0; attempt < 3; attempt++) {
    const input = await prompt("  Paste your API key (crsr_...): ")
    if (API_KEY_PATTERN.test(input)) {
      apiKey = input
      break
    }
    console.log("  Invalid key format — expected crsr_<token>. Try again.\n")
  }

  if (!apiKey) {
    console.error("\n  Login failed: no valid API key provided.\n")
    process.exitCode = 1
    return
  }

  saveConfig({ apiKey })
  console.log("\n  Logged in. API key saved to ~/.cursor-cli/config.json")
  console.log("  Run cursor-cli to start an interactive session.\n")
}

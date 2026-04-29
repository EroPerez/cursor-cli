import { execFileSync } from "node:child_process"

export type GitContext = {
  branch: string
  status: string
  recentCommits: string
  remoteUrl?: string
}

export function getGitContext(cwd: string): GitContext | undefined {
  const branch = runGit(cwd, ["rev-parse", "--abbrev-ref", "HEAD"])
  if (!branch) return undefined

  const status = runGit(cwd, ["status", "--short"]) ?? ""
  const recentCommits = runGit(cwd, ["log", "--oneline", "-5"]) ?? ""
  const remoteUrl = runGit(cwd, ["config", "--get", "remote.origin.url"]) ?? undefined

  return { branch, status, recentCommits, remoteUrl }
}

export function formatGitContext(ctx: GitContext): string {
  const parts = [`Branch: ${ctx.branch}`]
  if (ctx.status) {
    parts.push(`\nUnstaged changes:\n${ctx.status}`)
  }
  if (ctx.recentCommits) {
    parts.push(`\nRecent commits:\n${ctx.recentCommits}`)
  }
  return parts.join("")
}

export function getGitContextString(cwd: string): string | undefined {
  const ctx = getGitContext(cwd)
  if (!ctx) return undefined
  return formatGitContext(ctx)
}

function runGit(cwd: string, args: string[]): string | undefined {
  try {
    const result = execFileSync("git", ["-C", cwd, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
    return result || undefined
  } catch {
    return undefined
  }
}

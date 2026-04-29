import type { AgentEvent } from "./agent.js"

export type DemoAgentOptions = {
  onEvent: (event: AgentEvent) => void
}

export class DemoAgent {
  private onEvent: (event: AgentEvent) => void

  constructor(options: DemoAgentOptions) {
    this.onEvent = options.onEvent
  }

  async sendPrompt(prompt: string) {
    // Simulate delay
    await new Promise((r) => setTimeout(r, 500))

    // Emit thinking
    this.onEvent({ type: "thinking", text: "Analyzing the request..." })
    await new Promise((r) => setTimeout(r, 800))

    // Emit tool call (simulated)
    this.onEvent({
      type: "tool",
      name: "read",
      status: "running",
      params: `file: src/index.ts`,
    })
    await new Promise((r) => setTimeout(r, 600))
    this.onEvent({
      type: "tool",
      name: "read",
      status: "success",
    })

    // Emit assistant response
    const responses = [
      "This prompt is asking me to help with something. Let me break it down...",
      "I can see what you're trying to do. Here's my analysis:\n\n1. First, we should understand the context\n2. Then identify the key components\n3. Finally, implement a solution",
      "Based on the codebase structure, I recommend:\n\n- Check the existing patterns\n- Follow the naming conventions\n- Add tests for new functionality",
      "Looking at your request, the best approach would be:\n\n```typescript\n// Example implementation\nfunction example(param: string): string {\n  return `Hello, ${param}!`\n}\n```",
    ]

    const response = responses[Math.floor(Math.random() * responses.length)]!
    for (const char of response) {
      this.onEvent({ type: "assistant_delta", text: char })
      await new Promise((r) => setTimeout(r, 5))
    }

    // Emit result
    this.onEvent({
      type: "result",
      status: "success",
      durationMs: 2500,
      usage: {
        inputTokens: 150,
        outputTokens: 200,
      },
    })
  }

  // Mock methods to match SDKAgent interface minimally
  async [Symbol.asyncDispose]() {}
}

export async function runDemoMode(cwd: string, prompt?: string) {
  console.log("\n  🎬 cursor-cli DEMO MODE\n")
  console.log("  No API key required. Shows simulated agent behavior.\n")

  if (!prompt) {
    console.log("  Usage:  cursor-cli --demo 'Your task here'")
    console.log("  Or start interactive:  cursor-cli --demo\n")
    return
  }

  console.log(`  📝 Prompt: ${prompt}\n`)
  console.log("  ▶ Starting demo agent...\n")

  const agent = new DemoAgent({
    onEvent: (event) => {
      switch (event.type) {
        case "assistant_delta":
          process.stdout.write(event.text)
          break
        case "thinking":
          console.log(`\n[thinking] ${event.text}`)
          break
        case "tool":
          console.log(`[tool] ${event.status} ${event.name}`)
          break
        case "result":
          console.log(`\n[done] status=${event.status} duration=${event.durationMs}ms`)
          break
      }
    },
  })

  await agent.sendPrompt(prompt)
  console.log("\n")
}

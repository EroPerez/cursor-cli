export type SearchResult = {
  title: string
  url: string
  snippet: string
}

export type SearchResponse = {
  query: string
  abstract: string
  results: SearchResult[]
}

export async function webSearch(query: string): Promise<SearchResponse> {
  const encoded = encodeURIComponent(query)

  // Try the Instant Answer API first (works well for single-topic queries)
  const instantUrl = `https://api.duckduckgo.com/?q=${encoded}&format=json&no_html=1&skip_disambig=1`
  const instantResponse = await fetch(instantUrl, {
    headers: { "User-Agent": "cursor-cli/0.1.0" },
    signal: AbortSignal.timeout(10_000),
  })

  if (instantResponse.ok) {
    const data = (await instantResponse.json()) as DdgResponse

    const flatTopics: DdgTopic[] = []
    for (const item of data.RelatedTopics ?? []) {
      if ("Text" in item && "FirstURL" in item) {
        flatTopics.push(item)
      } else if ("Topics" in item) {
        flatTopics.push(...item.Topics)
      }
    }

    const abstract = data.AbstractText ?? data.Answer ?? ""

    if (flatTopics.length > 0 || abstract) {
      return {
        query,
        abstract,
        results: flatTopics.slice(0, 8).map((t) => ({
          title: t.Text.split(" - ")[0]?.trim() ?? t.Text,
          url: t.FirstURL,
          snippet: t.Text,
        })),
      }
    }
  }

  // Fall back to HTML search for general multi-word queries
  const htmlResponse = await fetch(`https://html.duckduckgo.com/html/?q=${encoded}`, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; cursor-cli/0.1.0)",
      "Accept": "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(10_000),
  })

  if (!htmlResponse.ok) {
    throw new Error(`Search request failed: HTTP ${htmlResponse.status}`)
  }

  const html = await htmlResponse.text()
  const results = parseDdgHtml(html).slice(0, 8)

  return { query, abstract: "", results }
}

function parseDdgHtml(html: string): SearchResult[] {
  const results: SearchResult[] = []

  // Locate anchor tags with class "result__a" (titles/URLs)
  const anchorRe = /<a\s[^>]*class="[^"]*result__a[^"]*"[^>]*>/g
  // Locate anchor tags with class "result__snippet" (descriptions)
  const snippetRe = /<a\s[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/g

  const links: { url: string; title: string }[] = []
  const snippets: string[] = []

  let m: RegExpExecArray | null

  while ((m = anchorRe.exec(html)) !== null) {
    const tag = m[0]
    const hrefMatch = /href="([^"]+)"/.exec(tag)
    if (!hrefMatch) continue
    const url = extractDdgUrl(hrefMatch[1]!)
    if (!url) continue

    const afterTag = html.slice(m.index + tag.length)
    const closeIdx = afterTag.indexOf("</a>")
    if (closeIdx === -1) continue
    const title = stripTags(afterTag.slice(0, closeIdx)).trim()
    if (title) links.push({ url, title })
  }

  while ((m = snippetRe.exec(html)) !== null) {
    snippets.push(stripTags(m[1]!).trim())
  }

  const count = Math.min(links.length, snippets.length)
  for (let i = 0; i < count; i++) {
    results.push({ title: links[i]!.title, url: links[i]!.url, snippet: snippets[i]! })
  }
  return results
}

function extractDdgUrl(href: string): string | undefined {
  try {
    const full = href.startsWith("//") ? `https:${href}` : href
    const uddg = new URL(full).searchParams.get("uddg")
    return uddg ? decodeURIComponent(uddg) : full
  } catch {
    return href || undefined
  }
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "")
}

export function formatSearchResults(response: SearchResponse): string {
  const parts: string[] = [`**Web search:** "${response.query}"`, ""]

  if (response.abstract) {
    parts.push(response.abstract, "")
  }

  if (response.results.length > 0) {
    for (const result of response.results) {
      parts.push(`- **${result.title}**`)
      if (result.snippet && result.snippet !== result.title) {
        parts.push(`  ${result.snippet}`)
      }
      parts.push(`  ${result.url}`)
    }
  } else if (!response.abstract) {
    parts.push("No results found.")
  }

  return parts.join("\n").trim()
}

type DdgResponse = {
  AbstractText?: string
  Answer?: string
  RelatedTopics?: Array<DdgTopic | DdgTopicGroup>
}

type DdgTopic = {
  Text: string
  FirstURL: string
}

type DdgTopicGroup = {
  Name: string
  Topics: DdgTopic[]
}

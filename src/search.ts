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
  const url = `https://api.duckduckgo.com/?q=${encoded}&format=json&no_html=1&skip_disambig=1`

  const response = await fetch(url, {
    headers: { "User-Agent": "cursor-cli/0.1.0" },
    signal: AbortSignal.timeout(10_000),
  })

  if (!response.ok) {
    throw new Error(`Search request failed: HTTP ${response.status}`)
  }

  const data = (await response.json()) as DdgResponse

  const flatTopics: DdgTopic[] = []
  for (const item of data.RelatedTopics ?? []) {
    if ("Text" in item && "FirstURL" in item) {
      flatTopics.push(item)
    } else if ("Topics" in item) {
      flatTopics.push(...item.Topics)
    }
  }

  const results: SearchResult[] = flatTopics
    .slice(0, 8)
    .map((t) => ({
      title: t.Text.split(" - ")[0]?.trim() ?? t.Text,
      url: t.FirstURL,
      snippet: t.Text,
    }))

  return {
    query,
    abstract: data.AbstractText ?? data.Answer ?? "",
    results,
  }
}

export function formatSearchResults(response: SearchResponse): string {
  const parts: string[] = [`**Web search:** "${response.query}"`, ""]

  if (response.abstract) {
    parts.push(response.abstract, "")
  }

  if (response.results.length > 0) {
    for (const result of response.results) {
      parts.push(`- ${result.snippet}`)
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

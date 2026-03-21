---
name: tavily-search
description: Web search and research using the Tavily API. Use when you need to find information, research topics, perform competitive analysis, or gather data from the web. Supports advanced search operators, source filtering, and detailed search results with content extraction.
---

# Tavily Search Skill

Tavily is a web search API optimized for research, information retrieval, and data gathering. This skill enables you to perform powerful web searches with advanced filtering and detailed result analysis.

## Quick Start

To perform a search:

1. Have your Tavily API key ready: `[API_KEY_REMOVED]`
2. Use the search script with your query
3. Get back structured results with sources, content, and metadata

## Search Parameters

### Basic Search
```bash
scripts/tavily_search.py "your search query"
```

### Advanced Search with Options
```bash
scripts/tavily_search.py "your search query" \
  --include-answer \
  --max-results 10 \
  --include-raw-content
```

### Options

- `--include-answer`: Include AI-synthesized answer in results
- `--max-results`: Number of results to return (1-20, default: 5)
- `--include-raw-content`: Include full page content (larger payload)
- `--search-depth`: `basic` or `advanced` (default: advanced)
- `--topic`: `general`, `news`, or `finance` (default: general)

## Use Cases

### Market Research
Search for competitor information, market trends, pricing strategies.

### Lead Generation
Find companies, contacts, and business opportunities matching specific criteria.

### Content Research
Gather information for writing articles, blog posts, or reports.

### Trend Monitoring
Track news, announcements, and developments in your industry.

### Data Collection
Extract structured information from web sources for analysis.

## Result Format

Results include:
- **title**: Article/page title
- **url**: Source URL
- **content**: Page content snippet or full text
- **answer**: (if requested) AI-synthesized summary
- **score**: Relevance score (0-1)

## Rate Limits & Best Practices

- Tavily has generous rate limits for development keys
- Batch multiple queries when possible
- Use `--search-depth basic` for faster, lighter results when precision isn't critical
- Cache results when doing repeated searches for the same topic

## Bundled Resources

See `scripts/tavily_search.py` for the implementation and additional configuration options.

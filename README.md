# OpenClaw Skills Repository

A collection of specialized skills for OpenClaw agents.

## Skills

### tavily-search
Web search and research using the Tavily API. Perform powerful web searches with advanced filtering, detailed result analysis, and AI-synthesized answers.

**Features:**
- Advanced web search with multiple topics (general, news, finance)
- AI-synthesized answer generation
- Source filtering and relevance scoring
- Raw content extraction
- Configurable search depth (basic/advanced)

**Use cases:**
- Market research and competitive analysis
- Lead generation and business intelligence
- Content research for articles and reports
- Trend monitoring and news tracking
- Data collection and web scraping

**Quick start:**
```bash
python3 scripts/tavily_search.py "your search query" --include-answer --max-results 5
```

See `tavily-search/SKILL.md` for complete documentation.

---

**Note:** API keys and credentials should never be committed to this repository. Configure them via environment variables or secure credential management systems.

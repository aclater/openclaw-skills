# OpenClaw Skills Repository

A collection of specialized skills for OpenClaw agents. These skills extend the capabilities of OpenClaw with domain-specific knowledge, automation, and intelligence.

## Skills

### 1. tavily-search
**Web search and research using the Tavily API**

Perform powerful web searches with advanced filtering, detailed result analysis, and AI-synthesized answers.

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

**Location:** [`tavily-search/`](./tavily-search)

---

### 2. vibe-kingdom-openclaw
**Personal brand amplification using signal sources and authentic voice**

Transform quality technical conversations from communities into thoughtful LinkedIn posts in your authentic voice — without sounding like a bot or content marketing machine.

**Features:**
- Discovers signals from communities (Reddit, HN, Dev.to, GitHub)
- Auto-learns your voice from public signals
- Filters for non-political, business-focused content
- Generates authentic commentary that bridges conversations
- Simple workflow: discover → generate → approve → export

**Use cases:**
- Effortless thought leadership (quality over volume)
- Authentic voice consistency across posts
- Bringing peer conversations to LinkedIn
- Batching content for consistent presence
- Building credibility in your domain

**Location:** [`vibe-kingdom-openclaw/`](./vibe-kingdom-openclaw)

---

## Getting Started

### Install a Skill

1. Clone or download this repository
2. Navigate to the skill directory you want to use
3. Follow the skill's `SKILL.md` for setup and usage

### Example: Using vibe-kingdom-openclaw

```bash
cd vibe-kingdom-openclaw

# Initialize
node scripts/vibe-kingdom.js setup

# Discover signals from communities
node scripts/vibe-kingdom.js fetch-signals

# Generate draft posts
node scripts/vibe-kingdom.js generate-posts --count 5

# Review and approve
node scripts/vibe-kingdom.js list-posts --status draft
node scripts/vibe-kingdom.js set-status 1 approved

# Export for LinkedIn
node scripts/vibe-kingdom.js export-csv --outfile posts.csv
```

### Example: Using tavily-search

```bash
# Search the web with Tavily API
TAVILY_API_KEY=your-key python3 tavily-search/scripts/tavily_search.py "your query" --include-answer --max-results 10
```

---

## Requirements

- **Node.js 16+** (for vibe-kingdom-openclaw)
- **Python 3.8+** (for tavily-search)
- **API Keys:**
  - `TAVILY_API_KEY` — For web search (required for both skills)
  - Optional: `GEMINI_API_KEY`, `OPENAI_API_KEY` (for enhanced LLM features)

Set API keys as environment variables:
```bash
export TAVILY_API_KEY=your-tavily-key
export GEMINI_API_KEY=your-gemini-key
```

---

## Documentation

Each skill has:
- **SKILL.md** — Complete skill documentation, commands, and configuration
- **README.md** — Overview and philosophy
- **scripts/** — Implementation files

For detailed information on a specific skill, see its `SKILL.md`.

---

## Philosophy

These skills embody the **vibe coding** philosophy:
- Co-design with AI instead of hand-coding everything
- Focus on authenticity over automation
- Quality over volume
- Real utility, not vanity metrics

---

## Security

⚠️ **Important:**
- **Never commit API keys** to this repository
- Use environment variables for all credentials
- Store sensitive data outside version control
- Respect community guidelines when using signal sources

---

## File Structure

```
openclaw-skills/
├── README.md                  # This file
├── tavily-search/
│   ├── SKILL.md              # Skill documentation
│   ├── README.md
│   └── scripts/
│       └── tavily_search.py  # Implementation
└── vibe-kingdom-openclaw/
    ├── SKILL.md              # Skill documentation
    ├── README.md
    └── scripts/
        └── vibe-kingdom.js   # Implementation
```

---

## Support

For issues, questions, or improvements:
1. Check the skill's `SKILL.md` for troubleshooting
2. Review the skill's `README.md` for detailed usage
3. Check environment variables and API key configuration

---

## License

MIT — Use freely. Respect community guidelines and source attributions.

**Built for OpenClaw.** Authentic intelligence, amplified.

---

## What's Next?

- **Need signal discovery?** → Use `vibe-kingdom-openclaw`
- **Need web research?** → Use `tavily-search`
- **Building something new?** → These skills are foundations for extending OpenClaw

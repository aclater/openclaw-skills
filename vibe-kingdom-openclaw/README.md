# Vibe Kingdom - OpenClaw Edition

**Modern personal brand amplification using signal sources and authentic voice.**

Transform quality technical conversations from communities (Reddit, HN, Dev.to, GitHub) into thoughtful LinkedIn posts in your authentic voice — without sounding like a bot or content marketing machine.

## What It Does

1. **Discovers signals** — Monitors communities for substantive technical discussions in your domain
2. **Filters intelligently** — Finds non-political, business-focused, high-engagement content
3. **Learns your voice** — Auto-builds a Speaker Profile from your public signals
4. **Generates posts** — Creates authentic commentary that bridges communities to LinkedIn
5. **You approve** — Simple workflow: discover → generate → approve → export

## Quick Start

### Initialize
```bash
node scripts/vibe-kingdom.js setup
```

Creates config at `~/.openclaw/vibe-kingdom/`

### Discover discussions
```bash
node scripts/vibe-kingdom.js fetch-signals
```

Searches Reddit, HN, Dev.to, GitHub for your domains

### Generate posts
```bash
node scripts/vibe-kingdom.js generate-posts --count 5
```

Uses your Speaker Profile to create drafts

### Review & approve
```bash
node scripts/vibe-kingdom.js list-posts --status draft
node scripts/vibe-kingdom.js show-post 1
node scripts/vibe-kingdom.js set-status 1 approved
```

### Export
```bash
node scripts/vibe-kingdom.js export-csv --outfile posts.csv
```

Copy to LinkedIn or your scheduler.

## Why This Is Different

### Not RSS Feeds
RSS is 2005. Vibe Kingdom uses **modern signal sources**: Reddit, Hacker News, GitHub, real-time web search.

### Not Formulaic
Posts generated from your **Speaker Profile** — learned from your actual public content — not templates.

### Not Marketing
Goal is **authentic peer dialogue**, not content volume. Posts sound like genuine insights from someone who's been doing this 15 years.

### Not Scripted
Every post varies in **tone, length, opener, and angle**. No repetitive patterns.

## Signal Sources

- **Reddit** — Subreddits: r/devops, r/kubernetes, r/cybersecurity, r/netsec, r/sysadmin
- **Hacker News** — Trending posts and discussions
- **Dev.to** — Technical articles and comments
- **GitHub** — Repos, releases, discussions
- **Tavily** — Real-time web search for your domains

## Configuration

Edit `~/.openclaw/vibe-kingdom/config.json`:

```json
{
  "domains": ["cybersecurity", "kubernetes", "devops", "government IT"],
  "communities": {
    "reddit": ["r/devops", "r/kubernetes", "r/cybersecurity"],
    "hn": true,
    "devto": true,
    "github": true
  },
  "filters": {
    "minUpvotes": 10,
    "excludeKeywords": ["politics", "partisan", "inflammatory"]
  }
}
```

## Voice & Tone

Vibe Kingdom learns your voice from:
- Your published articles and talks
- LinkedIn activity
- Video interviews
- Public speaking patterns

Then generates posts that authentically reflect your:
- Expertise level
- Communication style
- Values and constraints
- Domain focus

**Example openers (vary naturally):**
- "I recently read..."
- "Been thinking about..."
- "Saw this issue come up..."
- "The good news is..."
- "We've seen teams struggle with..."

## Commands

```
setup                           Initialize configuration
fetch-signals                   Discover signals from communities
generate-posts --count N        Generate N draft posts from signals
list-posts [--status S]         View posts by status
show-post <id>                  View full post content
set-status <id> <status>        Move post: draft → approved → exported
export-csv [--outfile F]        Export approved posts for LinkedIn
rebuild-profile                 Refresh Speaker Profile
show-config                     View current configuration
```

## How It Works

### 1. Signal Discovery
Scans communities for substantive technical discussions matching your domains. Filters for engagement, quality, and relevance.

### 2. Speaker Profile
Auto-learns from your public presence:
- Tavily searches for your content
- Analysis of writing and speaking
- Tone, style, vocabulary patterns
- Values and constraints

### 3. Post Generation
For each signal:
- Analyze the discussion
- Extract the insight
- Generate using your Speaker Profile
- Pick the most authentic variation
- Present as draft

### 4. Approval Workflow
Review drafts. Approve the ones that truly sound like you. Reject the generic ones.

### 5. Export
CSV file ready for LinkedIn, Buffer, Hootsuite, or copy/paste.

## Philosophy

**"Vibe coding for thought leadership"** — Instead of hand-writing every post or using templates, you co-create with AI:

- AI discovers good conversations in your communities
- AI learns how you actually think and communicate
- You curate and approve what authentically reflects you
- Result: Consistent, authentic, effortless thought leadership

The goal is **quality over volume**. Not 10 posts a week. 2-3 authentic posts that drive real peer dialogue.

## Requirements

- Node.js 16+
- `TAVILY_API_KEY` environment variable (for signal discovery)
- Optional: `GEMINI_API_KEY` or `OPENAI_API_KEY` (for enhanced LLM generation)

## Data Storage

All data stored locally at: `~/.openclaw/vibe-kingdom/`

- `config.json` — Your configuration
- `speaker_profile.json` — Auto-built voice profile
- `signals.json` — Discovered discussions
- `posts.json` — Generated posts and statuses
- `exports/` — Exported CSVs

## Use Cases

### Effortless Thought Leadership
Generate quality posts without hand-writing them. Stay visible without the work.

### Authentic Voice
Posts that actually sound like you, not like marketing content.

### Community Engagement
Bridge Reddit, HN, Dev.to discussions to LinkedIn without looking like content repackaging.

### Consistent Presence
Generate a batch of posts monthly, approve over time, maintain consistent presence.

## Best Practices

1. **Customize your config** — Add domains and communities relevant to your actual expertise
2. **Review carefully** — Only approve posts that genuinely sound like you
3. **Vary your content** — Don't approve every post; be selective and intentional
4. **Update profile periodically** — Rebuild every 2-3 months to stay current
5. **Engage with originals** — Comment on source discussions too; don't just extract
6. **Keep it real** — If you disagree with a signal, don't approve it

## Troubleshooting

**"No signals found"**
- Check domains in config.json
- Increase `minUpvotes` threshold
- Ensure API key is valid

**"Posts don't sound like me"**
- Run `rebuild-profile` to refresh voice
- Adjust tone settings in config
- Try regenerating with different style

**"API key invalid"**
- Check `TAVILY_API_KEY` is set
- Verify key is correct

## License

MIT — Use freely. Respect community guidelines and source attributions.

## Built With

- OpenClaw — Personal automation framework
- Tavily API — Real-time web search
- Node.js — Modern, async runtime

## Philosophy & Credits

Inspired by vibe-coding philosophy: co-designing with AI instead of hand-coding everything up front.

Original vibe-kingdom project: https://github.com/aclater/vibe-kingdom

---

**Made for OpenClaw.** Your authentic voice, amplified.

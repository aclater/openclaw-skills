---
name: vibe-kingdom-openclaw
description: Personal brand amplification using modern signal sources and authentic voice. Use when you need to: discover quality technical conversations from communities (Reddit, HN, Dev.to, GitHub), auto-learn your speaking voice, generate thoughtful LinkedIn posts that bridge conversations, or build your thought leadership without sounding formulaic. Brings peer discussions into LinkedIn as authentic commentary.
---

# Vibe Kingdom - OpenClaw Edition

Modern personal brand amplification that discovers quality technical conversations and transforms them into authentic LinkedIn posts in your voice.

## Core Concept

Instead of curating RSS feeds or hand-writing posts, Vibe Kingdom:
1. **Monitors communities** — Reddit, Hacker News, Dev.to, GitHub discussions
2. **Filters intelligently** — Only substantive, business-focused, non-political content
3. **Learns your voice** — Auto-builds Speaker Profile from your public signals
4. **Generates posts** — Creates authentic commentary that bridges conversations
5. **You approve** — Simple workflow: discover → generate → approve → export to LinkedIn

The goal: **Authentic peer dialogue**, not content marketing. Posts sound like genuine insights from someone who's been doing this 15 years.

## Quick Start

### Initialize
```bash
node scripts/vibe-kingdom.js setup
```

Creates: `~/.openclaw/vibe-kingdom/`

### Discover Signals
```bash
node scripts/vibe-kingdom.js fetch-signals
```

Scans: Reddit, HN, Dev.to, GitHub, Tavily for your domain topics

### Generate Posts
```bash
node scripts/vibe-kingdom.js generate-posts --count 5
```

Uses your Speaker Profile to create draft posts

### Review
```bash
node scripts/vibe-kingdom.js list-posts --status draft
```

### Approve & Export
```bash
node scripts/vibe-kingdom.js set-status 1 approved
node scripts/vibe-kingdom.js export-csv --outfile linkedin_posts.csv
```

Copy/paste into LinkedIn or your scheduler.

---

## Configuration

### Environment Variables

Required:
- `TAVILY_API_KEY` — For web search and signal discovery

Optional:
- `GEMINI_API_KEY` — For post generation (fallback: Tavily synthesis)
- `OPENAI_API_KEY` — Alternative LLM for generation

### Setup File (~/.openclaw/vibe-kingdom/config.json)

```json
{
  "domains": [
    "cybersecurity",
    "kubernetes",
    "devops",
    "federal government IT",
    "open source"
  ],
  "communities": {
    "reddit": ["r/devops", "r/kubernetes", "r/cybersecurity", "r/netsec", "r/sysadmin"],
    "hn": true,
    "devto": true,
    "github": true
  },
  "filters": {
    "minUpvotes": 10,
    "minComments": 3,
    "excludeKeywords": ["politics", "election", "trump", "biden", "partisan"],
    "includeKeywords": ["security", "linux", "kubernetes", "devops", "cloud", "government"]
  },
  "voice": {
    "tone": "pragmatic",
    "style": "grounded_architect",
    "maxWordCount": 280,
    "varyLength": true
  }
}
```

Edit to match your domains and community preferences.

### Speaker Profile (Auto-Built)

The skill auto-builds your Speaker Profile using:
- Tavily searches for your public content
- Analysis of your published articles
- Synthesis of your speaking patterns
- Your LinkedIn presence

Stored at: `~/.openclaw/vibe-kingdom/speaker_profile.json`

Regenerate anytime:
```bash
node scripts/vibe-kingdom.js rebuild-profile
```

---

## Commands

### setup
Initialize configuration and create data directories.
```bash
node scripts/vibe-kingdom.js setup
```

### fetch-signals
Discover quality discussions from communities.
```bash
node scripts/vibe-kingdom.js fetch-signals
node scripts/vibe-kingdom.js fetch-signals --community reddit    # Specific source
node scripts/vibe-kingdom.js fetch-signals --hours 24           # Last 24 hours only
```

Scans: Reddit, HN, Dev.to, GitHub, Tavily web search

### list-signals
View discovered signals waiting for post generation.
```bash
node scripts/vibe-kingdom.js list-signals
node scripts/vibe-kingdom.js list-signals --sort upvotes        # Sort by engagement
node scripts/vibe-kingdom.js list-signals --filter domain:kubernetes
```

### generate-posts
Create draft posts from signals using your Speaker Profile.
```bash
node scripts/vibe-kingdom.js generate-posts --count 5
node scripts/vibe-kingdom.js generate-posts --signal-id 1,3,5   # From specific signals
```

### list-posts
View posts by status.
```bash
node scripts/vibe-kingdom.js list-posts --status draft
node scripts/vibe-kingdom.js list-posts --status approved
node scripts/vibe-kingdom.js list-posts                         # All
```

### show-post
View full post content.
```bash
node scripts/vibe-kingdom.js show-post 1
```

### set-status
Move post between statuses: draft → approved → exported
```bash
node scripts/vibe-kingdom.js set-status 1 approved
node scripts/vibe-kingdom.js set-status 2 exported
```

### regenerate-post
Recreate a post (different angle, tone, length).
```bash
node scripts/vibe-kingdom.js regenerate-post 1
node scripts/vibe-kingdom.js regenerate-post 1 --style shorter
```

### export-csv
Export approved posts for LinkedIn scheduling.
```bash
node scripts/vibe-kingdom.js export-csv --outfile posts.csv
```

Output: CSV with columns: post_id, content, signal_source, approved_date

### rebuild-profile
Rebuild your Speaker Profile from scratch (refreshes voice understanding).
```bash
node scripts/vibe-kingdom.js rebuild-profile
```

### show-config
Display current configuration.
```bash
node scripts/vibe-kingdom.js show-config
```

---

## How It Works

### 1. Signal Discovery
Monitors communities for:
- **Reddit**: Threads in subscribed subreddits with meaningful discussion
- **Hacker News**: Posts matching your domains with substantive comments
- **Dev.to**: Articles and discussions relevant to your expertise
- **GitHub**: Trending repos, releases, discussions in your space
- **Tavily**: Web search for trending topics in your domains

**Quality Filters:**
- Minimum engagement (upvotes, comments, stars)
- Excludes inflammatory/political language
- Filters for substantive technical content
- Matches your domain keywords

### 2. Speaker Profile Learning
Auto-analyzes your public presence:
- Tavily searches: "Adam Clater articles", "Adam Clater Red Hat", etc.
- Published writing: tone, phrasing, favorite metaphors
- Speaking patterns: from videos and interviews
- LinkedIn activity: engagement style
- Values: what you actually care about

Generates: Detailed voice profile (tone, style, vocabulary, structure)

### 3. Post Generation
For each signal:
1. Analyze the discussion/content
2. Identify the insight relevant to your audience
3. Generate 3-5 variations using your Speaker Profile
4. Pick the most authentic-sounding
5. Present as draft

**Generation Goals:**
- Authentic voice (passes the "would Adam say this?" test)
- Natural openers ("I recently read...", "Been thinking about...")
- Varied length and structure
- No formulaic patterns
- Bridges the gap between community and LinkedIn
- Adds original insight, not just summarization

### 4. Approval Workflow
Review drafts:
- Does this sound like you?
- Does it add value to your network?
- Is it truly non-inflammatory?
- Approved → Ready to export

### 5. Export
CSV file ready for:
- Copy/paste into LinkedIn
- Buffer, Hootsuite, or other schedulers
- Your content calendar

---

## Philosophy

**"Vibe coding for thought leadership"** — Instead of hand-writing posts or using templates, you co-create with AI:

- AI discovers the good conversations
- AI learns how you actually think
- You approve what sounds authentically like you
- Result: Consistent, authentic, effortless thought leadership

The goal is **not** volume. It's quality peer dialogue that genuinely reflects your expertise and values.

---

## Signal Sources in Detail

### Reddit
- Scans configured subreddits
- Filters by engagement and relevance
- Extracts discussion threads with meaningful comments
- Captures: title, top comments, engagement metrics

### Hacker News
- Searches for posts matching your domains
- Finds substantive discussion threads
- Extracts: title, top comments, points, engagement

### Dev.to
- Searches for articles in your expertise areas
- Finds discussions and comments
- Extracts: article content, comments, engagement

### GitHub
- Monitors trending repos in your space
- Follows releases and major discussions
- Extracts: project info, discussion threads

### Tavily Web Search
- Real-time search for your domain keywords
- Finds trending articles, news, discussions
- Extracts: title, summary, source, relevance score

---

## Use Cases

### Stay Current Without Effort
Spend 5 minutes approving posts instead of 30 minutes writing them. The skill finds the important conversations.

### Authentic Thought Leadership
Posts that actually reflect how you think, sourced from communities where real technical discussion happens.

### Bridge Communities to LinkedIn
Bring peer-to-peer technical dialogue to LinkedIn without it feeling like content repurposing.

### Consistent Voice
Speaker Profile ensures all posts maintain your tone, values, and expertise level.

### Batch Workflow
Generate 20 posts in one session, approve over the next few weeks, maintain consistent presence.

---

## Best Practices

1. **Customize domains** — Edit config.json with topics actually relevant to you
2. **Review carefully** — Approval is your quality gate; only post what truly sounds like you
3. **Vary your activity** — Don't approve every generated post; be selective
4. **Update profile regularly** — Every 2-3 months: `rebuild-profile`
5. **Check for tone drift** — If posts start feeling generic, regenerate with different style
6. **Engage with originals** — Comment on original Reddit/HN posts too; don't just extract
7. **Keep it real** — If you disagree with a signal, don't approve it; authenticity matters

---

## Data Storage

All data persists at: `~/.openclaw/vibe-kingdom/`

- `config.json` — Your configuration
- `speaker_profile.json` — Auto-built voice profile
- `signals.json` — Discovered discussions/articles
- `posts.json` — Generated posts and their statuses
- `exports/` — Exported CSVs

Keep it private; contains your draft thoughts and voice profile.

---

## Security & Privacy

- **No hardcoded keys** — Uses environment variables only
- **Local storage** — Everything stored locally, not in cloud
- **Privacy-first** — Your posts are yours until you export
- **Community respect** — We link back to sources, don't spam

---

## Troubleshooting

**"No signals found"**: 
- Check domains in config.json match your actual expertise
- Increase `minUpvotes` threshold in filters
- Run `fetch-signals --hours 48` to get more historical data

**"Posts don't sound like me"**:
- Run `rebuild-profile` to refresh voice understanding
- Try `regenerate-post ID --style shorter/longer/more_casual`
- Update speaker profile tone settings in config.json

**"API key invalid"**:
- Cloud (Tavily): Check TAVILY_API_KEY is set correctly
- Generation: Check GEMINI_API_KEY or OPENAI_API_KEY

**"Too many false positives in signals"**:
- Adjust `includeKeywords` and `excludeKeywords` in config.json
- Increase `minUpvotes` threshold
- Refine domain list to be more specific

---

## License

MIT - Use freely, but respect community guidelines and source attributions.

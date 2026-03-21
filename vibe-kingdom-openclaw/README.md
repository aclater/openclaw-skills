# Vibe Kingdom — OpenClaw Edition

Personal brand amplification for LinkedIn. Discovers quality technical discussions from Reddit, Hacker News, Dev.to, GitHub, Mastodon, and Lobste.rs, generates authentic posts in your voice, and schedules approved posts to Buffer.

## How It Works

1. **Cron** — OpenClaw wakes the vibe-kingdom agent Monday and Thursday at 8am
2. **Fetch** — agent runs `fetch-signals` to pull fresh discussions from communities
3. **Generate** — agent runs `generate-posts` to draft LinkedIn posts from signals
4. **Review** — you open the vibe-kingdom session in OpenClaw and review drafts
5. **Approve** — say "approve 3" or "approve all" in the session
6. **Publish** — approved posts go straight to Buffer, scheduled Tue/Wed/Fri 4–5pm

---

## Required API Keys

Set these in OpenClaw's environment/secrets UI — **not** in any config file.

| Key | Where to get it |
|-----|----------------|
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) → API Keys |
| `TAVILY_API_KEY` | [app.tavily.com](https://app.tavily.com) → API |
| `BUFFER_ACCESS_TOKEN` | Buffer → Settings → Apps & API → Access Token (OAuth Bearer token) |
| `BUFFER_CHANNEL_ID` | One or more Buffer channel IDs, comma-separated. Get each ID from the URL at publish.buffer.com/channels/**ID**/settings. Example: `LINKEDIN_ID,BLUESKY_ID` |

---

## One-Time Setup in OpenClaw

### 1. Install the skill

In the OpenClaw Skills UI, add this repository. The skill script is at:
```
scripts/vibe-kingdom.js
```

### 2. Create the agent

In OpenClaw → AI Agents, create a new agent:

**Name:** `vibe-kingdom`

**Tool command:**
```
node ~/.openclaw/skills/vibe-kingdom-openclaw/scripts/vibe-kingdom.js
```

**System prompt:**
```
You are the Vibe Kingdom content pipeline. Your job is to fetch technical
signals, generate LinkedIn draft posts, and help review and publish them to
Buffer.

When presenting draft posts: list them numerically with ID, source, and first
40 words. Keep it scannable.

Accept approval commands:
- "approve <id>" — approve a single post and queue to Buffer
- "approve all" — approve all remaining drafts (calls approve-all command)
- "reject <id>" — reject a post
- "show <id>" — show full post content

After each approval, confirm the Buffer scheduled time. After reviewing all
posts, summarise what was queued and what was rejected.

Stay focused on the content pipeline. Do not engage in general conversation.
```

**Required env vars** (set in agent tool env or OpenClaw global env):
- `ANTHROPIC_API_KEY`
- `TAVILY_API_KEY`
- `BUFFER_ACCESS_TOKEN`
- `BUFFER_CHANNEL_ID`

### 3. Create the cron job

In OpenClaw → Cron, create a new job:

| Field | Value |
|-------|-------|
| Name | `vibe-kingdom-fetch` |
| Schedule | `0 8 * * 1,4` (Monday and Thursday at 8am) |
| Agent | `vibe-kingdom` |
| Session | Isolated |
| Prompt | `Fetch new signals and generate 5 draft posts. Present them for review.` |

If OpenClaw supports result delivery to your main chat timeline, enable it so you get a notification when new posts are ready.

---

## Commands

```bash
node scripts/vibe-kingdom.js fetch-signals              # Discover signals from communities
node scripts/vibe-kingdom.js generate-posts [--count N] # Generate N draft posts
node scripts/vibe-kingdom.js list-posts [--status S]    # List posts (draft/approved/rejected)
node scripts/vibe-kingdom.js show-post <id>             # View full post content
node scripts/vibe-kingdom.js approve <id>               # Approve + queue to Buffer
node scripts/vibe-kingdom.js approve-all                # Approve all drafts
node scripts/vibe-kingdom.js reject <id>                # Reject a draft
node scripts/vibe-kingdom.js buffer-push <id>           # Push a specific post to Buffer
node scripts/vibe-kingdom.js set-status <id> <status>   # Update status only (no Buffer push)
node scripts/vibe-kingdom.js regenerate-post <id>       # Regenerate with new angle
node scripts/vibe-kingdom.js rebuild-profile            # Refresh Speaker Profile
```

**Dry-run mode** (computes slots, no actual Buffer API call):
```bash
BUFFER_DRY_RUN=1 node scripts/vibe-kingdom.js approve 1
BUFFER_DRY_RUN=1 node scripts/vibe-kingdom.js approve-all
```

---

## Configuration

Edit `~/.openclaw/vibe-kingdom/config.json` to customise domains, communities, and Buffer schedule:

```json
{
  "domains": ["cybersecurity", "kubernetes", "devops", "federal government IT", "open source"],
  "communities": {
    "reddit": ["r/devops", "r/kubernetes", "r/cybersecurity", "r/netsec", "r/sysadmin"],
    "hn": true,
    "devto": true,
    "github": true
  },
  "buffer": {
    "timezone": "America/New_York",
    "schedule": {
      "days": ["tuesday", "wednesday", "friday"],
      "windowStart": "16:00",
      "windowEnd": "17:00",
      "slotIntervalMinutes": 15
    }
  }
}
```

---

## Data Storage

All data at `~/.openclaw/vibe-kingdom/`:

| File | Contents |
|------|----------|
| `config.json` | Your configuration |
| `speaker_profile.json` | Auto-built voice profile |
| `signals.json` | Discovered discussions |
| `posts.json` | Posts and their statuses, including `scheduled_at` and `buffer_update_id` |

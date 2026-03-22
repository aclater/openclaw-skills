---
name: vibe-kingdom-openclaw
description: "LinkedIn and Bluesky content pipeline. Requires Node.js (runs scripts/vibe-kingdom.js) and four environment variables: ANTHROPIC_API_KEY (Claude API — generates posts and speaker profile), TAVILY_API_KEY (Tavily web search API — fetches signals from Reddit, Hacker News, Dev.to, GitHub, and Lobste.rs), BUFFER_ACCESS_TOKEN (Buffer OAuth bearer token — schedules posts), and BUFFER_CHANNEL_ID (comma-separated Buffer channel IDs for LinkedIn and/or Bluesky). Persists all data to ~/.openclaw/vibe-kingdom/ (config.json, speaker_profile.json, signals.json, posts.json). Two-stage workflow: approve posts first, then push to Buffer separately. Generates channel-specific content — full LinkedIn post and a separate Bluesky version (≤300 chars). Schedules to Buffer on Tue/Wed/Fri 4–5pm in configurable timezone. Use when you need to: fetch new signals, generate draft posts, review and approve posts, push approved posts to Buffer, regenerate a post, or rebuild the speaker profile."
---

# Vibe Kingdom — LinkedIn Content Pipeline

Automated LinkedIn content from the communities you follow. Fetches signals, generates posts in your voice, and schedules to Buffer when you're ready to publish.

## Two-Stage Workflow

Approval and publishing are separate steps:

1. **Approve** — mark posts as approved after review (`approve <id>`, `approve-all`)
2. **Push** — queue approved posts to Buffer when ready (`push <id>`)

## Commands

```bash
node scripts/vibe-kingdom.js fetch-signals              # Discover signals from communities
node scripts/vibe-kingdom.js generate-posts [--count N] # Generate N draft posts (default 5)
node scripts/vibe-kingdom.js list-posts [--status S]    # List posts with scheduled times
node scripts/vibe-kingdom.js show-post <id>             # View full post content
node scripts/vibe-kingdom.js approve <id>               # Mark post as approved (no Buffer push)
node scripts/vibe-kingdom.js approve-all [--count N]    # Mark up to N drafts approved (default 3)
node scripts/vibe-kingdom.js reject <id>                # Reject a draft
node scripts/vibe-kingdom.js push <id>           # Push approved post to Buffer
node scripts/vibe-kingdom.js set-status <id> <status>   # Update status only (no Buffer push)
node scripts/vibe-kingdom.js regenerate-post <id>       # Regenerate with new angle
node scripts/vibe-kingdom.js rebuild-profile            # Refresh Speaker Profile
node scripts/vibe-kingdom.js show-config                # Show configuration
```

## Required Environment Variables

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | Post generation and speaker profile |
| `TAVILY_API_KEY` | Web search signals (optional but recommended) |
| `BUFFER_ACCESS_TOKEN` | Buffer OAuth Bearer token |
| `BUFFER_CHANNEL_ID` | Buffer channel ID(s), comma-separated for multi-channel |

## Agent Setup

See `README.md` for the one-time agent and cron job setup in OpenClaw.

## Data Storage

All data at `~/.openclaw/vibe-kingdom/` — config, speaker profile, signals, and posts.

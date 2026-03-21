# Vibe Kingdom — OpenClaw-Native Workflow Design

**Date:** 2026-03-21
**Status:** Approved (updated 2026-03-21)

## Problem

The current workflow writes generated posts to a local CSV file for manual copy/paste into LinkedIn. This requires leaving the terminal, opening a file, and manually scheduling. There is no review UI.

## Goal

Replace the CSV export step with an end-to-end workflow inside OpenClaw: a dedicated vibe-kingdom agent runs fetch/generate on a cron schedule, presents draft posts conversationally, accepts approvals, and pushes approved posts directly to Buffer for LinkedIn and Bluesky scheduling.

---

## Deployment Model

All skill code lives in this git repository. OpenClaw pulls the skill into the container's own home directory (`/home/openclaw/`). No bind mounts from outside the container are required or permitted. The script runs as the `openclaw` user inside the container, so `os.homedir()` resolves to `/home/openclaw/` — the existing default data path `~/.openclaw/vibe-kingdom/` is correct as-is and requires no override.

**What this skill does NOT touch in openclaw:**
- Does not modify `openclaw.json` programmatically
- Does not modify the quadlet unit file
- Does not set up the agent definition or cron job automatically

The agent definition and cron job are one-time manual setup steps the user performs through the OpenClaw UI. They are documented in detail in `README.md`. The only required direct configuration is populating four API keys, which are documented prominently in the README.

---

## Architecture

### 1. vibe-kingdom.js — Tool Library

The script remains CLI-runnable. The existing `set-status <id> <status>` command is **retained for manual/backward-compatible use only** — it does NOT trigger a Buffer push regardless of the status value set. Approval and publishing are deliberately separated into two stages:

| Command | Behaviour |
|---|---|
| `fetch-signals` | Discovers signals from configured communities |
| `generate-posts [--count N]` | Generates N draft posts (default 5), skipping any signal where the LLM returns an error |
| `list-posts [--status S]` | Lists posts with ID, status, source, preview, and scheduled time |
| `show-post <id>` | Shows full post content, scheduled time, and Buffer IDs |
| `set-status <id> <status>` | Updates status only, no Buffer push |
| `approve <id>` | Marks post approved — does NOT push to Buffer |
| `approve-all [--count N]` | Marks up to N drafts approved ascending by post ID (default 3) — does NOT push to Buffer |
| `reject <id>` | Marks post rejected in posts.json, no Buffer push |
| `push <id>` | Pushes a single approved post to Buffer at the next available slot |
| `regenerate-post <id>` | Regenerates post content from original signal; exits with error if LLM fails |

**Data path:** `DATA_DIR` defaults to `~/.openclaw/vibe-kingdom/` via `os.homedir()`. No env var override is needed.

**Buffer integration (`push`):**
- API: GraphQL at `POST https://api.buffer.com/` (root path)
- Mutation: `createPost(input: CreatePostInput!)` returning `PostActionPayload` union
- Auth: `Bearer ${BUFFER_ACCESS_TOKEN}` header
- Channel targeting: `BUFFER_CHANNEL_ID` env var — comma-separated list for multi-channel (e.g. `LINKEDIN_ID,BLUESKY_ID`). One API call is made per channel at the same computed slot.
- Scheduling: compute next available slot using `nextBufferSlot()`, pass as `dueAt` in ISO 8601
- Mode: `customScheduled`, `schedulingType: automatic`
- On success: update post record with `scheduled_at` and `buffer_update_ids` array (one entry per channel)

**Slot scheduling algorithm (`nextBufferSlot`):**

Ensures no two posts share the same scheduled time:

1. Load all posts where `scheduled_at` is set (already queued)
2. Build a set of occupied timestamps
3. Iterate through future Tue/Wed/Fri windows starting from now
4. For each window (4:00–5:00pm), try slots at :00, :15, :30, :45 past the hour
5. Return the first slot not in the occupied set
6. Timezone: read from `config.buffer.timezone` (default `America/New_York`)

Pushing three posts in a row will schedule them at e.g. Tue 4:00pm, Tue 4:15pm, Tue 4:30pm — spilling across days if the window fills up.

**LLM error handling:**

`generatePostFromSignal` throws (rather than returning error text) if:
- The response starts with `{` or `[` (JSON error payload)
- The response contains `"type":"error"` (API error shape)
- The response is under 50 characters

`generate-posts` skips failed signals with a `SKIPPED` notice — no error text is ever saved to posts.json. `regenerate-post` exits with the error message rather than overwriting the existing post.

---

### 2. OpenClaw Vibe Kingdom Agent (manual setup, documented in README)

The user creates a dedicated agent in the OpenClaw UI with the following configuration. This is a one-time step; the README provides copy-paste values.

**Tool command** (path assumes OpenClaw pulls skills to `~/.openclaw/skills/`; adjust if your OpenClaw uses a different skills directory):
```
node ~/.openclaw/skills/vibe-kingdom-openclaw/scripts/vibe-kingdom.js
```

**Required env vars** (set in agent tool env or OpenClaw global env — see README):
- `ANTHROPIC_API_KEY`
- `TAVILY_API_KEY`
- `BUFFER_ACCESS_TOKEN`
- `BUFFER_CHANNEL_ID`

**System prompt:**
```
You are the Vibe Kingdom content pipeline. Your job is to fetch technical
signals, generate LinkedIn draft posts, and help review and publish them to
Buffer.

When presenting draft posts: list them numerically with ID, source, and first
40 words. Keep it scannable.

Two-stage workflow — approval and publishing are separate steps:

Stage 1 — Review and approve:
- "approve <id>" — mark a single post as approved (does NOT push to Buffer)
- "approve all" — mark all drafts as approved (calls approve-all command)
- "reject <id>" — reject a post
- "show <id>" — show full post content

Stage 2 — Push to Buffer:
- "push <id>" — push an approved post to Buffer (calls push command)
- "push all approved" — push all approved posts to Buffer one by one

After each Buffer push, confirm the scheduled time. After reviewing all
posts, summarise what was approved, what was rejected, and what was queued
to Buffer.

Stay focused on the content pipeline. Do not engage in general conversation.
```

---

### 3. OpenClaw Cron Job (manual setup, documented in README)

The user creates a cron job in the OpenClaw UI:

- **Name:** `vibe-kingdom-fetch`
- **Schedule:** `0 8 * * 1,4` — Monday and Thursday at 8am
- **Agent:** `vibe-kingdom`
- **Session:** isolated
- **Prompt:** `Fetch new signals and generate 5 draft posts. Present them for review.`

If OpenClaw supports delivery of cron run summaries to the main chat timeline, enable it so the user is notified when new posts are ready. This is optional — if not supported, the user opens the vibe-kingdom session manually.

---

### 4. Data Flow

```
Cron fires (Mon/Thu 8am)
  → OpenClaw wakes vibe-kingdom agent (isolated session)
  → agent calls: vibe-kingdom.js fetch-signals
  → agent calls: vibe-kingdom.js generate-posts --count 5
    → each signal generates a post; failed LLM responses are skipped (not saved)
  → agent calls: vibe-kingdom.js list-posts --status draft
  → agent presents posts in session (numbered, scannable)

User opens vibe-kingdom session
  → reviews posts, says "approve 3"
  → agent calls: vibe-kingdom.js approve 3
    → posts.json updated (status: approved)
    → agent confirms: "Post 3 approved — say 'push 3' to queue to Buffer"

  → user says "approve all"
  → agent calls: vibe-kingdom.js approve-all [--count N]
    → up to N drafts marked approved sequentially (ascending by post ID, default 3)
    → agent lists approved post IDs and prompts user to push when ready

  → user says "push 3" (or "push all approved")
  → agent calls: vibe-kingdom.js push 3
    → nextBufferSlot() computes next available Tue/Wed/Fri 4–5pm slot
    → Buffer GraphQL API called for each channel in BUFFER_CHANNEL_ID
    → post record updated with scheduled_at + buffer_update_ids
    → agent confirms: "Post 3 queued for Wednesday 4:15pm"
```

---

## Configuration

`~/.openclaw/vibe-kingdom/config.json`:

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

## What Changes in vibe-kingdom.js

### Approval and Buffer commands
1. Add `approve <id>` command: update status to `approved` only — does NOT push to Buffer
2. Add `approve-all [--count N]` command: load up to N drafts sorted ascending by post ID, mark each approved — does NOT push to Buffer
3. Add `reject <id>` command: update status to `rejected`
4. Add `push <id>` command: call `nextBufferSlot()`, POST to Buffer GraphQL API for each channel, update post record
5. Add `nextBufferSlot(config)` function: iterate Tue/Wed/Fri 4–5pm windows, avoid occupied timestamps
6. Load Buffer config from `config.buffer` block
7. `set-status` unchanged — does not trigger Buffer

### Post generation improvements

**A. Include source URL in every post.**
The signal's URL is already passed in the user prompt (`URL: ${signal.url}`). Add an explicit instruction: *"End every post with the source URL on its own line. No label, just the URL."*

**B. Token limit.** `callClaude(..., 1024)` in `generatePostFromSignal` for post generation calls.

**C. Opener variety.** Remove the `Openers:` line from the system prompt. Replace with: *"Vary openers naturally — sometimes lead with a direct observation, sometimes with a question, sometimes mid-story. Never open with 'Been thinking about'. Never start two posts with the same phrase."*

**D. Structural guidance.** Add to the system prompt:
- *"A good post has 2–4 short paragraphs. First: one concrete observation or hook. Middle: the insight or tension. End: what it means for practitioners, or a question that invites response."*
- *"Plain text only. No bullet lists. No headers. No hashtags. No emojis."*

**E. LLM error handling.** `generatePostFromSignal` throws if the response looks like an error payload, is JSON, or is under 50 characters. `generate-posts` skips failed signals rather than saving error text to posts.json.

---

## What's in README.md

The README documents the following clearly, as these are the only manual steps required of the user:

1. **Prerequisites** — Node.js, an OpenClaw instance with this skill installed
2. **Required API keys** — with links to where to obtain each:
   - `ANTHROPIC_API_KEY` — [console.anthropic.com](https://console.anthropic.com)
   - `TAVILY_API_KEY` — [app.tavily.com](https://app.tavily.com)
   - `BUFFER_ACCESS_TOKEN` — Buffer → Settings → Apps & API → Access Token
   - `BUFFER_CHANNEL_ID` — comma-separated Buffer channel IDs (LinkedIn, Bluesky, etc.)
3. **Where to set the keys** — in OpenClaw's environment/secrets UI (not in the skill config files)
4. **One-time agent setup** — copy-paste values for agent name, tool command, system prompt, and env vars
5. **One-time cron setup** — copy-paste values for the cron job

---

## Out of Scope

- LinkedIn direct API (Buffer handles this)
- Post editing in OpenClaw (use `regenerate-post` if needed)
- Analytics/engagement tracking
- Automatic openclaw.json configuration (user sets up agent and cron manually via UI)

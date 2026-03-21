# Vibe Kingdom — OpenClaw-Native Workflow Design

**Date:** 2026-03-21
**Status:** Approved

## Problem

The current workflow writes generated posts to a local CSV file for manual copy/paste into LinkedIn. This requires leaving the terminal, opening a file, and manually scheduling. There is no review UI.

## Goal

Replace the CSV export step with an end-to-end workflow inside OpenClaw: a dedicated vibe-kingdom agent runs fetch/generate on a cron schedule, presents draft posts conversationally, accepts approvals, and pushes approved posts directly to Buffer for LinkedIn scheduling.

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

The script remains CLI-runnable. The existing `set-status <id> <status>` command is **retained for manual/backward-compatible use only** — it does NOT trigger a Buffer push regardless of the status value set. New dedicated commands are the primary approval mechanism:

| Command | Behaviour |
|---|---|
| `fetch-signals` | Existing — discovers signals from communities |
| `generate-posts [--count N]` | Existing — generates N draft posts |
| `list-posts [--status S]` | Existing — lists posts with ID, status, source, preview |
| `show-post <id>` | Existing — shows full post content |
| `set-status <id> <status>` | Existing — updates status only, no Buffer push |
| `approve <id>` | **New** — marks post approved, calls `bufferPush(id)` internally |
| `approve-all` | **New** — approves all draft posts sequentially (ascending by post ID), each gets its own Buffer slot |
| `reject <id>` | **New** — marks post rejected in posts.json, no Buffer push |
| `buffer-push <id>` | **New** — pushes a single post to Buffer at next available slot (also called by `approve`) |

**Data path:** `DATA_DIR` defaults to `~/.openclaw/vibe-kingdom/` via `os.homedir()`. No env var override is needed or introduced — `os.homedir()` returns the correct path whether the script is run by the openclaw container user or a developer on their local machine.

**Buffer integration (`buffer-push`):**
- Verify current endpoint before implementation; historically `POST https://api.bufferapp.com/1/updates/create.json` — check Buffer's developer docs for the current publishing endpoint before coding.
- Auth: `BUFFER_ACCESS_TOKEN` env var
- Target profile: `BUFFER_PROFILE_ID` env var (LinkedIn profile ID in Buffer)
- Scheduling: compute next available slot using `nextBufferSlot()` (see below), pass as `scheduled_at` in ISO 8601
- On success: update post record with `buffer_update_id` and `scheduled_at`

**Slot scheduling algorithm (`nextBufferSlot`):**

Ensures no two posts share the same scheduled time:

1. Load all posts where `scheduled_at` is set (already queued)
2. Build a set of occupied timestamps
3. Iterate through future Tue/Wed/Fri windows starting from now
4. For each window (4:00–5:00pm), try slots at :00, :15, :30, :45 past the hour
5. Return the first slot not in the occupied set
6. Timezone: read from `config.buffer.timezone` (default `America/New_York`)

Approving three posts in a row will schedule them at e.g. Tue 4:00pm, Tue 4:15pm, Tue 4:30pm — spilling across days if the window fills up.

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
- `BUFFER_PROFILE_ID`

**System prompt:**
```
You are the Vibe Kingdom content pipeline. Your job is to fetch technical
signals, generate LinkedIn draft posts, and help review and publish them to
Buffer.

When presenting draft posts: list them numerically with ID, source, and first
40 words. Keep it scannable.

Accept approval commands:
- "approve <id>" — approve a single post and queue to Buffer
- "approve all" — natural-language trigger; call the approve-all command
  (do NOT create a space-separated CLI branch)
- "reject <id>" — reject a post
- "show <id>" — show full post content

After each approval, confirm the Buffer scheduled time. After reviewing all
posts, summarise what was queued and what was rejected.

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
  → agent calls: vibe-kingdom.js list-posts --status draft
  → agent presents posts in session (numbered, scannable)

User opens vibe-kingdom session
  → reviews posts, says "approve 3"
  → agent calls: vibe-kingdom.js approve 3
    → posts.json updated (status: approved)
    → nextBufferSlot() computes next available Tue/Wed/Fri 4–5pm slot
    → Buffer API called, scheduled_at = computed slot
    → post record updated with buffer_update_id + scheduled_at
    → agent confirms: "Post 3 queued for Wednesday 4:15pm"

  → user says "approve all"
  → agent calls: vibe-kingdom.js approve-all
    → each remaining draft approved sequentially (ascending by post ID)
    → each gets its own Buffer slot (no collisions)
    → agent confirms all scheduled times
```

---

## Configuration

New keys added to `~/.openclaw/vibe-kingdom/config.json`:

```json
{
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
1. Add `approve <id>` command: update status to `approved`, call `bufferPush(id)`
2. Add `approve-all` command: load all drafts sorted ascending by post ID, call `approve` on each sequentially
3. Add `reject <id>` command: update status to `rejected`
4. Add `bufferPush(id)` function: call `nextBufferSlot()`, POST to Buffer API, update post record
5. Add `nextBufferSlot(config)` function: iterate Tue/Wed/Fri 4–5pm windows, avoid occupied timestamps
6. Load Buffer config from `config.buffer` block
7. `set-status` unchanged — does not trigger Buffer

### Post generation improvements

**A. Include source URL in every post.**
The signal's URL is already passed in the user prompt (`URL: ${signal.url}`). Add an explicit instruction: *"End every post with the source URL on its own line. No label, just the URL."* This gives readers context and drives traffic to the original discussion.

**B. Token limit too low.** `callClaude(..., 512)` in `generatePostFromSignal` truncates posts mid-thought. Change to **1024 tokens** for post generation calls.

**C. Opener repetition.** The system prompt passes `Openers: ${profile.openers.join(' | ')}`, causing Claude to default to the first item ("Been thinking about..."). The API error fallback also always uses `openers[0]`. Fix:
- Remove the `Openers:` line from the system prompt entirely
- Replace with: *"Vary openers naturally — sometimes lead with a direct observation, sometimes with a question, sometimes mid-story. Never open with 'Been thinking about'. Never start two posts with the same phrase."*
- Remove `openers[0]` from the error fallback; surface the error message cleanly instead

**D. No structural guidance.** Posts come out as one dense block or a single truncated sentence. Add to the system prompt:
- *"A good post has 2–4 short paragraphs. First: one concrete observation or hook. Middle: the insight or tension — what's actually hard about this. End: what it means for practitioners, or a question that invites response."*
- *"Vary length naturally: some posts are 80 words and direct, some are 200–250 words and walk through reasoning."*
- *"Plain text only. No bullet lists. No headers. No hashtags. No emojis. Write the way a senior engineer talks to a peer, not the way a marketer writes content."*

---

## What's in README.md

The README must document the following clearly, as these are the only manual steps required of the user:

1. **Prerequisites** — Node.js, an OpenClaw instance with this skill installed
2. **Required API keys** — with links to where to obtain each:
   - `ANTHROPIC_API_KEY` — [console.anthropic.com](https://console.anthropic.com)
   - `TAVILY_API_KEY` — [app.tavily.com](https://app.tavily.com)
   - `BUFFER_ACCESS_TOKEN` — Buffer app settings → Developer → Access Token
   - `BUFFER_PROFILE_ID` — Buffer profile ID for your LinkedIn account
3. **Where to set the keys** — in OpenClaw's environment/secrets UI (not in the skill config files)
4. **One-time agent setup** — copy-paste values for agent name, tool command, system prompt, and env vars
5. **One-time cron setup** — copy-paste values for the cron job

---

## Out of Scope

- LinkedIn direct API (Buffer handles this)
- Post editing in OpenClaw (use `regenerate-post` CLI if needed)
- Multi-platform posting (LinkedIn only for now)
- Analytics/engagement tracking
- Automatic openclaw.json configuration (user sets up agent and cron manually via UI)

# Vibe Kingdom — OpenClaw-Native Workflow Design

**Date:** 2026-03-21
**Status:** Approved

## Problem

The current workflow writes generated posts to a local CSV file for manual copy/paste into LinkedIn. This requires leaving the terminal, opening a file, and manually scheduling. There is no review UI.

## Goal

Replace the CSV export step with an end-to-end workflow inside OpenClaw: a dedicated vibe-kingdom agent runs fetch/generate on a cron schedule, presents draft posts conversationally, accepts approvals, and pushes approved posts directly to Buffer for LinkedIn scheduling.

---

## Architecture

### 1. vibe-kingdom.js — Tool Library

The script remains CLI-runnable. The existing `set-status <id> <status>` command is **retained for manual/backward-compatible use only** — it does NOT trigger a Buffer push regardless of the status value set. Two new dedicated commands replace `set-status` as the primary approval mechanism:

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

**Buffer integration (`buffer-push`):**
- Verify current endpoint before implementation; Buffer has historically served `POST https://api.bufferapp.com/1/updates/create.json` but may have migrated to `https://api.buffer.com/` — check Buffer's developer docs for the current publishing endpoint.
- Auth: `BUFFER_ACCESS_TOKEN` env var (personal access token)
- Target profile: `BUFFER_PROFILE_ID` env var (LinkedIn profile ID in Buffer)
- Scheduling: compute next available slot using `nextBufferSlot()` (see below), pass as `scheduled_at` in ISO 8601
- On success: update post record with `buffer_update_id` and `scheduled_at`

**Slot scheduling algorithm (`nextBufferSlot`):**

The function must ensure no two posts share the same scheduled time. Algorithm:

1. Load all posts where `scheduled_at` is set (already queued)
2. Build a set of occupied timestamps
3. Iterate through future Tue/Wed/Fri windows starting from now
4. For each window (4:00–5:00pm), try slots at :00, :15, :30, :45 past the hour
5. Return the first slot not in the occupied set
6. Timezone: read from `config.buffer.timezone` (default `America/New_York`)

This means approving three posts in a row will schedule them at e.g. Tue 4:00pm, Tue 4:15pm, Tue 4:30pm — or spill across days if the window fills up.

**Data path:**

`DATA_DIR` must be configurable via a `VIBE_KINGDOM_DATA_DIR` environment variable so the path is not hardcoded to the invoking user's home directory. Default fallback is `~/.openclaw/vibe-kingdom/` (resolved via `os.homedir()` at runtime). The OpenClaw agent tool definition must explicitly set `VIBE_KINGDOM_DATA_DIR=/home/aclater/.openclaw/vibe-kingdom` to ensure the correct user's data is used regardless of which OS user OpenClaw runs as.

---

### 2. OpenClaw Vibe Kingdom Agent

A dedicated agent entry in `~/.openclaw/openclaw.json`:

```json
{
  "agents": {
    "vibe-kingdom": {
      "name": "Vibe Kingdom",
      "description": "LinkedIn content pipeline — fetch signals, review draft posts, approve to Buffer",
      "tools": [
        {
          "type": "shell",
          "command": "node /home/aclater/openclaw-skills/vibe-kingdom-openclaw/scripts/vibe-kingdom.js",
          "env": {
            "VIBE_KINGDOM_DATA_DIR": "/home/aclater/.openclaw/vibe-kingdom",
            "ANTHROPIC_API_KEY": "ENV:ANTHROPIC_API_KEY",
            "TAVILY_API_KEY": "ENV:TAVILY_API_KEY",
            "BUFFER_ACCESS_TOKEN": "ENV:BUFFER_ACCESS_TOKEN",
            "BUFFER_PROFILE_ID": "ENV:BUFFER_PROFILE_ID"
          }
        }
      ],
      "systemPrompt": "You are the Vibe Kingdom content pipeline for Adam Clater. Your job is to fetch technical signals, generate LinkedIn draft posts in Adam's voice, and help him review and publish them to Buffer.\n\nWhen presenting draft posts: list them numerically with ID, source, and first 40 words. Keep it scannable.\n\nAccept approval commands:\n- 'approve <id>' — approve a single post and queue to Buffer\n- 'approve all' — natural-language trigger; map to the approve-all CLI command (the CLI does not accept a space-separated form — do NOT create one)\n- 'reject <id>' — reject a post\n- 'show <id>' — show full post content\n\nAfter each approval, confirm the Buffer scheduled time. After reviewing all posts, summarise what was queued and what was rejected.\n\nStay focused on the content pipeline. Do not engage in general conversation."
    }
  }
}
```

> **Note:** The exact `openclaw.json` schema for agent and tool definitions should be verified against OpenClaw's documentation or the running instance's config before writing. The structure above is illustrative — field names (`tools`, `type`, `command`, `env`) must match what OpenClaw actually parses.

The agent session is isolated — it does not appear in the main chat timeline.

---

### 3. OpenClaw Cron Job

A cron entry that wakes the vibe-kingdom agent on a schedule:

```json
{
  "cron": [
    {
      "name": "vibe-kingdom-fetch",
      "description": "Fetch signals and generate draft LinkedIn posts",
      "schedule": "0 8 * * 1,4",
      "agentId": "vibe-kingdom",
      "session": "isolated",
      "payloadKind": "agentTurn",
      "prompt": "Fetch new signals and generate 5 draft posts. Present them for review.",
      "enabled": true
    }
  ]
}
```

- **Schedule:** Monday and Thursday at 8am (gives posts time to land before Tue/Wed/Fri publishing windows)
- **Session:** isolated — runs in its own session, not the main chat

**Main chat announcement:** If OpenClaw supports delivery of cron run summaries to the main chat timeline (configurable in the cron job's `resultDelivery` field), set it to announce. If not supported, the cron run completes silently and the user opens the vibe-kingdom session manually to review. Do not assume this feature exists — verify against OpenClaw docs.

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
    → each remaining draft approved sequentially
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

Environment variables required:
- `BUFFER_ACCESS_TOKEN` — Buffer personal access token
- `BUFFER_PROFILE_ID` — Buffer LinkedIn profile ID in Buffer account
- `VIBE_KINGDOM_DATA_DIR` — Absolute path to data directory (set in agent tool definition)

---

## What Changes in vibe-kingdom.js

1. Make `DATA_DIR` read from `process.env.VIBE_KINGDOM_DATA_DIR` with fallback to `~/.openclaw/vibe-kingdom/`
2. Add `approve <id>` command: update status to `approved`, call `bufferPush(id)`
3. Add `approve-all` command: load all drafts, call `approve` on each sequentially
4. Add `reject <id>` command: update status to `rejected`
5. Add `bufferPush(id)` function: call `nextBufferSlot()`, POST to Buffer API, update post record
6. Add `nextBufferSlot(config)` function: iterate Tue/Wed/Fri 4–5pm windows, avoid occupied timestamps
7. Load Buffer config from `config.buffer` block
8. `set-status` unchanged — does not trigger Buffer

## What's Added to openclaw.json

1. `vibe-kingdom` agent definition (name, system prompt, tool command, env vars)
2. Cron job entry: Mon/Thu 8am, isolated session, fetch+generate prompt

---

## Out of Scope

- LinkedIn direct API (Buffer handles this)
- Post editing in OpenClaw (use `regenerate-post` CLI if needed)
- Multi-platform posting (LinkedIn only for now)
- Analytics/engagement tracking
- Buffer v2 API migration (use current stable endpoint, note to verify)

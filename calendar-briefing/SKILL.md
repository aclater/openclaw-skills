---
name: calendar-briefing
description: Natural language calendar briefings with personality modes. Use when you need to: get your daily schedule in natural language, receive real-time alerts when your calendar changes, view week previews, or get daily briefings in different voices (Picard, JARVIS, Ace Rimmer, etc.). Monitors your calendar every 15 minutes and auto-sends tomorrow preview at 10pm.
---

# Calendar Briefing - Daily Schedule Intelligence

Get your calendar delivered as natural conversation, not a list. Monitors changes in real-time and adapts tone to match your personality mode.

## Core Features

- **Natural language briefings** — "You've got a rough week ahead..." not "9am: Meeting, 2pm: Meeting"
- **Smart summarization** — Monday = week view, other days = today + tomorrow preview
- **Real-time change detection** — Monitors every 15 minutes, alerts on shifts
- **Dynamic personalities** — Switch tone on the fly: Picard, JARVIS, Ace Rimmer, or custom
- **Auto-preview** — 10pm Sun-Thu: "Here's what tomorrow looks like"
- **PTO-aware** — Detects vacation, gives week summary on return

## Quick Start

### Setup
```bash
node scripts/calendar-briefing.js setup
```

Prompts for:
- Google Calendar URL (public calendar link)
- Your timezone
- Notification preferences

### First Daily Use
```bash
node scripts/calendar-briefing.js briefing
```

Returns full briefing:
- **Monday or first day back**: Week summary + today's details
- **Other days**: Today's schedule + tomorrow preview
- **Natural voice**: Your configured personality mode

### Check Changes (Manual)
```bash
node scripts/calendar-briefing.js check-changes
```

Alerts if anything has changed since last check.

### Set Personality Mode
```bash
node scripts/calendar-briefing.js set-personality picard
```

Available modes: `natural`, `picard`, `jarvis`, `ace-rimmer`, `custom`

### View Tomorrow
```bash
node scripts/calendar-briefing.js tomorrow
```

Get the day-ahead preview without waiting for 10pm message.

---

## How It Works

### 1. Calendar Parsing
Fetches your public Google Calendar and extracts:
- All-day events
- Timed meetings with exact times
- Time blocks
- Free/busy patterns
- Week-long events

### 2. Change Detection
Every 15 minutes (background):
- Checks calendar against last known state
- Detects new events, cancellations, time shifts
- Alerts you to changes
- Stores state locally for comparison

### 3. Natural Language Generation
Uses your Speaker Profile + personality mode to generate:
- Conversational opening ("Adam, you've got a rough week...")
- Week patterns if it's Monday
- Today's specifics (times, back-to-back, gaps)
- Tomorrow's preview
- Practical advice ("You'll get breathing room Friday")

### 4. Personality Modes
Switch how the briefing sounds:

**natural** (default)
> "Adam, you're slammed Monday through Thursday. Monday's got a 9am, 2pm, and 4pm. Tuesday and Wednesday are similar patterns. You'll get some breathing room Friday afternoon."

**picard**
> "Admiral, your calendar indicates a most demanding week lies ahead. Monday through Thursday presents continuous engagements. Monday specifically: 0900 hours, 1400 hours, 1600 hours. This pattern persists through Wednesday. Friday afternoon shall provide the respite you require."

**jarvis**
> "Sir, I have taken the liberty of reviewing your schedule. The week ahead is rather full. Monday presents three engagements: 9 in the morning, 2 in the afternoon, and 4 in the evening. A similar pattern continues through Wednesday. Friday afternoon should provide some relief."

**ace-rimmer**
> "Chinstrap! Feast your peepers on this calendar - you're gonna be busier than a droid in a pleasure dome! Monday through Thursday, it's non-stop action. Monday alone: 9am, 2pm, 4pm. It's gonna be a red alert situation, but you'll catch a breather Friday arvo."

**custom**
> Define your own personality in config with custom tone, speech patterns, and vocabulary.

### 5. Scheduling

**Runs automatically:**
- **First use each day** (any time) → Full briefing
- **Every 15 minutes** → Change detection (background)
- **10pm Sun-Thu** → Tomorrow preview

**Cron jobs:**
- `0 */15 * * * *` — Check changes every 15 minutes
- `0 22 * * 0-4` — Tomorrow preview at 10pm Sun-Thu

---

## Configuration

Edit `~/.openclaw/calendar-briefing/config.json`:

```json
{
  "calendarUrl": "https://calendar.google.com/calendar/u/0/r?...",
  "timezone": "America/New_York",
  "personality": "natural",
  "notifications": {
    "enableChangeAlerts": true,
    "enableTomorrowPreview": true,
    "previewTime": "22:00"
  },
  "briefing": {
    "weekSummaryDays": ["monday", "first_day_after_pto"],
    "includeTomorrowPreview": true,
    "highlightConflicts": true
  }
}
```

### Personality Modes

Built-in personalities: `natural`, `picard`, `jarvis`, `ace-rimmer`

Create custom personality in `~/.openclaw/calendar-briefing/personalities/custom.json`:

```json
{
  "name": "custom",
  "opening": "Hey there, here's your day...",
  "vocabulary": {
    "busy": "packed",
    "free": "clear",
    "meeting": "huddle",
    "conflict": "collision"
  },
  "tone": "casual_friendly",
  "examples": "..."
}
```

---

## Commands

### setup
Initialize calendar connection and preferences.
```bash
node scripts/calendar-briefing.js setup
```

### briefing
Get today's briefing (or week summary on Monday).
```bash
node scripts/calendar-briefing.js briefing
node scripts/calendar-briefing.js briefing --date 2026-03-25    # Specific date
node scripts/calendar-briefing.js briefing --personality picard # Override personality
```

### tomorrow
View tomorrow's day-ahead preview.
```bash
node scripts/calendar-briefing.js tomorrow
node scripts/calendar-briefing.js tomorrow --personality jarvis
```

### check-changes
Manually check for calendar changes since last check.
```bash
node scripts/calendar-briefing.js check-changes
```

### set-personality
Switch personality mode.
```bash
node scripts/calendar-briefing.js set-personality picard
node scripts/calendar-briefing.js set-personality natural
```

### list-personalities
Show available personality modes.
```bash
node scripts/calendar-briefing.js list-personalities
```

### show-config
Display current configuration.
```bash
node scripts/calendar-briefing.js show-config
```

### reset
Clear all cached data and start fresh.
```bash
node scripts/calendar-briefing.js reset
```

---

## Use Cases

### Morning Briefing
Start your day with a natural language summary of what's ahead. Get the whole week if it's Monday.

### Real-Time Alerts
Get notified immediately when something changes: meeting cancelled, new conflict, time shift.

### Meeting Prep
Check what's coming up tomorrow before bed (10pm preview).

### Week Planning
Monday briefing gives you the full week pattern so you can plan around busy/free periods.

### Personality Flexibility
Match your mood or the situation: Picard when you're feeling formal, JARVIS when you want wit, natural everyday.

---

## Data Storage

All data persists at: `~/.openclaw/calendar-briefing/`

- `config.json` — Your configuration
- `state.json` — Last known calendar state (for change detection)
- `personalities/` — Personality mode definitions
- `cache/` — Brief cache of calendar data

Calendar data is never stored long-term; only used for change detection.

---

## Google Calendar Public URL

The skill works with public Google Calendar URLs. To find yours:

1. Open your Google Calendar
2. Right-click the calendar name → "Settings"
3. Scroll to "Integrate calendar"
4. Copy the public calendar URL or iCal feed URL

Example: `https://calendar.google.com/calendar/u/0/r?cid=...`

---

## Personality Modes in Detail

### natural
Your authentic voice. Practical, grounded, slightly comfortable flair. Uses your Speaker Profile.

### picard
Starship captain formality. Professional, measured, command presence. "Admiral, your schedule..."

### jarvis
British AI butler. Polite, witty, slightly formal. "Sir, I have reviewed your calendar..."

### ace-rimmer
Red Dwarf chaos. Cocky, action-movie speak, irreverent humor. "Chinstrap! You're gonna be busy..."

### custom
Define your own with vocabulary, tone, and examples in `personalities/custom.json`

---

## Best Practices

1. **Review the 10pm preview** — Prepares you mentally for the next day
2. **Act on change alerts** — When something shifts, decide immediately if it impacts your day
3. **Use personality for mood** — Switch to Picard when you need formal energy, natural most days
4. **Check on Monday** — Week summary helps with resource planning
5. **Combine with vibe-kingdom** — Use free time blocks for content creation, scheduled from briefing

---

## Troubleshooting

**"Calendar not loading"**
- Check URL is public (not private or restricted)
- Verify timezone is correct
- Try: `node scripts/calendar-briefing.js reset`

**"Not getting tomorrow preview"**
- Enable in config: `enableTomorrowPreview: true`
- Check `previewTime` (default 22:00 = 10pm)
- Cron job may not be running; check with `crontab -l`

**"Personality mode not working"**
- List available: `calendar-briefing.js list-personalities`
- Verify personality file exists: `~/.openclaw/calendar-briefing/personalities/`
- Check spelling in config

**"Change alerts too noisy"**
- Set `enableChangeAlerts: false` in config
- Or manually check: `calendar-briefing.js check-changes`

---

## License

MIT — Use freely. Respects Google Calendar privacy and terms.

Built for OpenClaw. Your schedule, spoken naturally.

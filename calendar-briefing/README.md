# Calendar Briefing

**Natural language calendar summaries with personality modes.**

Get your daily schedule delivered as conversation, not as a list. Get the full week on Mondays, just today on other days. Personality modes let you hear it as Picard, JARVIS, Ace Rimmer, or your natural voice.

## What It Does

- **Natural briefings** — "Adam, you've got a rough week ahead..." instead of a list
- **Smart summarization** — Monday = week view, other days = today + tomorrow preview
- **Real-time monitoring** — Checks every 15 minutes for changes
- **Dynamic personalities** — Switch tone on the fly: Captain Picard, JARVIS, Ace Rimmer, natural
- **Auto-preview** — 10pm Sun-Thu: "Here's what tomorrow looks like"
- **Change alerts** — Get notified immediately when something shifts

## Quick Start

### Setup
```bash
node scripts/calendar-briefing.js setup
```

Add your public Google Calendar URL.

### Get Today's Briefing
```bash
node scripts/calendar-briefing.js briefing
```

**Monday output:**
> "Adam, you've got quite a week ahead. Here's the breakdown: Monday: 3 engagements (9am, 2pm, 4pm). Tuesday: 2 engagements. Wednesday: 2 engagements. Thursday: 1 engagement. Friday: You're clear."

**Other days:**
> "Adam, here's what your day looks like: You have 3 engagements: 9am, 2pm, 4pm. Tomorrow's looking lighter — just 2 calls."

### Tomorrow's Preview
```bash
node scripts/calendar-briefing.js tomorrow
```

> "📅 Here's what tomorrow (Tuesday) looks like: 10:00 - All-hands standup, 14:00 - Architecture review"

### Switch Personality
```bash
node scripts/calendar-briefing.js set-personality picard
```

Same briefing, now delivered by Captain Picard:
> "Admiral, your schedule for the coming week presents several significant engagements. Monday: 3 engagements (0900, 1400, 1600)..."

## Personality Modes

### natural
Your authentic voice. Pragmatic, grounded, slightly comfortable flair.

### picard
Captain Picard from Star Trek. Formal, measured, command presence.

### jarvis
JARVIS from Iron Man. British butler, polite, witty, slightly formal.

### ace-rimmer
Ace Rimmer from Red Dwarf. Cocky, action-movie speak, irreverent humor.

### custom
Define your own in `~/.openclaw/calendar-briefing/personalities/custom.json`

## Configuration

Edit `~/.openclaw/calendar-briefing/config.json`:

```json
{
  "calendarUrl": "https://calendar.google.com/calendar/...",
  "timezone": "America/New_York",
  "personality": "natural",
  "notifications": {
    "enableChangeAlerts": true,
    "enableTomorrowPreview": true,
    "previewTime": "22:00"
  }
}
```

## Commands

```
setup                          Initialize and configure
briefing [--personality X]     Get today's briefing
tomorrow [--personality X]     View tomorrow's preview
check-changes                  Manually check for updates
set-personality <mode>         Switch personality
list-personalities             Show available modes
show-config                    Display configuration
reset                          Clear cached data
```

## How to Get Your Calendar URL

1. Open Google Calendar
2. Right-click your calendar → "Settings"
3. Scroll to "Integrate calendar"
4. Copy the public calendar URL or iCal feed
5. Add to config

Example: `https://calendar.google.com/calendar/u/0/r?cid=...`

## Automation

**First daily use:**
- Run `briefing` command → Full briefing (week on Monday, today on other days)

**Every 15 minutes:**
- Background check for changes → Alert if something shifted

**10pm Sun-Thu:**
- Auto-send "Here's what tomorrow looks like" message

## Use Cases

### Morning Routine
Start your day with a natural summary of what's ahead. Get the whole week on Monday.

### Meeting Prep
Check `tomorrow` before bed to mentally prepare.

### Real-Time Alerts
Get notified when a meeting is added, cancelled, or moved.

### Personality Flexibility
Match your mood: Be formal with Picard, witty with JARVIS, chaotic with Ace Rimmer.

### Week Planning
Monday's week view helps you plan your own work around busy/free periods.

## Features

✅ Natural language (not a list)  
✅ Smart context (week on Monday, today other days)  
✅ Real-time change detection  
✅ Dynamic personalities  
✅ Auto-preview at 10pm  
✅ PTO-aware (full week on return)  
✅ No API keys needed (uses public calendar)

## Data Privacy

- Only reads your public calendar
- No data stored beyond local caching
- Change detection happens locally
- No external tracking

## Requirements

- Node.js 16+
- Public Google Calendar URL

## License

MIT — Use freely. Built for OpenClaw.

---

**Get your calendar delivered as conversation.** Your schedule, spoken naturally.

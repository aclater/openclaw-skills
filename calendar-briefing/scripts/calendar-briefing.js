#!/usr/bin/env node
/**
 * Calendar Briefing - Daily Schedule Intelligence
 *
 * Get your calendar delivered as natural conversation with personality modes.
 * Monitors changes in real-time and auto-sends previews at 10pm.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const http = require('http');

const DATA_DIR = path.join(os.homedir(), '.openclaw', 'calendar-briefing');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const PERSONALITIES_DIR = path.join(DATA_DIR, 'personalities');

// ─────────────────────────────────────────────────────────────────────────────

function ensureDirectories() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(PERSONALITIES_DIR)) fs.mkdirSync(PERSONALITIES_DIR, { recursive: true });
}

function loadConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  }
  const defaultConfig = {
    iCalUrl: '',
    timezone: 'America/New_York',
    personality: 'natural',
    useLLM: true,
    notifications: {
      enableChangeAlerts: true,
      enableTomorrowPreview: true,
      previewTime: '22:00'
    },
    briefing: {
      weekSummaryDays: ['monday', 'first_day_after_pto'],
      includeTomorrowPreview: true,
      highlightConflicts: true
    }
  };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(defaultConfig, null, 2));
  return defaultConfig;
}

function loadState() {
  if (fs.existsSync(STATE_FILE)) {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  }
  return { lastChecked: null, lastCalendarHash: null, lastPersonality: 'natural', lastFetch: null };
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ─────────────────────────────────────────────────────────────────────────────
// iCal fetching and parsing

function fetchICalData(iCalUrl) {
  return new Promise((resolve, reject) => {
    const protocol = iCalUrl.startsWith('https') ? https : http;
    protocol.get(iCalUrl, (res) => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchICalData(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) resolve(data);
        else reject(new Error(`HTTP ${res.statusCode}`));
      });
    }).on('error', reject);
  });
}

/**
 * Unfold iCal line continuations.
 * RFC 5545: a CRLF followed by a single whitespace char is a fold — join it.
 */
function unfoldICalLines(data) {
  return data.replace(/\r?\n[ \t]/g, '');
}

/**
 * Convert a UTC iCal datetime string (YYYYMMDDTHHMMSSZ) to local date/time
 * in the given IANA timezone using Intl.
 */
function utcToLocal(dateStr, timezone) {
  const m = dateStr.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/);
  if (!m) return null;
  const [, year, month, day, hour, min, sec] = m;
  const utc = new Date(Date.UTC(+year, +month - 1, +day, +hour, +min, +(sec || 0)));

  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  });
  const parts = {};
  fmt.formatToParts(utc).forEach(({ type, value }) => parts[type] = value);
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: parts.hour === '24' ? `00:${parts.minute}` : `${parts.hour}:${parts.minute}`,
    isAllDay: false
  };
}

/**
 * Parse a local iCal datetime (YYYYMMDDTHHMMSS, no Z) as-is.
 */
function parseLocalDatetime(dateStr) {
  const m = dateStr.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/);
  if (!m) return null;
  const [, year, month, day, hour, min] = m;
  return { date: `${year}-${month}-${day}`, time: `${hour}:${min}`, isAllDay: false };
}

/**
 * Parse a date-only value (YYYYMMDD) as an all-day event.
 */
function parseAllDay(dateStr) {
  if (dateStr.length < 8) return null;
  const d = dateStr.substring(0, 8);
  return {
    date: `${d.substring(0, 4)}-${d.substring(4, 6)}-${d.substring(6, 8)}`,
    time: null,
    isAllDay: true
  };
}

function decodeICalValue(value) {
  return value
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\n/g, '\n')
    .replace(/\\\\/g, '\\');
}

/**
 * Parse iCal data into an array of event objects.
 * Handles: line folding, UTC Z datetimes, TZID-qualified datetimes, all-day dates.
 */
function parseICalEvents(iCalData, timezone) {
  const tz = timezone || 'America/New_York';
  const unfolded = unfoldICalLines(iCalData);
  const lines = unfolded.split(/\r?\n/);

  // Extract calendar-level timezone if present
  let calTz = tz;
  for (const line of lines) {
    if (line.startsWith('X-WR-TIMEZONE:')) {
      calTz = line.substring('X-WR-TIMEZONE:'.length).trim();
      break;
    }
  }
  const effectiveTz = tz !== 'America/New_York' ? tz : calTz;

  const events = [];
  let cur = null;

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      cur = {};
      continue;
    }
    if (line === 'END:VEVENT') {
      if (cur) events.push(cur);
      cur = null;
      continue;
    }
    if (!cur) continue;

    // Split into property name (with optional params) and value
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const propFull = line.substring(0, colonIdx);   // e.g. DTSTART;TZID=America/New_York
    const rawValue = line.substring(colonIdx + 1);

    // Split prop name from params
    const semiIdx = propFull.indexOf(';');
    const propName = semiIdx === -1 ? propFull : propFull.substring(0, semiIdx);
    const params = semiIdx === -1 ? '' : propFull.substring(semiIdx + 1);

    if (propName === 'SUMMARY') {
      cur.title = decodeICalValue(rawValue);
    } else if (propName === 'DESCRIPTION') {
      cur.description = decodeICalValue(rawValue);
    } else if (propName === 'LOCATION') {
      cur.location = decodeICalValue(rawValue);
    } else if (propName === 'DTSTART') {
      if (params.includes('VALUE=DATE')) {
        // All-day: YYYYMMDD
        cur.startDate = parseAllDay(rawValue);
      } else if (rawValue.endsWith('Z')) {
        // UTC — convert to local timezone
        cur.startDate = utcToLocal(rawValue, effectiveTz);
      } else if (params.includes('TZID=')) {
        // Local datetime with explicit TZID — treat as local
        cur.startDate = parseLocalDatetime(rawValue);
      } else if (rawValue.length === 8) {
        // Date-only without VALUE=DATE param (some clients omit it)
        cur.startDate = parseAllDay(rawValue);
      } else {
        // Floating datetime — parse as-is
        cur.startDate = parseLocalDatetime(rawValue);
      }
      if (cur.startDate) cur.startTime = cur.startDate.time;
    } else if (propName === 'DTEND') {
      if (params.includes('VALUE=DATE')) {
        cur.endDate = parseAllDay(rawValue);
      } else if (rawValue.endsWith('Z')) {
        cur.endDate = utcToLocal(rawValue, effectiveTz);
      } else {
        cur.endDate = parseLocalDatetime(rawValue);
      }
    }
  }

  return events.filter(e => e.title && e.startDate);
}

// ─────────────────────────────────────────────────────────────────────────────
// Claude LLM via Anthropic API

function callClaude(prompt) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      reject(new Error('ANTHROPIC_API_KEY not set'));
      return;
    }
    const payload = JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 512,
      temperature: 0.7,
      messages: [{ role: 'user', content: prompt }]
    });
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': payload.length,
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const text = parsed.content?.[0]?.text;
          if (text) resolve(text.trim());
          else reject(new Error(`Claude error: ${JSON.stringify(parsed.error || parsed)}`));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Briefing generation

function buildEventSummary(events, date, days = 1) {
  const lines = [];
  for (let i = 0; i < days; i++) {
    const d = addDays(date, i);
    const dateStr = formatDate(d);
    const dayEvents = events
      .filter(e => e.startDate.date === dateStr)
      .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
    const label = getDayOfWeek(d);
    if (dayEvents.length === 0) {
      lines.push(`${label}: no events`);
    } else {
      const items = dayEvents.map(e => e.startTime ? `${e.startTime} ${e.title}` : `(all day) ${e.title}`);
      lines.push(`${label}: ${items.join(', ')}`);
    }
  }
  return lines.join('\n');
}

async function generateBriefingLLM(events, personalityMode, date, isWeek) {
  const days = isWeek ? 7 : 2;
  const summary = buildEventSummary(events, date, days);
  const label = isWeek ? 'week' : 'day';

  const prompt = `You are delivering a calendar briefing in the voice of "${personalityMode.name}".

Personality: ${personalityMode.tone}
Vocabulary hints: ${JSON.stringify(personalityMode.vocab)}
Opening to use: "${isWeek ? personalityMode.weekOpening : personalityMode.opening}"

Here is the ${label}'s schedule (already converted to the user's timezone):
${summary}

Write a natural language briefing in character. Be concise (3-6 sentences). Do not use bullet points, markdown, or emojis. Just plain conversational text that sounds like the character speaking.`;

  return callClaude(prompt);
}

function generateBriefingTemplate(events, personalityMode, date) {
  const dateStr = formatDate(date);
  const dayOfWeek = getDayOfWeek(date);
  const isMonday = dayOfWeek === 'Monday';

  if (isMonday) {
    let briefing = personalityMode.weekOpening + '\n\n';
    for (let i = 0; i < 7; i++) {
      const d = addDays(date, i);
      const day = getDayOfWeek(d);
      const dayEvents = events.filter(e => e.startDate.date === formatDate(d));
      if (dayEvents.length > 0) {
        const times = dayEvents.filter(e => e.startTime).map(e => e.startTime).sort().join(', ');
        briefing += `${day}: ${dayEvents.length} engagement${dayEvents.length > 1 ? 's' : ''}${times ? ` (${times})` : ''}\n`;
      } else {
        briefing += `${day}: Clear\n`;
      }
    }
    return briefing;
  }

  let briefing = personalityMode.opening + ' ';
  const todayEvents = events.filter(e => e.startDate.date === dateStr);
  if (todayEvents.length === 0) {
    briefing += "You're clear today.";
  } else {
    const timed = todayEvents.filter(e => e.startTime).sort((a, b) => a.startTime.localeCompare(b.startTime));
    briefing += `You have ${todayEvents.length} engagement${todayEvents.length > 1 ? 's' : ''}: ${timed.map(e => e.startTime).join(', ')}.`;
    if (timed.length >= 3) briefing += ' This is a busy day.';
  }
  return briefing;
}

// ─────────────────────────────────────────────────────────────────────────────
// Personality

function loadPersonality(mode) {
  const modes = {
    natural: {
      name: 'natural',
      opening: "Adam, here's what your day looks like:",
      weekOpening: "Adam, you've got quite a week ahead. Here's the breakdown:",
      tone: 'pragmatic, grounded senior architect — practical, slightly wry, seen-it-before',
      vocab: { busy: 'slammed', free: 'clear', meeting: 'call', conflict: 'back-to-back', allDay: 'all-day commitment' }
    },
    picard: {
      name: 'picard',
      opening: 'Admiral, your calendar indicates the following schedule:',
      weekOpening: 'Admiral, your schedule for the coming week presents several significant engagements.',
      tone: 'formal Starfleet captain — measured, command presence, "Make it so" energy',
      vocab: { busy: 'demanding', free: 'available', meeting: 'engagement', conflict: 'back-to-back engagements', allDay: 'full-day commitment' }
    },
    jarvis: {
      name: 'jarvis',
      opening: 'Sir, I have reviewed your calendar. Here is your schedule:',
      weekOpening: 'Sir, if I may be so bold, your week ahead appears quite full.',
      tone: 'British AI butler — polite, witty, slightly formal, dry humour',
      vocab: { busy: 'rather occupied', free: 'available', meeting: 'appointment', conflict: 'back-to-back appointments', allDay: "full day's commitment" }
    },
    'ace-rimmer': {
      name: 'ace-rimmer',
      opening: 'Chinstrap! Check out this action-packed schedule:',
      weekOpening: "Chinstrap! Your week's gonna be busier than a droid in a pleasure dome!",
      tone: 'Red Dwarf Ace Rimmer — cocky, action-movie speak, irreverent, "Smoke me a kipper" energy',
      vocab: { busy: 'packed', free: 'got some breather', meeting: 'action item', conflict: 'non-stop action', allDay: 'full-day mission' }
    }
  };

  if (modes[mode]) return modes[mode];

  const customPath = path.join(PERSONALITIES_DIR, `${mode}.json`);
  if (fs.existsSync(customPath)) return JSON.parse(fs.readFileSync(customPath, 'utf8'));

  return modes.natural;
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilities

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function getDayOfWeek(date) {
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][date.getDay()];
}

function hashEvents(events) {
  return JSON.stringify(events.map(e => `${e.startDate.date}|${e.startTime || ''}|${e.title}`).sort());
}

function filterWindow(events, from, to) {
  return events.filter(e => {
    const d = new Date(e.startDate.date);
    return d >= from && d <= to;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Commands

async function cmdSetup() {
  console.log(`\nSetting up Calendar Briefing at ${DATA_DIR}...\n`);
  ensureDirectories();
  loadConfig();

  console.log('To connect your Google Calendar:\n');
  console.log('1. Open Google Calendar');
  console.log('2. Settings (gear) -> Settings -> find your calendar on the left');
  console.log('3. Scroll to "Integrate calendar"');
  console.log('4. Copy the "Secret address in iCal format" URL (.ics)\n');
  console.log(`5. Edit ${CONFIG_FILE}`);
  console.log('   Set iCalUrl to your .ics URL\n');
  console.log('To enable automatic briefings, add these to your crontab (crontab -e):\n');

  const scriptPath = path.resolve(__filename);
  console.log(`  # Calendar change detection every 15 minutes`);
  console.log(`  */15 * * * * node ${scriptPath} check-changes >> ~/.openclaw/calendar-briefing/changes.log 2>&1\n`);
  console.log(`  # Tomorrow preview at 10pm Sun-Thu`);
  console.log(`  0 22 * * 0-4 node ${scriptPath} tomorrow >> ~/.openclaw/calendar-briefing/preview.log 2>&1\n`);

  console.log('Personalities: natural, picard, jarvis, ace-rimmer\n');
}

async function cmdBriefing(args) {
  ensureDirectories();
  const config = loadConfig();
  const state = loadState();

  if (!config.iCalUrl) {
    console.error('iCal URL not configured. Run: calendar-briefing setup');
    process.exit(1);
  }

  try {
    const personality = args.personality || config.personality;
    const date = args.date ? new Date(args.date + 'T12:00:00') : new Date();
    const isMonday = getDayOfWeek(date) === 'Monday';

    process.stderr.write('Fetching calendar...\n');
    const iCalData = await fetchICalData(config.iCalUrl);
    const events = parseICalEvents(iCalData, config.timezone);
    const windowed = filterWindow(events, addDays(new Date(), -1), addDays(new Date(), 14));

    const personalityMode = loadPersonality(personality);
    let briefing;

    if (config.useLLM !== false) {
      try {
        briefing = await generateBriefingLLM(windowed, personalityMode, date, isMonday);
      } catch (e) {
        process.stderr.write(`LLM unavailable (${e.message}), using template.\n`);
        briefing = generateBriefingTemplate(windowed, personalityMode, date);
      }
    } else {
      briefing = generateBriefingTemplate(windowed, personalityMode, date);
    }

    console.log('\n' + briefing + '\n');

    state.lastChecked = new Date().toISOString();
    state.lastCalendarHash = hashEvents(windowed);
    state.lastPersonality = personality;
    state.lastFetch = new Date().toISOString();
    saveState(state);
  } catch (e) {
    console.error('Error generating briefing:', e.message);
    process.exit(1);
  }
}

async function cmdTomorrow(args) {
  ensureDirectories();
  const config = loadConfig();

  if (!config.iCalUrl) {
    console.error('iCal URL not configured. Run: calendar-briefing setup');
    process.exit(1);
  }

  try {
    const personality = args.personality || config.personality;
    const tomorrow = addDays(new Date(), 1);

    process.stderr.write('Fetching calendar...\n');
    const iCalData = await fetchICalData(config.iCalUrl);
    const events = parseICalEvents(iCalData, config.timezone);
    const tomorrowEvents = events
      .filter(e => e.startDate.date === formatDate(tomorrow))
      .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));

    const personalityMode = loadPersonality(personality);
    let briefing;

    if (config.useLLM !== false) {
      try {
        briefing = await generateBriefingLLM(tomorrowEvents.length ? tomorrowEvents : events, personalityMode, tomorrow, false);
      } catch (e) {
        process.stderr.write(`LLM unavailable (${e.message}), using template.\n`);
        briefing = null;
      }
    }

    if (briefing) {
      console.log(`\nTomorrow (${getDayOfWeek(tomorrow)}):\n\n${briefing}\n`);
    } else {
      console.log(`\nTomorrow (${getDayOfWeek(tomorrow)}):\n`);
      if (tomorrowEvents.length === 0) {
        console.log("You're clear tomorrow.\n");
      } else {
        tomorrowEvents.forEach(e => console.log(`  ${e.startTime || 'all day'} - ${e.title}`));
        console.log();
      }
    }
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

async function cmdCheckChanges() {
  ensureDirectories();
  const config = loadConfig();
  const state = loadState();

  if (!config.iCalUrl) {
    console.error('iCal URL not configured.');
    process.exit(1);
  }

  try {
    const iCalData = await fetchICalData(config.iCalUrl);
    const events = parseICalEvents(iCalData, config.timezone);
    const windowed = filterWindow(events, addDays(new Date(), -1), addDays(new Date(), 14));
    const currentHash = hashEvents(windowed);

    if (state.lastCalendarHash === null) {
      console.log('Calendar loaded (first check)');
    } else if (currentHash === state.lastCalendarHash) {
      console.log('No changes since last check');
    } else {
      console.log('Calendar has changed — something shifted on your schedule.');
    }

    state.lastChecked = new Date().toISOString();
    state.lastCalendarHash = currentHash;
    saveState(state);
  } catch (e) {
    console.error('Error checking changes:', e.message);
    process.exit(1);
  }
}

function cmdSetPersonality(mode) {
  ensureDirectories();
  const config = loadConfig();
  config.personality = mode;
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  console.log(`Personality set to: ${mode}`);
}

function cmdListPersonalities() {
  console.log('\nAvailable personalities:\n');
  console.log('  natural      Your authentic voice (default)');
  console.log('  picard       Captain Picard formality');
  console.log('  jarvis       British AI butler');
  console.log('  ace-rimmer   Red Dwarf chaos\n');

  ensureDirectories();
  const custom = fs.readdirSync(PERSONALITIES_DIR).filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''));
  if (custom.length > 0) {
    console.log('Custom:\n');
    custom.forEach(p => console.log(`  ${p}`));
    console.log();
  }
}

function cmdShowConfig() {
  ensureDirectories();
  console.log(JSON.stringify(loadConfig(), null, 2));
}

function cmdReset() {
  if (fs.existsSync(STATE_FILE)) {
    fs.unlinkSync(STATE_FILE);
    console.log('State reset');
  } else {
    console.log('Nothing to reset');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    const scriptName = path.basename(process.argv[1]);
    console.log(`
Calendar Briefing - Daily Schedule Intelligence

Usage:
  ${scriptName} setup                     Initialize and configure
  ${scriptName} briefing [options]        Get today's briefing
  ${scriptName} tomorrow [options]        View tomorrow's schedule
  ${scriptName} check-changes             Check for calendar updates
  ${scriptName} set-personality <mode>    Switch personality mode
  ${scriptName} list-personalities        Show available personalities
  ${scriptName} show-config               Display configuration
  ${scriptName} reset                     Clear cached state

Options:
  --personality <mode>    picard, jarvis, ace-rimmer, natural
  --date <YYYY-MM-DD>     Briefing for a specific date

Data: ${DATA_DIR}
`);
    return;
  }

  const cmd = args[0];
  const cmdArgs = {};
  for (let i = 1; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '');
    const val = args[i + 1] !== undefined ? args[i + 1] : true;
    cmdArgs[key] = val;
  }

  switch (cmd) {
    case 'setup':             return cmdSetup();
    case 'briefing':          return cmdBriefing(cmdArgs);
    case 'tomorrow':          return cmdTomorrow(cmdArgs);
    case 'check-changes':     return cmdCheckChanges();
    case 'set-personality':   return cmdSetPersonality(args[1]);
    case 'list-personalities':return cmdListPersonalities();
    case 'show-config':       return cmdShowConfig();
    case 'reset':             return cmdReset();
    default:
      console.error(`Unknown command: ${cmd}`);
      process.exit(1);
  }
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });

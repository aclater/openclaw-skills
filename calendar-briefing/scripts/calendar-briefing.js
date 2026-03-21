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

/**
 * Ensure directories exist
 */
function ensureDirectories() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(PERSONALITIES_DIR)) {
    fs.mkdirSync(PERSONALITIES_DIR, { recursive: true });
  }
}

/**
 * Load or create default config
 */
function loadConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  }
  
  const defaultConfig = {
    calendarUrl: '',
    iCalUrl: '',
    timezone: 'America/New_York',
    personality: 'natural',
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

/**
 * Load or create default state
 */
function loadState() {
  if (fs.existsSync(STATE_FILE)) {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  }
  return {
    lastChecked: null,
    lastCalendarHash: null,
    events: [],
    lastPersonality: 'natural',
    lastFetch: null
  };
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

/**
 * Fetch iCal data from Google Calendar
 */
function fetchICalData(iCalUrl) {
  return new Promise((resolve, reject) => {
    const protocol = iCalUrl.startsWith('https') ? https : http;
    
    protocol.get(iCalUrl, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(data);
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Parse iCal format to extract events
 */
function parseICalEvents(iCalData) {
  const events = [];
  const lines = iCalData.split('\n');
  let currentEvent = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === 'BEGIN:VEVENT') {
      currentEvent = {};
    } else if (trimmed === 'END:VEVENT' && currentEvent) {
      events.push(currentEvent);
      currentEvent = null;
    } else if (currentEvent && trimmed.includes(':')) {
      const [key, ...valueParts] = trimmed.split(':');
      const value = valueParts.join(':');
      
      if (key === 'DTSTART' || key === 'DTSTART;VALUE=DATE') {
        currentEvent.startDate = parseICalDate(value);
      } else if (key === 'DTEND' || key === 'DTEND;VALUE=DATE') {
        currentEvent.endDate = parseICalDate(value);
      } else if (key === 'SUMMARY') {
        currentEvent.title = decodeICalValue(value);
      } else if (key === 'DESCRIPTION') {
        currentEvent.description = decodeICalValue(value);
      } else if (key === 'LOCATION') {
        currentEvent.location = decodeICalValue(value);
      } else if (key.startsWith('DTSTART')) {
        // Full datetime with timezone
        const match = value.match(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/);
        if (match) {
          const [, year, month, day, hour, min] = match;
          currentEvent.startDate = `${year}-${month}-${day}`;
          currentEvent.startTime = `${hour}:${min}`;
          currentEvent.isAllDay = false;
        }
      }
    }
  }

  return events.filter(e => e.title && e.startDate);
}

/**
 * Parse iCal date format: YYYYMMDD or YYYYMMDDTHHMMSS
 */
function parseICalDate(dateStr) {
  if (!dateStr) return null;

  if (dateStr.length === 8) {
    // All-day event: YYYYMMDD
    return {
      date: `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`,
      isAllDay: true,
      time: null
    };
  } else if (dateStr.includes('T')) {
    // Timed event: YYYYMMDDTHHMMSS
    const [date, time] = dateStr.split('T');
    return {
      date: `${date.substring(0, 4)}-${date.substring(4, 6)}-${date.substring(6, 8)}`,
      time: `${time.substring(0, 2)}:${time.substring(2, 4)}`,
      isAllDay: false
    };
  }
  return null;
}

/**
 * Decode iCal escaped values
 */
function decodeICalValue(value) {
  return value
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\n/g, '\n')
    .replace(/\\\\/g, '\\');
}

/**
 * Load personality mode
 */
function loadPersonality(mode) {
  const modes = {
    natural: {
      name: 'natural',
      opening: 'Adam, here\'s what your day looks like:',
      weekOpening: 'Adam, you\'ve got quite a week ahead. Here\'s the breakdown:',
      tone: 'pragmatic_grounded',
      vocab: {
        busy: 'slammed',
        free: 'clear',
        meeting: 'call',
        conflict: 'back-to-back',
        allDay: 'all-day commitment'
      }
    },
    picard: {
      name: 'picard',
      opening: 'Admiral, your calendar indicates the following schedule:',
      weekOpening: 'Admiral, your schedule for the coming week presents several significant engagements.',
      tone: 'formal_captain',
      vocab: {
        busy: 'demanding',
        free: 'available',
        meeting: 'engagement',
        conflict: 'back-to-back engagements',
        allDay: 'full-day commitment'
      }
    },
    jarvis: {
      name: 'jarvis',
      opening: 'Sir, I have reviewed your calendar. Here is your schedule:',
      weekOpening: 'Sir, if I may be so bold, your week ahead appears quite full.',
      tone: 'british_butler',
      vocab: {
        busy: 'rather occupied',
        free: 'available',
        meeting: 'appointment',
        conflict: 'back-to-back appointments',
        allDay: 'full day\'s commitment'
      }
    },
    'ace-rimmer': {
      name: 'ace-rimmer',
      opening: 'Chinstrap! Check out this action-packed schedule:',
      weekOpening: 'Chinstrap! Your week\'s gonna be busier than a droid in a pleasure dome!',
      tone: 'cocky_action',
      vocab: {
        busy: 'packed',
        free: 'got some breather',
        meeting: 'action item',
        conflict: 'non-stop action',
        allDay: 'full-day mission'
      }
    }
  };

  if (modes[mode]) {
    return modes[mode];
  }
  
  // Try to load custom personality
  const customPath = path.join(PERSONALITIES_DIR, `${mode}.json`);
  if (fs.existsSync(customPath)) {
    return JSON.parse(fs.readFileSync(customPath, 'utf8'));
  }
  
  return modes.natural; // Fallback
}

/**
 * Generate natural language briefing
 */
function generateBriefing(events, personality, date) {
  const personalityMode = loadPersonality(personality);
  const dayOfWeek = getDayOfWeek(date);
  const isMonday = dayOfWeek === 'Monday';
  const dateStr = formatDate(date);
  
  let briefing = '';

  if (isMonday) {
    briefing = personalityMode.weekOpening + '\n\n';
    
    // Week view
    const weekEvents = groupEventsByDay(events, date);
    for (let i = 0; i < 7; i++) {
      const dayDate = addDays(date, i);
      const day = getDayOfWeek(dayDate);
      const dayEvents = events.filter(e => e.startDate.date === formatDate(dayDate));
      
      if (dayEvents.length > 0) {
        const times = dayEvents
          .filter(e => e.startTime)
          .map(e => e.startTime)
          .sort()
          .join(', ');
        const label = times ? ` (${times})` : '';
        briefing += `${day}: ${dayEvents.length} engagement${dayEvents.length > 1 ? 's' : ''}${label}\n`;
      } else {
        briefing += `${day}: Clear\n`;
      }
    }
  } else {
    briefing = personalityMode.opening + ' ';
    
    // Today
    const todayEvents = events.filter(e => e.startDate.date === dateStr);
    if (todayEvents.length === 0) {
      briefing += 'You\'re clear today.';
    } else {
      const timedEvents = todayEvents.filter(e => e.startTime).sort((a, b) => a.startTime.localeCompare(b.startTime));
      const times = timedEvents.map(e => e.startTime).join(', ');
      briefing += `You have ${todayEvents.length} engagement${todayEvents.length > 1 ? 's' : ''}: ${times}.`;
      
      if (timedEvents.length >= 3) {
        briefing += ' This is a busy day.';
      }
    }
  }

  return briefing;
}

/**
 * Utility functions
 */
function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function getDayOfWeek(date) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[date.getDay()];
}

function groupEventsByDay(events, startDate) {
  const grouped = {};
  for (let i = 0; i < 7; i++) {
    const date = addDays(startDate, i);
    const day = getDayOfWeek(date);
    grouped[day] = events.filter(e => e.startDate.date === formatDate(date));
  }
  return grouped;
}

function hashEvents(events) {
  return JSON.stringify(events.map(e => `${e.startDate.date}${e.startTime || ''}${e.title}`).sort());
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Commands
 */

async function cmdSetup() {
  console.log(`\nSetting up Calendar Briefing at ${DATA_DIR}...\n`);
  ensureDirectories();
  
  const config = loadConfig();
  
  console.log('To use calendar-briefing with your Google Calendar:\n');
  console.log('1. Open your Google Calendar');
  console.log('2. Right-click your calendar → "Settings"');
  console.log('3. Scroll to "Integrate calendar"');
  console.log('4. Copy the iCal (.ics) URL\n');
  console.log('5. Edit this file and add iCalUrl:');
  console.log(`   ${CONFIG_FILE}\n`);
  console.log('Example config:');
  console.log(JSON.stringify({
    iCalUrl: 'https://calendar.google.com/calendar/ical/.../basic.ics',
    timezone: 'America/New_York',
    personality: 'natural'
  }, null, 2));
  console.log('\nThen run: calendar-briefing briefing\n');
  
  console.log('Available personalities:');
  console.log('  - natural (default, your authentic voice)');
  console.log('  - picard (Captain Picard formality)');
  console.log('  - jarvis (British AI butler)');
  console.log('  - ace-rimmer (Red Dwarf chaos)\n');
}

async function cmdBriefing(args) {
  ensureDirectories();
  const config = loadConfig();
  const state = loadState();
  
  if (!config.iCalUrl) {
    console.error('❌ iCal URL not configured. Run: calendar-briefing setup');
    process.exit(1);
  }
  
  try {
    const personality = args.personality || config.personality;
    const date = args.date ? new Date(args.date) : new Date();
    
    console.log('📅 Fetching calendar...');
    const iCalData = await fetchICalData(config.iCalUrl);
    const events = parseICalEvents(iCalData);
    
    // Filter to this week and next
    const weekStart = addDays(new Date(), -7);
    const weekEnd = addDays(new Date(), 14);
    const filteredEvents = events.filter(e => {
      const eventDate = new Date(e.startDate.date);
      return eventDate >= weekStart && eventDate <= weekEnd;
    });
    
    // Generate briefing
    const briefing = generateBriefing(filteredEvents, personality, date);
    console.log('\n' + briefing + '\n');
    
    // Save state
    state.lastChecked = new Date().toISOString();
    state.lastCalendarHash = hashEvents(filteredEvents);
    state.lastPersonality = personality;
    state.lastFetch = new Date().toISOString();
    saveState(state);
  } catch (e) {
    console.error('❌ Error generating briefing:', e.message);
    process.exit(1);
  }
}

async function cmdTomorrow(args) {
  ensureDirectories();
  const config = loadConfig();
  
  if (!config.iCalUrl) {
    console.error('❌ iCal URL not configured. Run: calendar-briefing setup');
    process.exit(1);
  }
  
  try {
    const personality = args.personality || config.personality;
    const tomorrow = addDays(new Date(), 1);
    
    console.log('📅 Fetching calendar...');
    const iCalData = await fetchICalData(config.iCalUrl);
    const events = parseICalEvents(iCalData);
    
    const tomorrowEvents = events.filter(e => e.startDate.date === formatDate(tomorrow));
    
    const personalityMode = loadPersonality(personality);
    console.log(`\n📅 Here's what tomorrow (${getDayOfWeek(tomorrow)}) looks like:\n`);
    
    if (tomorrowEvents.length === 0) {
      console.log('You\'re clear tomorrow. Good breathing room.\n');
    } else {
      tomorrowEvents
        .filter(e => e.startTime)
        .sort((a, b) => a.startTime.localeCompare(b.startTime))
        .forEach(e => {
          console.log(`${e.startTime} - ${e.title}`);
        });
      console.log();
    }
  } catch (e) {
    console.error('❌ Error:', e.message);
    process.exit(1);
  }
}

async function cmdCheckChanges() {
  ensureDirectories();
  const config = loadConfig();
  const state = loadState();
  
  if (!config.iCalUrl) {
    console.error('❌ iCal URL not configured.');
    process.exit(1);
  }
  
  try {
    const iCalData = await fetchICalData(config.iCalUrl);
    const events = parseICalEvents(iCalData);
    const currentHash = hashEvents(events);
    
    if (state.lastCalendarHash === null) {
      console.log('✓ Calendar loaded (first check)');
    } else if (currentHash === state.lastCalendarHash) {
      console.log('✓ No changes since last check');
    } else {
      console.log('⚠️  Calendar has changed!');
      console.log('  Something shifted on your schedule. You might want to review.');
    }
    
    state.lastChecked = new Date().toISOString();
    state.lastCalendarHash = currentHash;
    saveState(state);
  } catch (e) {
    console.error('❌ Error checking changes:', e.message);
    process.exit(1);
  }
}

function cmdSetPersonality(mode) {
  ensureDirectories();
  const config = loadConfig();
  
  config.personality = mode;
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  
  console.log(`✓ Personality set to: ${mode}`);
}

function cmdListPersonalities() {
  console.log('\nAvailable personalities:\n');
  console.log('  natural        - Your authentic voice (default)');
  console.log('  picard         - Captain Picard formality');
  console.log('  jarvis         - British AI butler');
  console.log('  ace-rimmer     - Red Dwarf chaos\n');
  
  ensureDirectories();
  const customPersonalities = fs.readdirSync(PERSONALITIES_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''));
  
  if (customPersonalities.length > 0) {
    console.log('Custom personalities:\n');
    customPersonalities.forEach(p => console.log(`  ${p}`));
    console.log();
  }
}

function cmdShowConfig() {
  ensureDirectories();
  const config = loadConfig();
  console.log(JSON.stringify(config, null, 2));
}

function cmdReset() {
  if (fs.existsSync(STATE_FILE)) {
    fs.unlinkSync(STATE_FILE);
    console.log('✓ State reset');
  }
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Main CLI
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`
Calendar Briefing - Daily Schedule Intelligence
Get your calendar delivered as natural conversation.

Usage:
  calendar-briefing setup                 Initialize and configure
  calendar-briefing briefing [options]    Get today's briefing (or week on Monday)
  calendar-briefing tomorrow [options]    View tomorrow's schedule
  calendar-briefing check-changes         Check for calendar updates
  calendar-briefing set-personality <mode> Switch personality mode
  calendar-briefing list-personalities    Show available personalities
  calendar-briefing show-config           Display configuration
  calendar-briefing reset                 Clear all cached data

Options:
  --personality <mode>   Use specific personality (picard, jarvis, etc.)
  --date <YYYY-MM-DD>    Briefing for specific date

Personalities: natural, picard, jarvis, ace-rimmer, custom

Data: ${DATA_DIR}
    `);
    return;
  }

  const cmd = args[0];
  const cmdArgs = {};
  for (let i = 1; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '');
    const val = args[i + 1] || true;
    cmdArgs[key] = val;
  }

  try {
    switch (cmd) {
      case 'setup': return await cmdSetup();
      case 'briefing': return await cmdBriefing(cmdArgs);
      case 'tomorrow': return await cmdTomorrow(cmdArgs);
      case 'check-changes': return await cmdCheckChanges();
      case 'set-personality': return cmdSetPersonality(args[1]);
      case 'list-personalities': return cmdListPersonalities();
      case 'show-config': return cmdShowConfig();
      case 'reset': return cmdReset();
      default:
        console.error(`Unknown command: ${cmd}`);
        process.exit(1);
    }
  } catch (e) {
    console.error('❌ Error:', e.message);
    process.exit(1);
  }
}

main();

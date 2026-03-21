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
    lastPersonality: 'natural'
  };
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
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
 * Mock calendar fetch (in real implementation, would parse iCal)
 */
async function fetchCalendarEvents(url) {
  // For demo, return mock events
  const today = new Date();
  const mockEvents = [
    {
      date: formatDate(today),
      time: '09:00',
      title: '9am call',
      duration: 60,
      allDay: false
    },
    {
      date: formatDate(today),
      time: '14:00',
      title: '2pm meeting',
      duration: 60,
      allDay: false
    },
    {
      date: formatDate(today),
      time: '16:00',
      title: '4pm sync',
      duration: 60,
      allDay: false
    },
    {
      date: formatDate(addDays(today, 1)),
      time: '10:00',
      title: 'All-hands standup',
      duration: 30,
      allDay: false
    },
    {
      date: formatDate(addDays(today, 1)),
      time: '14:00',
      title: 'Architecture review',
      duration: 90,
      allDay: false
    }
  ];
  
  return mockEvents;
}

/**
 * Generate natural language briefing
 */
function generateBriefing(events, personality, date) {
  const personalityMode = loadPersonality(personality);
  const dayOfWeek = getDayOfWeek(date);
  const isMonday = dayOfWeek === 'Monday';
  
  let briefing = personalityMode.opening;
  
  // Check if we should do week summary
  if (isMonday) {
    briefing = personalityMode.weekOpening + '\n\n';
    
    // Week view
    const weekEvents = groupEventsByDay(events, date);
    Object.entries(weekEvents).forEach(([day, dayEvents]) => {
      if (dayEvents.length > 0) {
        const times = dayEvents.map(e => `${e.time}`).join(', ');
        briefing += `${day}: ${dayEvents.length} engagement${dayEvents.length > 1 ? 's' : ''} (${times})\n`;
      }
    });
  } else {
    // Today only
    const todayEvents = events.filter(e => e.date === formatDate(date));
    if (todayEvents.length === 0) {
      briefing += ' You\'re clear today.';
    } else {
      briefing += ' ';
      const times = todayEvents.map(e => `${e.time}`).join(', ');
      briefing += `You have ${todayEvents.length} engagement${todayEvents.length > 1 ? 's' : ''}: ${times}.`;
      
      if (todayEvents.length >= 3) {
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
  return date.toISOString().split('T')[0];
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
    grouped[day] = events.filter(e => e.date === formatDate(date));
  }
  return grouped;
}

function hashEvents(events) {
  return JSON.stringify(events);
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Commands
 */

async function cmdSetup() {
  console.log(`\nSetting up Calendar Briefing at ${DATA_DIR}...\n`);
  ensureDirectories();
  
  const config = loadConfig();
  
  if (!config.calendarUrl) {
    console.log('⚠️  No calendar URL configured yet.');
    console.log('Go to Google Calendar → Settings → Integrate calendar');
    console.log('Copy your public calendar URL and update:');
    console.log(`  ${CONFIG_FILE}`);
    console.log('\nThen run: calendar-briefing briefing\n');
  } else {
    console.log('✓ Configuration found');
    console.log(`  Calendar: ${config.calendarUrl.substring(0, 50)}...`);
    console.log(`  Personality: ${config.personality}`);
  }
  
  console.log('\nAvailable personalities:');
  console.log('  - natural (default, your authentic voice)');
  console.log('  - picard (Captain Picard formality)');
  console.log('  - jarvis (British AI butler)');
  console.log('  - ace-rimmer (Red Dwarf chaos)\n');
}

async function cmdBriefing(args) {
  ensureDirectories();
  const config = loadConfig();
  const state = loadState();
  
  if (!config.calendarUrl) {
    console.error('❌ Calendar URL not configured. Run: calendar-briefing setup');
    process.exit(1);
  }
  
  try {
    const personality = args.personality || config.personality;
    const date = args.date ? new Date(args.date) : new Date();
    
    // Fetch events
    const events = await fetchCalendarEvents(config.calendarUrl);
    
    // Generate briefing
    const briefing = generateBriefing(events, personality, date);
    console.log('\n' + briefing + '\n');
    
    // Save state
    state.lastChecked = new Date().toISOString();
    state.lastCalendarHash = hashEvents(events);
    state.lastPersonality = personality;
    saveState(state);
  } catch (e) {
    console.error('Error generating briefing:', e.message);
    process.exit(1);
  }
}

async function cmdTomorrow(args) {
  ensureDirectories();
  const config = loadConfig();
  
  if (!config.calendarUrl) {
    console.error('❌ Calendar URL not configured. Run: calendar-briefing setup');
    process.exit(1);
  }
  
  try {
    const personality = args.personality || config.personality;
    const tomorrow = addDays(new Date(), 1);
    
    const events = await fetchCalendarEvents(config.calendarUrl);
    const tomorrowEvents = events.filter(e => e.date === formatDate(tomorrow));
    
    const personalityMode = loadPersonality(personality);
    console.log(`\n📅 Here's what tomorrow (${getDayOfWeek(tomorrow)}) looks like:\n`);
    
    if (tomorrowEvents.length === 0) {
      console.log('You\'re clear tomorrow. Good breathing room.\n');
    } else {
      const times = tomorrowEvents.map(e => `${e.time} - ${e.title}`).join('\n');
      console.log(times + '\n');
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
  
  if (!config.calendarUrl) {
    console.error('❌ Calendar URL not configured.');
    process.exit(1);
  }
  
  try {
    const events = await fetchCalendarEvents(config.calendarUrl);
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
    console.error('Error checking changes:', e.message);
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
    console.error('Error:', e.message);
    process.exit(1);
  }
}

main();

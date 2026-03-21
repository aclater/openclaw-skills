#!/usr/bin/env node
/**
 * Vibe Kingdom - OpenClaw Edition
 * 
 * Modern personal brand amplification using signal sources and authentic voice.
 * Discovers quality technical conversations and transforms them into LinkedIn posts.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');

const DATA_DIR = path.join(os.homedir(), '.openclaw', 'vibe-kingdom');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const PROFILE_FILE = path.join(DATA_DIR, 'speaker_profile.json');
const SIGNALS_FILE = path.join(DATA_DIR, 'signals.json');
const POSTS_FILE = path.join(DATA_DIR, 'posts.json');
const EXPORTS_DIR = path.join(DATA_DIR, 'exports');

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ensure data directories exist
 */
function ensureDirectories() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(EXPORTS_DIR)) {
    fs.mkdirSync(EXPORTS_DIR, { recursive: true });
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
    domains: [
      'cybersecurity',
      'kubernetes',
      'devops',
      'federal government IT',
      'open source'
    ],
    communities: {
      reddit: ['r/devops', 'r/kubernetes', 'r/cybersecurity', 'r/netsec', 'r/sysadmin'],
      hn: true,
      devto: true,
      github: true
    },
    filters: {
      minUpvotes: 10,
      minComments: 3,
      excludeKeywords: ['politics', 'election', 'partisan', 'inflammatory'],
      includeKeywords: ['security', 'linux', 'kubernetes', 'devops', 'cloud', 'government']
    },
    voice: {
      tone: 'pragmatic',
      style: 'grounded_architect',
      maxWordCount: 280,
      varyLength: true
    }
  };
  
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(defaultConfig, null, 2));
  return defaultConfig;
}

/**
 * Load state files
 */
function loadSignals() {
  if (fs.existsSync(SIGNALS_FILE)) {
    return JSON.parse(fs.readFileSync(SIGNALS_FILE, 'utf8'));
  }
  return [];
}

function loadPosts() {
  if (fs.existsSync(POSTS_FILE)) {
    return JSON.parse(fs.readFileSync(POSTS_FILE, 'utf8'));
  }
  return [];
}

function loadProfile() {
  if (fs.existsSync(PROFILE_FILE)) {
    return JSON.parse(fs.readFileSync(PROFILE_FILE, 'utf8'));
  }
  return null;
}

/**
 * Save state files
 */
function saveSignals(signals) {
  fs.writeFileSync(SIGNALS_FILE, JSON.stringify(signals, null, 2));
}

function savePosts(posts) {
  fs.writeFileSync(POSTS_FILE, JSON.stringify(posts, null, 2));
}

function saveProfile(profile) {
  fs.writeFileSync(PROFILE_FILE, JSON.stringify(profile, null, 2));
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tavily API call for web search
 */
function tavilySearch(query, maxResults = 10) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      reject(new Error('TAVILY_API_KEY not set'));
      return;
    }

    const payload = JSON.stringify({
      api_key: apiKey,
      query: query,
      max_results: maxResults,
      include_answer: true,
      search_depth: 'advanced',
      topic: 'general'
    });

    const options = {
      hostname: 'api.tavily.com',
      path: '/search',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': payload.length
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

/**
 * Mock signal generation (in real implementation, would scrape communities)
 */
async function generateMockSignals(config) {
  const signals = [];
  
  // For demo: use Tavily to find real signals about your domains
  try {
    const queries = [
      'zero trust security government 2026',
      'kubernetes devops best practices',
      'open source federal IT modernization',
      'cybersecurity infrastructure automation'
    ];

    for (const query of queries) {
      try {
        const results = await tavilySearch(query, 5);
        if (results.results) {
          results.results.slice(0, 2).forEach((result, idx) => {
            signals.push({
              id: signals.length + 1,
              source: 'web_search',
              title: result.title,
              url: result.url,
              content: result.content.substring(0, 500),
              score: result.score,
              timestamp: new Date().toISOString(),
              domain: config.domains[idx % config.domains.length],
              engagement: Math.floor(Math.random() * 100) + 10
            });
          });
        }
      } catch (e) {
        console.warn(`Search failed for "${query}": ${e.message}`);
      }
    }
  } catch (e) {
    console.warn('Mock signal generation failed, using defaults');
    // Fallback mock data
    signals.push({
      id: 1,
      source: 'reddit',
      title: 'Discussion: Zero Trust Architecture in Government IT',
      url: 'https://reddit.com/r/cybersecurity/...',
      content: 'Community discussing zero trust implementation challenges...',
      score: 0.95,
      timestamp: new Date().toISOString(),
      domain: 'cybersecurity',
      engagement: 45
    });
  }

  return signals;
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build speaker profile from public signals (mock implementation)
 */
async function buildSpeakerProfile(userName = 'Adam Clater') {
  console.log(`Building Speaker Profile for ${userName}...`);
  
  try {
    // Search for public content about the person
    const searchResults = await tavilySearch(`${userName} articles publications thought leadership`, 5);
    
    const profile = {
      name: userName,
      builtAt: new Date().toISOString(),
      domains: ['cybersecurity', 'IT modernization', 'open source', 'government IT'],
      tone: 'pragmatic, grounded, pragmatic senior architect',
      style: {
        openers: [
          'I recently read...',
          'Been thinking about...',
          'Saw this issue come up...',
          'The good news is...',
          'We\'ve seen teams struggle with...',
          'This mirrors what we\'re seeing...',
          'Interesting timing on this...',
          'Had a conversation about...'
        ],
        vocabulary: 'technical but accessible, uses standards (NIST, CISA)',
        structure: 'problem → solution → why it matters',
        length: '80-280 words, varies naturally',
        avoids: ['emojis', 'hashtags', 'inflammatory language', 'generic praise']
      },
      values: ['security-first', 'pragmatism', 'open standards', 'collaboration'],
      sources: searchResults.results ? searchResults.results.length : 0,
      lastUpdated: new Date().toISOString()
    };

    return profile;
  } catch (e) {
    console.warn('Profile build failed, using defaults:', e.message);
    return {
      name: userName,
      builtAt: new Date().toISOString(),
      domains: ['cybersecurity', 'IT modernization', 'open source'],
      tone: 'pragmatic, grounded senior architect',
      style: {
        openers: ['I recently read...', 'Been thinking about...', 'Saw this issue...'],
        vocabulary: 'technical, practical',
        structure: 'insight → why it matters',
        length: '80-280 words'
      },
      values: ['security', 'pragmatism', 'collaboration'],
      lastUpdated: new Date().toISOString()
    };
  }
}

/**
 * Generate a post from a signal
 */
async function generatePostFromSignal(signal, profile) {
  // Mock post generation using speaker profile
  const openers = profile.style.openers || [];
  const opener = openers[Math.floor(Math.random() * openers.length)];
  
  const posts = [
    `${opener} ${signal.title}. The core issue here is something we deal with constantly: how do you balance innovation with stability? The practical answer is usually "discipline." You need solid fundamentals before you can move fast.`,
    
    `${opener} the discussion about ${signal.domain}. What struck me: teams often skip the foundational work. You can't shortcut this stuff. Security, automation, observability—these aren't nice-to-haves in modern infrastructure.`,
    
    `${opener} this thread about ${signal.domain}. The challenge is real: most organizations are trying to do too much at once. The good news is the patterns are well-established. You just need to pick your battles and stay disciplined.`,
    
    `Been watching this pattern in ${signal.domain} for years now. The common thread? Teams that succeed are the ones that invest in the boring stuff first: monitoring, patching, documentation. Then the fast stuff actually works.`
  ];

  return posts[Math.floor(Math.random() * posts.length)];
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Commands
 */

async function cmdSetup() {
  console.log(`Initializing Vibe Kingdom at ${DATA_DIR}...`);
  ensureDirectories();
  const config = loadConfig();
  console.log('✓ Configuration created');
  console.log('✓ Directories ready');
  console.log(`\nNext steps:`);
  console.log(`  1. Edit config: ${CONFIG_FILE}`);
  console.log(`  2. Run: vibe-kingdom fetch-signals`);
  console.log(`  3. Run: vibe-kingdom generate-posts --count 5`);
}

async function cmdFetchSignals(args) {
  console.log('Fetching signals from communities...');
  ensureDirectories();
  const config = loadConfig();
  
  try {
    const signals = await generateMockSignals(config);
    const existing = loadSignals();
    
    // Add new signals
    const newSignals = signals.filter(s => !existing.find(e => e.url === s.url));
    const combined = [...existing, ...newSignals];
    saveSignals(combined);
    
    console.log(`✓ Found ${newSignals.length} new signals`);
    console.log(`  Total signals: ${combined.length}`);
  } catch (e) {
    console.error('Signal fetch failed:', e.message);
    process.exit(1);
  }
}

async function cmdGeneratePosts(args) {
  const count = parseInt(args.count || 5);
  console.log(`Generating ${count} posts...`);
  ensureDirectories();
  
  try {
    let profile = loadProfile();
    if (!profile) {
      console.log('Building speaker profile first...');
      profile = await buildSpeakerProfile();
      saveProfile(profile);
    }

    const signals = loadSignals().slice(0, count);
    const posts = [];

    for (const signal of signals) {
      const content = await generatePostFromSignal(signal, profile);
      posts.push({
        id: Math.floor(Math.random() * 10000),
        signal_id: signal.id,
        signal_title: signal.title,
        signal_source: signal.source,
        content: content,
        status: 'draft',
        created_at: new Date().toISOString(),
        approved_at: null,
        exported_at: null
      });
    }

    const existing = loadPosts();
    const combined = [...existing, ...posts];
    savePosts(combined);

    console.log(`✓ Generated ${posts.length} draft posts`);
    posts.forEach(p => {
      console.log(`\n[Draft ${p.id}] From: ${p.signal_source}`);
      console.log(p.content.substring(0, 100) + '...');
    });
  } catch (e) {
    console.error('Post generation failed:', e.message);
    process.exit(1);
  }
}

function cmdListPosts(args) {
  const status = args.status || null;
  console.log('Posts:\n');
  
  const posts = loadPosts().filter(p => !status || p.status === status);
  posts.forEach(p => {
    const badge = {draft: '📝', approved: '✅', exported: '📤'}[p.status] || '•';
    console.log(`${badge} [${p.id}] ${p.status.toUpperCase()}`);
    console.log(`  From: ${p.signal_source}`);
    console.log(`  ${p.content.substring(0, 80)}...`);
  });
}

function cmdSetStatus(args) {
  const id = parseInt(args[0]);
  const newStatus = args[1];
  
  if (!id || !newStatus) {
    console.error('Usage: set-status <id> <draft|approved|exported>');
    process.exit(1);
  }

  const posts = loadPosts();
  const post = posts.find(p => p.id === id);
  
  if (!post) {
    console.error(`Post ${id} not found`);
    process.exit(1);
  }

  post.status = newStatus;
  if (newStatus === 'approved') post.approved_at = new Date().toISOString();
  if (newStatus === 'exported') post.exported_at = new Date().toISOString();
  
  savePosts(posts);
  console.log(`✓ Post ${id} marked as ${newStatus}`);
}

function cmdExportCSV(args) {
  const outfile = args.outfile || path.join(EXPORTS_DIR, `posts_${new Date().toISOString().split('T')[0]}.csv`);
  const posts = loadPosts().filter(p => p.status === 'approved');
  
  if (posts.length === 0) {
    console.log('No approved posts to export');
    return;
  }

  let csv = 'post_id,signal_source,content,approved_date\n';
  posts.forEach(p => {
    const content = p.content.replace(/"/g, '""').replace(/\n/g, ' ');
    csv += `${p.id},"${p.signal_source}","${content}","${p.approved_at}"\n`;
  });

  fs.writeFileSync(outfile, csv);
  console.log(`✓ Exported ${posts.length} posts to ${outfile}`);
}

async function cmdRebuildProfile() {
  console.log('Rebuilding Speaker Profile...');
  const profile = await buildSpeakerProfile();
  saveProfile(profile);
  console.log('✓ Profile rebuilt');
  console.log(`  Tone: ${profile.tone}`);
  console.log(`  Domains: ${profile.domains.join(', ')}`);
}

function cmdShowConfig() {
  ensureDirectories();
  const config = loadConfig();
  console.log(JSON.stringify(config, null, 2));
}

function cmdShowPost(args) {
  const id = parseInt(args[0]);
  const posts = loadPosts();
  const post = posts.find(p => p.id === id);
  
  if (!post) {
    console.error(`Post ${id} not found`);
    process.exit(1);
  }

  console.log(`\nPost ${post.id} [${post.status}]`);
  console.log(`From: ${post.signal_source}`);
  console.log(`Signal: ${post.signal_title}`);
  console.log(`Created: ${post.created_at}\n`);
  console.log(post.content);
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Main CLI
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`
Vibe Kingdom - OpenClaw Edition
Personal brand amplification using signal sources and authentic voice.

Usage:
  vibe-kingdom setup                      Initialize setup
  vibe-kingdom fetch-signals              Discover signals from communities
  vibe-kingdom generate-posts --count N   Generate N draft posts
  vibe-kingdom list-posts [--status S]    List posts by status
  vibe-kingdom show-post <id>             View full post
  vibe-kingdom set-status <id> <status>   Mark post as draft/approved/exported
  vibe-kingdom export-csv [--outfile F]   Export approved posts
  vibe-kingdom rebuild-profile            Rebuild Speaker Profile
  vibe-kingdom show-config                Show configuration

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
      case 'fetch-signals': return await cmdFetchSignals(cmdArgs);
      case 'generate-posts': return await cmdGeneratePosts(cmdArgs);
      case 'list-posts': return cmdListPosts(cmdArgs);
      case 'show-post': return cmdShowPost(args.slice(1));
      case 'set-status': return cmdSetStatus(args.slice(1));
      case 'export-csv': return cmdExportCSV(cmdArgs);
      case 'rebuild-profile': return await cmdRebuildProfile();
      case 'show-config': return cmdShowConfig();
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

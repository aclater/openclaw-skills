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
const http = require('http');

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
      hackernews: true,
      devto: true,
      github: true,
      tavily: true
    },
    filters: {
      minEngagement: {
        reddit: 10,
        hackernews: 20,
        devto: 5,
        github: 10
      },
      excludeKeywords: ['politics', 'election', 'partisan', 'inflammatory', 'trump', 'biden'],
      includeKeywords: ['security', 'linux', 'kubernetes', 'devops', 'cloud', 'government', 'automation']
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
 * API Calls
 */

function makeRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const protocol = options.protocol === 'https:' ? https : http;
    
    const req = protocol.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

/**
 * Tavily Search
 */
async function tavilySearch(query, maxResults = 10) {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    console.warn('⚠️  TAVILY_API_KEY not set, skipping Tavily search');
    return [];
  }

  try {
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

    const response = await makeRequest(options, null);
    
    if (response.results) {
      return response.results.map(r => ({
        source: 'tavily_search',
        title: r.title,
        url: r.url,
        content: r.content.substring(0, 500),
        score: r.score,
        timestamp: new Date().toISOString(),
        engagement: Math.floor(r.score * 100)
      }));
    }
  } catch (e) {
    console.warn('Tavily search failed:', e.message);
  }
  return [];
}

/**
 * Hacker News API
 */
async function fetchHackerNewsSignals(config) {
  try {
    const options = {
      hostname: 'hacker-news.firebaseio.com',
      path: '/v0/topstories.json',
      method: 'GET',
      protocol: 'https:'
    };

    const topStories = await makeRequest(options);
    const signals = [];

    // Get top 10 stories
    for (let i = 0; i < Math.min(10, topStories.length); i++) {
      const storyId = topStories[i];
      try {
        const storyOptions = {
          hostname: 'hacker-news.firebaseio.com',
          path: `/v0/item/${storyId}.json`,
          method: 'GET',
          protocol: 'https:'
        };

        const story = await makeRequest(storyOptions);
        
        if (story.title && story.score >= config.filters.minEngagement.hackernews) {
          // Check if domain matches
          const title = story.title.toLowerCase();
          const matches = config.domains.some(d => title.includes(d)) || 
                         config.filters.includeKeywords.some(k => title.includes(k));
          
          if (matches && !config.filters.excludeKeywords.some(k => title.includes(k))) {
            signals.push({
              source: 'hackernews',
              title: story.title,
              url: story.url || `https://news.ycombinator.com/item?id=${storyId}`,
              content: story.title,
              score: Math.min(story.score / 100, 1),
              timestamp: new Date().toISOString(),
              engagement: story.score,
              comments: story.descendants || 0
            });
          }
        }
      } catch (e) {
        // Skip failed story
      }
    }

    return signals;
  } catch (e) {
    console.warn('HN fetch failed:', e.message);
    return [];
  }
}

/**
 * Dev.to API
 */
async function fetchDevtoSignals(config) {
  try {
    const keywords = config.domains.join(',');
    const options = {
      hostname: 'dev.to',
      path: `/api/articles?query=${encodeURIComponent(keywords)}&per_page=10`,
      method: 'GET',
      protocol: 'https:'
    };

    const response = await makeRequest(options);
    
    if (Array.isArray(response)) {
      return response.map(article => ({
        source: 'devto',
        title: article.title,
        url: article.url,
        content: article.description?.substring(0, 500) || article.title,
        score: Math.min((article.positive_reactions_count || 0) / 100, 1),
        timestamp: article.published_at || new Date().toISOString(),
        engagement: article.positive_reactions_count || 0,
        comments: article.comments_count || 0
      }));
    }
  } catch (e) {
    console.warn('Dev.to fetch failed:', e.message);
  }
  return [];
}

/**
 * GitHub Trending
 */
async function fetchGitHubSignals(config) {
  try {
    const signals = [];
    
    for (const keyword of config.domains.slice(0, 3)) {
      try {
        const options = {
          hostname: 'api.github.com',
          path: `/search/repositories?q=${encodeURIComponent(keyword)}&sort=stars&per_page=5`,
          method: 'GET',
          protocol: 'https:',
          headers: {
            'User-Agent': 'OpenClaw'
          }
        };

        const response = await makeRequest(options);
        
        if (response.items) {
          response.items.slice(0, 3).forEach(repo => {
            signals.push({
              source: 'github',
              title: repo.full_name,
              url: repo.html_url,
              content: repo.description || repo.full_name,
              score: Math.min(repo.stargazers_count / 10000, 1),
              timestamp: repo.updated_at || new Date().toISOString(),
              engagement: repo.stargazers_count,
              language: repo.language || 'unknown'
            });
          });
        }
      } catch (e) {
        // Skip keyword
      }
    }

    return signals;
  } catch (e) {
    console.warn('GitHub fetch failed:', e.message);
  }
  return [];
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build speaker profile from public signals
 */
async function buildSpeakerProfile(userName = 'Adam Clater') {
  console.log(`Building Speaker Profile for ${userName}...`);
  
  try {
    const results = await tavilySearch(`${userName} articles publications`, 5);
    
    const profile = {
      name: userName,
      builtAt: new Date().toISOString(),
      domains: ['cybersecurity', 'IT modernization', 'open source', 'government IT'],
      tone: 'pragmatic, grounded, senior architect',
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
      sources: results.length,
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
 * Generate post from signal
 */
function generatePostFromSignal(signal, profile) {
  const openers = profile.style.openers || [];
  const opener = openers[Math.floor(Math.random() * openers.length)];
  
  const postVariations = [
    `${opener} ${signal.title}. The underlying challenge is real: how do you balance moving fast with maintaining solid fundamentals? The practical answer: discipline. Security, automation, observability—you can't skip the boring stuff.`,
    
    `${opener} the discussion around ${signal.source === 'devto' ? 'web development' : 'infrastructure'}. What struck me: most teams overlook the foundational work. You need monitoring, patching, clear processes. Then the interesting stuff actually works.`,
    
    `I've been watching this pattern for years. Teams that succeed invest in the basics first. ${opener} another take on exactly this. The good news: the patterns are well-established. You just need discipline to execute them.`,
    
    `${opener} ${signal.title}. The challenge is one we see constantly: balancing innovation with stability. The answer isn't complicated—it's just unglamorous. Focus on the fundamentals, and the rest follows.`,
    
    `Been thinking about this a lot. ${opener} This exact issue. What works: a disciplined approach. What doesn't: trying to do everything at once. Pick your battles, build solid foundations, move forward systematically.`
  ];

  return postVariations[Math.floor(Math.random() * postVariations.length)];
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
  console.log('🔍 Fetching signals from communities...\n');
  ensureDirectories();
  const config = loadConfig();
  
  try {
    let signals = [];

    // Tavily
    if (config.communities.tavily) {
      console.log('Tavily...');
      for (const domain of config.domains) {
        const results = await tavilySearch(`${domain} 2026`, 5);
        signals = signals.concat(results.slice(0, 2));
      }
    }

    // Hacker News
    if (config.communities.hackernews) {
      console.log('Hacker News...');
      const hnSignals = await fetchHackerNewsSignals(config);
      signals = signals.concat(hnSignals);
    }

    // Dev.to
    if (config.communities.devto) {
      console.log('Dev.to...');
      const devtoSignals = await fetchDevtoSignals(config);
      signals = signals.concat(devtoSignals);
    }

    // GitHub
    if (config.communities.github) {
      console.log('GitHub Trending...');
      const ghSignals = await fetchGitHubSignals(config);
      signals = signals.concat(ghSignals);
    }

    const existing = loadSignals();
    const existingUrls = new Set(existing.map(s => s.url));
    
    const newSignals = signals.filter(s => !existingUrls.has(s.url));
    const combined = [...existing, ...newSignals];
    
    saveSignals(combined);
    
    console.log(`\n✓ Found ${newSignals.length} new signals`);
    console.log(`  Total signals: ${combined.length}`);
  } catch (e) {
    console.error('Signal fetch failed:', e.message);
    process.exit(1);
  }
}

async function cmdGeneratePosts(args) {
  const count = parseInt(args.count || 5);
  console.log(`📝 Generating ${count} posts...\n`);
  ensureDirectories();
  
  try {
    let profile = loadProfile();
    if (!profile) {
      console.log('Building speaker profile first...');
      profile = await buildSpeakerProfile();
      saveProfile(profile);
    }

    const signals = loadSignals().slice(0, count);
    if (signals.length === 0) {
      console.log('No signals found. Run: vibe-kingdom fetch-signals');
      return;
    }

    const posts = [];

    for (const signal of signals) {
      const content = generatePostFromSignal(signal, profile);
      posts.push({
        id: Math.floor(Math.random() * 100000),
        signal_id: `${signal.source}_${Math.random()}`,
        signal_title: signal.title,
        signal_source: signal.source,
        signal_url: signal.url,
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

    console.log(`✓ Generated ${posts.length} draft posts\n`);
    posts.slice(0, 3).forEach(p => {
      console.log(`[Draft ${p.id}] From: ${p.signal_source}`);
      console.log(p.content.substring(0, 100) + '...\n');
    });
  } catch (e) {
    console.error('Post generation failed:', e.message);
    process.exit(1);
  }
}

function cmdListPosts(args) {
  const status = args.status || null;
  console.log('\n📋 Posts:\n');
  
  const posts = loadPosts().filter(p => !status || p.status === status);
  if (posts.length === 0) {
    console.log('No posts found.');
    return;
  }

  posts.forEach(p => {
    const badge = {draft: '📝', approved: '✅', exported: '📤'}[p.status] || '•';
    console.log(`${badge} [${p.id}] ${p.status.toUpperCase()}`);
    console.log(`  From: ${p.signal_source}`);
    console.log(`  ${p.content.substring(0, 80)}...`);
  });
  console.log();
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
  console.log('🔨 Rebuilding Speaker Profile...');
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
  console.log();
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
  vibe-kingdom generate-posts [--count N] Generate N draft posts
  vibe-kingdom list-posts [--status S]    List posts by status
  vibe-kingdom show-post <id>             View full post
  vibe-kingdom set-status <id> <status>   Mark post as draft/approved/exported
  vibe-kingdom export-csv [--outfile F]   Export approved posts to CSV
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

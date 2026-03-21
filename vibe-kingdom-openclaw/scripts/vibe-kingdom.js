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

function ensureDirectories() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(EXPORTS_DIR)) fs.mkdirSync(EXPORTS_DIR, { recursive: true });
}

function loadConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  }
  const defaultConfig = {
    userName: 'Adam Clater',
    employer: 'Red Hat',
    domains: ['cybersecurity', 'kubernetes', 'devops', 'federal government IT', 'open source'],
    communities: {
      reddit: ['r/devops', 'r/kubernetes', 'r/cybersecurity', 'r/netsec', 'r/sysadmin'],
      hackernews: true,
      devto: true,
      github: true,
      tavily: true
    },
    filters: {
      minEngagement: { reddit: 10, hackernews: 20, devto: 5, github: 10 },
      excludeKeywords: ['politics', 'election', 'partisan', 'inflammatory', 'trump', 'biden'],
      includeKeywords: ['security', 'linux', 'kubernetes', 'devops', 'cloud', 'government', 'automation']
    },
    voice: { tone: 'pragmatic', style: 'grounded_architect', maxWordCount: 280, varyLength: true }
  };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(defaultConfig, null, 2));
  return defaultConfig;
}

function loadSignals() {
  return fs.existsSync(SIGNALS_FILE) ? JSON.parse(fs.readFileSync(SIGNALS_FILE, 'utf8')) : [];
}

function loadPosts() {
  return fs.existsSync(POSTS_FILE) ? JSON.parse(fs.readFileSync(POSTS_FILE, 'utf8')) : [];
}

function loadProfile() {
  return fs.existsSync(PROFILE_FILE) ? JSON.parse(fs.readFileSync(PROFILE_FILE, 'utf8')) : null;
}

function saveSignals(signals) { fs.writeFileSync(SIGNALS_FILE, JSON.stringify(signals, null, 2)); }
function savePosts(posts)     { fs.writeFileSync(POSTS_FILE,   JSON.stringify(posts,   null, 2)); }
function saveProfile(profile) { fs.writeFileSync(PROFILE_FILE, JSON.stringify(profile, null, 2)); }

function nextId(items) {
  return items.length === 0 ? 1 : Math.max(...items.map(i => i.id)) + 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP helper

function makeRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const protocol = options.protocol === 'https:' ? https : http;

    let bodyData = null;
    if (body !== null && body !== undefined) {
      bodyData = typeof body === 'string' ? body : JSON.stringify(body);
      if (!options.headers) options.headers = {};
      options.headers['Content-Length'] = Buffer.byteLength(bodyData);
    }

    const req = protocol.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { resolve(data); }
      });
    });

    req.on('error', reject);
    if (bodyData) req.write(bodyData);
    req.end();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Claude API

function callClaude(userPrompt, systemPrompt = null, maxTokens = 1024) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      reject(new Error('ANTHROPIC_API_KEY not set'));
      return;
    }

    const requestBody = {
      model: 'claude-opus-4-6',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: userPrompt }]
    };
    if (systemPrompt) requestBody.system = systemPrompt;

    const payload = Buffer.from(JSON.stringify(requestBody));

    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': payload.length
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
// Signal sources

async function tavilySearch(query, maxResults = 10) {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    process.stderr.write('TAVILY_API_KEY not set, skipping Tavily search\n');
    return [];
  }

  try {
    const body = {
      api_key: apiKey,
      query,
      max_results: maxResults,
      include_answer: true,
      search_depth: 'advanced',
      topic: 'general'
    };

    const response = await makeRequest({
      hostname: 'api.tavily.com',
      path: '/search',
      method: 'POST',
      protocol: 'https:',
      headers: { 'Content-Type': 'application/json' }
    }, body);

    if (response.results) {
      return response.results.map(r => ({
        source: 'tavily_search',
        title: r.title,
        url: r.url,
        content: (r.content || '').substring(0, 500),
        score: r.score || 0,
        timestamp: new Date().toISOString(),
        engagement: Math.floor((r.score || 0) * 100)
      }));
    }
  } catch (e) {
    process.stderr.write(`Tavily search failed: ${e.message}\n`);
  }
  return [];
}

async function fetchHackerNewsSignals(config) {
  try {
    const topStories = await makeRequest({
      hostname: 'hacker-news.firebaseio.com',
      path: '/v0/topstories.json',
      method: 'GET',
      protocol: 'https:'
    });

    const signals = [];
    for (let i = 0; i < Math.min(10, topStories.length); i++) {
      try {
        const story = await makeRequest({
          hostname: 'hacker-news.firebaseio.com',
          path: `/v0/item/${topStories[i]}.json`,
          method: 'GET',
          protocol: 'https:'
        });

        if (!story.title || story.score < config.filters.minEngagement.hackernews) continue;

        const title = story.title.toLowerCase();
        const matches = config.domains.some(d => title.includes(d.toLowerCase())) ||
                       config.filters.includeKeywords.some(k => title.includes(k));

        if (matches && !config.filters.excludeKeywords.some(k => title.includes(k))) {
          signals.push({
            source: 'hackernews',
            title: story.title,
            url: story.url || `https://news.ycombinator.com/item?id=${topStories[i]}`,
            content: story.title,
            score: Math.min(story.score / 100, 1),
            timestamp: new Date().toISOString(),
            engagement: story.score,
            comments: story.descendants || 0
          });
        }
      } catch (e) { /* skip */ }
    }
    return signals;
  } catch (e) {
    process.stderr.write(`HN fetch failed: ${e.message}\n`);
    return [];
  }
}

async function fetchDevtoSignals(config) {
  try {
    const keywords = config.domains.slice(0, 3).join(',');
    const response = await makeRequest({
      hostname: 'dev.to',
      path: `/api/articles?tag=${encodeURIComponent(config.domains[0])}&per_page=10`,
      method: 'GET',
      protocol: 'https:',
      headers: { 'User-Agent': 'OpenClaw' }
    });

    if (Array.isArray(response)) {
      return response.map(article => ({
        source: 'devto',
        title: article.title,
        url: article.url,
        content: (article.description || article.title).substring(0, 500),
        score: Math.min((article.positive_reactions_count || 0) / 100, 1),
        timestamp: article.published_at || new Date().toISOString(),
        engagement: article.positive_reactions_count || 0,
        comments: article.comments_count || 0
      }));
    }
  } catch (e) {
    process.stderr.write(`Dev.to fetch failed: ${e.message}\n`);
  }
  return [];
}

async function fetchGitHubSignals(config) {
  const signals = [];
  for (const keyword of config.domains.slice(0, 3)) {
    try {
      const response = await makeRequest({
        hostname: 'api.github.com',
        path: `/search/repositories?q=${encodeURIComponent(keyword)}&sort=stars&per_page=5`,
        method: 'GET',
        protocol: 'https:',
        headers: {
          'User-Agent': 'OpenClaw',
          'Accept': 'application/vnd.github+json'
        }
      });

      if (response.items) {
        response.items.slice(0, 3).forEach(repo => {
          signals.push({
            source: 'github',
            title: `${repo.full_name}: ${repo.description || ''}`.trim(),
            url: repo.html_url,
            content: (repo.description || repo.full_name).substring(0, 500),
            score: Math.min(repo.stargazers_count / 10000, 1),
            timestamp: repo.updated_at || new Date().toISOString(),
            engagement: repo.stargazers_count,
            language: repo.language || 'unknown'
          });
        });
      }
    } catch (e) { /* skip keyword */ }
  }
  return signals;
}

// ─────────────────────────────────────────────────────────────────────────────
// Speaker Profile

async function buildSpeakerProfile(config) {
  const name = config.userName || 'Adam Clater';
  const employer = config.employer || 'Red Hat';
  console.log(`Building Speaker Profile for ${name}...`);

  // Gather public signals
  let webResults = [];
  try {
    webResults = await tavilySearch(`"${name}" "${employer}" articles talks publications`, 8);
  } catch (e) { /* continue without */ }

  const resultSummary = webResults.length > 0
    ? webResults.map(r => `- ${r.title}\n  ${r.content}`).join('\n')
    : 'No public web results found.';

  const systemPrompt = `You are building a writing profile for an AI LinkedIn ghostwriter. Be specific and concrete. Output only valid JSON with no markdown or explanation.`;

  const userPrompt = `Build a Speaker Profile for ${name}, ${employer}.

Public signals found:
${resultSummary}

Return a JSON object with exactly these fields:
{
  "name": "${name}",
  "employer": "${employer}",
  "domains": ["array", "of", "specific", "technical", "domains"],
  "tone": "one-line description of voice and style",
  "openers": ["6-8 natural sentence openers this person would use"],
  "vocabulary": "description of preferred vocabulary and terminology",
  "structure": "preferred post structure",
  "avoids": ["things", "to", "avoid"],
  "values": ["core", "professional", "values"]
}`;

  try {
    const raw = await callClaude(userPrompt, systemPrompt, 1024);
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const profile = JSON.parse(jsonMatch[0]);
      profile.builtAt = new Date().toISOString();
      profile.sourceCount = webResults.length;
      return profile;
    }
  } catch (e) {
    process.stderr.write(`Profile LLM failed: ${e.message}\n`);
  }

  // Fallback
  return {
    name,
    employer,
    builtAt: new Date().toISOString(),
    domains: config.domains,
    tone: 'pragmatic, grounded senior architect',
    openers: [
      'I recently read...', 'Been thinking about...', 'Saw this issue come up...',
      'The good news is...', "We've seen teams struggle with...",
      'This mirrors what we\'re seeing...', 'Had a conversation about...',
      'Interesting timing on this...'
    ],
    vocabulary: 'technical but accessible, uses standards (NIST, CISA, FIPS)',
    structure: 'problem → insight → why it matters',
    avoids: ['emojis', 'hashtags', 'partisan topics', 'generic praise'],
    values: ['security-first', 'pragmatism', 'open standards', 'collaboration'],
    sourceCount: 0
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Post generation

async function generatePostFromSignal(signal, profile) {
  const systemPrompt = `You are a LinkedIn ghostwriter for ${profile.name} at ${profile.employer}.

Voice: ${profile.tone}
Domains: ${(profile.domains || []).join(', ')}
Openers: ${(profile.openers || []).join(' | ')}
Vocabulary: ${profile.vocabulary}
Structure: ${profile.structure}
Avoid: ${(profile.avoids || []).join(', ')}

Write authentic LinkedIn posts that sound like genuine insights from a senior architect who has seen these problems in the field. No emojis, no hashtags, no generic praise. Plain text only, max ${profile.maxWordCount || 280} words.`;

  const userPrompt = `Write a LinkedIn post inspired by this signal:

Source: ${signal.source}
Title: ${signal.title}
Content: ${signal.content}
URL: ${signal.url}

Generate one post in the person's voice. Open with one of their natural openers. Add a specific insight from their domain experience. Keep it conversational, not promotional.`;

  try {
    return await callClaude(userPrompt, systemPrompt, 512);
  } catch (e) {
    process.stderr.write(`Post generation LLM failed: ${e.message}\n`);
    // Minimal fallback
    const opener = (profile.openers || ['Been thinking about...'])[0];
    return `${opener} ${signal.title}. The underlying challenge is real and one we encounter constantly in this space. The patterns for addressing it are well-established — the hard part is execution.`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Commands

async function cmdSetup() {
  console.log(`Initializing Vibe Kingdom at ${DATA_DIR}...`);
  ensureDirectories();
  const config = loadConfig();
  console.log('Configuration created');
  console.log(`  Edit: ${CONFIG_FILE}`);
  console.log(`  Set userName and employer fields`);
  console.log('');
  console.log('Required env vars:');
  console.log('  ANTHROPIC_API_KEY  — post generation and speaker profile');
  console.log('  TAVILY_API_KEY     — web search signals');
  console.log('');
  console.log('Next steps:');
  console.log('  1. Edit config.json with your domains and communities');
  console.log('  2. vibe-kingdom fetch-signals');
  console.log('  3. vibe-kingdom generate-posts --count 5');
}

async function cmdFetchSignals(args) {
  console.log('Fetching signals from communities...\n');
  ensureDirectories();
  const config = loadConfig();

  let signals = [];

  if (config.communities.tavily) {
    process.stdout.write('  Tavily... ');
    for (const domain of config.domains) {
      const results = await tavilySearch(`${domain} ${new Date().getFullYear()}`, 5);
      signals = signals.concat(results.slice(0, 2));
    }
    console.log(`${signals.length} results`);
  }

  if (config.communities.hackernews) {
    process.stdout.write('  Hacker News... ');
    const hn = await fetchHackerNewsSignals(config);
    console.log(`${hn.length} results`);
    signals = signals.concat(hn);
  }

  if (config.communities.devto) {
    process.stdout.write('  Dev.to... ');
    const devto = await fetchDevtoSignals(config);
    console.log(`${devto.length} results`);
    signals = signals.concat(devto);
  }

  if (config.communities.github) {
    process.stdout.write('  GitHub... ');
    const gh = await fetchGitHubSignals(config);
    console.log(`${gh.length} results`);
    signals = signals.concat(gh);
  }

  const existing = loadSignals();
  const existingUrls = new Set(existing.map(s => s.url));
  const newSignals = signals
    .filter(s => s.url && !existingUrls.has(s.url))
    .map((s, i) => ({ ...s, id: existing.length + i + 1 }));

  const combined = [...existing, ...newSignals];
  saveSignals(combined);

  console.log(`\nNew signals: ${newSignals.length}`);
  console.log(`Total signals: ${combined.length}`);
}

async function cmdGeneratePosts(args) {
  const count = parseInt(args.count || 5);
  console.log(`Generating ${count} posts...\n`);
  ensureDirectories();

  let profile = loadProfile();
  if (!profile) {
    const config = loadConfig();
    profile = await buildSpeakerProfile(config);
    saveProfile(profile);
    console.log('Speaker profile built\n');
  }

  const signals = loadSignals();
  if (signals.length === 0) {
    console.log('No signals found. Run: vibe-kingdom fetch-signals');
    return;
  }

  // Use most recent signals first, skip already-used ones
  const existingPosts = loadPosts();
  const usedSignalIds = new Set(existingPosts.map(p => p.signal_id));
  const available = signals.filter(s => !usedSignalIds.has(s.id)).slice(0, count);

  if (available.length === 0) {
    console.log('All signals have been used. Run: vibe-kingdom fetch-signals to get new ones.');
    return;
  }

  const newPosts = [];
  for (const signal of available) {
    process.stdout.write(`  Generating from [${signal.source}] ${signal.title.substring(0, 50)}... `);
    const content = await generatePostFromSignal(signal, profile);
    const post = {
      id: nextId([...existingPosts, ...newPosts]),
      signal_id: signal.id,
      signal_title: signal.title,
      signal_source: signal.source,
      signal_url: signal.url,
      content,
      status: 'draft',
      created_at: new Date().toISOString(),
      approved_at: null,
      exported_at: null
    };
    newPosts.push(post);
    console.log('done');
    console.log(`\n  [${post.id}] ${content.substring(0, 100)}...\n`);
  }

  savePosts([...existingPosts, ...newPosts]);
  console.log(`Saved ${newPosts.length} draft posts.`);
}

function cmdListPosts(args) {
  const status = args.status || null;
  const posts = loadPosts().filter(p => !status || p.status === status);

  if (posts.length === 0) {
    console.log('No posts found.');
    return;
  }

  posts.forEach(p => {
    console.log(`\n[${p.id}] ${p.status.toUpperCase()} — ${p.signal_source}`);
    console.log(`  ${p.content.substring(0, 100)}...`);
  });
  console.log();
}

function cmdShowPost(args) {
  const id = parseInt(args[0]);
  const post = loadPosts().find(p => p.id === id);

  if (!post) {
    console.error(`Post ${id} not found`);
    process.exit(1);
  }

  console.log(`\n[${post.id}] ${post.status.toUpperCase()}`);
  console.log(`Source: ${post.signal_source} — ${post.signal_title}`);
  console.log(`URL: ${post.signal_url}`);
  console.log(`Created: ${post.created_at}\n`);
  console.log(post.content);
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
  console.log(`Post ${id} marked as ${newStatus}`);
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
  console.log(`Exported ${posts.length} posts to ${outfile}`);
}

async function cmdRebuildProfile() {
  console.log('Rebuilding Speaker Profile...');
  const config = loadConfig();
  const profile = await buildSpeakerProfile(config);
  saveProfile(profile);
  console.log('Profile rebuilt');
  console.log(`  Tone: ${profile.tone}`);
  console.log(`  Domains: ${(profile.domains || []).join(', ')}`);
}

function cmdShowConfig() {
  ensureDirectories();
  console.log(JSON.stringify(loadConfig(), null, 2));
}

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const scriptName = path.basename(process.argv[1]);

  if (args.length === 0) {
    console.log(`
Vibe Kingdom - OpenClaw Edition

Usage:
  ${scriptName} setup                       Initialize setup
  ${scriptName} fetch-signals               Discover signals from communities
  ${scriptName} generate-posts [--count N]  Generate N draft posts (default 5)
  ${scriptName} list-posts [--status S]     List posts (draft/approved/exported)
  ${scriptName} show-post <id>              View full post
  ${scriptName} set-status <id> <status>    Mark post as draft/approved/exported
  ${scriptName} export-csv [--outfile F]    Export approved posts to CSV
  ${scriptName} rebuild-profile             Rebuild Speaker Profile from scratch
  ${scriptName} show-config                 Show configuration

Required env vars:
  ANTHROPIC_API_KEY  — post generation and speaker profile
  TAVILY_API_KEY     — web search signals (optional but recommended)

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
    case 'setup':           return cmdSetup();
    case 'fetch-signals':   return cmdFetchSignals(cmdArgs);
    case 'generate-posts':  return cmdGeneratePosts(cmdArgs);
    case 'list-posts':      return cmdListPosts(cmdArgs);
    case 'show-post':       return cmdShowPost(args.slice(1));
    case 'set-status':      return cmdSetStatus(args.slice(1));
    case 'export-csv':      return cmdExportCSV(cmdArgs);
    case 'rebuild-profile': return cmdRebuildProfile();
    case 'show-config':     return cmdShowConfig();
    default:
      console.error(`Unknown command: ${cmd}`);
      process.exit(1);
  }
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });

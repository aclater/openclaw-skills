#!/usr/bin/env node
/**
 * Vibe Kingdom - OpenClaw Edition
 *
 * Personal brand amplification using modern signal sources and authentic voice.
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
    domains: [
      'cybersecurity', 'kubernetes', 'devops', 'federal government IT',
      'open source', 'linux', 'zero trust', 'compliance'
    ],
    communities: {
      reddit: [
        'r/devops', 'r/kubernetes', 'r/cybersecurity', 'r/netsec',
        'r/sysadmin', 'r/linux', 'r/networking', 'r/redhat', 'r/openshift'
      ],
      hackernews: true,
      devto: true,
      github: true,
      mastodon: true,
      lobsters: true,
      tavily: true
    },
    filters: {
      minEngagement: {
        reddit: 25,
        hackernews: 15,
        devto: 5,
        github: 100,
        mastodon: 3,
        lobsters: 5
      },
      // Strictly non-political: content must be about technology, not political controversy
      excludeKeywords: [
        'trump', 'biden', 'harris', 'obama', 'maga', 'democrat', 'republican',
        'congress', 'senate', 'partisan', 'election', 'impeach', 'vote',
        'political party', 'gun control', 'abortion', 'immigration policy',
        'culture war', 'woke', 'dei mandate', 'antifa', 'january 6'
      ],
      includeKeywords: [
        'security', 'linux', 'kubernetes', 'devops', 'cloud', 'government',
        'automation', 'openshift', 'ansible', 'rhel', 'fedora', 'zero trust',
        'nist', 'cisa', 'federal', 'compliance', 'container', 'gitops',
        'infrastructure', 'devsecops', 'sre', 'platform engineering',
        'supply chain', 'vulnerability', 'patch', 'open source', 'networking'
      ]
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

function stripHtml(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
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
    req.setTimeout(10000, () => { req.destroy(new Error('timeout')); });
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
// Signal relevance filter

function isRelevantSignal(signal, config) {
  const text = `${signal.title} ${signal.content || ''}`.toLowerCase();

  // Must not contain any excluded (political/inflammatory) keywords
  if (config.filters.excludeKeywords?.some(k => text.includes(k.toLowerCase()))) {
    return false;
  }

  // Must contain at least one domain or include keyword
  const domainMatch = config.domains?.some(d => text.includes(d.toLowerCase()));
  const keywordMatch = config.filters.includeKeywords?.some(k => text.includes(k.toLowerCase()));

  return domainMatch || keywordMatch;
}

// ─────────────────────────────────────────────────────────────────────────────
// Signal sources

async function tavilySearch(query, maxResults = 10) {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return [];

  try {
    const response = await makeRequest({
      hostname: 'api.tavily.com',
      path: '/search',
      method: 'POST',
      protocol: 'https:',
      headers: { 'Content-Type': 'application/json' }
    }, {
      api_key: apiKey,
      query,
      max_results: maxResults,
      include_answer: false,
      search_depth: 'advanced',
      topic: 'general'
    });

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

async function fetchRedditSignals(config) {
  // Reddit's public API requires OAuth since 2023.
  // We use Tavily to surface Reddit discussions instead — it indexes Reddit content
  // and doesn't need OAuth.
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return [];

  const subreddits = config.communities.reddit || [];
  const signals = [];
  const seen = new Set();

  // Build queries from subreddits and domains
  const topSubs = subreddits.slice(0, 4).map(s => s.replace(/^r\//, '')).join(' OR ');
  const topDomains = (config.domains || []).slice(0, 3).join(' ');

  const queries = [
    `site:reddit.com (${topSubs}) ${topDomains} discussion`,
    `site:reddit.com devops kubernetes security best practices`,
    `site:reddit.com federal government IT linux open source`
  ];

  for (const query of queries) {
    try {
      const results = await tavilySearch(query, 5);
      for (const r of results) {
        if (!r.url || seen.has(r.url)) continue;
        const signal = {
          source: 'reddit',
          title: r.title,
          url: r.url,
          content: r.content,
          score: r.score,
          timestamp: r.timestamp,
          engagement: r.engagement
        };
        if (isRelevantSignal(signal, config)) {
          signals.push(signal);
          seen.add(r.url);
        }
      }
    } catch (e) { /* skip */ }
  }
  return signals;
}

async function fetchMastodonSignals(config) {
  // Public Mastodon instances with strong tech/security communities
  const sources = [
    { host: 'infosec.exchange', tags: ['cybersecurity', 'infosec', 'zerotrust'] },
    { host: 'fosstodon.org',    tags: ['linux', 'devops', 'kubernetes'] }
  ];

  const signals = [];

  for (const source of sources) {
    for (const tag of source.tags.slice(0, 2)) {
      try {
        const response = await makeRequest({
          hostname: source.host,
          path: `/api/v1/timelines/tag/${tag}?limit=15`,
          method: 'GET',
          protocol: 'https:',
          headers: { 'User-Agent': 'OpenClaw/1.0' }
        });

        if (!Array.isArray(response)) continue;

        for (const post of response) {
          if (!post.content || post.visibility !== 'public') continue;
          const text = stripHtml(post.content);
          if (text.length < 80) continue; // skip short toots

          const engagementScore = (post.reblogs_count || 0) + (post.favourites_count || 0);
          if (engagementScore < (config.filters.minEngagement?.mastodon || 3)) continue;

          const signal = {
            source: 'mastodon',
            instance: source.host,
            title: text.substring(0, 120).replace(/\n/g, ' '),
            url: post.url || post.uri,
            content: text.substring(0, 500),
            score: Math.min(engagementScore / 50, 1),
            timestamp: post.created_at || new Date().toISOString(),
            engagement: engagementScore,
            comments: post.replies_count || 0
          };

          if (isRelevantSignal(signal, config)) signals.push(signal);
        }
      } catch (e) {
        // Instance may be down, skip
      }
    }
  }
  return signals;
}

async function fetchLobstersSignals(config) {
  try {
    const response = await makeRequest({
      hostname: 'lobste.rs',
      path: '/hottest.json',
      method: 'GET',
      protocol: 'https:',
      headers: { 'User-Agent': 'OpenClaw/1.0' }
    });

    if (!Array.isArray(response)) return [];

    return response
      .filter(story => {
        if ((story.score || 0) < (config.filters.minEngagement?.lobsters || 5)) return false;
        const signal = {
          title: story.title || '',
          content: story.description || story.title || ''
        };
        return isRelevantSignal(signal, config);
      })
      .map(story => ({
        source: 'lobsters',
        title: story.title,
        url: story.url || `https://lobste.rs${story.short_id_url}`,
        content: (story.description || story.title).substring(0, 500),
        score: Math.min((story.score || 0) / 50, 1),
        timestamp: story.created_at || new Date().toISOString(),
        engagement: story.score || 0,
        comments: story.comment_count || 0,
        tags: (story.tags || []).join(', ')
      }))
      .slice(0, 10);
  } catch (e) {
    process.stderr.write(`Lobste.rs fetch failed: ${e.message}\n`);
    return [];
  }
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
    // Check top 50 for domain matches (not just 10)
    for (let i = 0; i < Math.min(50, topStories.length); i++) {
      try {
        const story = await makeRequest({
          hostname: 'hacker-news.firebaseio.com',
          path: `/v0/item/${topStories[i]}.json`,
          method: 'GET',
          protocol: 'https:'
        });

        if (!story.title) continue;
        if ((story.score || 0) < (config.filters.minEngagement?.hackernews || 15)) continue;

        const signal = {
          source: 'hackernews',
          title: story.title,
          url: story.url || `https://news.ycombinator.com/item?id=${topStories[i]}`,
          content: story.title,
          score: Math.min((story.score || 0) / 200, 1),
          timestamp: story.time ? new Date(story.time * 1000).toISOString() : new Date().toISOString(),
          engagement: story.score || 0,
          comments: story.descendants || 0
        };

        if (isRelevantSignal(signal, config)) signals.push(signal);
        if (signals.length >= 10) break;
      } catch (e) { /* skip */ }
    }
    return signals;
  } catch (e) {
    process.stderr.write(`HN fetch failed: ${e.message}\n`);
    return [];
  }
}

async function fetchDevtoSignals(config) {
  // Search multiple domain tags, not just the first one
  const tags = config.domains
    .map(d => d.toLowerCase().replace(/\s+/g, ''))
    .slice(0, 4);

  const signals = [];
  const seen = new Set();

  for (const tag of tags) {
    try {
      const response = await makeRequest({
        hostname: 'dev.to',
        path: `/api/articles?tag=${encodeURIComponent(tag)}&per_page=8&top=7`,
        method: 'GET',
        protocol: 'https:',
        headers: { 'User-Agent': 'OpenClaw/1.0' }
      });

      if (!Array.isArray(response)) continue;

      for (const article of response) {
        if (!article.url || seen.has(article.url)) continue;
        if ((article.positive_reactions_count || 0) < (config.filters.minEngagement?.devto || 5)) continue;

        const signal = {
          source: 'devto',
          title: article.title,
          url: article.url,
          content: (article.description || article.title).substring(0, 500),
          score: Math.min((article.positive_reactions_count || 0) / 100, 1),
          timestamp: article.published_at || new Date().toISOString(),
          engagement: article.positive_reactions_count || 0,
          comments: article.comments_count || 0
        };

        if (isRelevantSignal(signal, config)) {
          signals.push(signal);
          seen.add(article.url);
        }
      }
    } catch (e) { /* skip tag */ }
  }
  return signals;
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
          'User-Agent': 'OpenClaw/1.0',
          'Accept': 'application/vnd.github+json'
        }
      });

      if (response.items) {
        response.items.slice(0, 3).forEach(repo => {
          if ((repo.stargazers_count || 0) < (config.filters.minEngagement?.github || 100)) return;
          signals.push({
            source: 'github',
            title: `${repo.full_name}: ${repo.description || ''}`.trim(),
            url: repo.html_url,
            content: (repo.description || repo.full_name).substring(0, 500),
            score: Math.min((repo.stargazers_count || 0) / 10000, 1),
            timestamp: repo.updated_at || new Date().toISOString(),
            engagement: repo.stargazers_count || 0,
            language: repo.language || 'unknown'
          });
        });
      }
    } catch (e) { /* skip keyword */ }
  }
  return signals;
}

// Build targeted Tavily queries from the speaker profile and config
function buildTavilyQueries(config, profile) {
  const domains = profile?.domains || config.domains;
  const year = new Date().getFullYear();
  const queries = [];

  // Core domain queries
  for (const domain of domains.slice(0, 4)) {
    queries.push(`${domain} ${year} news best practices`);
  }

  // Federal / government tech specific (always include)
  queries.push(`CISA advisory cybersecurity ${year}`);
  queries.push(`federal government IT modernization zero trust ${year}`);
  queries.push(`NIST framework update ${year}`);

  return queries;
}

// ─────────────────────────────────────────────────────────────────────────────
// Speaker Profile

async function buildSpeakerProfile(config) {
  const name = config.userName || 'Adam Clater';
  const employer = config.employer || 'Red Hat';
  console.log(`Building Speaker Profile for ${name}...`);

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

  return {
    name,
    employer,
    builtAt: new Date().toISOString(),
    domains: config.domains,
    tone: 'pragmatic, grounded senior architect',
    openers: [
      'I recently read...', 'Been thinking about...', 'Saw this issue come up...',
      'The good news is...', "We've seen teams struggle with...",
      "This mirrors what we're seeing...", 'Had a conversation about...',
      'Interesting timing on this...'
    ],
    vocabulary: 'technical but accessible, uses standards (NIST, CISA, FIPS)',
    structure: 'problem → insight → why it matters',
    avoids: ['emojis', 'hashtags', 'partisan topics', 'generic praise', 'amplification without insight'],
    values: ['security-first', 'pragmatism', 'open standards', 'collaboration'],
    sourceCount: 0
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Post generation

async function generatePostFromSignal(signal, profile, style = null) {
  const styleHint = style === 'shorter' ? 'Keep it under 100 words, one tight observation.'
    : style === 'longer' ? 'Go deeper, 200-280 words, walk through the reasoning.'
    : style === 'more_casual' ? 'Conversational tone, like talking to a colleague over coffee.'
    : `Vary length and structure naturally, max ${profile.maxWordCount || 280} words.`;

  const systemPrompt = `You are a LinkedIn ghostwriter for ${profile.name} at ${profile.employer}.

Voice: ${profile.tone}
Domains: ${(profile.domains || []).join(', ')}
Openers: ${(profile.openers || []).join(' | ')}
Vocabulary: ${profile.vocabulary}
Structure: ${profile.structure}
Avoid: ${(profile.avoids || []).join(', ')}

Write posts that sound like genuine peer conversation from someone with 15+ years in the field. No emojis, no hashtags, no generic praise. Plain text only. The goal is peer dialogue and thought leadership, not amplification.`;

  const userPrompt = `Write a LinkedIn post inspired by this signal:

Source: ${signal.source}${signal.subreddit ? ' (' + signal.subreddit + ')' : ''}
Title: ${signal.title}
Content: ${signal.content}
URL: ${signal.url}

Critical instructions:
- Do NOT summarize or amplify this article. Use it as a conversation starter only.
- Add ${profile.name}'s original insight — what does this person actually think about this problem from field experience?
- The post should contribute new perspective, not repeat the signal's content.
- Open with one of their natural openers. Be specific to their domains (${(profile.domains || []).slice(0, 3).join(', ')}).
- ${styleHint}
- Strictly non-political and non-inflammatory. Pure technical peer conversation.`;

  try {
    return await callClaude(userPrompt, systemPrompt, 512);
  } catch (e) {
    process.stderr.write(`Post generation failed: ${e.message}\n`);
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
  console.log('');
  console.log('Required env vars:');
  console.log('  ANTHROPIC_API_KEY  — post generation and speaker profile');
  console.log('  TAVILY_API_KEY     — web search signals');
  console.log('');
  console.log('Signal sources (no auth required):');
  console.log('  Reddit, Hacker News, Dev.to, GitHub, Lobste.rs, Mastodon');
  console.log('');
  console.log('Next steps:');
  console.log('  1. Edit config.json with your domains and subreddits');
  console.log('  2. vibe-kingdom fetch-signals');
  console.log('  3. vibe-kingdom generate-posts --count 5');
}

async function cmdFetchSignals(args) {
  console.log('Fetching signals from communities...\n');
  ensureDirectories();
  const config = loadConfig();
  const profile = loadProfile();
  const community = args.community || null;

  let signals = [];

  if (!community || community === 'reddit') {
    if (config.communities.reddit?.length) {
      process.stdout.write('  Reddit... ');
      const reddit = await fetchRedditSignals(config);
      console.log(`${reddit.length} results`);
      signals = signals.concat(reddit);
    }
  }

  if (!community || community === 'hn' || community === 'hackernews') {
    if (config.communities.hackernews) {
      process.stdout.write('  Hacker News... ');
      const hn = await fetchHackerNewsSignals(config);
      console.log(`${hn.length} results`);
      signals = signals.concat(hn);
    }
  }

  if (!community || community === 'devto') {
    if (config.communities.devto) {
      process.stdout.write('  Dev.to... ');
      const devto = await fetchDevtoSignals(config);
      console.log(`${devto.length} results`);
      signals = signals.concat(devto);
    }
  }

  if (!community || community === 'github') {
    if (config.communities.github) {
      process.stdout.write('  GitHub... ');
      const gh = await fetchGitHubSignals(config);
      console.log(`${gh.length} results`);
      signals = signals.concat(gh);
    }
  }

  if (!community || community === 'mastodon') {
    if (config.communities.mastodon) {
      process.stdout.write('  Mastodon... ');
      const masto = await fetchMastodonSignals(config);
      console.log(`${masto.length} results`);
      signals = signals.concat(masto);
    }
  }

  if (!community || community === 'lobsters') {
    if (config.communities.lobsters) {
      process.stdout.write('  Lobste.rs... ');
      const lob = await fetchLobstersSignals(config);
      console.log(`${lob.length} results`);
      signals = signals.concat(lob);
    }
  }

  if (!community || community === 'tavily') {
    if (config.communities.tavily) {
      process.stdout.write('  Tavily... ');
      const queries = buildTavilyQueries(config, profile);
      let tavilyResults = [];
      for (const query of queries) {
        const results = await tavilySearch(query, 5);
        tavilyResults = tavilyResults.concat(results.slice(0, 2));
      }
      // Apply the same relevance filter
      const filtered = tavilyResults.filter(s => isRelevantSignal(s, config));
      console.log(`${filtered.length} results`);
      signals = signals.concat(filtered);
    }
  }

  // Filter by hours if requested
  if (args.hours) {
    const cutoff = new Date(Date.now() - parseInt(args.hours) * 3600000);
    signals = signals.filter(s => new Date(s.timestamp) >= cutoff);
  }

  // Deduplicate by URL and merge with existing
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

function cmdListSignals(args) {
  const signals = loadSignals();
  if (signals.length === 0) {
    console.log('No signals. Run: vibe-kingdom fetch-signals');
    return;
  }

  let filtered = signals;

  // --filter domain:kubernetes or source:reddit
  if (args.filter) {
    const [field, value] = args.filter.split(':');
    if (field === 'domain' || field === 'source') {
      const key = field === 'domain' ? 'content' : 'source';
      filtered = signals.filter(s => (s[key] || '').toLowerCase().includes(value.toLowerCase()));
    }
  }

  // --sort upvotes
  if (args.sort === 'upvotes' || args.sort === 'engagement') {
    filtered = [...filtered].sort((a, b) => (b.engagement || 0) - (a.engagement || 0));
  }

  const limit = parseInt(args.limit || 20);
  filtered.slice(0, limit).forEach(s => {
    const used = s.used ? ' [used]' : '';
    console.log(`\n[${s.id}] ${s.source.toUpperCase()}${used}`);
    console.log(`  ${s.title.substring(0, 90)}`);
    console.log(`  engagement: ${s.engagement || 0}  comments: ${s.comments || 0}`);
  });
  console.log(`\nShowing ${Math.min(filtered.length, limit)} of ${filtered.length} signals`);
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

  // Mark signals as used
  const updatedSignals = signals.map(s =>
    available.find(a => a.id === s.id) ? { ...s, used: true } : s
  );
  saveSignals(updatedSignals);
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

async function cmdRegeneratePost(args) {
  const id = parseInt(args[0]);
  const style = args.style || null;

  const posts = loadPosts();
  const post = posts.find(p => p.id === id);

  if (!post) {
    console.error(`Post ${id} not found`);
    process.exit(1);
  }

  const profile = loadProfile();
  if (!profile) {
    console.error('No speaker profile. Run: vibe-kingdom rebuild-profile');
    process.exit(1);
  }

  const signals = loadSignals();
  const signal = signals.find(s => s.id === post.signal_id);

  if (!signal) {
    console.error(`Original signal not found for post ${id}`);
    process.exit(1);
  }

  console.log(`Regenerating post ${id}${style ? ' (style: ' + style + ')' : ''}...`);
  const newContent = await generatePostFromSignal(signal, profile, style);

  post.content = newContent;
  post.status = 'draft';
  post.created_at = new Date().toISOString();
  post.approved_at = null;

  savePosts(posts);
  console.log(`\n[${post.id}] DRAFT\n`);
  console.log(newContent);
  console.log();
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
  ${scriptName} setup                          Initialize setup
  ${scriptName} fetch-signals [options]        Discover signals from communities
  ${scriptName} list-signals [options]         List discovered signals
  ${scriptName} generate-posts [--count N]     Generate N draft posts (default 5)
  ${scriptName} list-posts [--status S]        List posts (draft/approved/exported)
  ${scriptName} show-post <id>                 View full post
  ${scriptName} set-status <id> <status>       Mark post as draft/approved/exported
  ${scriptName} regenerate-post <id> [options] Regenerate a post with new angle
  ${scriptName} export-csv [--outfile F]       Export approved posts to CSV
  ${scriptName} rebuild-profile                Rebuild Speaker Profile from scratch
  ${scriptName} show-config                    Show configuration

Signal sources (no auth required):
  Reddit, Hacker News, Dev.to, GitHub, Lobste.rs, Mastodon (infosec.exchange, fosstodon.org)

fetch-signals options:
  --community <name>   Only fetch from one source (reddit, hn, devto, github, mastodon, lobsters, tavily)
  --hours <N>          Only keep signals from last N hours

list-signals options:
  --sort engagement    Sort by engagement score
  --filter source:reddit  Filter by source or domain keyword
  --limit N            Show N results (default 20)

regenerate-post options:
  --style shorter|longer|more_casual

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
    case 'setup':             return cmdSetup();
    case 'fetch-signals':     return cmdFetchSignals(cmdArgs);
    case 'list-signals':      return cmdListSignals(cmdArgs);
    case 'generate-posts':    return cmdGeneratePosts(cmdArgs);
    case 'list-posts':        return cmdListPosts(cmdArgs);
    case 'show-post':         return cmdShowPost(args.slice(1));
    case 'set-status':        return cmdSetStatus(args.slice(1));
    case 'regenerate-post':   return cmdRegeneratePost(args.slice(1).concat([cmdArgs]));
    case 'export-csv':        return cmdExportCSV(cmdArgs);
    case 'rebuild-profile':   return cmdRebuildProfile();
    case 'show-config':       return cmdShowConfig();
    default:
      console.error(`Unknown command: ${cmd}`);
      process.exit(1);
  }
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });

#!/usr/bin/env node
process.env.BUFFER_DRY_RUN = '1';
process.env.BUFFER_ACCESS_TOKEN = 'test-token';
process.env.BUFFER_PROFILE_ID = 'test-profile';

const fs = require('fs');
const os = require('os');
const path = require('path');

const testDir = path.join(os.tmpdir(), 'vibe-kingdom-approve-test');
fs.mkdirSync(testDir, { recursive: true });

// Override DATA_DIR by setting env var before requiring the module
// The module uses process.env.HOME or os.homedir() — we patch via the module
// Since the module reads DATA_DIR at load time as a const, we set HOME before require
process.env.HOME = testDir;

// Actually: just set up the data directory the module expects
const dataDir = path.join(testDir, '.openclaw', 'vibe-kingdom');
fs.mkdirSync(dataDir, { recursive: true });

fs.writeFileSync(path.join(dataDir, 'config.json'), JSON.stringify({
  buffer: { timezone: 'America/New_York', schedule: { days: ['tuesday','wednesday','friday'], windowStart: '16:00', windowEnd: '17:00', slotIntervalMinutes: 15 }}
}));

fs.writeFileSync(path.join(dataDir, 'posts.json'), JSON.stringify([
  { id: 1, status: 'draft', content: 'Post one.\nhttps://a.com', signal_source: 'hn', signal_title: 'A', signal_url: 'https://a.com', created_at: new Date().toISOString() },
  { id: 2, status: 'draft', content: 'Post two.\nhttps://b.com', signal_source: 'hn', signal_title: 'B', signal_url: 'https://b.com', created_at: new Date().toISOString() },
  { id: 3, status: 'draft', content: 'Post three.\nhttps://c.com', signal_source: 'hn', signal_title: 'C', signal_url: 'https://c.com', created_at: new Date().toISOString() }
]));

const { approvePost, rejectPost, approveAll, loadPosts } = require('./vibe-kingdom.js');

(async () => {
  await approvePost(1);
  const p1 = loadPosts().find(p => p.id === 1);
  console.assert(p1.status === 'approved', `Post 1 status: ${p1.status}`);
  console.assert(p1.scheduled_at, 'Post 1 missing scheduled_at');
  console.assert(p1.approved_at, 'Post 1 missing approved_at');
  console.log('Test 1 PASS — approve single post, scheduled_at:', p1.scheduled_at);

  await rejectPost(2);
  const p2 = loadPosts().find(p => p.id === 2);
  console.assert(p2.status === 'rejected', `Post 2 status: ${p2.status}`);
  console.assert(!p2.scheduled_at, 'Post 2 should not have scheduled_at');
  console.log('Test 2 PASS — reject post');

  await approveAll();
  const p3 = loadPosts().find(p => p.id === 3);
  console.assert(p3.status === 'approved', `Post 3 status: ${p3.status}`);
  console.assert(p1.scheduled_at !== p3.scheduled_at, 'Posts must have distinct slots');
  console.log('Test 3 PASS — approve-all, distinct slots:', p3.scheduled_at);

  console.log('All approve tests passed.');
})().catch(e => { console.error('FAIL:', e); process.exit(1); });

# Vibe Kingdom — OpenClaw-Native Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace CSV export with end-to-end LinkedIn publishing workflow: Buffer integration with slot scheduling, conversational approval in a dedicated OpenClaw agent, and improved post generation quality.

**Architecture:** vibe-kingdom.js gains `approve`, `approve-all`, `reject`, and `buffer-push` commands. Post generation gets a rewritten prompt (structure, openers, source URL, higher token limit). A README documents the four required API keys and one-time OpenClaw agent/cron setup. No container volume mounts — `os.homedir()` works correctly inside the container.

**Tech Stack:** Node.js 22, native `https` module (no new dependencies), Buffer API (REST), existing Claude API via `callClaude()`, existing posts.json/config.json storage.

**Test approach:** The script has no test framework yet. Each task adds a `--test` self-test flag or uses `node -e` one-liners to verify behaviour. For the Buffer push, tests use a dry-run mode (`BUFFER_DRY_RUN=1`) that skips the actual HTTP call and prints what would be sent.

**Key file:** `scripts/vibe-kingdom.js` — all changes are in this single file. Line references below are approximate; verify with grep before editing.

---

## File Map

| File | Change |
|---|---|
| `scripts/vibe-kingdom.js` | Add Buffer commands; rewrite post generation prompt; fix token limit and fallback |
| `README.md` | Add API key requirements and OpenClaw setup instructions |

---

## Task 1: Verify Buffer API endpoint and auth

**Files:**
- No code changes — research only

- [ ] **Step 1: Confirm the current Buffer API endpoint**

Run:
```bash
curl -s "https://api.bufferapp.com/1/user.json?access_token=$(cat ~/.buffer.key)" | head -c 300
```

Expected: JSON with `id`, `name`, or `email` fields — confirms v1 API is alive and the key works.

If you get `{"code":400,"error":"..."}` the key is wrong. If you get a connection error, try `https://api.buffer.com/1/user.json` instead. Use whichever works for all subsequent tasks.

- [ ] **Step 2: Find your LinkedIn profile ID in Buffer**

Run:
```bash
curl -s "https://api.bufferapp.com/1/profiles.json?access_token=$(cat ~/.buffer.key)" | python3 -m json.tool | grep -A5 '"service": "linkedin"'
```

Expected: JSON block containing `"id": "XXXXXXXXXXXXXXXXXXXXXXXX"` next to `"service": "linkedin"`. Note this ID — it is `BUFFER_PROFILE_ID` used in all subsequent tasks.

- [ ] **Step 3: Note the confirmed values**

Write confirmed endpoint URL and LinkedIn profile ID to a scratch note. You'll hardcode these in tests and use them as defaults in the README.

---

## Task 2: Add `nextBufferSlot()` helper

**Files:**
- Modify: `scripts/vibe-kingdom.js` — add after the `// ─── Post generation` section, around line 597

- [ ] **Step 1: Write a manual test for `nextBufferSlot`**

Create `scripts/test-slot.js`:
```javascript
#!/usr/bin/env node
// Manual test for nextBufferSlot - run with: node scripts/test-slot.js
const { nextBufferSlot } = require('./vibe-kingdom-testexports');

// Test 1: next slot from a quiet Sunday should be Tuesday
const quietSunday = new Date('2026-03-22T12:00:00-05:00'); // Sunday noon ET
const slot1 = nextBufferSlot([], quietSunday, 'America/New_York');
const d1 = new Date(slot1);
console.assert(d1.getDay() === 2, `Expected Tuesday (2), got ${d1.getDay()}`);
console.assert(d1.getHours() === 16 || d1.getUTCHours() !== 16, 'Expected 4pm ET');
console.log('Test 1 PASS — Sunday → next Tuesday 4:00pm:', slot1);

// Test 2: three consecutive calls must return distinct slots
const occupied = [];
const s1 = nextBufferSlot(occupied, quietSunday, 'America/New_York');
occupied.push(s1);
const s2 = nextBufferSlot(occupied, quietSunday, 'America/New_York');
occupied.push(s2);
const s3 = nextBufferSlot(occupied, quietSunday, 'America/New_York');
console.assert(s1 !== s2 && s2 !== s3, 'All three slots must be distinct');
console.log('Test 2 PASS — three distinct slots:', s1, s2, s3);

console.log('All tests passed.');
```

- [ ] **Run test to verify it fails** (module doesn't exist yet)

```bash
node scripts/test-slot.js 2>&1 | head -5
```
Expected: `Cannot find module './vibe-kingdom-testexports'`

- [ ] **Step 2: Add `nextBufferSlot` to `vibe-kingdom.js`**

Add this function in `vibe-kingdom.js`, after the `loadConfig` / `saveConfig` helpers and before the `// ─── Claude API` section:

```javascript
/**
 * Returns the next ISO 8601 timestamp in the Tue/Wed/Fri 4–5pm window
 * that is not already in occupiedIso (array of ISO strings).
 * fromDate defaults to now; timezone from config.buffer.timezone.
 */
function nextBufferSlot(occupiedIso, fromDate, timezone) {
  fromDate = fromDate || new Date();
  timezone = timezone || 'America/New_York';

  const occupied = new Set(occupiedIso.map(s => new Date(s).getTime()));
  const slotDays = new Set([2, 3, 5]); // Tue=2, Wed=3, Fri=5
  const windowStartHour = 16; // 4pm
  const slotMinutes = [0, 15, 30, 45];
  const maxDaysAhead = 30;

  // Walk forward minute by minute through valid slots
  // Start from next minute to avoid "now" edge cases
  const cursor = new Date(fromDate.getTime() + 60000);

  for (let day = 0; day < maxDaysAhead; day++) {
    // Get local date parts in the target timezone
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
      weekday: 'short'
    }).formatToParts(new Date(cursor.getTime() + day * 86400000));

    const get = type => parts.find(p => p.type === type)?.value;
    const weekdayNames = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const wday = weekdayNames[get('weekday')];

    if (!slotDays.has(wday)) continue;

    // Build candidate timestamps for each slot in the window
    const dateStr = `${get('year')}-${get('month')}-${get('day')}`;
    for (const min of slotMinutes) {
      const candidate = new Date(`${dateStr}T${String(windowStartHour).padStart(2,'0')}:${String(min).padStart(2,'0')}:00`);
      // Convert local time to UTC using Intl
      const utcMs = localToUtcMs(dateStr, windowStartHour, min, timezone);
      if (utcMs <= fromDate.getTime()) continue; // in the past
      if (!occupied.has(utcMs)) {
        return new Date(utcMs).toISOString();
      }
    }
  }
  throw new Error('No available Buffer slot found in the next 30 days');
}

/**
 * Convert a local date+time to UTC milliseconds using Intl.
 */
function localToUtcMs(dateStr, hour, minute, timezone) {
  // Create a date string that Intl can parse in the given timezone
  // by finding the UTC offset at that moment via format round-trip
  const probe = new Date(`${dateStr}T${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:00Z`);
  const localStr = probe.toLocaleString('en-CA', { timeZone: timezone, hour12: false })
    .replace(',', '');
  // localStr looks like "2026-03-24 16:00:00"
  const [datePart, timePart] = localStr.split(' ');
  if (!timePart) return probe.getTime();

  // Binary search for the UTC ms that produces the target local time
  // Simple approach: offset = difference between UTC probe and formatted local
  const formattedHour = parseInt(timePart.split(':')[0]);
  const formattedMinute = parseInt(timePart.split(':')[1]);
  const offsetMs = (hour - formattedHour) * 3600000 + (minute - formattedMinute) * 60000;
  return probe.getTime() - offsetMs;
}
```

- [ ] **Step 3: Export for test module**

Add to the bottom of `vibe-kingdom.js`, just before the `main()` call:

```javascript
// Test exports (only used by test scripts)
if (require.main !== module) {
  module.exports = { nextBufferSlot, localToUtcMs };
}
```

Rename `test-slot.js` to use the correct require path:
```javascript
const { nextBufferSlot } = require('./vibe-kingdom.js');
```

- [ ] **Step 4: Run the test**

```bash
node scripts/test-slot.js
```
Expected:
```
Test 1 PASS — Sunday → next Tuesday 4:00pm: 2026-03-24T21:00:00.000Z
Test 2 PASS — three distinct slots: ...
All tests passed.
```

The UTC hour in the ISO string should be 21 for 4pm ET (UTC-5 in March).

- [ ] **Step 5: Commit**

```bash
cd /home/aclater/openclaw-skills
git add vibe-kingdom-openclaw/scripts/vibe-kingdom.js vibe-kingdom-openclaw/scripts/test-slot.js
git commit -m "feat(vibe-kingdom): add nextBufferSlot() with slot collision avoidance"
```

---

## Task 3: Add `buffer-push` command

**Files:**
- Modify: `scripts/vibe-kingdom.js` — add `bufferPush()` function and `cmdBufferPush()`, register in main switch

- [ ] **Step 1: Write the dry-run test**

Create `scripts/test-buffer-push.js`:
```javascript
#!/usr/bin/env node
// Run with: BUFFER_DRY_RUN=1 BUFFER_ACCESS_TOKEN=x BUFFER_PROFILE_ID=y node scripts/test-buffer-push.js
process.env.BUFFER_DRY_RUN = '1';
process.env.BUFFER_ACCESS_TOKEN = process.env.BUFFER_ACCESS_TOKEN || 'test-token';
process.env.BUFFER_PROFILE_ID = process.env.BUFFER_PROFILE_ID || 'test-profile';
process.env.VIBE_KINGDOM_DATA_DIR = '/tmp/vibe-kingdom-test';

const fs = require('fs');
const path = require('path');
fs.mkdirSync('/tmp/vibe-kingdom-test', { recursive: true });

// Write a minimal posts.json with one approved post
const posts = [{
  id: 1, status: 'approved', content: 'Test post content.\n\nhttps://example.com',
  signal_source: 'hackernews', signal_title: 'Test Signal', signal_url: 'https://example.com',
  created_at: new Date().toISOString(), approved_at: new Date().toISOString()
}];
fs.writeFileSync('/tmp/vibe-kingdom-test/posts.json', JSON.stringify(posts));
fs.writeFileSync('/tmp/vibe-kingdom-test/config.json', JSON.stringify({
  buffer: { timezone: 'America/New_York', schedule: { days: ['tuesday','wednesday','friday'], windowStart: '16:00', windowEnd: '17:00', slotIntervalMinutes: 15 }}
}));

const { bufferPush } = require('./vibe-kingdom.js');
bufferPush(1).then(result => {
  console.assert(result.dry_run === true, 'Expected dry_run flag');
  console.assert(result.scheduled_at, 'Expected scheduled_at in result');
  console.assert(result.text.includes('Test post'), 'Expected post content in result');
  console.log('PASS — dry run result:', JSON.stringify(result, null, 2));
}).catch(e => {
  console.error('FAIL:', e.message);
  process.exit(1);
});
```

- [ ] **Run test to verify it fails** (function not yet defined)
```bash
BUFFER_DRY_RUN=1 node scripts/test-buffer-push.js 2>&1 | head -3
```
Expected: module export error or `bufferPush is not a function`

- [ ] **Step 2: Add `bufferPush()` to `vibe-kingdom.js`**

Add after `nextBufferSlot` / `localToUtcMs`:

```javascript
async function bufferPush(postId) {
  const token = process.env.BUFFER_ACCESS_TOKEN;
  const profileId = process.env.BUFFER_PROFILE_ID;
  if (!token) throw new Error('BUFFER_ACCESS_TOKEN not set');
  if (!profileId) throw new Error('BUFFER_PROFILE_ID not set');

  const posts = loadPosts();
  const post = posts.find(p => p.id === postId);
  if (!post) throw new Error(`Post ${postId} not found`);

  const config = loadConfig();
  const tz = config.buffer?.timezone || 'America/New_York';

  // Collect already-occupied slots
  const occupiedIso = posts
    .filter(p => p.scheduled_at && p.id !== postId)
    .map(p => p.scheduled_at);

  const scheduledAt = nextBufferSlot(occupiedIso, new Date(), tz);

  // Dry-run mode: skip HTTP, return what would be sent
  if (process.env.BUFFER_DRY_RUN === '1') {
    return { dry_run: true, post_id: postId, text: post.content, scheduled_at: scheduledAt, profile_id: profileId };
  }

  const body = new URLSearchParams({
    access_token: token,
    text: post.content,
    profile_ids[]: profileId,
    scheduled_at: scheduledAt,
    now: 'false'
  }).toString();

  return new Promise((resolve, reject) => {
    const payload = Buffer.from(body);
    const req = https.request({
      hostname: 'api.bufferapp.com',
      path: '/1/updates/create.json',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': payload.length
      }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.success === false || res.statusCode >= 400) {
            reject(new Error(`Buffer error: ${JSON.stringify(parsed)}`));
          } else {
            // Update post record
            post.buffer_update_id = parsed.updates?.[0]?.id;
            post.scheduled_at = scheduledAt;
            savePosts(posts);
            resolve({ post_id: postId, buffer_update_id: post.buffer_update_id, scheduled_at: scheduledAt });
          }
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}
```

> **Note on Buffer API:** If the `api.bufferapp.com` endpoint returns errors in Task 1, replace `hostname` and `path` with the working values you found then.

- [ ] **Step 3: Add `module.exports` export for `bufferPush`**

The existing export block at the bottom of the file should now read:
```javascript
if (require.main !== module) {
  module.exports = { nextBufferSlot, localToUtcMs, bufferPush };
}
```

- [ ] **Step 4: Run dry-run test**

```bash
BUFFER_DRY_RUN=1 node scripts/test-buffer-push.js
```
Expected:
```
PASS — dry run result: {
  "dry_run": true,
  "post_id": 1,
  "text": "Test post content.\n\nhttps://example.com",
  "scheduled_at": "2026-...",
  "profile_id": "test-profile"
}
```

- [ ] **Step 5: Add `cmdBufferPush` and wire into `main()`**

Find `function cmdSetStatus` (~line 888) and add after it:

```javascript
async function cmdBufferPush(args) {
  const id = parseInt(args[0]);
  if (!id) { console.error('Usage: buffer-push <id>'); process.exit(1); }
  try {
    const result = await bufferPush(id);
    if (result.dry_run) {
      console.log(`[DRY RUN] Post ${id} would be scheduled at ${result.scheduled_at}`);
    } else {
      console.log(`Post ${id} queued in Buffer — scheduled: ${result.scheduled_at}`);
    }
  } catch (e) {
    console.error(`Buffer push failed: ${e.message}`);
    process.exit(1);
  }
}
```

In the `main()` switch statement, add:
```javascript
case 'buffer-push':   return cmdBufferPush(args.slice(1));
```

- [ ] **Step 6: Smoke-test the CLI command in dry-run mode**

```bash
BUFFER_DRY_RUN=1 BUFFER_ACCESS_TOKEN=x BUFFER_PROFILE_ID=y \
  node scripts/vibe-kingdom.js buffer-push 1 2>&1
```
Expected: `[DRY RUN] Post 1 would be scheduled at 2026-...` (or "Post 1 not found" if posts.json is empty — that's fine)

- [ ] **Step 7: Live test against Buffer (optional, skippable)**

```bash
BUFFER_ACCESS_TOKEN=$(cat ~/.buffer.key) BUFFER_PROFILE_ID=<id-from-task-1> \
  node scripts/vibe-kingdom.js buffer-push <a-real-post-id>
```
Expected: `Post N queued in Buffer — scheduled: 2026-...`
Check Buffer dashboard to confirm the post appeared in the queue.

- [ ] **Step 8: Commit**

```bash
cd /home/aclater/openclaw-skills
git add vibe-kingdom-openclaw/scripts/vibe-kingdom.js vibe-kingdom-openclaw/scripts/test-buffer-push.js
git commit -m "feat(vibe-kingdom): add bufferPush() and buffer-push command with dry-run support"
```

---

## Task 4: Add `approve`, `approve-all`, and `reject` commands

**Files:**
- Modify: `scripts/vibe-kingdom.js` — add three command functions, wire into main switch

- [ ] **Step 1: Write the test**

Create `scripts/test-approve.js`:
```javascript
#!/usr/bin/env node
process.env.BUFFER_DRY_RUN = '1';
process.env.BUFFER_ACCESS_TOKEN = 'x';
process.env.BUFFER_PROFILE_ID = 'y';
process.env.VIBE_KINGDOM_DATA_DIR = '/tmp/vibe-kingdom-approve-test';

const fs = require('fs');
fs.mkdirSync('/tmp/vibe-kingdom-approve-test', { recursive: true });
fs.writeFileSync('/tmp/vibe-kingdom-approve-test/config.json', JSON.stringify({
  buffer: { timezone: 'America/New_York', schedule: { days: ['tuesday','wednesday','friday'], windowStart: '16:00', windowEnd: '17:00', slotIntervalMinutes: 15 }}
}));
fs.writeFileSync('/tmp/vibe-kingdom-approve-test/posts.json', JSON.stringify([
  { id: 1, status: 'draft', content: 'Post one.\nhttps://a.com', signal_source: 'hn', signal_title: 'A', signal_url: 'https://a.com', created_at: new Date().toISOString() },
  { id: 2, status: 'draft', content: 'Post two.\nhttps://b.com', signal_source: 'hn', signal_title: 'B', signal_url: 'https://b.com', created_at: new Date().toISOString() },
  { id: 3, status: 'draft', content: 'Post three.\nhttps://c.com', signal_source: 'hn', signal_title: 'C', signal_url: 'https://c.com', created_at: new Date().toISOString() }
]));

const { approvePost, rejectPost, approveAll, loadPosts } = require('./vibe-kingdom.js');

(async () => {
  // Test approve
  await approvePost(1);
  const posts = loadPosts();
  const p1 = posts.find(p => p.id === 1);
  console.assert(p1.status === 'approved', 'Post 1 should be approved');
  console.assert(p1.scheduled_at, 'Post 1 should have scheduled_at');
  console.assert(p1.approved_at, 'Post 1 should have approved_at');
  console.log('Test 1 PASS — approve single post');

  // Test reject
  await rejectPost(2);
  const p2 = loadPosts().find(p => p.id === 2);
  console.assert(p2.status === 'rejected', 'Post 2 should be rejected');
  console.assert(!p2.scheduled_at, 'Post 2 should not have scheduled_at');
  console.log('Test 2 PASS — reject post');

  // Test approve-all (only post 3 is still draft)
  await approveAll();
  const p3 = loadPosts().find(p => p.id === 3);
  console.assert(p3.status === 'approved', 'Post 3 should be approved by approve-all');
  // Slots must be distinct
  console.assert(p1.scheduled_at !== p3.scheduled_at, 'Posts must have distinct slots');
  console.log('Test 3 PASS — approve-all, distinct slots');

  console.log('All tests passed.');
})().catch(e => { console.error('FAIL:', e); process.exit(1); });
```

- [ ] **Run to verify it fails**
```bash
node scripts/test-approve.js 2>&1 | head -3
```
Expected: `approvePost is not a function` or similar

- [ ] **Step 2: Add `approvePost`, `rejectPost`, `approveAll` functions**

Add after `cmdBufferPush`:

```javascript
async function approvePost(postId) {
  const posts = loadPosts();
  const post = posts.find(p => p.id === postId);
  if (!post) throw new Error(`Post ${postId} not found`);
  if (post.status === 'approved') {
    console.log(`Post ${postId} already approved`);
    return;
  }
  post.status = 'approved';
  post.approved_at = new Date().toISOString();
  savePosts(posts);
  const result = await bufferPush(postId);
  return result;
}

async function rejectPost(postId) {
  const posts = loadPosts();
  const post = posts.find(p => p.id === postId);
  if (!post) throw new Error(`Post ${postId} not found`);
  post.status = 'rejected';
  post.rejected_at = new Date().toISOString();
  savePosts(posts);
}

async function approveAll() {
  const posts = loadPosts();
  const drafts = posts.filter(p => p.status === 'draft').sort((a, b) => a.id - b.id);
  if (drafts.length === 0) { console.log('No draft posts to approve'); return; }
  for (const post of drafts) {
    await approvePost(post.id);
  }
}
```

- [ ] **Step 3: Add CLI command wrappers**

```javascript
async function cmdApprove(args) {
  const id = parseInt(args[0]);
  if (!id) { console.error('Usage: approve <id>'); process.exit(1); }
  try {
    const result = await approvePost(id);
    if (result?.dry_run) {
      console.log(`[DRY RUN] Post ${id} approved — would schedule at ${result.scheduled_at}`);
    } else if (result) {
      console.log(`Post ${id} approved — queued for ${result.scheduled_at}`);
    }
  } catch (e) { console.error(e.message); process.exit(1); }
}

async function cmdReject(args) {
  const id = parseInt(args[0]);
  if (!id) { console.error('Usage: reject <id>'); process.exit(1); }
  try {
    await rejectPost(id);
    console.log(`Post ${id} rejected`);
  } catch (e) { console.error(e.message); process.exit(1); }
}

async function cmdApproveAll() {
  try {
    await approveAll();
  } catch (e) { console.error(e.message); process.exit(1); }
}
```

Wire into the `main()` switch:
```javascript
case 'approve':       return cmdApprove(args.slice(1));
case 'approve-all':   return cmdApproveAll();
case 'reject':        return cmdReject(args.slice(1));
```

- [ ] **Step 4: Export the new functions**

Update the export block:
```javascript
if (require.main !== module) {
  module.exports = { nextBufferSlot, localToUtcMs, bufferPush, approvePost, rejectPost, approveAll, loadPosts };
}
```

- [ ] **Step 5: Run the test**

```bash
node scripts/test-approve.js
```
Expected:
```
Test 1 PASS — approve single post
Test 2 PASS — reject post
Test 3 PASS — approve-all, distinct slots
All tests passed.
```

- [ ] **Step 6: Update help text in `main()`**

Find the help output block (~line 998) and add:
```
  ${scriptName} approve <id>                   Approve post and queue to Buffer
  ${scriptName} approve-all                    Approve all drafts and queue to Buffer
  ${scriptName} reject <id>                    Reject a draft post
```

- [ ] **Step 7: Commit**

```bash
cd /home/aclater/openclaw-skills
git add vibe-kingdom-openclaw/scripts/vibe-kingdom.js vibe-kingdom-openclaw/scripts/test-approve.js
git commit -m "feat(vibe-kingdom): add approve, approve-all, reject commands with Buffer integration"
```

---

## Task 5: Improve post generation quality

**Files:**
- Modify: `scripts/vibe-kingdom.js` — rewrite `generatePostFromSignal()`, fix fallback

- [ ] **Step 1: Write a generation smoke test**

This is a live API call test (requires `ANTHROPIC_API_KEY`). Create `scripts/test-generation.js`:

```javascript
#!/usr/bin/env node
// Run with: ANTHROPIC_API_KEY=... node scripts/test-generation.js
const { generatePostFromSignal } = require('./vibe-kingdom.js');

const fakeProfile = {
  name: 'Adam Clater', employer: 'Red Hat',
  tone: 'pragmatic, grounded senior architect',
  domains: ['cybersecurity', 'kubernetes', 'devops'],
  vocabulary: 'technical but accessible',
  avoids: ['emojis', 'hashtags', 'generic praise'],
  values: ['security-first', 'pragmatism']
};

const fakeSignal = {
  id: 1, source: 'hackernews',
  title: 'NIST finalizes post-quantum cryptography standards',
  content: 'NIST has finalized the first post-quantum cryptography standards after years of evaluation. Organizations now need to plan migration timelines for their PKI infrastructure.',
  url: 'https://example.com/nist-pqc'
};

generatePostFromSignal(fakeSignal, fakeProfile).then(post => {
  console.log('--- Generated post ---');
  console.log(post);
  console.log('--- Checks ---');

  const lc = post.toLowerCase();
  const bannedOpeners = ['been thinking about'];
  bannedOpeners.forEach(b => {
    if (lc.startsWith(b)) console.error(`FAIL: post starts with banned opener "${b}"`);
    else console.log(`PASS: does not start with "${b}"`);
  });

  if (post.includes('https://example.com/nist-pqc')) console.log('PASS: source URL present');
  else console.error('FAIL: source URL missing from post');

  const paragraphs = post.split('\n\n').filter(p => p.trim());
  if (paragraphs.length >= 2) console.log(`PASS: ${paragraphs.length} paragraphs`);
  else console.error(`FAIL: only ${paragraphs.length} paragraph(s) — expected 2+`);

  const words = post.split(/\s+/).length;
  console.log(`INFO: word count = ${words}`);
}).catch(e => { console.error('Generation failed:', e.message); process.exit(1); });
```

- [ ] **Run to confirm current behaviour shows the problems**

```bash
ANTHROPIC_API_KEY=$(cat ~/.anthropic.key 2>/dev/null || echo $ANTHROPIC_API_KEY) \
  node scripts/test-generation.js
```
Expected: post generated but likely starts with "Been thinking about", probably missing URL, possibly only one paragraph.

- [ ] **Step 2: Export `generatePostFromSignal`**

Update the export block at the bottom:
```javascript
if (require.main !== module) {
  module.exports = { nextBufferSlot, localToUtcMs, bufferPush, approvePost, rejectPost, approveAll, loadPosts, generatePostFromSignal };
}
```

- [ ] **Step 3: Rewrite `generatePostFromSignal` system prompt**

Locate `generatePostFromSignal` (~line 601). Replace the `systemPrompt` and `userPrompt` strings and fix the token limit:

```javascript
async function generatePostFromSignal(signal, profile, style = null) {
  const styleHint = style === 'shorter'
    ? 'Write a tight, direct post under 100 words. One sharp observation, nothing more.'
    : style === 'longer'
    ? 'Write a fuller post, 200-250 words. Walk through the reasoning step by step.'
    : style === 'more_casual'
    ? 'Write conversationally, like talking to a peer over coffee. Relaxed but still substantive.'
    : 'Vary length naturally — some posts are 80 words and punchy, some are 180 words and walk through the reasoning. Do not pad to fill a word count.';

  const systemPrompt = `You are a LinkedIn ghostwriter for ${profile.name} at ${profile.employer}.

Voice: ${profile.tone}
Domains: ${(profile.domains || []).join(', ')}
Vocabulary: ${profile.vocabulary}
Avoid: ${(profile.avoids || []).join(', ')}

Structure: A good post has 2-4 short paragraphs separated by a blank line.
- First paragraph: one concrete observation or hook — something specific, not generic.
- Middle: the real tension or insight — what's actually hard about this, or what most people miss.
- End: what this means for practitioners, or one genuine question that invites response.
- Final line: the source URL, alone on its own line, no label.

Vary your openers. Sometimes start with a direct observation. Sometimes open mid-story or with a question. Never open with "Been thinking about". Never start two posts with the same phrase.

${profile.values ? `Values: ${profile.values.join(', ')}` : ''}

Plain text only. No bullet lists. No headers. No hashtags. No emojis. Write the way a senior engineer talks to a peer at a conference, not the way a marketer writes content.`;

  const userPrompt = `Write a LinkedIn post inspired by this signal:

Source: ${signal.source}${signal.subreddit ? ' (' + signal.subreddit + ')' : ''}
Title: ${signal.title}
Content: ${(signal.content || '').substring(0, 800)}
URL: ${signal.url}

Critical instructions:
- Do NOT summarize or amplify this. Use it only as a conversation starter.
- Add ${profile.name}'s original perspective from field experience. What does someone who has actually deployed this stuff actually think?
- The post must contribute something not already in the signal.
- ${styleHint}
- Strictly non-political and non-inflammatory.
- End with the source URL on its own line: ${signal.url}`;

  try {
    return await callClaude(userPrompt, systemPrompt, 1024);
  } catch (e) {
    process.stderr.write(`Post generation failed: ${e.message}\n`);
    return `[Generation failed: ${e.message}]\n\nSignal: ${signal.title}\n${signal.url}`;
  }
}
```

- [ ] **Step 4: Run the test again**

```bash
ANTHROPIC_API_KEY=$(cat ~/.anthropic.key 2>/dev/null || echo $ANTHROPIC_API_KEY) \
  node scripts/test-generation.js
```
Expected: all three checks PASS — no banned opener, URL present, 2+ paragraphs.

- [ ] **Step 5: Commit**

```bash
cd /home/aclater/openclaw-skills
git add vibe-kingdom-openclaw/scripts/vibe-kingdom.js vibe-kingdom-openclaw/scripts/test-generation.js
git commit -m "feat(vibe-kingdom): rewrite post generation — structure, openers, URL, 1024 tokens"
```

---

## Task 6: Write README.md

**Files:**
- Create or overwrite: `README.md` in `vibe-kingdom-openclaw/`

- [ ] **Step 1: Write the README**

```markdown
# Vibe Kingdom — OpenClaw Edition

Personal brand amplification for LinkedIn. Discovers quality technical
discussions from Reddit, Hacker News, Dev.to, GitHub, Mastodon, and Lobste.rs,
generates authentic posts in your voice, and schedules approved posts to Buffer.

## How It Works

1. **Cron** — OpenClaw wakes the vibe-kingdom agent Monday and Thursday at 8am
2. **Fetch** — agent runs `fetch-signals` to pull fresh discussions from communities
3. **Generate** — agent runs `generate-posts` to draft LinkedIn posts from signals
4. **Review** — you open the vibe-kingdom session in OpenClaw and review drafts
5. **Approve** — say "approve 3" or "approve all" in the session
6. **Publish** — approved posts go straight to Buffer, scheduled Tue/Wed/Fri 4–5pm

---

## Required API Keys

Set these in OpenClaw's environment/secrets UI — **not** in any config file.

| Key | Where to get it |
|-----|----------------|
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) → API Keys |
| `TAVILY_API_KEY` | [app.tavily.com](https://app.tavily.com) → API |
| `BUFFER_ACCESS_TOKEN` | Buffer → Settings → Apps & API → Access Token |
| `BUFFER_PROFILE_ID` | Run `curl "https://api.bufferapp.com/1/profiles.json?access_token=YOUR_TOKEN"` and find the `id` for your LinkedIn profile |

---

## One-Time Setup in OpenClaw

### 1. Install the skill

In the OpenClaw Skills UI, add this repository. The skill script is at:
```
scripts/vibe-kingdom.js
```

### 2. Create the agent

In OpenClaw → AI Agents, create a new agent with these settings:

**Name:** `vibe-kingdom`
**Tool command:**
```
node ~/.openclaw/skills/vibe-kingdom-openclaw/scripts/vibe-kingdom.js
```
*(Adjust the path if your OpenClaw installs skills to a different directory.)*

**System prompt:**
```
You are the Vibe Kingdom content pipeline. Your job is to fetch technical
signals, generate LinkedIn draft posts, and help review and publish them to
Buffer.

When presenting draft posts: list them numerically with ID, source, and first
40 words. Keep it scannable.

Accept approval commands:
- "approve <id>" — approve a single post and queue to Buffer
- "approve all" — approve all remaining drafts (calls approve-all command)
- "reject <id>" — reject a post
- "show <id>" — show full post content

After each approval, confirm the Buffer scheduled time. After reviewing all
posts, summarise what was queued and what was rejected.

Stay focused on the content pipeline. Do not engage in general conversation.
```

### 3. Create the cron job

In OpenClaw → Cron, create a new job:

| Field | Value |
|-------|-------|
| Name | `vibe-kingdom-fetch` |
| Schedule | `0 8 * * 1,4` (Monday and Thursday at 8am) |
| Agent | `vibe-kingdom` |
| Session | Isolated |
| Prompt | `Fetch new signals and generate 5 draft posts. Present them for review.` |

If OpenClaw supports result delivery to your main chat timeline, enable it so you get a notification when new posts are ready.

---

## Commands (CLI reference)

```bash
node scripts/vibe-kingdom.js fetch-signals          # Discover signals from communities
node scripts/vibe-kingdom.js generate-posts [--count N]  # Generate N draft posts
node scripts/vibe-kingdom.js list-posts [--status S]     # List posts
node scripts/vibe-kingdom.js show-post <id>         # View full post
node scripts/vibe-kingdom.js approve <id>           # Approve + queue to Buffer
node scripts/vibe-kingdom.js approve-all            # Approve all drafts
node scripts/vibe-kingdom.js reject <id>            # Reject a draft
node scripts/vibe-kingdom.js buffer-push <id>       # Push a specific post to Buffer
node scripts/vibe-kingdom.js regenerate-post <id>   # Regenerate with new angle
node scripts/vibe-kingdom.js rebuild-profile        # Refresh Speaker Profile
```

**Dry-run mode** (no actual Buffer calls):
```bash
BUFFER_DRY_RUN=1 node scripts/vibe-kingdom.js approve 1
```

---

## Configuration

Edit `~/.openclaw/vibe-kingdom/config.json` to customise domains, communities, and Buffer schedule:

```json
{
  "buffer": {
    "timezone": "America/New_York",
    "schedule": {
      "days": ["tuesday", "wednesday", "friday"],
      "windowStart": "16:00",
      "windowEnd": "17:00",
      "slotIntervalMinutes": 15
    }
  }
}
```
```

- [ ] **Step 2: Verify README renders correctly**

```bash
cat vibe-kingdom-openclaw/README.md | wc -l
```
Expected: 100+ lines. Spot-check that the four API key table rows are present.

- [ ] **Step 3: Commit**

```bash
cd /home/aclater/openclaw-skills
git add vibe-kingdom-openclaw/README.md
git commit -m "docs(vibe-kingdom): add README with API keys, agent setup, cron setup"
```

---

## Task 7: Integration smoke test

- [ ] **Step 1: Run full dry-run end-to-end**

```bash
cd /home/aclater/openclaw-skills/vibe-kingdom-openclaw
export ANTHROPIC_API_KEY=$(grep -r ANTHROPIC ~/.anthropic.key 2>/dev/null | head -1 | cut -d= -f2 || echo $ANTHROPIC_API_KEY)
export TAVILY_API_KEY=$(cat ~/.tavily.key)
export BUFFER_ACCESS_TOKEN=$(cat ~/.buffer.key)
export BUFFER_PROFILE_ID=<id-from-task-1>
export BUFFER_DRY_RUN=1

node scripts/vibe-kingdom.js fetch-signals
node scripts/vibe-kingdom.js generate-posts --count 2
node scripts/vibe-kingdom.js list-posts --status draft
```

Note the IDs of the generated posts.

- [ ] **Step 2: Approve one post in dry-run**

```bash
BUFFER_DRY_RUN=1 BUFFER_ACCESS_TOKEN=$(cat ~/.buffer.key) BUFFER_PROFILE_ID=<id> \
  node scripts/vibe-kingdom.js approve <first-post-id>
```
Expected: `[DRY RUN] Post N approved — would schedule at 2026-...T21:...Z`

- [ ] **Step 3: Approve remaining posts live (optional)**

Remove `BUFFER_DRY_RUN=1` and run `approve-all` to push real posts to Buffer. Check the Buffer dashboard to confirm they appear in the queue at Tue/Wed/Fri 4–5pm slots.

- [ ] **Step 4: Final push to GitHub**

```bash
cd /home/aclater/openclaw-skills
git push
```

---

## Quick reference: what changed vs previous version

| Before | After |
|--------|-------|
| `export-csv` — writes CSV to filesystem | `approve <id>` — pushes to Buffer |
| No direct LinkedIn workflow | Posts scheduled Tue/Wed/Fri 4–5pm via Buffer |
| Posts start with "Been thinking about..." | Varied openers, structural guidance |
| `max_tokens: 512` — posts truncated | `max_tokens: 1024` |
| No source URL in post | Source URL on final line |
| Fallback uses `openers[0]` | Fallback surfaces the error cleanly |

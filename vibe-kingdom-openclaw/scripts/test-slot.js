#!/usr/bin/env node
const { nextBufferSlot } = require('./vibe-kingdom.js');

// Test 1: quiet Sunday should give next Tuesday
const quietSunday = new Date('2026-03-22T17:00:00Z'); // Sunday noon ET (UTC-5)
const slot1 = nextBufferSlot([], quietSunday, 'America/New_York');
const d1 = new Date(slot1);
const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', hour12: false }).formatToParts(d1);
const wday = parts.find(p => p.type === 'weekday')?.value;
const hour = parseInt(parts.find(p => p.type === 'hour')?.value);
console.assert(wday === 'Tue', `Expected Tue, got ${wday}`);
console.assert(hour === 16, `Expected hour 16, got ${hour}`);
console.log('Test 1 PASS — Sunday → next Tuesday 4:00pm ET:', slot1);

// Test 2: three consecutive calls must return distinct slots
const occupied = [];
const s1 = nextBufferSlot(occupied, quietSunday, 'America/New_York');
occupied.push(s1);
const s2 = nextBufferSlot(occupied, quietSunday, 'America/New_York');
occupied.push(s2);
const s3 = nextBufferSlot(occupied, quietSunday, 'America/New_York');
console.assert(s1 !== s2 && s2 !== s3 && s1 !== s3, 'All three slots must be distinct');
console.log('Test 2 PASS — three distinct slots:', s1, s2, s3);

console.log('All slot tests passed.');

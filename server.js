const express = require('express');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 10000;
const USER_AGENT = 'ClubBonusBall-TEST-LottoServer/1.0';

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'Club Bonus Ball TEST Lotto Server', environment: 'TEST' });
});

function cleanText(s) {
  return String(s || '').replace(/\\u00a0/g, ' ').replace(/\\s+/g, ' ').trim();
}

function uniqueSix(nums) {
  const a = nums.map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= 59);
  const out = [];
  for (const n of a) if (!out.includes(n)) out.push(n);
  return out.length === 6 ? out : null;
}

function dateISOFromText(text) {
  const m = text.match(/Saturday\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s+([A-Za-z]+)\\s+(\\d{4})/i);
  if (!m) return null;
  const months = {january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12};
  const month = months[m[2].toLowerCase()];
  if (!month) return null;
  return `${m[3]}-${String(month).padStart(2,'0')}-${String(Number(m[1])).padStart(2,'0')}`;
}

function parseLotteryCoUk(html) {
  const $ = cheerio.load(html);
  const text = cleanText($('body').text());
  const marker = /Tonight's Lotto Result\\s+Saturday\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s+([A-Za-z]+)\\s+(\\d{4})/i.exec(text);
  if (!marker) throw new Error('Saturday Lotto date was not found on the results page.');
  const date = dateISOFromText(marker[0]);
  const after = text.slice(marker.index + marker[0].length);
  const r1 = /Round 1:\\s*((?:\\d{1,2}\\s+){5}\\d{1,2})/i.exec(after);
  if (!r1) throw new Error('Saturday Round 1 numbers have not been published yet.');
  const numbers = uniqueSix(r1[1].match(/\\d{1,2}/g) || []);
  if (!numbers) throw new Error('Could not safely read six Round 1 numbers.');
  return { date, numbers, source: 'lottery.co.uk', sourceLabel: 'Independent UK Lotto results feed', verifiedAgainstOfficial: false };
}

async function fetchPage(url) {
  const r = await fetch(url, {
    headers: { 'user-agent': USER_AGENT, 'accept': 'text/html,application/xhtml+xml' },
    redirect: 'follow'
  });
  if (!r.ok) throw new Error(`${new URL(url).hostname} returned HTTP ${r.status}`);
  return await r.text();
}

async function getLatest() {
  // Primary: National Lottery operator page. We deliberately parse only Round 1.
  try {
    const html = await fetchPage('https://www.national-lottery.co.uk/results/lotto/draw-history');
    const $ = cheerio.load(html);
    const text = cleanText($('body').text());
    const saturday = /Saturday\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s+([A-Za-z]+)\\s+(\\d{4})/i.exec(text);
    if (!saturday) throw new Error('Official page did not expose a Saturday draw.');
    const date = dateISOFromText(saturday[0]);
    const pos = saturday.index + saturday[0].length;
    const after = text.slice(pos);
    const r1 = /Round 1:\s*((?:\\d{1,2}\\s+){5}\\d{1,2})/i.exec(after);
    const numbers = r1 ? uniqueSix(r1[1].match(/\\d{1,2}/g) || []) : null;
    if (!numbers) throw new Error('Official page has not published six Round 1 numbers yet.');
    return { date, numbers, source: 'national-lottery.co.uk', sourceLabel: 'The National Lottery', verifiedAgainstOfficial: true };
  } catch (officialError) {
    // TEST fallback only. The app still requires organiser confirmation before saving.
    const html = await fetchPage('https://www.lottery.co.uk/lotto/results');
    const fallback = parseLotteryCoUk(html);
    return { ...fallback, fallbackReason: officialError.message };
  }
}

app.get('/api/test/lotto/latest', async (req, res) => {
  try {
    const result = await getLatest();
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, game: 'UK Lotto', round: 1, ...result, retrievedAt: new Date().toISOString() });
  } catch (e) {
    res.status(503).json({ ok: false, error: e.message || 'Lotto result is not available yet.', retrievedAt: new Date().toISOString() });
  }
});

app.listen(PORT, () => console.log(`Club Bonus Ball TEST Lotto Server listening on ${PORT}`));

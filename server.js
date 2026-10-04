const express = require('express');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 10000;
const USER_AGENT = 'ClubBonusBall-TEST-LottoServer/1.1';

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'Club Bonus Ball TEST Lotto Server', environment: 'TEST', version: '1.1' });
});

function cleanText(s) {
  return String(s || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function uniqueSix(nums) {
  const a = nums.map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= 59);
  const out = [];
  for (const n of a) if (!out.includes(n)) out.push(n);
  return out.length === 6 ? out : null;
}

function dateISOFromText(text) {
  const m = text.match(/Saturday\s+(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})/i);
  if (!m) return null;
  const months = {january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12};
  const month = months[m[2].toLowerCase()];
  if (!month) return null;
  return `${m[3]}-${String(month).padStart(2,'0')}-${String(Number(m[1])).padStart(2,'0')}`;
}

function saturdayISOInUK() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short'
  }).formatToParts(new Date());
  const get = type => parts.find(p => p.type === type)?.value;
  const year = Number(get('year'));
  const month = Number(get('month'));
  const day = Number(get('day'));
  const weekday = get('weekday');
  const d = new Date(Date.UTC(year, month - 1, day));
  const dow = d.getUTCDay();
  const daysBack = dow === 6 ? 0 : dow === 0 ? 1 : dow;
  d.setUTCDate(d.getUTCDate() - daysBack);
  return d.toISOString().slice(0, 10);
}

function monthName(month) {
  return ['january','february','march','april','may','june','july','august','september','october','november','december'][month - 1];
}

function lottoNetPath(dateISO) {
  const [y, m, d] = dateISO.split('-').map(Number);
  return `/uk-lotto/results/${monthName(m)}-${String(d).padStart(2,'0')}-${y}`;
}

function parseLottoNet(html, expectedDate) {
  const $ = cheerio.load(html);
  const text = cleanText($('body').text());
  const marker = /UK Lotto Results for Saturday\s+(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})/i.exec(text);
  if (!marker) throw new Error('Lotto.net did not expose the expected Saturday result date.');
  const date = dateISOFromText(marker[0]);
  if (expectedDate && date !== expectedDate) throw new Error(`Lotto.net returned ${date}, expected ${expectedDate}.`);
  const after = text.slice(marker.index + marker[0].length);
  const r1 = /Round 1\s+((?:\d{1,2}\s+){6}\d{1,2})\s+Bonus/i.exec(after);
  if (!r1) throw new Error('Lotto.net did not expose six Round 1 numbers.');
  const all = r1[1].match(/\d{1,2}/g) || [];
  const numbers = uniqueSix(all.slice(0, 6));
  if (!numbers) throw new Error('Could not safely read six Round 1 numbers from Lotto.net.');
  return {
    date,
    numbers,
    source: 'lotto.net',
    sourceLabel: 'Independent UK Lotto results feed',
    verifiedAgainstOfficial: false
  };
}

async function fetchPage(url) {
  const r = await fetch(url, {
    headers: {
      'user-agent': USER_AGENT,
      'accept': 'text/html,application/xhtml+xml,text/plain,*/*',
      'accept-language': 'en-GB,en;q=0.9'
    },
    redirect: 'follow'
  });
  if (!r.ok) throw new Error(`${new URL(url).hostname} returned HTTP ${r.status}`);
  return await r.text();
}

async function getLatest() {
  const officialErrors = [];

  // Primary: National Lottery operator page. Only Round 1 is accepted.
  try {
    const html = await fetchPage('https://www.national-lottery.co.uk/results/lotto/draw-history');
    const $ = cheerio.load(html);
    const text = cleanText($('body').text());
    const saturday = /Saturday\s+(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})/i.exec(text);
    if (!saturday) throw new Error('Official page did not expose a Saturday draw.');
    const date = dateISOFromText(saturday[0]);
    const pos = saturday.index + saturday[0].length;
    const after = text.slice(pos);
    const r1 = /Round 1:\s*((?:\d{1,2}\s+){5}\d{1,2})/i.exec(after);
    const numbers = r1 ? uniqueSix(r1[1].match(/\d{1,2}/g) || []) : null;
    if (!numbers) throw new Error('Official page has not published six Round 1 numbers yet.');
    return { date, numbers, source: 'national-lottery.co.uk', sourceLabel: 'The National Lottery', verifiedAgainstOfficial: true };
  } catch (officialError) {
    officialErrors.push(`official: ${officialError.message}`);
  }

  // TEST fallback: independent UK Lotto results page. This is clearly labelled
  // so the organiser can see that the result was not directly verified against
  // the operator site. The app still requires organiser confirmation before saving.
  const expectedDate = saturdayISOInUK();
  try {
    const url = `https://www.lotto.net${lottoNetPath(expectedDate)}`;
    const html = await fetchPage(url);
    const fallback = parseLottoNet(html, expectedDate);
    return { ...fallback, fallbackReason: officialErrors.join('; ') };
  } catch (fallbackError) {
    throw new Error(`${officialErrors.join('; ')}; fallback: ${fallbackError.message}`);
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

app.listen(PORT, () => console.log(`Club Bonus Ball TEST Lotto Server v1.1 listening on ${PORT}`));

const express = require('express');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 10000;
const USER_AGENT = 'ClubBonusBall-TEST-LottoServer/1.2';

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'Club Bonus Ball TEST Lotto Server',
    environment: 'TEST',
    version: '1.2'
  });
});

function cleanText(s) {
  return String(s || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function uniqueSix(nums) {
  const out = [];

  for (const value of nums.map(Number)) {
    if (
      Number.isInteger(value) &&
      value >= 1 &&
      value <= 59 &&
      !out.includes(value)
    ) {
      out.push(value);
    }
  }

  return out.length === 6 ? out : null;
}

function dateISO(day, monthName, year) {
  const months = {
    january: 1,
    february: 2,
    march: 3,
    april: 4,
    may: 5,
    june: 6,
    july: 7,
    august: 8,
    september: 9,
    october: 10,
    november: 11,
    december: 12
  };

  const month = months[String(monthName).toLowerCase()];

  if (!month) return null;

  return `${year}-${String(month).padStart(2, '0')}-${String(Number(day)).padStart(2, '0')}`;
}

async function fetchPage(url) {
  const response = await fetch(url, {
    headers: {
      'user-agent': USER_AGENT,
      'accept': 'text/html,application/xhtml+xml,text/plain,*/*',
      'accept-language': 'en-GB,en;q=0.9'
    },
    redirect: 'follow'
  });

  if (!response.ok) {
    throw new Error(
      `${new URL(url).hostname} returned HTTP ${response.status}`
    );
  }

  return await response.text();
}

function parseNationalLotteryCom(html) {
  const $ = cheerio.load(html);
  const text = cleanText($('body').text());

  /*
    Saturday draw
    Round 1
    Six main numbers only

    Bonus Ball is deliberately ignored.
    Round 2 is deliberately ignored.
  */

  const pattern =
    /Saturday\s+(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})\s+Round\s*1\s*:?\s*((?:\d{1,2}\s+){5}\d{1,2})/gi;

  const matches = [...text.matchAll(pattern)];

  if (!matches.length) {
    throw new Error(
      'Could not find a Saturday Round 1 result on the results page.'
    );
  }

  for (const match of matches) {
    const [, day, month, year, numbersText] = match;

    const drawDate = dateISO(day, month, year);

    const numbers = uniqueSix(
      numbersText.match(/\d{1,2}/g) || []
    );

    if (!drawDate || !numbers) continue;

    return {
      date: drawDate,
      numbers,
      source: 'national-lottery.com',
      sourceLabel: 'National Lottery results page',
      verifiedAgainstOfficial: false
    };
  }

  throw new Error(
    'A Saturday draw was found, but six valid Round 1 numbers could not be read.'
  );
}

async function getLatest() {

  const urls = [
    'https://www.national-lottery.com/lotto/results',
    'https://www.national-lottery.com/lotto/results/history'
  ];

  const errors = [];

  for (const url of urls) {

    try {

      const html = await fetchPage(url);

      return parseNationalLotteryCom(html);

    } catch (error) {

      errors.push(
        `${url}: ${error.message}`
      );

    }
  }

  throw new Error(errors.join('; '));
}

async function lottoLatest(req, res) {

  try {

    const result = await getLatest();

    res.set('Cache-Control', 'no-store');

    res.json({
      ok: true,
      game: 'UK Lotto',
      round: 1,
      ...result,
      retrievedAt: new Date().toISOString()
    });

  } catch (error) {

    res.status(503).json({
      ok: false,
      error:
        error.message ||
        'Lotto result is not available yet.',
      retrievedAt: new Date().toISOString()
    });

  }
}

// Existing TEST app route
app.get(
  '/api/test/lotto/latest',
  lottoLatest
);

// New route for future app versions
app.get(
  '/api/v1/uk-lotto/latest',
  lottoLatest
);

app.listen(PORT, () => {

  console.log(
    `Club Bonus Ball TEST Lotto Server v1.2 listening on ${PORT}`
  );

});

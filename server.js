const express = require('express');

const app = express();
const PORT = process.env.PORT || 10000;
const USER_AGENT = 'ClubBonusBall-TEST-LottoServer/2.0';

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'Club Bonus Ball TEST Lotto Server',
    environment: 'TEST',
    version: '2.0'
  });
});

function getUKDateParts() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());

  const get = type => parts.find(p => p.type === type)?.value;

  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day'))
  };
}

function getLatestSaturdayISO() {
  const { year, month, day } = getUKDateParts();

  const d = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = d.getUTCDay();

  const daysBack = dayOfWeek === 6 ? 0 : dayOfWeek + 1;

  d.setUTCDate(d.getUTCDate() - daysBack);

  return d.toISOString().slice(0, 10);
}

function validSix(numbers) {
  if (!Array.isArray(numbers) || numbers.length !== 6) {
    return false;
  }

  const unique = [...new Set(
    numbers.map(Number).filter(
      n => Number.isInteger(n) && n >= 1 && n <= 59
    )
  )];

  return unique.length === 6;
}

async function getLatestLottoResult() {

  if (!process.env.LOTTERY_API_KEY) {
    throw new Error('LOTTERY_API_KEY is not configured on the TEST server.');
  }

  const drawDate = getLatestSaturdayISO();

  const url =
    `https://www.lotteryresultsfeed.com/api/lottery/results?id=727&draw_date=${drawDate}`;

  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'Authorization': `Bearer ${process.env.LOTTERY_API_KEY}`,
      'User-Agent': USER_AGENT
    }
  });

  if (!response.ok) {
    throw new Error(
      `LotteryResultsFeed returned HTTP ${response.status}`
    );
  }

  const data = await response.json();

  if (!data || !Array.isArray(data.results)) {
    throw new Error('LotteryResultsFeed returned an unexpected response.');
  }

  /*
   * IMPORTANT:
   * We only accept Saturday Round 1.
   * Round 2 is deliberately ignored.
   */

  const round1 = data.results.find(result => {

    if (!result || result.draw_date !== drawDate) {
      return false;
    }

    return String(result.draw_type || '')
      .toLowerCase()
      .includes('round 1');

  });

  if (!round1) {
    throw new Error(
      `No Saturday Round 1 Lotto result is available for ${drawDate}.`
    );
  }

  if (!validSix(round1.balls)) {
    throw new Error(
      'The Lotto API did not return exactly six valid main numbers.'
    );
  }

  const numbers = round1.balls.map(Number);

  return {
    date: round1.draw_date,
    numbers: numbers,
    source: 'lotteryresultsfeed.com',
    sourceLabel: 'Lottery Results Feed',
    verifiedAgainstOfficial: false
  };
}

async function lottoLatest(req, res) {

  try {

    const result = await getLatestLottoResult();

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
      error: error.message || 'Lotto result is not available.',
      retrievedAt: new Date().toISOString()
    });

  }
}

// Existing TEST app route
app.get('/api/test/lotto/latest', lottoLatest);

// New route
app.get('/api/v1/uk-lotto/latest', lottoLatest);

app.listen(PORT, () => {

  console.log(
    `Club Bonus Ball TEST Lotto Server v2.0 listening on ${PORT}`
  );

});

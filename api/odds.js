export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=120');
  res.setHeader('Content-Type', 'application/json');

  try {
    const response = await fetch('https://oddslot.com/dropping/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      }
    });

    const html = await response.text();
    const matches = parse(html);
    res.json({ ok: true, matches, ts: Date.now(), count: matches.length });

  } catch(e) {
    res.status(500).json({ ok: false, error: e.message, matches: [] });
  }
}

function parse(html) {
  const results = [];

  // oddslot table rows contain match data
  // Each row has: time, home team, away team, then odds pairs (old/new) for H/D/A
  const rows = html.split('<tr');

  for (const row of rows) {
    // Extract all decimal odds in the row (numbers between 1.01 and 20.00)
    const oddsMatches = row.match(/\b([1-9]\d?\.\d{2})\b/g);
    if (!oddsMatches || oddsMatches.length < 6) continue;

    const nums = oddsMatches.map(Number).filter(n => n >= 1.01 && n <= 25);
    if (nums.length < 6) continue;

    // Extract team names from links or td content
    const teamRe = /class="[^"]*team[^"]*"[^>]*>([^<]{2,40})</gi;
    const teams = [];
    let tm;
    while ((tm = teamRe.exec(row)) !== null) {
      const name = tm[1].trim();
      if (name && !teams.includes(name)) teams.push(name);
    }

    // Extract time
    const timeRe = /(\d{1,2}:\d{2})/;
    const timeM = row.match(timeRe);
    const time = timeM ? timeM[1] : '';

    // Extract league/competition
    const leagueRe = /class="[^"]*league[^"]*"[^>]*>([^<]{2,50})</i;
    const leagueM = row.match(leagueRe);
    const league = leagueM ? leagueM[1].trim() : '';

    if (nums.length >= 6) {
      results.push({
        home: teams[0] || 'Home Team',
        away: teams[1] || 'Away Team',
        league,
        time,
        hP: nums[0], hN: nums[1],
        dP: nums[2], dN: nums[3],
        aP: nums[4], aN: nums[5]
      });
    }
  }

  return results;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=120');
  res.setHeader('Content-Type', 'application/json');

  try {
    const response = await fetch('https://oddslot.com/dropping/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://oddslot.com/',
      }
    });

    const html = await response.text();
    const matches = parse(html);
    res.json({ ok: true, matches, ts: Date.now(), count: matches.length });

  } catch(e) {
    res.status(500).json({ ok: false, error: e.message, matches: [] });
  }
}

function strip(s) {
  return s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, '').replace(/[▲▼]/g, '').trim();
}

function parse(html) {
  const results = [];

  // oddslot structure per match block:
  // Two <a> tags with team names (with /football/match/ in href)
  // Then 6 numbers: hP hN dP dN aP aN (sometimes with ▼▲ after them)
  // League is in an <h4> tag before each group of matches

  // Split by match links — each match has exactly 2 team links
  // Pattern: href contains /football/match/
  const matchLinkRe = /href="https:\/\/oddslot\.com\/football\/match\/([^/]+)\/([^/]+)\/([^/]+)\/[^"]+"/g;

  // Get current league from h4 tags
  const leagueMap = [];
  const h4Re = /<h4[^>]*>([^<]+)<\/h4>/gi;
  let h4m;
  while ((h4m = h4Re.exec(html)) !== null) {
    leagueMap.push({ pos: h4m.index, name: h4m[1].trim() });
  }

  function getLeague(pos) {
    let league = '';
    for (const l of leagueMap) {
      if (l.pos < pos) league = l.name;
      else break;
    }
    return league;
  }

  // Find all team link pairs
  // Each match = 2 consecutive /football/match/ links with the same match path
  const teamLinkRe = /<a[^>]*href="https:\/\/oddslot\.com\/football\/match\/[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
  const allLinks = [];
  let lm;
  while ((lm = teamLinkRe.exec(html)) !== null) {
    const name = strip(lm[1]);
    if (name && name.length > 1 && name.length < 60) {
      allLinks.push({ pos: lm.index, name, full: lm[0] });
    }
  }

  // Group into pairs (home, away)
  for (let i = 0; i + 1 < allLinks.length; i += 2) {
    const home = allLinks[i];
    const away = allLinks[i + 1];

    // The odds come right after the away team link
    // Extract the text between away link end and the next match or section
    const afterPos = allLinks[i + 1].pos + allLinks[i + 1].full.length;
    const nextPos = (i + 2 < allLinks.length) ? allLinks[i + 2].pos : afterPos + 500;
    const segment = html.substring(afterPos, Math.min(nextPos, afterPos + 800));

    // Extract all decimal numbers from this segment
    const numRe = /\b(\d+\.?\d*)\b/g;
    const nums = [];
    let nm;
    while ((nm = numRe.exec(segment)) !== null) {
      const v = parseFloat(nm[1]);
      if (v >= 1.01 && v <= 30 && nm[1].includes('.')) {
        nums.push(v);
      }
    }

    if (nums.length < 6) continue;

    // Take first 6 as hP,hN,dP,dN,aP,aN
    const [hP, hN, dP, dN, aP, aN] = nums.slice(0, 6);

    // Validate pairs are reasonable (not more than 80% different)
    if (Math.abs(hP - hN) / Math.max(hP, hN) > 0.8) continue;
    if (Math.abs(dP - dN) / Math.max(dP, dN) > 0.8) continue;
    if (Math.abs(aP - aN) / Math.max(aP, aN) > 0.8) continue;

    const league = getLeague(home.pos);

    results.push({
      home: home.name,
      away: away.name,
      league,
      time: '',
      hP, hN, dP, dN, aP, aN
    });
  }

  return results;
}

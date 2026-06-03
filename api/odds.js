export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Content-Type', 'application/json');

  const debug = req.url && req.url.includes('debug=1');

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

    if (debug) {
      // Return raw snippet so we can see the structure
      res.json({
        ok: true,
        htmlLength: html.length,
        snippet: html.substring(0, 3000),
        teamLinks: (html.match(/href="https:\/\/oddslot\.com\/football\/match\//g) || []).length,
        h4count: (html.match(/<h4/g) || []).length,
        hasOdds: /\d+\.\d{2}/.test(html)
      });
      return;
    }

    const matches = parse(html);
    res.json({ ok: true, matches, ts: Date.now(), count: matches.length });

  } catch(e) {
    res.status(500).json({ ok: false, error: e.message, matches: [], stack: e.stack });
  }
}

function strip(s) {
  return s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, '').replace(/[▲▼]/g, '').trim();
}

function parse(html) {
  const results = [];

  // Get league positions from h4 tags
  const leagueMap = [];
  const h4Re = /<h4[^>]*>([\s\S]*?)<\/h4>/gi;
  let h4m;
  while ((h4m = h4Re.exec(html)) !== null) {
    leagueMap.push({ pos: h4m.index, name: strip(h4m[1]) });
  }

  function getLeague(pos) {
    let league = '';
    for (const l of leagueMap) {
      if (l.pos <= pos) league = l.name;
      else break;
    }
    return league;
  }

  // Find all team links - oddslot uses /football/match/ hrefs
  const teamLinkRe = /<a\s[^>]*href="https:\/\/oddslot\.com\/football\/match\/[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
  const allLinks = [];
  let lm;
  while ((lm = teamLinkRe.exec(html)) !== null) {
    const name = strip(lm[1]);
    if (name && name.length >= 2 && name.length <= 60 && !/^\d/.test(name)) {
      allLinks.push({ pos: lm.index, end: lm.index + lm[0].length, name });
    }
  }

  // Each match = 2 consecutive team links
  for (let i = 0; i + 1 < allLinks.length; i += 2) {
    const home = allLinks[i];
    const away = allLinks[i + 1];

    // Segment between end of away link and start of next home link
    const segStart = away.end;
    const segEnd = (i + 2 < allLinks.length) ? allLinks[i + 2].pos : segStart + 600;
    const segment = html.substring(segStart, Math.min(segEnd, segStart + 600));

    // Extract ALL decimal numbers from segment
    const nums = [];
    const numRe = /(\d+\.\d+)/g;
    let nm;
    while ((nm = numRe.exec(segment)) !== null) {
      const v = parseFloat(nm[1]);
      if (v >= 1.01 && v <= 30) nums.push(v);
    }

    if (nums.length < 6) continue;

    const hP = nums[0], hN = nums[1];
    const dP = nums[2], dN = nums[3];
    const aP = nums[4], aN = nums[5];

    // Basic sanity — pairs shouldn't differ by more than 50%
    if (Math.abs(hP-hN)/Math.max(hP,hN) > 0.5) continue;
    if (Math.abs(dP-dN)/Math.max(dP,dN) > 0.5) continue;
    if (Math.abs(aP-aN)/Math.max(aP,aN) > 0.5) continue;

    results.push({
      home: home.name,
      away: away.name,
      league: getLeague(home.pos),
      time: '',
      hP, hN, dP, dN, aP, aN
    });
  }

  return results;
}

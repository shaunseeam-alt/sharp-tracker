export const config = { runtime: 'edge' };

export default async function handler(req) {
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET',
    'Content-Type': 'application/json',
    'Cache-Control': 's-maxage=120, stale-while-revalidate=60'
  };

  try {
    const res = await fetch('https://oddslot.com/dropping/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache'
      }
    });

    const html = await res.text();
    const matches = parseOddslot(html);

    return new Response(JSON.stringify({ ok: true, matches, ts: Date.now() }), { headers: CORS });
  } catch(e) {
    return new Response(JSON.stringify({ ok: false, error: e.message, matches: [] }), { status: 500, headers: CORS });
  }
}

function parseOddslot(html) {
  const matches = [];

  // Extract table rows - oddslot uses a consistent table structure
  // Match pattern: team names, old odds, new odds, drop %
  const rowRe = /<tr[^>]*class="[^"]*match[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi;
  const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  const stripRe = /<[^>]+>/g;
  const strip = s => s.replace(stripRe,'').replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').trim();

  let rowMatch;
  while((rowMatch = rowRe.exec(html)) !== null) {
    const row = rowMatch[1];
    const cells = [];
    let td;
    tdRe.lastIndex = 0;
    while((td = tdRe.exec(row)) !== null) cells.push(strip(td[1]));

    if(cells.length >= 8) {
      // Typical oddslot columns: time, home, away, h_old, h_new, d_old, d_new, a_old, a_new, drop%
      const nums = cells.map(c => parseFloat(c)).filter(n => !isNaN(n) && n > 1 && n < 50);
      if(nums.length >= 6) {
        matches.push({
          home: cells[1]||'?', away: cells[2]||'?',
          time: cells[0]||'',
          hP: nums[0], hN: nums[1],
          dP: nums[2], dN: nums[3],
          aP: nums[4], aN: nums[5]
        });
      }
    }
  }

  // If table parsing fails, try a broader pattern
  if(matches.length === 0) {
    // Look for odds patterns: consecutive decimal numbers between 1.01 and 30
    const oddsRe = /(\d+\.\d{2})/g;
    const allOdds = [];
    let m;
    while((m = oddsRe.exec(html)) !== null) {
      const v = parseFloat(m[1]);
      if(v >= 1.01 && v <= 30) allOdds.push(v);
    }
    // Group into sets of 6 (3 outcomes × 2 [old,new])
    for(let i=0; i+5 < allOdds.length; i+=6) {
      matches.push({
        home:'Team A', away:'Team B', time:'',
        hP:allOdds[i], hN:allOdds[i+1],
        dP:allOdds[i+2], dN:allOdds[i+3],
        aP:allOdds[i+4], aN:allOdds[i+5]
      });
    }
  }

  return matches;
}

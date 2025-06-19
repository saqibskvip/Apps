const fetch = require('node-fetch');
const admin = require('firebase-admin');
const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.DBFB,
});

const db = admin.database();

// Normalize names for matching
const normalize = (str) => str?.toLowerCase().replace(/\s+/g, '').trim() || '';

// Load all tips to prepare matching
const getAllTipMatchKeys = async () => {
  const snapshot = await db.ref('tips').once('value');
  const tipsData = snapshot.val() || {};
  const matchTips = [];

  for (const sectionKey in tipsData) {
    const tips = Object.values(tipsData[sectionKey] || {});
    for (const tip of tips) {
      const team1 = normalize(tip.team1);
      const team2 = normalize(tip.team2);
      const time = tip.time;
      const country = tip.country || '';
      if (team1 && team2) {
        matchTips.push({ team1, team2, time, country });
      }
    }
  }

  return matchTips;
};

// Loose contains match
const isMatch = (apiName, tipName) =>
  normalize(apiName).includes(tipName) || tipName.includes(normalize(apiName));

// Main fetcher
const fetchLiveScores = async () => {
  try {
    const tips = await getAllTipMatchKeys();

    const response = await fetch('https://api-football-v1.p.rapidapi.com/v3/fixtures?date=2025-06-18', {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
        'X-RapidAPI-Host': 'api-football-v1.p.rapidapi.com',
      },
    });

    const result = await response.json();
    const allMatches = Array.isArray(result.response) ? result.response : [];

    const matchedMap = new Map();

    for (const match of allMatches) {
      const apiTeam1 = match?.teams?.home?.name;
      const apiTeam2 = match?.teams?.away?.name;
      const apiCountry = match?.league?.country || '';
      const apiTimestamp = match?.fixture?.timestamp;
      const apiStatus = match?.fixture?.status?.short;

      if (!apiTeam1 || !apiTeam2 || !apiStatus) continue;

      for (const tip of tips) {
        const team1Match = isMatch(apiTeam1, tip.team1);
        const team2Match = isMatch(apiTeam2, tip.team2);
        const isSameCountry = normalize(apiCountry) === normalize(tip.country) || tip.country === '';
        const isSameTime = !tip.time ||
          Math.abs((tip.time * 1000) - (apiTimestamp * 1000)) < 90 * 60 * 1000;

        if (team1Match && team2Match && isSameCountry && isSameTime) {
          matchedMap.set(match.fixture.id, match);
          break;
        }
      }
    }

    // Also preserve previously saved liveScores that are still in tips
    const oldSnap = await db.ref('liveScores').once('value');
    const oldData = Array.isArray(oldSnap.val()) ? oldSnap.val() : [];

    for (const match of oldData) {
      const apiTeam1 = match?.teams?.home?.name;
      const apiTeam2 = match?.teams?.away?.name;

      for (const tip of tips) {
        const team1Match = isMatch(apiTeam1, tip.team1);
        const team2Match = isMatch(apiTeam2, tip.team2);
        if (team1Match && team2Match) {
          matchedMap.set(match.fixture?.id, match);
          break;
        }
      }
    }

    const finalScores = Array.from(matchedMap.values());

    await db.ref('liveScores').set(finalScores);
    console.log(`✅ Synced ${finalScores.length} scores at ${new Date().toLocaleTimeString()}`);
  } catch (err) {
    console.error('❌ Score Sync Failed:', err.message);
  }
};

// Run every minute
setInterval(fetchLiveScores, 60 * 1000);

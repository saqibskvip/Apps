const fetch = require('node-fetch');
const admin = require('firebase-admin');
const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.DBFB,
});

const db = admin.database();

// Utility to normalize text for partial matching
const normalize = (str) => str?.toLowerCase().replace(/\s+/g, '').trim() || '';

// Fetch all tips and prepare simplified keys for fuzzy match
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

const isMatch = (apiName, tipName) =>
  normalize(apiName).includes(tipName) || tipName.includes(normalize(apiName));

const fetchLiveScores = async () => {
  try {
    const tips = await getAllTipMatchKeys();

    const response = await fetch('https://api-football-v1.p.rapidapi.com/v3/fixtures?live=all', {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
        'X-RapidAPI-Host': 'api-football-v1.p.rapidapi.com',
      },
    });

    const result = await response.json();
    const liveMatches = Array.isArray(result.response) ? result.response : [];

    const matchedScores = [];

    for (const match of liveMatches) {
      const apiTeam1 = match?.teams?.home?.name;
      const apiTeam2 = match?.teams?.away?.name;
      const apiCountry = match?.league?.country || '';
      const apiTimestamp = match?.fixture?.timestamp;

      const apiKey = `${normalize(apiTeam1)}_${normalize(apiTeam2)}`;

      for (const tip of tips) {
        const team1Match = isMatch(apiTeam1, tip.team1);
        const team2Match = isMatch(apiTeam2, tip.team2);

        const isSameCountry =
          normalize(apiCountry) === normalize(tip.country) || tip.country === '';
        const isSameTime =
          !tip.time ||
          Math.abs((tip.time * 1000 || 0) - (apiTimestamp * 1000)) < 90 * 60 * 1000; // within 90 mins

        if (team1Match && team2Match && isSameCountry && isSameTime) {
          matchedScores.push(match);
          break; // prevent duplicate push
        }
      }
    }

    await db.ref('liveScores').set(matchedScores);
    console.log(`✅ Synced ${matchedScores.length} matches at ${new Date().toLocaleTimeString()}`);
  } catch (err) {
    console.error('❌ Score Sync Failed:', err.message);
  }
};

// Refresh every minute
setInterval(fetchLiveScores, 60 * 1000);

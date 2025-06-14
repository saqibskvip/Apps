const fetch = require('node-fetch');
const admin = require('firebase-admin');
const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.DBFB
});

const db = admin.database();

// Collect all tips as a Set of "team1_team2"
const getAllTipMatchKeys = async () => {
  const snapshot = await db.ref('tips').once('value');
  const tipsData = snapshot.val() || {};
  const matchKeys = new Set();

  for (const sectionKey in tipsData) {
    const tips = Object.values(tipsData[sectionKey] || {});
    for (const tip of tips) {
      const team1 = (tip.team1 || '').toLowerCase().trim();
      const team2 = (tip.team2 || '').toLowerCase().trim();
      if (team1 && team2) {
        matchKeys.add(`${team1}_${team2}`);
      }
    }
  }

  return matchKeys;
};

const fetchLiveScores = async () => {
  try {
    const tipMatchKeys = await getAllTipMatchKeys();

    if (tipMatchKeys.size === 0) {
      console.log('🛑 No tip matches found. Clearing liveScores.');
      await db.ref('liveScores').remove();
      return;
    }

    const response = await fetch('https://api-football-v1.p.rapidapi.com/v3/fixtures?live=all', {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
        'X-RapidAPI-Host': 'api-football-v1.p.rapidapi.com',
      }
    });

    const result = await response.json();
    const liveMatches = Array.isArray(result.response) ? result.response : [];

    // Load existing scores (e.g. finished matches still in tips)
    const existingSnap = await db.ref('liveScores').once('value');
    const existing = Array.isArray(existingSnap.val()) ? existingSnap.val() : [];

    const allScoresMap = new Map();

    // Step 1: Add existing ones that are still valid (present in tips)
    for (const match of existing) {
      const team1 = match?.teams?.home?.name?.toLowerCase()?.trim();
      const team2 = match?.teams?.away?.name?.toLowerCase()?.trim();
      const key = `${team1}_${team2}`;

      if (tipMatchKeys.has(key)) {
        allScoresMap.set(match.fixture?.id, match);
      }
    }

    // Step 2: Add/overwrite with latest live data
    for (const match of liveMatches) {
      const team1 = match?.teams?.home?.name?.toLowerCase()?.trim();
      const team2 = match?.teams?.away?.name?.toLowerCase()?.trim();
      const key = `${team1}_${team2}`;

      if (tipMatchKeys.has(key)) {
        allScoresMap.set(match.fixture?.id, match);
      }
    }

    // Final result: de-duped scores related to tips only
    const filteredScores = Array.from(allScoresMap.values());

    await db.ref('liveScores').set(filteredScores);
    console.log(`✅ Synced ${filteredScores.length} scores at ${new Date().toLocaleTimeString()}`);
  } catch (error) {
    console.error('❌ Error during score sync:', error.message);
  }
};

// Schedule every minute
setInterval(fetchLiveScores, 60 * 1000);

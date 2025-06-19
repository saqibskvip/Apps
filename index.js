const fetch = require('node-fetch');
const admin = require('firebase-admin');
const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.DBFB,
});

const db = admin.database();

const normalize = (str) => str?.toLowerCase().trim() || '';

// Fetch team1_team2 keys from all tips
const getAllTipMatchKeys = async () => {
  const snapshot = await db.ref('tips').once('value');
  const tipsData = snapshot.val() || {};
  const matchKeys = new Set();

  for (const sectionKey in tipsData) {
    const tips = Object.values(tipsData[sectionKey] || {});
    for (const tip of tips) {
      const team1 = normalize(tip.team1);
      const team2 = normalize(tip.team2);
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
      console.log('🛑 No tips found. Clearing liveScores.');
      await db.ref('liveScores').remove();
      return;
    }

    // Fetch all today matches (live + finished)
    const response = await fetch('https://api-football-v1.p.rapidapi.com/v3/fixtures?date=2025-06-18', {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
        'X-RapidAPI-Host': 'api-football-v1.p.rapidapi.com',
      },
    });

    const result = await response.json();
    const matches = Array.isArray(result.response) ? result.response : [];

    const liveMap = new Map();

    // Keep old ones that still match tip keys
    const existingSnap = await db.ref('liveScores').once('value');
    const existing = Array.isArray(existingSnap.val()) ? existingSnap.val() : [];

    for (const match of existing) {
      const team1 = normalize(match?.teams?.home?.name);
      const team2 = normalize(match?.teams?.away?.name);
      const key = `${team1}_${team2}`;
      if (tipMatchKeys.has(key)) {
        liveMap.set(match.fixture?.id, match);
      }
    }

    // Add new ones (live or finished) from today's API
    for (const match of matches) {
      const team1 = normalize(match?.teams?.home?.name);
      const team2 = normalize(match?.teams?.away?.name);
      const key = `${team1}_${team2}`;
      if (tipMatchKeys.has(key)) {
        liveMap.set(match.fixture?.id, match);
      }
    }

    const finalScores = Array.from(liveMap.values());

    await db.ref('liveScores').set(finalScores);
    console.log(`✅ Synced ${finalScores.length} matches at ${new Date().toLocaleTimeString()}`);
  } catch (error) {
    console.error('❌ Error during score sync:', error.message);
  }
};

setInterval(fetchLiveScores, 60 * 1000);

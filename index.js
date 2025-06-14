const fetch = require('node-fetch');
const admin = require('firebase-admin');
const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.DBFB
});

const db = admin.database();

const getAllTipMatches = async () => {
  const snapshot = await db.ref('tips').once('value');
  const tipsData = snapshot.val() || {};
  const allKeys = new Set();

  for (const sectionKey in tipsData) {
    const tips = Object.values(tipsData[sectionKey] || {});
    for (const tip of tips) {
      const team1 = (tip.team1 || '').toLowerCase().trim();
      const team2 = (tip.team2 || '').toLowerCase().trim();
      if (team1 && team2) {
        allKeys.add(`${team1}_${team2}`);
      }
    }
  }

  return allKeys;
};

const fetchLiveScores = async () => {
  try {
    const tipMatchKeys = await getAllTipMatches();

    if (tipMatchKeys.size === 0) {
      console.log('🛑 No tips found — clearing liveScores');
      await db.ref('liveScores').remove();
      return;
    }

    const res = await fetch('https://api-football-v1.p.rapidapi.com/v3/fixtures?live=all', {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
        'X-RapidAPI-Host': 'api-football-v1.p.rapidapi.com',
      },
    });

    const data = await res.json();
    const liveData = data.response || [];

    // Add existing scores from Firebase (even if not live anymore)
    const existingSnap = await db.ref('liveScores').once('value');
    const existingScores = existingSnap.val() || [];

    // Combine existing + live (prevent duplicates)
    const combined = [...existingScores, ...liveData];

    // Filter only those that exist in Tips
    const finalScores = combined.filter((match) => {
      const team1 = match.teams?.home?.name?.toLowerCase().trim();
      const team2 = match.teams?.away?.name?.toLowerCase().trim();
      return tipMatchKeys.has(`${team1}_${team2}`);
    });

    await db.ref('liveScores').set(finalScores);
    console.log(`✅ Filtered ${finalScores.length} scores at ${new Date().toLocaleTimeString()}`);
  } catch (e) {
    console.error('❌ Error fetching live scores:', e.message);
  }
};

// Run every 1 minute
setInterval(fetchLiveScores, 60 * 1000);

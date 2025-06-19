const fetch = require('node-fetch');
const admin = require('firebase-admin');
const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.DBFB,
});

const db = admin.database();

const normalize = (str) => str?.toLowerCase().trim() || '';

// Step 1: Get all tips
const getAllTipMatches = async () => {
  const snapshot = await db.ref('tips').once('value');
  const tips = snapshot.val() || {};
  const matches = [];

  for (const section in tips) {
    for (const key in tips[section]) {
      const tip = tips[section][key];
      const team1 = normalize(tip.team1);
      const team2 = normalize(tip.team2);
      if (team1 && team2) {
        matches.push({ team1, team2 });
      }
    }
  }

  return matches;
};

const fetchScores = async () => {
  try {
    const tips = await getAllTipMatches();

    // 🔁 Fetch BOTH live and recently finished matches
    const response = await fetch(
      'https://api-football-v1.p.rapidapi.com/v3/fixtures?next=100&live=all',
      {
        method: 'GET',
        headers: {
          'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
          'X-RapidAPI-Host': 'api-football-v1.p.rapidapi.com',
        },
      }
    );

    const result = await response.json();
    const fixtures = result?.response || [];

    const filtered = [];

    for (const match of fixtures) {
      const apiTeam1 = normalize(match?.teams?.home?.name);
      const apiTeam2 = normalize(match?.teams?.away?.name);

      const found = tips.find(
        (tip) =>
          apiTeam1.includes(tip.team1) && apiTeam2.includes(tip.team2)
      );

      if (found) {
        filtered.push(match);
      }
    }

    await db.ref('liveScores').set(filtered);
    console.log(`✅ Synced ${filtered.length} scores at ${new Date().toLocaleTimeString()}`);
  } catch (err) {
    console.error('❌ Score Sync Failed:', err.message);
  }
};

setInterval(fetchScores, 60 * 1000);

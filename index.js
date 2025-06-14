const fetch = require('node-fetch');
const admin = require('firebase-admin');
const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.DBFB
});

const db = admin.database();

const isToday = (timestamp) => {
  const today = new Date();
  const date = new Date(Number(timestamp));
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
};

const getTodayTipsTeams = async () => {
  const snapshot = await db.ref('tips').once('value');
  const tipsData = snapshot.val() || {};
  const todayTeams = new Set();

  for (const sectionKey in tipsData) {
    const tips = Object.values(tipsData[sectionKey] || {});
    for (const tip of tips) {
      if (isToday(tip.matchDate)) {
        const matchKey = `${tip.team1.toLowerCase()}_${tip.team2.toLowerCase()}`;
        todayTeams.add(matchKey);
      }
    }
  }

  return todayTeams;
};

const fetchLiveScores = async () => {
  try {
    const todayTeams = await getTodayTipsTeams();
    if (todayTeams.size === 0) {
      console.log('🛑 No today tips found — clearing liveScores');
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
    const allLive = data.response || [];

    // Match by team1 + team2 combo
    const filteredLive = allLive.filter((match) => {
      const team1 = match.teams?.home?.name?.toLowerCase();
      const team2 = match.teams?.away?.name?.toLowerCase();
      const key = `${team1}_${team2}`;
      return todayTeams.has(key);
    });

    await db.ref('liveScores').set(filteredLive);
    console.log(`✅ ${filteredLive.length} live scores saved at ${new Date().toLocaleTimeString()}`);
  } catch (e) {
    console.error('❌ Error fetching live scores:', e.message);
  }
};

// Run every 1 min
setInterval(fetchLiveScores, 60 * 1000);

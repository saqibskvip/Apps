const fetch = require('node-fetch');
const admin = require('firebase-admin');
const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);

// Initialize Firebase
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://sk-surebet-default-rtdb.firebaseio.com"
});

const db = admin.database();

// ⛔ Remove any liveScores not matching tips
const filterLiveScoresByTips = async () => {
  const tipsSnap = await db.ref('tips').once('value');
  const allTips = tipsSnap.val() || {};

  const validPairs = new Set();

  Object.values(allTips).forEach((section) => {
    Object.values(section || {}).forEach((tip) => {
      if (tip.team1 && tip.team2) {
        validPairs.add(`${tip.team1.toLowerCase()} vs ${tip.team2.toLowerCase()}`);
      }
    });
  });

  const liveSnap = await db.ref('liveScores').once('value');
  const allLiveScores = liveSnap.val();

  if (!allLiveScores || !Array.isArray(allLiveScores)) return;

  const filtered = allLiveScores.filter((match) => {
    const home = match.teams?.home?.name?.toLowerCase();
    const away = match.teams?.away?.name?.toLowerCase();
    if (!home || !away) return false;
    return validPairs.has(`${home} vs ${away}`);
  });

  await db.ref('liveScores').set(filtered);
};

const fetchLiveScores = async () => {
  try {
    const res = await fetch('https://api-football-v1.p.rapidapi.com/v3/fixtures?live=all', {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
        'X-RapidAPI-Host': 'api-football-v1.p.rapidapi.com',
      }
    });

    const data = await res.json();

    if (!data || !Array.isArray(data.response)) {
      console.log('⚠️ No valid data returned or response is not an array');
      return;
    }

    if (data.response.length === 0) {
      console.log('ℹ️ No live matches at this time');
      return;
    }

    await db.ref('liveScores').set(data.response);
    console.log(`✅ Live scores updated at ${new Date().toLocaleTimeString()}`);

    // 🔍 Now clean up non-matching live scores
    await filterLiveScoresByTips();

  } catch (e) {
    console.error('❌ Error fetching live scores:', e.message);
  }
};

// Fetch every 1 minute
setInterval(fetchLiveScores, 60 * 1000);

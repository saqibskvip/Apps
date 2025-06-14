const fetch = require('node-fetch');
const admin = require('firebase-admin');
const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);

// Initialize Firebase
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://sk-surebet-default-rtdb.firebaseio.com"
});

const db = admin.database();

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

    // Optional: skip if no live matches
    if (data.response.length === 0) {
      console.log('ℹ️ No live matches at this time');
      return;
    }

    await db.ref('liveScores').set(data.response);
    console.log(`✅ Live scores updated at ${new Date().toLocaleTimeString()}`);
  } catch (e) {
    console.error('❌ Error fetching live scores:', e.message);
  }
};

// Fetch every 1 minute
setInterval(fetchLiveScores, 60 * 1000);

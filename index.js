const fetch = require('node-fetch');
const admin = require('firebase-admin');
const serviceAccount = require('./firebase-service-account.json');

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
        'X-RapidAPI-Key': '84f51ce12emshe4194f0279a2d70p18cf3cjsnf1d138586f3c',
        'X-RapidAPI-Host': 'api-football-v1.p.rapidapi.com'
      }
    });

    const data = await res.json();
    await db.ref('liveScores').set(data.response);
    console.log(`✅ Live scores updated at ${new Date().toISOString()}`);
  } catch (e) {
    console.error('❌ Error fetching live scores:', e.message);
  }
};

// Fetch every 1 minute
setInterval(fetchLiveScores, 60 * 1000);

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

app.get('/', (req, res) => {
  res.send('Instagram video API is running!');
});

app.get('/instagram-video', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing url parameter' });

  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
      }
    });

    const html = response.data;

    // Extract from og:video meta tag
    const match = html.match(/<meta property="og:video" content="([^"]+)"/);
    if (match && match[1]) {
      return res.json({ videoUrl: match[1] });
    } else {
      return res.status(404).json({ error: 'No video found. Try a public Reel or post.' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch content' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
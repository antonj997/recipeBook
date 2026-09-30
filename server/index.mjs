import express from 'express';
import {
  validateUrl,
  fetchHtml,
  parseRecipe,
} from '../supabase/functions/_shared/recipe-parser.mjs';

const app = express();
app.use(express.json({ limit: '8kb' }));

app.post('/api/import', async (req, res) => {
  let url;
  try {
    url = validateUrl(req.body?.url);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  let html;
  try {
    html = await fetchHtml(url);
  } catch {
    return res
      .status(502)
      .json({
        error: 'Could not fetch the website. It may block requests or redirect to another URL.',
      });
  }
  try {
    return res.json(parseRecipe(html, url));
  } catch (error) {
    return res.status(422).json({ error: error.message });
  }
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, '127.0.0.1', () =>
  console.log('Recipe importer running on http://127.0.0.1:' + port),
);

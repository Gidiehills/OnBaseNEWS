// api/og-image.js
// Fallback route to serve og-image.png if static file doesn't work
import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const filePath = path.join(process.cwd(), 'public', 'og-image.png');
    const imageBuffer = fs.readFileSync(filePath);
    
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.status(200).send(imageBuffer);
  } catch (error) {
    console.error('Error serving og-image:', error);
    res.status(404).json({ error: 'Image not found' });
  }
}

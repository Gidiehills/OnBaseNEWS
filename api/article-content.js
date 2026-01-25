// api/article-content.js
// Fetches full article content from a URL

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ 
      success: false,
      error: 'URL parameter is required' 
    });
  }

  try {
    // Fetch the article URL
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch article: ${response.status}`);
    }

    const html = await response.text();
    
    // Simple HTML to text extraction (removes scripts, styles, and extracts text content)
    // This is a basic implementation - for better results, consider using a library like Readability
    let text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // Remove scripts
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // Remove styles
      .replace(/<[^>]+>/g, ' ') // Remove HTML tags
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();

    // Try to extract article content from common article tags
    const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ||
                         html.match(/<div[^>]*class="[^"]*article[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
                         html.match(/<div[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
                         html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);

    if (articleMatch) {
      text = articleMatch[1]
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    // Limit text length to avoid huge responses
    if (text.length > 10000) {
      text = text.substring(0, 10000) + '...';
    }

    // If we couldn't extract meaningful content, return a message
    if (text.length < 100) {
      return res.status(200).json({
        success: true,
        content: 'Full article content is not available. Please use the "Read Full Story" button to view the original article.',
        isFallback: true
      });
    }

    res.status(200).json({
      success: true,
      content: text,
      isFallback: false
    });

  } catch (error) {
    console.error('Article content fetch error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message || 'Failed to fetch article content',
      content: 'Unable to load full article content. Please use the "Read Full Story" button to view the original article.'
    });
  }
}

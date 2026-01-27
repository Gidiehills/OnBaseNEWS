// api/news.js
// Updated version with Base-specific RSS feeds

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const CRYPTO_PANIC_KEY = process.env.CRYPTO_PANIC_KEY;
  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  const NEWSDATA_KEY = process.env.NEWSDATA_KEY;

  try {
    const allNews = [];

    // 1. Fetch from Coinbase Blog RSS (Base-specific!)
    try {
      const coinbaseRSS = await fetch('https://blog.coinbase.com/feed');
      if (coinbaseRSS.ok) {
        const rssText = await coinbaseRSS.text();
        const items = parseRSS(rssText);
        
        items.slice(0, 10).forEach((item, idx) => {
          // Check if it's Base-related
          const isBaseRelated = item.title.toLowerCase().includes('base') || 
                                 item.description.toLowerCase().includes('base') ||
                                 item.title.toLowerCase().includes('layer 2') ||
                                 item.title.toLowerCase().includes('l2');
          
          allNews.push({
            id: `coinbase_${idx}`,
            category: isBaseRelated ? 'base' : 'crypto',
            title: item.title,
            url: item.link,
            source: 'Coinbase Blog',
            timestamp: formatTime(item.pubDate),
            rawContent: item.description || item.title
          });
        });
      }
    } catch (err) {
      console.error('Coinbase RSS error:', err);
    }

    // 2. Fetch from CryptoPanic with Base focus
    try {
      const filters = ['rising', 'hot'];
      
      for (const filter of filters) {
        const cryptoResponse = await fetch(
          `https://cryptopanic.com/api/v1/posts/?auth_token=${CRYPTO_PANIC_KEY}&public=true&kind=news&filter=${filter}&currencies=ETH,BTC,BASE&page=1`
        );
        
        if (cryptoResponse.ok) {
          const cryptoData = await cryptoResponse.json();
          
          if (cryptoData.results) {
            cryptoData.results.slice(0, 8).forEach((item, idx) => {
              allNews.push({
                id: `crypto_${filter}_${item.id || idx}`,
                category: determineCategory(item.title, item.currencies),
                title: item.title,
                url: item.url,
                source: item.source?.title || 'Crypto News',
                timestamp: formatTime(item.created_at),
                rawContent: item.title
              });
            });
          }
        }
        
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    } catch (err) {
      console.error('CryptoPanic error:', err);
    }

    // 3. Fetch from NewsData.io with crypto focus
    try {
      const queries = [
        'Base blockchain OR Coinbase layer 2',
        'Ethereum layer 2 OR L2 scaling',
        'cryptocurrency OR DeFi',
        'artificial intelligence'
      ];
      
      for (const query of queries) {
        const newsResponse = await fetch(
          `https://newsdata.io/api/1/latest?apikey=${NEWSDATA_KEY}&q=${encodeURIComponent(query)}&language=en&size=3`
        );
        
        if (newsResponse.ok) {
          const newsData = await newsResponse.json();
          
          if (newsData.results) {
            newsData.results.forEach((item, idx) => {
              allNews.push({
                id: `news_${Date.now()}_${idx}`,
                category: mapCategory(item.title, item.description),
                title: item.title,
                url: item.link,
                source: item.source_name || 'News',
                timestamp: formatTime(item.pubDate),
                rawContent: item.description || item.title
              });
            });
          }
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (err) {
      console.error('NewsData.io error:', err);
    }

    if (allNews.length === 0) {
      return res.status(500).json({ 
        success: false,
        error: 'No news found' 
      });
    }

    // Remove duplicates
    const uniqueNews = removeDuplicates(allNews);

    // Process with AI
    const enrichedNews = await Promise.all(
      uniqueNews.map(article => enrichWithAI(article, GROQ_API_KEY))
    );

    const validNews = enrichedNews.filter(item => item !== null);

    res.status(200).json({
      success: true,
      data: validNews,
      count: validNews.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
}

function parseRSS(xmlText) {
  // Simple RSS parser for common fields
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  
  while ((match = itemRegex.exec(xmlText)) !== null) {
    const itemXML = match[1];
    
    const getTag = (tag) => {
      const regex = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>|<${tag}[^>]*>([\\s\\S]*?)</${tag}>`);
      const m = itemXML.match(regex);
      return m ? (m[1] || m[2] || '').trim() : '';
    };
    
    items.push({
      title: getTag('title'),
      link: getTag('link'),
      description: getTag('description'),
      pubDate: getTag('pubDate')
    });
  }
  
  return items;
}

function removeDuplicates(articles) {
  const seen = new Set();
  return articles.filter(article => {
    const key = article.title.toLowerCase().substring(0, 50);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function determineCategory(title, currencies) {
  const titleLower = title.toLowerCase();
  
  // Base-specific (highest priority)
  if (titleLower.includes('base chain') || titleLower.includes('base network') || 
      titleLower.includes('base blockchain') || titleLower.includes('coinbase l2') ||
      titleLower.includes('base ecosystem') || titleLower.includes('base app') ||
      (titleLower.includes('base') && (titleLower.includes('coinbase') || titleLower.includes('layer')))) {
    return 'base';
  }
  
  // Layer 2 / Scaling (Base-related)
  if (titleLower.includes('layer 2') || titleLower.includes('layer-2') || 
      titleLower.includes(' l2 ') || titleLower.includes('rollup') ||
      titleLower.includes('optimism') || titleLower.includes('arbitrum') ||
      titleLower.includes('scaling')) {
    return 'base';
  }
  
  // DeFi (Base-relevant)
  if (titleLower.includes('defi') || titleLower.includes('uniswap') ||
      titleLower.includes('aave') || titleLower.includes('liquidity')) {
    return 'base';
  }
  
  // Check currencies
  if (currencies && currencies.length > 0) {
    const hasETH = currencies.some(c => c.code === 'ETH' || c.code === 'ETHEREUM');
    if (hasETH) return 'base';
  }
  
  // General crypto
  if (titleLower.includes('crypto') || titleLower.includes('bitcoin') ||
      titleLower.includes('ethereum') || titleLower.includes('blockchain')) {
    return 'crypto';
  }
  
  return 'crypto';
}

function mapCategory(title, description) {
  const text = (title + ' ' + (description || '')).toLowerCase();
  
  // Base-specific
  if (text.includes('base') && (text.includes('blockchain') || text.includes('layer') || text.includes('coinbase'))) {
    return 'base';
  }
  
  // AI/Tech
  if (text.includes('ai ') || text.includes('artificial intelligence') ||
      text.includes('machine learning') || text.includes('chatgpt')) {
    return 'ai';
  }
  
  // Crypto
  if (text.includes('crypto') || text.includes('bitcoin') ||
      text.includes('ethereum') || text.includes('blockchain') ||
      text.includes('defi')) {
    return 'crypto';
  }
  
  return 'world';
}

function formatTime(timestamp) {
  try {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  } catch (e) {
    return 'Recently';
  }
}

async function enrichWithAI(article, apiKey) {
  try {
    const prompt = `Analyze this news for Base blockchain users.

Title: "${article.title}"
Content: "${article.rawContent}"

Respond ONLY with valid JSON (no markdown):
{
  "summary": "Clear 2-3 sentence summary (max 100 words)",
  "relevanceScore": [0-100 number - rate how relevant this is to Base blockchain ecosystem],
  "vibe": "bullish" OR "bearish" OR "neutral",
  "whyItMatters": "One sentence why Base users care (max 30 words)"
}`;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 500
      })
    });

    if (!response.ok) throw new Error(`AI error: ${response.status}`);

    const data = await response.json();
    const content = data.choices[0].message.content;
    const cleanContent = content.replace(/```json|```/g, '').trim();
    const aiAnalysis = JSON.parse(cleanContent);

    return {
      ...article,
      summary: aiAnalysis.summary || article.rawContent.substring(0, 150),
      relevanceScore: Math.min(100, Math.max(0, aiAnalysis.relevanceScore || 50)),
      vibe: ['bullish', 'bearish', 'neutral'].includes(aiAnalysis.vibe) ? aiAnalysis.vibe : 'neutral',
      whyItMatters: aiAnalysis.whyItMatters || 'Relevant to ecosystem.'
    };
  } catch (err) {
    return {
      ...article,
      summary: article.rawContent ? article.rawContent.substring(0, 150) : 'Summary unavailable',
      relevanceScore: 50,
      vibe: 'neutral',
      whyItMatters: 'Relevant to the crypto ecosystem.'
    };
  }
}
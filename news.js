// api/news.js
// Updated version with better free APIs

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Get API keys from environment variables
  const CRYPTO_PANIC_KEY = process.env.CRYPTO_PANIC_KEY;
  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  const NEWSDATA_KEY = process.env.NEWSDATA_KEY; // New API

  try {
    const allNews = [];

    // Fetch from CryptoPanic with multiple filters for more coverage
    try {
      const filters = ['rising', 'hot', 'important'];
      
      for (const filter of filters) {
        const cryptoResponse = await fetch(
          `https://cryptopanic.com/api/v1/posts/?auth_token=${CRYPTO_PANIC_KEY}&public=true&kind=news&filter=${filter}&currencies=ETH,BTC,BASE&page=1`
        );
        
        if (cryptoResponse.ok) {
          const cryptoData = await cryptoResponse.json();
          
          if (cryptoData.results && cryptoData.results.length > 0) {
            const cryptoNews = cryptoData.results.slice(0, 8).map((item, idx) => ({
              id: `crypto_${filter}_${item.id || idx}`,
              category: determineCategory(item.title, item.currencies),
              title: item.title,
              url: item.url,
              source: item.source?.title || item.source?.domain || 'Crypto News',
              timestamp: formatTime(item.created_at),
              rawContent: item.title
            }));
            allNews.push(...cryptoNews);
          }
        }
        
        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    } catch (err) {
      console.error('CryptoPanic error:', err);
    }

    // Fetch from NewsData.io with crypto-focused queries
    try {
      const queries = [
        { q: 'cryptocurrency OR blockchain OR bitcoin OR ethereum', category: 'crypto' },
        { q: 'Base blockchain OR Coinbase OR layer 2', category: 'base' },
        { q: 'artificial intelligence OR AI OR machine learning', category: 'ai' },
        { q: 'technology OR startup', category: 'tech' }
      ];
      
      for (const query of queries) {
        const newsResponse = await fetch(
          `https://newsdata.io/api/1/latest?apikey=${NEWSDATA_KEY}&q=${encodeURIComponent(query.q)}&language=en&size=5`
        );
        
        if (newsResponse.ok) {
          const newsData = await newsResponse.json();
          
          if (newsData.results && newsData.results.length > 0) {
            const categoryNews = newsData.results.map((item, idx) => ({
              id: `${query.category}_${idx}_${Date.now()}`,
              category: query.category === 'tech' ? mapCategory('technology', item.title) : query.category,
              title: item.title,
              url: item.link,
              source: item.source_name || item.source_id || 'News',
              timestamp: formatTime(item.pubDate),
              rawContent: item.description || item.title
            }));
            allNews.push(...categoryNews);
          }
        }
        
        // Delay between requests
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (err) {
      console.error('NewsData.io error:', err);
    }

    if (allNews.length === 0) {
      return res.status(500).json({ 
        success: false,
        error: 'No news articles found. Please try again later.' 
      });
    }

    // Process with AI
    console.log(`Processing ${allNews.length} articles with AI...`);
    const enrichedNews = await Promise.all(
      allNews.map(article => enrichWithAI(article, GROQ_API_KEY))
    );

    const validNews = enrichedNews.filter(item => item !== null);

    if (validNews.length === 0) {
      return res.status(500).json({ 
        success: false,
        error: 'Failed to process articles' 
      });
    }

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
      error: error.message || 'Internal server error' 
    });
  }
}

function determineCategory(title, currencies) {
  const titleLower = title.toLowerCase();
  
  // Base-specific keywords (highest priority)
  if (titleLower.includes('base chain') || titleLower.includes('base network') || 
      titleLower.includes('base blockchain') || titleLower.includes('coinbase l2') ||
      (titleLower.includes('base') && (titleLower.includes('coinbase') || titleLower.includes('layer 2')))) {
    return 'base';
  }
  
  // Layer 2 / Scaling solutions (relates to Base)
  if (titleLower.includes('layer 2') || titleLower.includes('layer-2') || 
      titleLower.includes(' l2 ') || titleLower.includes('rollup') ||
      titleLower.includes('optimism') || titleLower.includes('arbitrum') ||
      titleLower.includes('scaling solution')) {
    return 'base';
  }
  
  // DeFi keywords (often Base-relevant)
  if (titleLower.includes('defi') || titleLower.includes('decentralized finance') ||
      titleLower.includes('uniswap') || titleLower.includes('aave') ||
      titleLower.includes('liquidity') || titleLower.includes('yield')) {
    return 'base';
  }
  
  // Check currencies for crypto categorization
  if (currencies && currencies.length > 0) {
    const hasETH = currencies.some(c => c.code === 'ETH' || c.code === 'ETHEREUM');
    const hasBTC = currencies.some(c => c.code === 'BTC' || c.code === 'BITCOIN');
    
    // Ethereum-related often ties to Base
    if (hasETH && (titleLower.includes('ethereum') || titleLower.includes('eth'))) {
      return 'base';
    }
    
    if (hasBTC || hasETH) return 'crypto';
  }
  
  // General crypto keywords
  if (titleLower.includes('crypto') || titleLower.includes('bitcoin') ||
      titleLower.includes('ethereum') || titleLower.includes('blockchain') ||
      titleLower.includes('nft') || titleLower.includes('web3')) {
    return 'crypto';
  }
  
  return 'crypto';
}

function mapCategory(apiCategory, title) {
  const titleLower = title.toLowerCase();
  
  // Check for Base-specific content
  if (titleLower.includes('base') && (titleLower.includes('blockchain') || titleLower.includes('layer'))) {
    return 'base';
  }
  
  // Check for AI/Tech keywords
  if (titleLower.includes('ai ') || titleLower.includes('artificial intelligence') ||
      titleLower.includes('machine learning') || titleLower.includes('chatgpt') ||
      titleLower.includes('openai') || titleLower.includes('google') ||
      titleLower.includes('tech ') || titleLower.includes('startup')) {
    return 'ai';
  }
  
  // Check for crypto keywords
  if (titleLower.includes('crypto') || titleLower.includes('bitcoin') ||
      titleLower.includes('ethereum') || titleLower.includes('blockchain') ||
      titleLower.includes('defi') || titleLower.includes('nft')) {
    return 'crypto';
  }
  
  // Default to world for business/general news
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
    const prompt = `Analyze this news headline for a Base blockchain ecosystem audience.

Title: "${article.title}"
Content: "${article.rawContent}"
Category: ${article.category}

Provide a JSON response with these exact fields:
{
  "summary": "A clear 2-3 sentence summary (max 100 words)",
  "relevanceScore": [number 0-100, where 100 = extremely relevant to Base blockchain users, 0 = not relevant],
  "vibe": "bullish" OR "bearish" OR "neutral",
  "whyItMatters": "One sentence explaining why Base users care (max 30 words)"
}

Scoring guide:
- 90-100: Direct Base ecosystem news
- 70-89: Ethereum L2, DeFi, or crypto infrastructure news
- 50-69: General crypto/tech that affects ecosystem
- 30-49: Tangentially related
- 0-29: Not relevant to crypto/blockchain

Respond ONLY with valid JSON, no markdown, no explanation.`;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ 
          role: 'user', 
          content: prompt 
        }],
        temperature: 0.3,
        max_tokens: 500
      })
    });

    if (!response.ok) {
      throw new Error(`Groq API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    
    // Clean and parse AI response
    const cleanContent = content.replace(/```json|```/g, '').trim();
    const aiAnalysis = JSON.parse(cleanContent);

    return {
      ...article,
      summary: aiAnalysis.summary || article.rawContent.substring(0, 150),
      relevanceScore: Math.min(100, Math.max(0, aiAnalysis.relevanceScore || 50)),
      vibe: ['bullish', 'bearish', 'neutral'].includes(aiAnalysis.vibe) ? aiAnalysis.vibe : 'neutral',
      whyItMatters: aiAnalysis.whyItMatters || 'Stay informed about ecosystem developments.'
    };
  } catch (err) {
    console.error('AI enrichment error for:', article.title, err.message);
    
    // Return article with fallback values
    return {
      ...article,
      summary: article.rawContent ? article.rawContent.substring(0, 150) + '...' : 'Summary unavailable',
      relevanceScore: 50,
      vibe: 'neutral',
      whyItMatters: 'Relevant to the crypto and blockchain ecosystem.'
    };
  }
}

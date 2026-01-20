// api/news.js
// Updated version with better free APIs

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    // Light caching at the edge/CDN when deployed (safe for public news)
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    if (req.method !== 'GET') {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
  
    // Get API keys from environment variables
    const CRYPTO_PANIC_KEY = process.env.CRYPTO_PANIC_KEY;
    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    const NEWSDATA_KEY = process.env.NEWSDATA_KEY; // New API

    // Query params
    const requestedCategoryRaw = (req.query?.category ?? 'all').toString().toLowerCase();
    const requestedCategory = ['all', 'base', 'crypto', 'ai', 'world'].includes(requestedCategoryRaw)
      ? requestedCategoryRaw
      : 'all';

    const limitRaw = parseInt((req.query?.limit ?? '30').toString(), 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(50, Math.max(1, limitRaw)) : 30;

    const skipAi = ['1', 'true', 'yes'].includes((req.query?.skip_ai ?? '').toString().toLowerCase());
  
    try {
      const allNews = [];
  
      // Fetch from CryptoPanic (crypto news)
      try {
        if (CRYPTO_PANIC_KEY) {
          const cryptoResponse = await fetch(
            `https://cryptopanic.com/api/v1/posts/?auth_token=${CRYPTO_PANIC_KEY}&public=true&kind=news&filter=rising&page=1`
          );
          
          if (cryptoResponse.ok) {
            const cryptoData = await cryptoResponse.json();
            
            if (cryptoData.results && cryptoData.results.length > 0) {
              const cryptoNews = cryptoData.results.slice(0, 12).map((item, idx) => ({
                id: `crypto_${item.id || idx}`,
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
        }
      } catch (err) {
        console.error('CryptoPanic error:', err);
      }
  
      // Fetch from NewsData.io (world, tech, AI news)
      try {
        if (NEWSDATA_KEY) {
          const categories = ['technology', 'business', 'world'];
          
          for (const category of categories) {
            const newsResponse = await fetch(
              `https://newsdata.io/api/1/latest?apikey=${NEWSDATA_KEY}&category=${category}&language=en&size=4`
            );
            
            if (newsResponse.ok) {
              const newsData = await newsResponse.json();
              
              if (newsData.results && newsData.results.length > 0) {
                const categoryNews = newsData.results.map((item, idx) => ({
                  id: `${category}_${idx}_${Date.now()}`,
                  category: mapCategory(category, item.title),
                  title: item.title,
                  url: item.link,
                  source: item.source_name || item.source_id || 'News',
                  timestamp: formatTime(item.pubDate),
                  rawContent: item.description || item.title
                }));
                allNews.push(...categoryNews);
              }
            }
            
            // Small delay between requests to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
      } catch (err) {
        console.error('NewsData.io error:', err);
      }

      const filteredByCategory = requestedCategory === 'all'
        ? allNews
        : allNews.filter(n => n.category === requestedCategory);

      const limited = filteredByCategory.slice(0, limit);
  
      if (limited.length === 0) {
        return res.status(500).json({ 
          success: false,
          error: 'No news articles found. Check API keys and try again later.',
          missingKeys: {
            CRYPTO_PANIC_KEY: !CRYPTO_PANIC_KEY,
            NEWSDATA_KEY: !NEWSDATA_KEY
          }
        });
      }
  
      // Process with AI
      let validNews = limited;

      if (!skipAi && GROQ_API_KEY) {
        console.log(`Processing ${limited.length} articles with AI...`);
        const enrichedNews = await Promise.all(
          limited.map(article => enrichWithAI(article, GROQ_API_KEY))
        );
        validNews = enrichedNews.filter(item => item !== null);
      } else if (!skipAi && !GROQ_API_KEY) {
        // No AI key: return raw articles with minimal required fields for the frontend
        validNews = limited.map((article) => ({
          ...article,
          summary: article.rawContent ? article.rawContent.substring(0, 150) + '...' : 'Summary unavailable',
          relevanceScore: 50,
          vibe: 'neutral',
          whyItMatters: 'Relevant to the crypto and blockchain ecosystem.'
        }));
      }
  
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
        timestamp: new Date().toISOString(),
        category: requestedCategory,
        limit,
        ai: !skipAi && !!GROQ_API_KEY
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
    
    // Base-specific keywords
    if (titleLower.includes('base') && (titleLower.includes('chain') || titleLower.includes('layer') || titleLower.includes('coinbase'))) {
      return 'base';
    }
    
    // Layer 2 / DeFi (relates to Base)
    if (titleLower.includes('layer 2') || titleLower.includes('l2') || 
        titleLower.includes('defi') || titleLower.includes('scaling') ||
        titleLower.includes('rollup')) {
      return 'base';
    }
    
    // Check currencies
    if (currencies && currencies.length > 0) {
      const hasBTC = currencies.some(c => c.code === 'BTC' || c.code === 'BITCOIN');
      const hasETH = currencies.some(c => c.code === 'ETH' || c.code === 'ETHEREUM');
      if (hasBTC || hasETH) return 'crypto';
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
// api/news.js
// ULTIMATE VERSION - Ditches problematic RSS, focuses on reliable APIs + targeted Base queries

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

  console.log('🚀 Starting news fetch (Ultimate Edition)...');

  try {
    const allNews = [];
    const debugInfo = { cryptoPanicCount: 0, newsDataCount: 0, errors: [] };

    // 1. CRYPTOPANIC - Multiple attempts with different filters
    console.log('📰 Fetching CryptoPanic (comprehensive)...');
    try {
      const filters = ['rising', 'hot', 'bullish', 'important'];
      const currencies = 'ETH,BTC,BASE,USDC';
      
      for (const filter of filters) {
        try {
          const url = `https://cryptopanic.com/api/v1/posts/?auth_token=${CRYPTO_PANIC_KEY}&public=true&kind=news&filter=${filter}&currencies=${currencies}`;
          const response = await fetch(url, { 
            headers: { 'User-Agent': 'OnBaseNews/1.0' } 
          });
          
          if (response.ok) {
            const data = await response.json();
            
            if (data.results && data.results.length > 0) {
              console.log(`✅ CryptoPanic ${filter}: ${data.results.length} articles`);
              
              data.results.slice(0, 10).forEach((item, idx) => {
                const category = ultraSmartCategorize(item.title, '', item.currencies);
                
                allNews.push({
                  id: `cp_${filter}_${Date.now()}_${idx}`,
                  category,
                  title: item.title,
                  url: item.url,
                  source: item.source?.title || 'CryptoPanic',
                  timestamp: formatTime(item.created_at),
                  rawContent: item.title
                });
                
                if (category === 'base') {
                  console.log(`  🔵 BASE: ${item.title.substring(0, 60)}...`);
                }
                
                debugInfo.cryptoPanicCount++;
              });
              
              break; // Stop after first successful fetch
            }
          }
        } catch (e) {
          console.log(`  ⚠️  CryptoPanic ${filter} failed: ${e.message}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 400));
      }
    } catch (err) {
      console.error('❌ CryptoPanic error:', err.message);
      debugInfo.errors.push(`CryptoPanic: ${err.message}`);
    }

    // 2. NEWSDATA.IO - Hyper-targeted Base queries
    if (NEWSDATA_KEY) {
      console.log('📰 Fetching NewsData (Base-focused)...');
      try {
        const queries = [
          // Base-specific
          'Base blockchain Coinbase',
          'Base network layer 2',
          'Jesse Pollak Base',
          'Base ecosystem DeFi',
          // L2 general
          'Ethereum layer 2 scaling',
          'L2 rollup optimism arbitrum',
          // DeFi (often Base-relevant)
          'DeFi Uniswap Aave protocol',
          'decentralized exchange liquidity',
          // Crypto general
          'cryptocurrency Bitcoin Ethereum',
          'blockchain adoption',
          // AI/Tech
          'artificial intelligence blockchain',
          'AI crypto technology'
        ];
        
        for (const query of queries) {
          try {
            const url = `https://newsdata.io/api/1/latest?apikey=${NEWSDATA_KEY}&q=${encodeURIComponent(query)}&language=en&size=2`;
            const response = await fetch(url);
            
            if (response.ok) {
              const data = await response.json();
              
              if (data.results && data.results.length > 0) {
                console.log(`✅ NewsData "${query}": ${data.results.length} articles`);
                
                data.results.forEach((item, idx) => {
                  const category = ultraSmartCategorize(item.title, item.description);
                  
                  allNews.push({
                    id: `nd_${Date.now()}_${idx}`,
                    category,
                    title: item.title,
                    url: item.link,
                    source: item.source_name || 'NewsData',
                    timestamp: formatTime(item.pubDate),
                    rawContent: item.description || item.title
                  });
                  
                  if (category === 'base') {
                    console.log(`  🔵 BASE: ${item.title.substring(0, 60)}...`);
                  }
                  
                  debugInfo.newsDataCount++;
                });
              }
            }
          } catch (e) {
            console.log(`  ⚠️  NewsData query failed: ${e.message}`);
          }
          
          await new Promise(resolve => setTimeout(resolve, 650));
        }
      } catch (err) {
        console.error('❌ NewsData error:', err.message);
        debugInfo.errors.push(`NewsData: ${err.message}`);
      }
    } else {
      console.log('⚠️  NewsData API key not provided - limited Base coverage');
    }

    console.log(`📊 Total collected: ${allNews.length}`);
    console.log(`   CryptoPanic: ${debugInfo.cryptoPanicCount}`);
    console.log(`   NewsData: ${debugInfo.newsDataCount}`);

    if (allNews.length === 0) {
      return res.status(500).json({ 
        success: false,
        error: 'No news found. Check API keys.',
        debug: debugInfo
      });
    }

    // Remove duplicates
    const uniqueNews = removeDuplicates(allNews);
    console.log(`🔧 After dedup: ${uniqueNews.length}`);

    // Category breakdown
    const baseCount = uniqueNews.filter(n => n.category === 'base').length;
    const cryptoCount = uniqueNews.filter(n => n.category === 'crypto').length;
    const aiCount = uniqueNews.filter(n => n.category === 'ai').length;
    const worldCount = uniqueNews.filter(n => n.category === 'world').length;
    
    console.log(`📊 Categories:`);
    console.log(`   🔵 Base: ${baseCount}`);
    console.log(`   ₿ Crypto: ${cryptoCount}`);
    console.log(`   🤖 AI: ${aiCount}`);
    console.log(`   🌍 World: ${worldCount}`);

    // AI enrichment
    console.log('🤖 AI processing...');
    const enrichedNews = await Promise.all(
      uniqueNews.map(article => enrichWithAI(article, GROQ_API_KEY))
    );

    const validNews = enrichedNews.filter(item => item !== null);
    const finalBaseCount = validNews.filter(n => n.category === 'base').length;
    
    console.log(`✅ Final: ${validNews.length} articles`);
    console.log(`🔵 FINAL BASE COUNT: ${finalBaseCount}`);

    res.status(200).json({
      success: true,
      data: validNews,
      count: validNews.length,
      debug: {
        ...debugInfo,
        baseArticles: finalBaseCount,
        cryptoArticles: validNews.filter(n => n.category === 'crypto').length,
        aiArticles: validNews.filter(n => n.category === 'ai').length,
        worldArticles: validNews.filter(n => n.category === 'world').length
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('💥 CRITICAL:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

function ultraSmartCategorize(title, description = '', currencies = []) {
  const text = (title + ' ' + description).toLowerCase();
  
  // BASE - Maximum aggressive
  const baseKeywords = [
    'base chain', 'base network', 'base blockchain', 'base ecosystem',
    'base mainnet', 'base app', 'base dapp', 'base protocol',
    'jesse pollak', 'on base', 'base token', 'basecamp',
    'coinbase l2', 'coinbase layer 2', 'coinbase base'
  ];
  
  if (baseKeywords.some(kw => text.includes(kw))) {
    return 'base';
  }
  
  // Base-related combinations
  if ((text.includes('base') && (text.includes('coinbase') || text.includes('layer') || text.includes('l2')))) {
    return 'base';
  }
  
  // L2 / Scaling (all Base-related)
  const l2Keywords = [
    'layer 2', 'layer-2', ' l2 ', 'rollup', 'optimistic', 'zk-rollup',
    'optimism', 'arbitrum', 'scaling solution', 'ethereum scaling'
  ];
  
  if (l2Keywords.some(kw => text.includes(kw))) {
    return 'base';
  }
  
  // DeFi (often Base-relevant)
  const defiKeywords = [
    'defi', 'decentralized finance', 'uniswap', 'aave', 'compound',
    'lending protocol', 'liquidity pool', 'yield', 'dex ', 'amm '
  ];
  
  if (defiKeywords.some(kw => text.includes(kw))) {
    return 'base';
  }
  
  // Ethereum (usually Base-relevant)
  if (currencies && currencies.length > 0) {
    const hasETH = currencies.some(c => c.code === 'ETH' || c.code === 'ETHEREUM');
    if (hasETH) return 'base';
  }
  
  if (text.includes('ethereum') && (text.includes('layer') || text.includes('scaling') || text.includes('defi'))) {
    return 'base';
  }
  
  // AI/Tech
  const aiKeywords = [
    'ai ', 'artificial intelligence', 'machine learning', 'chatgpt',
    'openai', 'claude', 'llm', 'neural', 'deep learning'
  ];
  
  if (aiKeywords.some(kw => text.includes(kw))) {
    return 'ai';
  }
  
  // Crypto (general)
  const cryptoKeywords = [
    'crypto', 'bitcoin', 'btc ', 'blockchain', 'nft', 'web3',
    'token', 'mining', 'wallet', 'exchange'
  ];
  
  if (cryptoKeywords.some(kw => text.includes(kw))) {
    return 'crypto';
  }
  
  return 'world';
}

function removeDuplicates(articles) {
  const seen = new Set();
  return articles.filter(article => {
    const key = article.title.toLowerCase().substring(0, 40).replace(/[^a-z0-9]/g, '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatTime(timestamp) {
  try {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return 'Recently';
    
    const now = new Date();
    const diffMs = now - date;
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  } catch (e) {
    return 'Recently';
  }
}

async function enrichWithAI(article, apiKey) {
  try {
    const prompt = `Analyze for Base blockchain users.

Title: "${article.title}"

JSON only (no markdown):
{
  "summary": "2 sentence summary (80 words max)",
  "relevanceScore": [0-100 number],
  "vibe": "bullish" OR "bearish" OR "neutral",
  "whyItMatters": "Why Base users care (25 words max)"
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
        temperature: 0.2,
        max_tokens: 400
      })
    });

    if (!response.ok) throw new Error(`AI: ${response.status}`);

    const data = await response.json();
    const content = data.choices[0].message.content.replace(/```json|```/g, '').trim();
    const ai = JSON.parse(content);

    return {
      ...article,
      summary: ai.summary || article.rawContent.substring(0, 120),
      relevanceScore: Math.min(100, Math.max(0, ai.relevanceScore || 50)),
      vibe: ['bullish', 'bearish', 'neutral'].includes(ai.vibe) ? ai.vibe : 'neutral',
      whyItMatters: ai.whyItMatters || 'Relevant to crypto ecosystem.'
    };
  } catch (err) {
    return {
      ...article,
      summary: article.rawContent ? article.rawContent.substring(0, 120) : 'Summary unavailable',
      relevanceScore: 50,
      vibe: 'neutral',
      whyItMatters: 'Stay informed about developments.'
    };
  }
}
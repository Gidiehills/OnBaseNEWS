// api/news.js
// FINAL VERSION - Complete with all API integrations and debugging

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // API Keys - from environment variables only
  const CRYPTO_PANIC_KEY = process.env.CRYPTO_PANIC_KEY;
  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  const NEWSDATA_KEY = process.env.NEWSDATA_KEY;

  console.log('🚀 Starting news fetch...');

  try {
    const allNews = [];
    const debugInfo = {
      coinbaseCount: 0,
      cryptoPanicCount: 0,
      newsDataCount: 0,
      errors: []
    };

    // 1. COINBASE BLOG RSS (Best source for Base news!)
    console.log('📰 Fetching Coinbase Blog RSS...');
    try {
      const coinbaseResponse = await fetch('https://blog.coinbase.com/feed');
      
      if (coinbaseResponse.ok) {
        const rssText = await coinbaseResponse.text();
        console.log('✅ Coinbase RSS fetched, parsing...');
        
        const items = parseRSS(rssText);
        console.log(`📄 Found ${items.length} Coinbase articles`);
        
        items.slice(0, 15).forEach((item, idx) => {
          const titleLower = item.title.toLowerCase();
          const descLower = (item.description || '').toLowerCase();
          
          // Aggressive Base detection
          const isBase = titleLower.includes('base') || descLower.includes('base') ||
                         titleLower.includes('layer 2') || titleLower.includes('l2') ||
                         descLower.includes('base chain') || descLower.includes('base network');
          
          allNews.push({
            id: `coinbase_${idx}`,
            category: isBase ? 'base' : 'crypto',
            title: item.title,
            url: item.link,
            source: 'Coinbase Blog',
            timestamp: formatTime(item.pubDate),
            rawContent: item.description || item.title
          });
          
          if (isBase) {
            console.log(`  🔵 BASE NEWS: ${item.title.substring(0, 60)}...`);
          }
        });
        
        debugInfo.coinbaseCount = items.length;
      } else {
        throw new Error(`Coinbase RSS failed: ${coinbaseResponse.status}`);
      }
    } catch (err) {
      console.error('❌ Coinbase RSS error:', err.message);
      debugInfo.errors.push(`Coinbase: ${err.message}`);
    }

    // 2. CRYPTOPANIC API
    console.log('📰 Fetching CryptoPanic...');
    try {
      const filters = ['rising', 'hot'];
      
      for (const filter of filters) {
        const url = `https://cryptopanic.com/api/v1/posts/?auth_token=${CRYPTO_PANIC_KEY}&public=true&kind=news&filter=${filter}&page=1`;
        const response = await fetch(url);
        
        if (response.ok) {
          const data = await response.json();
          
          if (data.results) {
            console.log(`✅ CryptoPanic ${filter}: ${data.results.length} articles`);
            
            data.results.slice(0, 10).forEach((item, idx) => {
              const category = smartCategorize(item.title, '', item.currencies);
              
              allNews.push({
                id: `crypto_${filter}_${item.id || idx}`,
                category: category,
                title: item.title,
                url: item.url,
                source: item.source?.title || 'CryptoPanic',
                timestamp: formatTime(item.created_at),
                rawContent: item.title
              });
              
              if (category === 'base') {
                console.log(`  🔵 BASE NEWS: ${item.title.substring(0, 60)}...`);
              }
              
              debugInfo.cryptoPanicCount++;
            });
          }
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (err) {
      console.error('❌ CryptoPanic error:', err.message);
      debugInfo.errors.push(`CryptoPanic: ${err.message}`);
    }

    // 3. NEWSDATA.IO API (if key provided)
    if (NEWSDATA_KEY) {
      console.log('📰 Fetching NewsData.io...');
      try {
        const queries = [
          'Base blockchain OR Base chain',
          'Coinbase layer 2 OR Coinbase L2',
          'Ethereum layer 2',
          'cryptocurrency',
          'artificial intelligence'
        ];
        
        for (const query of queries) {
          const url = `https://newsdata.io/api/1/latest?apikey=${NEWSDATA_KEY}&q=${encodeURIComponent(query)}&language=en&size=3`;
          const response = await fetch(url);
          
          if (response.ok) {
            const data = await response.json();
            
            if (data.results) {
              console.log(`✅ NewsData "${query}": ${data.results.length} articles`);
              
              data.results.forEach((item, idx) => {
                const category = smartCategorize(item.title, item.description);
                
                allNews.push({
                  id: `news_${Date.now()}_${idx}`,
                  category: category,
                  title: item.title,
                  url: item.link,
                  source: item.source_name || 'NewsData',
                  timestamp: formatTime(item.pubDate),
                  rawContent: item.description || item.title
                });
                
                if (category === 'base') {
                  console.log(`  🔵 BASE NEWS: ${item.title.substring(0, 60)}...`);
                }
                
                debugInfo.newsDataCount++;
              });
            }
          }
          
          await new Promise(resolve => setTimeout(resolve, 600));
        }
      } catch (err) {
        console.error('❌ NewsData error:', err.message);
        debugInfo.errors.push(`NewsData: ${err.message}`);
      }
    } else {
      console.log('⚠️  NewsData key not provided, skipping...');
    }

    console.log(`📊 Total articles collected: ${allNews.length}`);
    console.log(`   Coinbase: ${debugInfo.coinbaseCount}`);
    console.log(`   CryptoPanic: ${debugInfo.cryptoPanicCount}`);
    console.log(`   NewsData: ${debugInfo.newsDataCount}`);

    if (allNews.length === 0) {
      return res.status(500).json({ 
        success: false,
        error: 'No news found',
        debug: debugInfo
      });
    }

    // Remove duplicates
    const uniqueNews = removeDuplicates(allNews);
    console.log(`🔧 After deduplication: ${uniqueNews.length} articles`);

    // Count by category
    const baseCount = uniqueNews.filter(n => n.category === 'base').length;
    const cryptoCount = uniqueNews.filter(n => n.category === 'crypto').length;
    console.log(`📊 Category breakdown:`);
    console.log(`   Base: ${baseCount}`);
    console.log(`   Crypto: ${cryptoCount}`);
    console.log(`   AI: ${uniqueNews.filter(n => n.category === 'ai').length}`);
    console.log(`   World: ${uniqueNews.filter(n => n.category === 'world').length}`);

    // Process with AI
    console.log('🤖 Processing with AI...');
    const enrichedNews = await Promise.all(
      uniqueNews.map(article => enrichWithAI(article, GROQ_API_KEY))
    );

    const validNews = enrichedNews.filter(item => item !== null);
    console.log(`✅ Final processed: ${validNews.length} articles`);

    res.status(200).json({
      success: true,
      data: validNews,
      count: validNews.length,
      debug: {
        ...debugInfo,
        baseArticles: validNews.filter(n => n.category === 'base').length,
        totalProcessed: validNews.length
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('💥 CRITICAL ERROR:', error);
    res.status(500).json({ 
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
}

function parseRSS(xmlText) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  
  while ((match = itemRegex.exec(xmlText)) !== null) {
    const itemXML = match[1];
    
    const getTag = (tag) => {
      // Handle CDATA
      const cdataRegex = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`);
      const cdataMatch = itemXML.match(cdataRegex);
      if (cdataMatch) return cdataMatch[1].trim();
      
      // Handle regular tags
      const regularRegex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`);
      const regularMatch = itemXML.match(regularRegex);
      return regularMatch ? regularMatch[1].trim() : '';
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

function smartCategorize(title, description = '', currencies = []) {
  const text = (title + ' ' + description).toLowerCase();
  
  // BASE - Most aggressive detection
  if (text.includes('base chain') || text.includes('base network') || 
      text.includes('base blockchain') || text.includes('base ecosystem') ||
      text.includes('coinbase l2') || text.includes('base mainnet') ||
      text.includes('base app') || text.includes('base dapp') ||
      (text.includes('base') && (text.includes('coinbase') || text.includes('layer 2') || text.includes('l2')))) {
    return 'base';
  }
  
  // L2 / Scaling (Base-related)
  if (text.includes('layer 2') || text.includes('layer-2') || text.includes(' l2 ') ||
      text.includes('rollup') || text.includes('optimism') || text.includes('arbitrum') ||
      text.includes('scaling solution')) {
    return 'base';
  }
  
  // DeFi (Base-relevant)
  if (text.includes('defi') || text.includes('decentralized finance') ||
      text.includes('uniswap') || text.includes('aave') || text.includes('compound') ||
      text.includes('liquidity pool') || text.includes('yield farming')) {
    return 'base';
  }
  
  // Ethereum (often Base-related)
  if (currencies && currencies.length > 0) {
    const hasETH = currencies.some(c => c.code === 'ETH' || c.code === 'ETHEREUM');
    if (hasETH && (text.includes('ethereum') || text.includes('eth '))) {
      return 'base';
    }
  }
  
  // AI/Tech
  if (text.includes('ai ') || text.includes('artificial intelligence') ||
      text.includes('machine learning') || text.includes('chatgpt') ||
      text.includes('openai')) {
    return 'ai';
  }
  
  // Crypto (general)
  if (text.includes('crypto') || text.includes('bitcoin') || text.includes('btc ') ||
      text.includes('ethereum') || text.includes('blockchain') || text.includes('nft')) {
    return 'crypto';
  }
  
  return 'world';
}

function removeDuplicates(articles) {
  const seen = new Set();
  return articles.filter(article => {
    const key = article.title.toLowerCase().substring(0, 50).replace(/[^a-z0-9]/g, '');
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

Provide JSON only (no markdown):
{
  "summary": "2-3 sentence summary (max 100 words)",
  "relevanceScore": [number 0-100],
  "vibe": "bullish" OR "bearish" OR "neutral",
  "whyItMatters": "Why Base users care (max 30 words)"
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

    if (!response.ok) {
      throw new Error(`AI error: ${response.status}`);
    }

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
    console.error(`AI error for "${article.title}":`, err.message);
    return {
      ...article,
      summary: article.rawContent ? article.rawContent.substring(0, 150) : 'Summary unavailable',
      relevanceScore: 50,
      vibe: 'neutral',
      whyItMatters: 'Stay informed about crypto developments.'
    };
  }
}
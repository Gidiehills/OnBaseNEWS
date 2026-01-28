// api/news.js
// FIXED VERSION - Uses RSS proxy + Better CryptoPanic handling

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

  console.log('🚀 Starting news fetch...');

  try {
    const allNews = [];
    const debugInfo = {
      coinbaseCount: 0,
      cryptoPanicCount: 0,
      newsDataCount: 0,
      errors: []
    };

    // 1. COINBASE BLOG RSS via AllOrigins Proxy
    console.log('📰 Fetching Coinbase Blog RSS via proxy...');
    try {
      const rssUrl = 'https://blog.coinbase.com/feed';
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(rssUrl)}`;
      
      const coinbaseResponse = await fetch(proxyUrl, {
        headers: {
          'User-Agent': 'OnBaseNews/1.0'
        }
      });
      
      if (coinbaseResponse.ok) {
        const rssText = await coinbaseResponse.text();
        console.log(`✅ Coinbase RSS fetched via proxy (${rssText.length} chars)`);
        
        const items = parseRSS(rssText);
        console.log(`📄 Parsed ${items.length} Coinbase articles`);
        
        items.slice(0, 15).forEach((item, idx) => {
          const titleLower = item.title.toLowerCase();
          const descLower = (item.description || '').toLowerCase();
          
          // Aggressive Base detection
          const isBase = titleLower.includes('base') || descLower.includes('base') ||
                         titleLower.includes('layer 2') || titleLower.includes('l2') ||
                         descLower.includes('base chain') || descLower.includes('base network') ||
                         descLower.includes('base ecosystem');
          
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
        throw new Error(`Proxy failed: ${coinbaseResponse.status}`);
      }
    } catch (err) {
      console.error('❌ Coinbase RSS error:', err.message);
      debugInfo.errors.push(`Coinbase: ${err.message}`);
    }

    // 2. CRYPTOPANIC API - Fixed with proper filtering
    console.log('📰 Fetching CryptoPanic...');
    try {
      // Try multiple endpoints
      const endpoints = [
        `https://cryptopanic.com/api/v1/posts/?auth_token=${CRYPTO_PANIC_KEY}&public=true&kind=news&filter=rising`,
        `https://cryptopanic.com/api/v1/posts/?auth_token=${CRYPTO_PANIC_KEY}&public=true&kind=news&filter=hot`,
        `https://cryptopanic.com/api/v1/posts/?auth_token=${CRYPTO_PANIC_KEY}&public=true&kind=news`
      ];
      
      for (const url of endpoints) {
        try {
          const response = await fetch(url);
          
          if (response.ok) {
            const data = await response.json();
            
            if (data.results && data.results.length > 0) {
              console.log(`✅ CryptoPanic: ${data.results.length} articles`);
              
              data.results.slice(0, 12).forEach((item, idx) => {
                const category = smartCategorize(item.title, '', item.currencies);
                
                allNews.push({
                  id: `crypto_${Date.now()}_${idx}`,
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
              
              break; // Stop after first successful fetch
            }
          }
        } catch (e) {
          console.log(`  ⚠️  CryptoPanic endpoint failed: ${e.message}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (err) {
      console.error('❌ CryptoPanic error:', err.message);
      debugInfo.errors.push(`CryptoPanic: ${err.message}`);
    }

    // 3. NEWSDATA.IO API
    if (NEWSDATA_KEY) {
      console.log('📰 Fetching NewsData.io...');
      try {
        const queries = [
          'Base blockchain OR Base chain OR Base network',
          'Coinbase layer 2 OR Coinbase L2',
          'Ethereum layer 2 OR L2 scaling',
          'DeFi OR decentralized finance',
          'cryptocurrency news',
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
    console.log(`📊 Category breakdown:`);
    console.log(`   Base: ${baseCount}`);
    console.log(`   Crypto: ${uniqueNews.filter(n => n.category === 'crypto').length}`);
    console.log(`   AI: ${uniqueNews.filter(n => n.category === 'ai').length}`);
    console.log(`   World: ${uniqueNews.filter(n => n.category === 'world').length}`);

    // Process with AI
    console.log('🤖 Processing with AI...');
    const enrichedNews = await Promise.all(
      uniqueNews.map(article => enrichWithAI(article, GROQ_API_KEY))
    );

    const validNews = enrichedNews.filter(item => item !== null);
    console.log(`✅ Final processed: ${validNews.length} articles`);

    const finalBaseCount = validNews.filter(n => n.category === 'base').length;
    console.log(`🔵 FINAL BASE ARTICLES: ${finalBaseCount}`);

    res.status(200).json({
      success: true,
      data: validNews,
      count: validNews.length,
      debug: {
        ...debugInfo,
        baseArticles: finalBaseCount,
        totalProcessed: validNews.length
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('💥 CRITICAL ERROR:', error);
    res.status(500).json({ 
      success: false,
      error: error.message
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
      const cdataRegex = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`);
      const cdataMatch = itemXML.match(cdataRegex);
      if (cdataMatch) return cdataMatch[1].trim();
      
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
  
  // BASE - Ultra aggressive detection
  if (text.includes('base chain') || text.includes('base network') || 
      text.includes('base blockchain') || text.includes('base ecosystem') ||
      text.includes('coinbase l2') || text.includes('base mainnet') ||
      text.includes('base app') || text.includes('base dapp') ||
      text.includes('base protocol') || text.includes('on base') ||
      (text.includes(' base ') && (text.includes('coinbase') || text.includes('layer') || text.includes('l2')))) {
    return 'base';
  }
  
  // L2 / Scaling
  if (text.includes('layer 2') || text.includes('layer-2') || text.includes(' l2 ') ||
      text.includes('rollup') || text.includes('optimistic') || text.includes('zk-rollup') ||
      text.includes('scaling solution') || text.includes('ethereum scaling')) {
    return 'base';
  }
  
  // DeFi
  if (text.includes('defi') || text.includes('decentralized finance') ||
      text.includes('uniswap') || text.includes('aave') || text.includes('compound') ||
      text.includes('liquidity pool') || text.includes('yield farming') ||
      text.includes('lending protocol') || text.includes('dex ')) {
    return 'base';
  }
  
  // Ethereum (Base-related)
  if (currencies && currencies.length > 0) {
    const hasETH = currencies.some(c => c.code === 'ETH' || c.code === 'ETHEREUM');
    if (hasETH) return 'base';
  }
  
  // AI/Tech
  if (text.includes('ai ') || text.includes('artificial intelligence') ||
      text.includes('machine learning') || text.includes('chatgpt') ||
      text.includes('openai') || text.includes('claude') || text.includes('llm')) {
    return 'ai';
  }
  
  // Crypto
  if (text.includes('crypto') || text.includes('bitcoin') || text.includes('btc ') ||
      text.includes('ethereum') || text.includes('blockchain') || text.includes('nft') ||
      text.includes('web3')) {
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
// api/news.js
// HYPER-FOCUSED BASE VERSION - Prioritizes Base, Coinbase, L2s (Optimism, Arbitrum)

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

  console.log('🔵 Starting BASE-FOCUSED news fetch...');
  console.log(`🔑 API Keys: CryptoPanic=${!!CRYPTO_PANIC_KEY}, NewsData=${!!NEWSDATA_KEY}, Groq=${!!GROQ_API_KEY}`);

  try {
    const allNews = [];
    const debugInfo = { rssCount: 0, cryptoPanicCount: 0, newsDataCount: 0, errors: [] };

    // 1. COINBASE BLOG RSS (Most reliable source for Base news)
    console.log('📰 Fetching Coinbase Blog RSS...');
    try {
      const rssUrl = 'https://blog.coinbase.com/feed';
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(rssUrl)}`;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
      
      const response = await fetch(proxyUrl, {
        signal: controller.signal,
        headers: { 'User-Agent': 'OnBaseNews/1.0' }
      });
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const rssText = await response.text();
        const items = parseRSS(rssText);
        console.log(`✅ Coinbase RSS: ${items.length} articles`);
        
        items.slice(0, 20).forEach((item, idx) => {
          const category = baseFirstCategorize(item.title, item.description || '');
          
          allNews.push({
            id: `rss_${idx}_${Date.now()}`,
            category,
            title: item.title,
            url: item.link,
            source: 'Coinbase Blog',
            timestamp: formatTime(item.pubDate),
            rawContent: item.description || item.title
          });
          
          debugInfo.rssCount++;
        });
      } else {
        throw new Error(`RSS fetch failed: ${response.status}`);
      }
    } catch (err) {
      console.error('❌ RSS error:', err.message);
      debugInfo.errors.push(`RSS: ${err.message}`);
    }

    // 2. CRYPTOPANIC - Simplified
    if (CRYPTO_PANIC_KEY) {
      console.log('📰 Fetching CryptoPanic...');
      try {
        const url = `https://cryptopanic.com/api/v1/posts/?auth_token=${CRYPTO_PANIC_KEY}&public=true&kind=news&filter=hot`;
        const response = await fetch(url, { 
          headers: { 'User-Agent': 'OnBaseNews/1.0' } 
        });
        
        if (response.ok) {
          const data = await response.json();
          
          if (data.results && data.results.length > 0) {
            console.log(`✅ CryptoPanic: ${data.results.length} articles`);
            
            data.results.slice(0, 15).forEach((item, idx) => {
              const category = baseFirstCategorize(item.title, '', item.currencies);
              
              allNews.push({
                id: `cp_${Date.now()}_${idx}`,
                category,
                title: item.title,
                url: item.url,
                source: item.source?.title || 'CryptoPanic',
                timestamp: formatTime(item.created_at),
                rawContent: item.title
              });
              
              debugInfo.cryptoPanicCount++;
            });
          }
        }
      } catch (err) {
        console.error('❌ CryptoPanic error:', err.message);
        debugInfo.errors.push(`CryptoPanic: ${err.message}`);
      }
    }

    // 3. NEWSDATA.IO - Reduced queries to avoid rate limits
    if (NEWSDATA_KEY) {
      console.log('📰 Fetching NewsData...');
      try {
        // Only essential queries to avoid rate limiting
        const queries = [
          'Base blockchain',
          'Coinbase Base',
          'Ethereum layer 2',
          'Optimism Arbitrum',
          'cryptocurrency'
        ];
        
        for (const query of queries) {
          try {
            const url = `https://newsdata.io/api/1/latest?apikey=${NEWSDATA_KEY}&q=${encodeURIComponent(query)}&language=en&size=5`;
            const response = await fetch(url);
            
            if (response.ok) {
              const data = await response.json();
              
              if (data.status === 'error') {
                console.log(`  ⚠️  NewsData "${query}": ${data.message || 'API error'}`);
                break; // Stop if API error
              } else if (data.results && data.results.length > 0) {
                console.log(`✅ NewsData "${query}": ${data.results.length} articles`);
                
                data.results.forEach((item, idx) => {
                  const category = baseFirstCategorize(item.title, item.description || '');
                  
                  allNews.push({
                    id: `nd_${Date.now()}_${idx}`,
                    category,
                    title: item.title,
                    url: item.link,
                    source: item.source_name || 'NewsData',
                    timestamp: formatTime(item.pubDate),
                    rawContent: item.description || item.title
                  });
                  
                  debugInfo.newsDataCount++;
                });
              }
            } else {
              console.log(`  ⚠️  NewsData "${query}" HTTP ${response.status}`);
            }
          } catch (e) {
            console.log(`  ⚠️  NewsData "${query}" failed: ${e.message}`);
          }
          
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (err) {
        console.error('❌ NewsData error:', err.message);
        debugInfo.errors.push(`NewsData: ${err.message}`);
      }
    }

    console.log(`📊 Total collected: ${allNews.length}`);
    console.log(`   RSS: ${debugInfo.rssCount}, CryptoPanic: ${debugInfo.cryptoPanicCount}, NewsData: ${debugInfo.newsDataCount}`);

    if (allNews.length === 0) {
      return res.status(500).json({ 
        success: false,
        error: 'No news found. Check API keys and network connection.',
        debug: debugInfo
      });
    }

    // Remove duplicates
    const uniqueNews = removeDuplicates(allNews);
    console.log(`🔧 After dedup: ${uniqueNews.length}`);

    // Category breakdown
    const baseCount = uniqueNews.filter(n => n.category === 'base').length;
    const cryptoCount = uniqueNews.filter(n => n.category === 'crypto').length;
    
    console.log(`📊 Categories (Base-First):`);
    console.log(`   🔵 Base/L2: ${baseCount}`);
    console.log(`   ₿ Crypto: ${cryptoCount}`);
    console.log(`   🤖 AI: ${uniqueNews.filter(n => n.category === 'ai').length}`);
    console.log(`   🌍 World: ${uniqueNews.filter(n => n.category === 'world').length}`);

    // AI enrichment
    let validNews;
    if (GROQ_API_KEY) {
      console.log('🤖 AI processing...');
      const enrichedNews = await Promise.all(
        uniqueNews.map(article => enrichWithAI(article, GROQ_API_KEY))
      );
      validNews = enrichedNews.filter(item => item !== null);
    } else {
      console.log('⚠️  Groq API key not provided, skipping AI enrichment...');
      validNews = uniqueNews.map(article => ({
        ...article,
        summary: article.rawContent ? article.rawContent.substring(0, 120) : 'Summary unavailable',
        relevanceScore: 50,
        vibe: 'neutral',
        whyItMatters: 'Stay informed about L2 developments.'
      }));
    }
    const finalBaseCount = validNews.filter(n => n.category === 'base').length;
    
    console.log(`✅ Final: ${validNews.length} articles`);
    console.log(`🔵 FINAL BASE/L2 COUNT: ${finalBaseCount}`);

    res.status(200).json({
      success: true,
      data: validNews,
      count: validNews.length,
      debug: {
        ...debugInfo,
        baseArticles: finalBaseCount,
        percentageBase: Math.round((finalBaseCount / validNews.length) * 100)
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('💥 CRITICAL:', error);
    res.status(500).json({ success: false, error: error.message });
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

// BASE-FIRST CATEGORIZATION - Everything possible goes to Base
function baseFirstCategorize(title, description = '', currencies = []) {
  const text = (title + ' ' + description).toLowerCase();
  
  // ========== BASE (HIGHEST PRIORITY) ==========
  
  // Direct Base mentions
  const baseExplicit = [
    'base chain', 'base network', 'base blockchain', 'base ecosystem',
    'base mainnet', 'base protocol', 'base app', 'base dapp',
    'jesse pollak', 'basecamp', 'on base', 'built on base',
    'base token', 'base nft', 'base defi'
  ];
  
  if (baseExplicit.some(kw => text.includes(kw))) {
    return 'base';
  }
  
  // Coinbase + Base/L2 combinations
  if (text.includes('coinbase') && (
    text.includes('base') || text.includes('layer 2') || 
    text.includes('l2') || text.includes('blockchain')
  )) {
    return 'base';
  }
  
  // ========== LAYER 2 (ALL = BASE) ==========
  
  const l2Keywords = [
    // General L2
    'layer 2', 'layer-2', ' l2 ', 'l2s', 'l2 network',
    
    // Rollup tech
    'rollup', 'optimistic rollup', 'zk-rollup', 'zk rollup',
    'zero knowledge rollup',
    
    // Specific L2s
    'optimism', 'op mainnet', 'op stack', 'optimistic',
    'arbitrum', 'arb chain', 'arbitrum one', 'arbitrum nova',
    'polygon zkevm', 'zksync', 'starknet', 'linea',
    
    // L2 concepts
    'scaling solution', 'ethereum scaling', 'scalability layer',
    'sidechain', 'plasma', 'state channel'
  ];
  
  if (l2Keywords.some(kw => text.includes(kw))) {
    return 'base';
  }
  
  // ========== ETHEREUM + L2 CONTEXT ==========
  
  if (text.includes('ethereum') && (
    text.includes('layer') || text.includes('scaling') || 
    text.includes('rollup') || text.includes('l2')
  )) {
    return 'base';
  }
  
  // ========== DEFI (Usually Base-relevant) ==========
  
  const defiKeywords = [
    'defi', 'decentralized finance',
    'uniswap', 'aave', 'compound', 'curve',
    'lending protocol', 'liquidity pool', 'liquidity mining',
    'yield farming', 'yield', 'staking rewards',
    'dex ', 'decentralized exchange', 'amm ',
    'automated market maker', 'swap protocol'
  ];
  
  if (defiKeywords.some(kw => text.includes(kw))) {
    return 'base';
  }
  
  // ========== ETHEREUM (Often Base-relevant) ==========
  
  // ETH currency tags
  if (currencies && currencies.length > 0) {
    const hasL2Currency = currencies.some(c => 
      c.code === 'ETH' || c.code === 'ETHEREUM' ||
      c.code === 'OP' || c.code === 'OPTIMISM' ||
      c.code === 'ARB' || c.code === 'ARBITRUM'
    );
    if (hasL2Currency) return 'base';
  }
  
  // General Ethereum with DeFi context
  if (text.includes('ethereum') && (
    text.includes('defi') || text.includes('protocol') || 
    text.includes('dapp') || text.includes('smart contract')
  )) {
    return 'base';
  }
  
  // ========== NFT (Often on L2s) ==========
  
  if (text.includes('nft') && (
    text.includes('layer 2') || text.includes('ethereum') ||
    text.includes('marketplace') || text.includes('collection')
  )) {
    return 'base';
  }
  
  // ========== CRYPTO (General - Lower Priority) ==========
  
  const cryptoKeywords = [
    'crypto', 'bitcoin', 'btc ', 'blockchain',
    'web3', 'token', 'mining', 'wallet'
  ];
  
  if (cryptoKeywords.some(kw => text.includes(kw))) {
    return 'crypto';
  }
  
  // ========== AI/TECH ==========
  
  const aiKeywords = [
    'ai ', 'artificial intelligence', 'machine learning',
    'chatgpt', 'openai', 'claude', 'llm', 'neural network'
  ];
  
  if (aiKeywords.some(kw => text.includes(kw))) {
    return 'ai';
  }
  
  // ========== WORLD (Default) ==========
  
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
  if (!apiKey) {
    return {
      ...article,
      summary: article.rawContent ? article.rawContent.substring(0, 120) : 'Summary unavailable',
      relevanceScore: 50,
      vibe: 'neutral',
      whyItMatters: 'Stay informed about L2 developments.'
    };
  }

  try {
    const prompt = `Analyze this news for Base blockchain ecosystem users. Base is an Ethereum Layer 2 built by Coinbase.

Title: "${article.title}"
Content: "${article.rawContent}"

Provide JSON only (no markdown):
{
  "summary": "2 sentence summary focused on L2/Base relevance (80 words max)",
  "relevanceScore": [0-100, where 90-100 = Base-specific, 70-90 = L2/Ethereum, 50-70 = DeFi/Crypto],
  "vibe": "bullish" OR "bearish" OR "neutral",
  "whyItMatters": "Why Base/L2 users care (25 words max)"
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
      whyItMatters: ai.whyItMatters || 'Relevant to L2 ecosystem.'
    };
  } catch (err) {
    return {
      ...article,
      summary: article.rawContent ? article.rawContent.substring(0, 120) : 'Summary unavailable',
      relevanceScore: 50,
      vibe: 'neutral',
      whyItMatters: 'Stay informed about L2 developments.'
    };
  }
}
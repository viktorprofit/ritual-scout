import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import OpenAI from 'openai'
import { z } from 'zod'
import { zodResponseFormat } from 'openai/helpers/zod'

dotenv.config()

const app = express()
const PORT = 3001

app.use(cors())
app.use(express.json())

if (!process.env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY is missing in the .env file')
  process.exit(1)
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

const CryptoAnalysis = z.object({
  score: z.number().int().min(0).max(100),
  verdict: z.string().min(1),
  strengths: z.array(z.string().min(1)).min(3).max(5),
  risks: z.array(z.string().min(1)).min(3).max(5),
  catalysts: z.array(z.string().min(1)).min(2).max(4),
  watchItems: z.array(z.string().min(1)).min(2).max(4),
})

async function searchCoinGecko(project) {
  const searchUrl = new URL(
    'https://api.coingecko.com/api/v3/search',
  )

  searchUrl.searchParams.set('query', project)

  const searchResponse = await fetch(searchUrl)

  if (!searchResponse.ok) {
    throw new Error(
      `CoinGecko search failed with status ${searchResponse.status}`,
    )
  }

  const searchData = await searchResponse.json()
  const coin = searchData.coins?.[0]

  if (!coin) {
    return null
  }

  const marketUrl = new URL(
    'https://api.coingecko.com/api/v3/coins/markets',
  )

  marketUrl.searchParams.set('vs_currency', 'usd')
  marketUrl.searchParams.set('ids', coin.id)
  marketUrl.searchParams.set('price_change_percentage', '24h')

  const marketResponse = await fetch(marketUrl)

  if (!marketResponse.ok) {
    throw new Error(
      `CoinGecko market request failed with status ${marketResponse.status}`,
    )
  }

  const marketData = await marketResponse.json()
  const market = marketData[0]

  if (!market) {
    return null
  }

  return {
    id: coin.id,
    name: market.name,
    symbol: market.symbol?.toUpperCase() || null,
    image: market.image || null,
    marketCapRank: market.market_cap_rank ?? null,
    price: market.current_price ?? null,
    marketCap: market.market_cap ?? null,
    volume24h: market.total_volume ?? null,
    priceChange24h:
      market.price_change_percentage_24h ?? null,
    circulatingSupply:
      market.circulating_supply ?? null,
    totalSupply: market.total_supply ?? null,
    maxSupply: market.max_supply ?? null,
    ath: market.ath ?? null,
    athChangePercentage:
      market.ath_change_percentage ?? null,
  }
}

app.get('/', (req, res) => {
  res.json({
    status: 'Ritual Scout API is running',
  })
})

app.post('/api/analyze', async (req, res) => {
  try {
    const project =
      typeof req.body.project === 'string'
        ? req.body.project.trim()
        : ''

    if (!project) {
      return res.status(400).json({
        error: 'Project name is required',
      })
    }

    if (project.length > 100) {
      return res.status(400).json({
        error: 'Project name is too long',
      })
    }

    console.log(`Analyzing project: ${project}`)

    let marketData = null

    try {
      marketData = await searchCoinGecko(project)
    } catch (coinGeckoError) {
      console.error(
        'CoinGecko error:',
        coinGeckoError.message,
      )
    }

    const marketContext = marketData
      ? JSON.stringify(marketData, null, 2)
      : 'No matching CoinGecko market data was found.'

    const completion =
      await openai.chat.completions.parse({
        model: 'gpt-5-mini',

        messages: [
          {
            role: 'system',
            content: `
You are a crypto research analyst.

Analyze the specific crypto project provided by the user.

You will receive live CoinGecko market data when available.

Rules:
- Give a project-specific analysis.
- Explain what the project does.
- Evaluate product utility, adoption, ecosystem, competition,
  token utility, decentralization, execution risk and market risk.
- Base all market-related claims only on the supplied market data.
- Never invent prices, market caps, volume, supply or performance.
- Consider volume relative to market capitalization.
- Consider dilution risk when total supply is materially higher
  than circulating supply.
- Consider the distance from the all-time high.
- If the project is ambiguous or market data is unavailable,
  clearly state that.
- Do not provide financial advice.
- Return the answer in English.
- Return 3 to 5 strengths.
- Return 3 to 5 risks.
- Return 2 to 4 possible catalysts.
- Return 2 to 4 important things to watch.
- The score must reflect both project quality and current risk.
            `.trim(),
          },
          {
            role: 'user',
            content: `
Project requested by the user:
${project}

Live CoinGecko market data:
${marketContext}
            `.trim(),
          },
        ],

        response_format: zodResponseFormat(
          CryptoAnalysis,
          'crypto_analysis',
        ),
      })

    const analysis =
      completion.choices[0].message.parsed

    if (!analysis) {
      return res.status(502).json({
        error:
          'The AI did not return a valid analysis',
      })
    }

    return res.json({
      project,
      matchedProject: marketData
        ? {
            id: marketData.id,
            name: marketData.name,
            symbol: marketData.symbol,
            image: marketData.image,
            marketCapRank:
              marketData.marketCapRank,
          }
        : null,
      marketData: marketData
        ? {
            price: marketData.price,
            marketCap: marketData.marketCap,
            volume24h: marketData.volume24h,
            priceChange24h:
              marketData.priceChange24h,
            circulatingSupply:
              marketData.circulatingSupply,
            totalSupply: marketData.totalSupply,
            maxSupply: marketData.maxSupply,
            ath: marketData.ath,
            athChangePercentage:
              marketData.athChangePercentage,
          }
        : null,
      ...analysis,
    })
  } catch (error) {
    console.error('Analysis error:', error)

    if (error.status === 401) {
      return res.status(401).json({
        error: 'Invalid OpenAI API key',
      })
    }

    if (error.status === 429) {
      return res.status(429).json({
        error:
          'API quota or rate limit exceeded. Check API billing.',
      })
    }

    if (error.status === 400) {
      return res.status(400).json({
        error:
          error.message || 'Invalid API request',
      })
    }

    return res.status(500).json({
      error: 'AI analysis failed',
    })
  }
})
  
  export default appФ
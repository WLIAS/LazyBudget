// app/api/categorise/route.ts — Server-side AI categorisation endpoint

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

export interface CategoriseRequest {
  transactions: Array<{
    index: number;
    payee: string;
    description: string;
    amount: number;
  }>;
  categories: Array<{
    id: string;
    name: string;
    group: string;
  }>;
}

export interface CategoriseResult {
  index: number;
  categoryId: string;
  confidence: number;
}

export async function POST(req: NextRequest) {
  try {
    const body: CategoriseRequest = await req.json();
    const { transactions, categories } = body;

    if (!transactions?.length || !categories?.length) {
      return NextResponse.json({ results: [] });
    }

    const categoryList = categories
      .map((c) => `  - ${c.id}: ${c.name} (${c.group})`)
      .join('\n');

    const txList = transactions
      .map(
        (t) =>
          `${t.index}. Payee: "${t.payee}"${t.description ? ` | Desc: "${t.description}"` : ''} | Amount: ${t.amount > 0 ? '+' : ''}${t.amount.toFixed(2)}`
      )
      .join('\n');

    const systemPrompt = `You are a financial transaction categoriser for a New Zealand user.
Given a list of bank transactions, assign each to the most appropriate category from the list provided.

Rules:
- Return ONLY a valid JSON array, no other text
- Each item: { "index": number, "categoryId": string, "confidence": number (0.0–1.0) }
- Include an entry for every transaction index given
- Negative amounts are debits/expenses, positive are credits/income
- If genuinely unsure, set confidence below 0.5
- For well-known merchants below, set confidence 0.95+

NZ merchant reference (use the closest matching category from the list):
GROCERIES: Countdown, Woolworths, New World, Pak'nSave, Four Square, Fresh Choice, SuperValue, Moore Wilson
TRANSPORT: Auckland Transport, AT HOP, Wellington Metlink, Otago Regional Council, NZ Bus, Ritchies, Go Bus, Uber, Ola, inDriver, BlueCity, Zoomy, KiwiRail, Interislander, Bluebridge
FUEL: Z Energy, Z Station, BP, Mobil, Caltex, Gull, Challenge, Allied Petroleum, NPD
EATING OUT: McDonald's, Mcdonalds, Burger King, KFC, Subway, Domino's, Pizza Hut, Hell Pizza, Wendy's, Taco Bell, Carl's Jr, Noodle Canteen, Sushi Sushi, Pita Pit, Al's Diner, Fergburger
COFFEE/CAFE: Starbucks, Columbus Coffee, Mojo, Esquires, The Coffee Club, Astoria, Muffin Break, Brumby's
SUPERMARKETS/LIQUOR: BWS, Liquorland, Super Liquor, Glengarry, Bottle-O
UTILITIES: Vector, Contact Energy, Genesis Energy, Mercury Energy, Meridian Energy, Nova Energy, Trustpower, Manawa Energy, Wellington Electricity, Orion NZ, Powerco
TELECOM/INTERNET: Spark, Vodafone, 2degrees, One NZ, Skinny, Warehouse Mobile, Slingshot, Orcon, Voyager, MyRepublic, Flip
HEALTHCARE: Chemist Warehouse, Life Pharmacy, Unichem, Green Cross Health, Amcal, Bargain Chemist, Huckleberry, Health 2000, Southern Cross Health
INSURANCE: AA Insurance, AMI, State, Tower, Vero, AIA, Fidelity Life, Partners Life, Cigna, nib, Southern Cross, Accuro
BANKING FEES: ANZ fee, ASB fee, BNZ fee, Westpac fee, Kiwibank fee, TSB fee, monthly fee, account fee, overdraft fee
RETAIL: The Warehouse, Kmart, Farmers, Briscoes, Mitre 10, Bunnings, Repco, Supercheap Auto, Paper Plus, Whitcoulls, Dymocks
STREAMING/SUBSCRIPTIONS: Netflix, Spotify, Disney+, Apple, Google, Microsoft, Adobe, Amazon, Sky TV, Neon, Lightbox
GYMS/FITNESS: Les Mills, Jetts, Anytime Fitness, Genesis Gym, Snap Fitness, F45
SALARY: any payroll/salary/wages credit with employer name
INTERNAL TRANSFER: TFR, transfer, to savings, to account, own account, internet banking between own accounts`;


    const userPrompt = `Available categories:\n${categoryList}\n\nCategorise these transactions:\n${txList}`;

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const text = message.content[0].type === 'text' ? message.content[0].text : '';

    // Extract JSON array from response (handle any surrounding text)
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error('[categorise] No JSON array in response:', text);
      return NextResponse.json({ results: [] });
    }

    const results: CategoriseResult[] = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ results });
  } catch (e) {
    console.error('[categorise] Error:', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

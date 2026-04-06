// app/api/categorise/route.ts — Server-side AI categorisation endpoint
// Uses Google Gemini (free tier) via its OpenAI-compatible endpoint.
// Set GEMINI_API_KEY in .env.local and Vercel env vars.
// Get a free key at: https://aistudio.google.com/app/apikey

import { NextRequest, NextResponse } from 'next/server';
import { MERCHANT_MAPPINGS, buildMerchantHints } from '@/lib/categorisation/merchant-mappings';

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

// Sort mappings longest-keyword-first so more specific entries win
const SORTED_MAPPINGS = [...MERCHANT_MAPPINGS].sort(
  (a, b) => b.keyword.length - a.keyword.length
);

function matchMerchant(
  payee: string,
  description: string,
  categories: CategoriseRequest['categories']
): string | null {
  const haystack = `${payee}${description}`.replace(/\s/g, '').toLowerCase();

  for (const m of SORTED_MAPPINGS) {
    const needle = m.keyword.replace(/\s/g, '').toLowerCase();
    if (needle.length < 2) continue;
    if (!haystack.includes(needle)) continue;

    const cat = categories.find(
      (c) =>
        c.group.toLowerCase() === m.category.toLowerCase() &&
        c.name.toLowerCase() === m.subcategory.toLowerCase()
    );
    if (cat) return cat.id;
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body: CategoriseRequest = await req.json();
    const { transactions, categories } = body;

    if (!transactions?.length || !categories?.length) {
      return NextResponse.json({ results: [] });
    }

    // ── Step 1: Merchant-mapping pre-filter ───────────────────────────────────
    const merchantResults: CategoriseResult[] = [];
    const needsAI: typeof transactions = [];

    for (const tx of transactions) {
      const categoryId = matchMerchant(tx.payee, tx.description, categories);
      if (categoryId) {
        merchantResults.push({ index: tx.index, categoryId, confidence: 0.95 });
      } else {
        needsAI.push(tx);
      }
    }

    if (needsAI.length === 0) {
      return NextResponse.json({ results: merchantResults });
    }

    // ── Step 2: AI categorisation for remaining transactions ──────────────────
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('[categorise] GEMINI_API_KEY is not set');
      return NextResponse.json({ results: merchantResults });
    }

    const categoryList = categories
      .map((c) => `  - ${c.id}: ${c.name} (${c.group})`)
      .join('\n');

    const txList = needsAI
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

NZ merchant → category mapping (Category › Subcategory: keywords):
${buildMerchantHints()}`;

    const userPrompt = `Available categories:\n${categoryList}\n\nCategorise these transactions:\n${txList}`;

    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gemini-2.0-flash-lite',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      console.error('[categorise] Gemini API error:', err);
      return NextResponse.json({ results: merchantResults });
    }

    const data = await response.json();
    const text: string = data.choices?.[0]?.message?.content ?? '';

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error('[categorise] No JSON array in Gemini response:', text);
      return NextResponse.json({ results: merchantResults });
    }

    const aiResults: CategoriseResult[] = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ results: [...merchantResults, ...aiResults] });
  } catch (e) {
    console.error('[categorise] Error:', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

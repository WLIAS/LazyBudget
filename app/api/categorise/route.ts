// app/api/categorise/route.ts — Server-side AI categorisation endpoint

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { MERCHANT_MAPPINGS, buildMerchantHints } from '@/lib/categorisation/merchant-mappings';

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

// Sort mappings longest-keyword-first so more specific entries win
// ("uber eats" beats "uber" if both were present)
const SORTED_MAPPINGS = [...MERCHANT_MAPPINGS].sort(
  (a, b) => b.keyword.length - a.keyword.length
);

/**
 * Match a transaction against merchant-mappings using space-stripped substring
 * comparison. Strips all whitespace from both the keyword and the combined
 * payee+description so that location suffixes don't break matching:
 *   keyword "new world" → "newworld"
 *   payee   "New World Birkenhead Birkenhead" → "newworldbirkenheadbirkenhead"
 * Returns the matched category IDs or null.
 */
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
    // Deterministic, zero-latency, no API cost. Anything matched here skips
    // Claude entirely.
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

    // If everything was matched locally, skip the Claude call entirely
    if (needsAI.length === 0) {
      return NextResponse.json({ results: merchantResults });
    }

    // ── Step 2: AI categorisation for remaining transactions ──────────────────
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
      return NextResponse.json({ results: merchantResults }); // return what we have
    }

    const aiResults: CategoriseResult[] = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ results: [...merchantResults, ...aiResults] });
  } catch (e) {
    console.error('[categorise] Error:', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

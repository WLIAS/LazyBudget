// app/api/categorise/route.ts — Server-side AI categorisation endpoint

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { buildMerchantHints } from '@/lib/categorisation/merchant-mappings';

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
- For merchants listed below, set confidence 0.95+
- Match keywords case-insensitively and as substrings (e.g. "AT HOP" matches "AT HOP TOP-UP")

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
      return NextResponse.json({ results: [] });
    }

    const results: CategoriseResult[] = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ results });
  } catch (e) {
    console.error('[categorise] Error:', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

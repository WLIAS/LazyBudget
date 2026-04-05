# LazyBudget — Implementation Plan

## Overview

AI-powered budgeting app that ingests bank exports (CSV/QIF), auto-categorises transactions, handles multi-account aggregation, and delivers spending/savings insights. Deployed on Vercel via the connected GitHub repo.

---

## Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Framework | **Next.js 14 (App Router)** | Vercel-native, RSC, API routes |
| Language | **TypeScript** | End-to-end type safety |
| Styling | **Tailwind CSS + shadcn/ui** | Rapid, consistent UI components |
| Charts | **Recharts** | React-native, composable |
| State | **Zustand** | Lightweight, persistent client store |
| Persistence | **IndexedDB (via Dexie.js)** | All data stays on-device, no backend DB needed initially |
| AI | **Anthropic API (claude-sonnet-4-20250514)** | Transaction categorisation via server-side API route |
| File Parsing | **PapaParse (CSV) + custom QIF parser** | Robust, streaming-capable |
| Deployment | **Vercel** | Connected project, zero-config |

### Why Client-Side Storage?

For V1, all transaction data lives in IndexedDB. This means:
- Zero infrastructure cost (no database to manage)
- Privacy-first (financial data never leaves the browser except for AI categorisation calls)
- Fast iteration speed
- Future: add Supabase/Postgres when multi-device sync is needed

---

## Project Structure

```
lazybudget/
├── app/
│   ├── layout.tsx                    # Root layout, providers, nav
│   ├── page.tsx                      # Landing / dashboard home
│   ├── upload/
│   │   └── page.tsx                  # File upload & account mapping
│   ├── transactions/
│   │   └── page.tsx                  # Full transaction table
│   ├── review/
│   │   └── page.tsx                  # Uncategorised / low-confidence queue
│   ├── categories/
│   │   └── page.tsx                  # Category summary dashboard
│   ├── budget/
│   │   └── page.tsx                  # Budget vs actual
│   ├── accounts/
│   │   └── page.tsx                  # Account breakdown view
│   ├── savings/
│   │   └── page.tsx                  # Savings insights
│   └── api/
│       └── categorise/
│           └── route.ts              # AI categorisation endpoint
├── lib/
│   ├── db/
│   │   ├── schema.ts                 # Dexie DB schema & types
│   │   ├── index.ts                  # DB instance singleton
│   │   ├── transactions.ts           # Transaction CRUD operations
│   │   ├── rules.ts                  # Categorisation rules CRUD
│   │   ├── accounts.ts               # Account CRUD
│   │   └── budgets.ts                # Budget CRUD
│   ├── parsers/
│   │   ├── csv.ts                    # CSV parser (multi-bank format detection)
│   │   ├── qif.ts                    # QIF parser
│   │   ├── normaliser.ts             # Unified transaction schema output
│   │   └── bank-profiles.ts          # Known bank CSV column mappings
│   ├── categorisation/
│   │   ├── engine.ts                 # Orchestrator: rules → AI fallback
│   │   ├── rules.ts                  # Rule matching (exact + fuzzy)
│   │   ├── ai.ts                     # Anthropic API categorisation client
│   │   ├── categories.ts             # Category definitions & hierarchy
│   │   └── confidence.ts             # Confidence scoring logic
│   ├── analytics/
│   │   ├── spending.ts               # Spend aggregation by category/time
│   │   ├── savings.ts                # Savings rate calculations
│   │   ├── transfers.ts              # Transfer detection & exclusion
│   │   ├── budget.ts                 # Budget vs actual computation
│   │   └── trends.ts                 # Seasonal/time-series analysis
│   ├── utils/
│   │   ├── dates.ts                  # Date parsing, period helpers
│   │   ├── money.ts                  # Currency formatting, rounding
│   │   └── fuzzy.ts                  # Fuzzy string matching
│   └── store/
│       └── app-store.ts              # Zustand store (UI state, filters)
├── components/
│   ├── layout/
│   │   ├── sidebar.tsx               # Navigation sidebar
│   │   ├── header.tsx                # Top bar with account selector
│   │   └── page-shell.tsx            # Consistent page wrapper
│   ├── upload/
│   │   ├── dropzone.tsx              # File drag-and-drop area
│   │   ├── column-mapper.tsx         # Map CSV columns to schema
│   │   ├── account-labeller.tsx      # Name & type the account
│   │   └── upload-preview.tsx        # Preview parsed transactions
│   ├── transactions/
│   │   ├── transaction-table.tsx     # Sortable, filterable table
│   │   ├── transaction-row.tsx       # Single row with inline edit
│   │   ├── category-badge.tsx        # Coloured category chip
│   │   ├── filter-bar.tsx            # Date range, category, account filters
│   │   └── search-bar.tsx            # Text search across payee/memo
│   ├── review/
│   │   ├── review-card.tsx           # Single transaction review card
│   │   ├── category-dropdown.tsx     # Category picker with search
│   │   ├── bulk-actions.tsx          # Bulk categorise selected
│   │   └── rule-preview.tsx          # Shows rule that will be created
│   ├── dashboard/
│   │   ├── spend-by-category.tsx     # Donut/bar chart
│   │   ├── spend-over-time.tsx       # Line/area chart
│   │   ├── top-merchants.tsx         # Top payees list
│   │   ├── period-selector.tsx       # Week/month/year toggle
│   │   ├── stat-card.tsx             # KPI card (total, avg, etc.)
│   │   └── trend-indicator.tsx       # Up/down arrow with %
│   ├── budget/
│   │   ├── budget-row.tsx            # Category budget input + bar
│   │   ├── budget-table.tsx          # Full budget vs actual table
│   │   ├── variance-chart.tsx        # Over/under visualisation
│   │   └── budget-setup-modal.tsx    # Initial budget entry
│   ├── accounts/
│   │   ├── account-card.tsx          # Account summary card
│   │   ├── account-flow.tsx          # Inflows/outflows per account
│   │   └── transfer-list.tsx         # Detected transfers
│   └── savings/
│       ├── savings-chart.tsx         # Savings trend line
│       ├── savings-rate-gauge.tsx    # Gauge or progress ring
│       └── best-worst-months.tsx     # Highlight cards
├── public/
│   └── ...                           # Static assets
├── tailwind.config.ts
├── next.config.ts
├── tsconfig.json
├── package.json
└── .env.local                        # ANTHROPIC_API_KEY
```

---

## Data Models (Dexie/IndexedDB)

```typescript
// lib/db/schema.ts

interface Transaction {
  id: string;                          // UUID
  date: string;                        // ISO date
  amount: number;                      // Negative = debit, positive = credit
  payee: string;                       // Cleaned payee name
  rawPayee: string;                    // Original payee from bank
  description: string;                 // Memo/reference
  categoryId: string | null;           // FK to category
  categorySource: 'rule' | 'ai' | 'user' | null;
  confidence: number;                  // 0–1, AI confidence score
  accountId: string;                   // FK to account
  isTransfer: boolean;                 // Flagged as internal transfer
  transferPairId: string | null;       // Links two sides of a transfer
  importBatchId: string;               // Groups transactions from same upload
  createdAt: string;
}

interface Account {
  id: string;
  name: string;                        // User-given name
  label: 'spending' | 'bills' | 'savings' | 'mortgage' | 'investment' | 'other';
  bankName: string;                    // Optional bank identifier
  currency: string;                    // NZD default
  createdAt: string;
}

interface Category {
  id: string;
  name: string;                        // e.g. "Groceries"
  group: string;                       // e.g. "Essentials", "Lifestyle", "Housing"
  icon: string;                        // Lucide icon name
  colour: string;                      // Hex colour
  isSystem: boolean;                   // Built-in vs user-created
}

interface CategorisationRule {
  id: string;
  type: 'exact' | 'contains' | 'fuzzy' | 'regex';
  matchField: 'payee' | 'description';
  matchValue: string;                  // The pattern to match
  categoryId: string;
  priority: number;                    // Higher = checked first
  createdBy: 'user' | 'system' | 'ai';
  hitCount: number;                    // Times this rule matched
  createdAt: string;
}

interface Budget {
  id: string;
  categoryId: string;
  amount: number;                      // Monthly budget amount
  period: 'monthly';                   // Future: weekly, yearly
  effectiveFrom: string;               // ISO date
  effectiveTo: string | null;          // Null = current
}

interface ImportBatch {
  id: string;
  fileName: string;
  accountId: string;
  transactionCount: number;
  dateRange: { from: string; to: string };
  importedAt: string;
}
```

---

## Implementation Phases

### Phase 1 — Scaffold & Data Layer

**Goal**: App skeleton, navigation, DB, and file parsing working.

**Tasks**:

1. **Project init**
   - `npx create-next-app@latest lazybudget --typescript --tailwind --app --src-dir=false`
   - Install deps: `dexie dexie-react-hooks zustand papaparse uuid recharts lucide-react`
   - Install shadcn/ui: `npx shadcn@latest init` then add: button, card, input, select, table, dialog, dropdown-menu, badge, tabs, separator, tooltip, progress, sheet
   - Set up `tailwind.config.ts` with custom colour palette (see Design section)

2. **Database layer** (`lib/db/`)
   - Define Dexie schema matching models above
   - Implement CRUD helpers for each entity
   - Seed default categories (see list below)
   - Add DB versioning for future migrations

3. **File parsers** (`lib/parsers/`)
   - CSV parser: auto-detect delimiter, header row, date/amount columns
   - QIF parser: handle `D`, `T`, `P`, `M`, `^` fields
   - Bank profile system: pre-configured column mappings for common NZ banks (ASB, ANZ, Westpac, Kiwibank, BNZ)
   - Normaliser: output unified `Transaction[]` from any parser

4. **Upload page** (`app/upload/`)
   - Drag-and-drop zone (accepts .csv, .qif)
   - If columns can't be auto-detected: show column mapping UI
   - Account creation/selection for this import
   - Preview table showing first 20 parsed transactions
   - "Import" button → writes to IndexedDB
   - Duplicate detection (same date + amount + payee + account = skip)

5. **App shell**
   - Sidebar navigation with icons for each page
   - Responsive: collapsible sidebar on mobile
   - Header with global date range filter
   - Empty states for all pages

**Default Categories**:

| Group | Categories |
|---|---|
| Housing | Mortgage/Rent, Rates, Insurance (Home), Maintenance |
| Essentials | Groceries, Utilities, Internet/Phone, Insurance (Other) |
| Transport | Fuel, Public Transport, Parking, Vehicle Maintenance |
| Lifestyle | Dining Out, Takeaway/Coffee, Entertainment, Subscriptions |
| Health | Medical, Pharmacy, Fitness |
| Shopping | Clothing, Electronics, Home & Garden |
| Children | Childcare, School, Kids Activities |
| Financial | Fees & Charges, Interest Paid, Tax |
| Income | Salary, Interest Earned, Refunds, Other Income |
| Transfers | Internal Transfer |
| Other | Uncategorised |

---

### Phase 2 — Categorisation Engine

**Goal**: Transactions get auto-categorised via rules + AI.

**Tasks**:

1. **Rule engine** (`lib/categorisation/rules.ts`)
   - Load all rules from DB, sorted by priority
   - For each uncategorised transaction:
     1. Try exact match on payee
     2. Try contains match on payee
     3. Try fuzzy match (Levenshtein distance ≤ 2)
     4. Try description matches
   - Return `{ categoryId, confidence: 1.0, source: 'rule' }` or null

2. **AI categorisation** (`lib/categorisation/ai.ts` + `app/api/categorise/route.ts`)
   - API route receives batch of transactions (max 50 per call)
   - Constructs prompt with:
     - List of available categories (id + name + group)
     - Transaction data (payee, description, amount)
   - Asks Claude to return JSON array: `[{ transactionIndex, categoryId, confidence, reasoning }]`
   - System prompt instructs NZ-aware categorisation (Countdown = groceries, Z Energy = fuel, etc.)
   - Confidence threshold: ≥ 0.85 = auto-apply, < 0.85 = send to review queue

3. **Orchestrator** (`lib/categorisation/engine.ts`)
   - Pipeline: rules → AI fallback → review queue
   - Batch processing: process in chunks of 50
   - Progress callback for UI progress bar
   - Reprocessing: when a new rule is added, re-run all matching transactions

4. **Post-import flow**
   - After upload, automatically run categorisation pipeline
   - Show progress: "Categorising... 142/350 transactions"
   - Summary: "285 auto-categorised, 43 need review, 22 transfers detected"

**AI Prompt Structure**:

```
System: You are a financial transaction categoriser for a New Zealand user.
Given a list of bank transactions, assign each to the most appropriate category.

Available categories:
${categories.map(c => `- ${c.id}: ${c.name} (${c.group})`).join('\n')}

Rules:
- Return ONLY valid JSON array
- Each item: { "index": number, "categoryId": string, "confidence": 0.0-1.0 }
- Consider NZ-specific merchants
- Negative amounts are debits/expenses, positive are credits/income
- If unsure, set confidence below 0.5

User: Categorise these transactions:
${transactions.map((t, i) => `${i}. Payee: "${t.payee}" | Desc: "${t.description}" | Amount: ${t.amount}`).join('\n')}
```

---

### Phase 3 — Review Queue & Rule Learning

**Goal**: Users can fix categorisations and the system learns.

**Tasks**:

1. **Review page** (`app/review/`)
   - Shows transactions where `confidence < 0.85` or `categoryId === null`
   - Card-based UI: payee, amount, date, AI suggestion (if any)
   - Category dropdown with search
   - "Apply & Create Rule" checkbox (default on)
   - Bulk select + bulk categorise
   - Count badge in sidebar nav

2. **Rule creation from review**
   - When user categorises a transaction:
     - Create rule: `{ type: 'exact', matchField: 'payee', matchValue: transaction.payee, categoryId }`
     - Show preview: "This will also categorise 12 other transactions with this payee"
     - On confirm: apply rule retroactively to all matching transactions
   - Dedup: don't create duplicate rules

3. **Transaction table** (`app/transactions/`)
   - Full table with columns: Date, Payee, Description, Amount, Category, Account
   - Inline category edit (click badge → dropdown)
   - Filters: date range, category, account, search text
   - Sort by any column
   - Pagination or virtual scroll for large datasets

---

### Phase 4 — Transfer Detection & Multi-Account

**Goal**: Correctly handle transfers between own accounts.

**Tasks**:

1. **Transfer detection** (`lib/analytics/transfers.ts`)
   - Algorithm:
     1. For each debit transaction, look for a credit of the same absolute amount in a different account within ±2 days
     2. Score candidates by: exact amount match (required), date proximity, payee hints ("transfer", "TFR", account numbers)
     3. If match found with high confidence: flag both as `isTransfer: true`, link via `transferPairId`
   - User can manually flag/unflag transfers
   - Transfers excluded from spending calculations but visible in account flows

2. **Account breakdown page** (`app/accounts/`)
   - Card per account: balance trend, inflows, outflows
   - Transfer flow diagram showing money movement between accounts
   - List of detected transfers with confirm/reject

---

### Phase 5 — Dashboards & Analytics

**Goal**: Full spending insights, budget tracking, savings analysis.

**Tasks**:

1. **Category dashboard** (`app/categories/`)
   - Donut chart: spend by category (current period)
   - Bar chart: spend by category compared to previous period
   - Top 10 merchants by spend
   - Period selector: this week / this month / last 3 months / this year / custom
   - Stat cards: total spend, daily average, transaction count

2. **Budget vs actual** (`app/budget/`)
   - Table: category | budgeted | actual | variance | % used
   - Visual progress bars per category (green → amber → red)
   - Setup modal for first-time budget entry
   - Month selector
   - Variance chart: horizontal bar showing over/under per category

3. **Savings page** (`app/savings/`)
   - Formula: `savings = income − expenses` (transfers excluded)
   - Savings rate = `savings / income × 100`
   - Monthly savings trend (line chart)
   - Savings rate gauge (target ring)
   - Best/worst month highlight cards
   - Rolling 3-month and 12-month averages

4. **Home dashboard** (`app/page.tsx`)
   - Quick stats: total spend this month, savings rate, review queue count
   - Mini spend-by-category chart
   - Recent transactions (last 10)
   - Budget health indicator
   - Quick links to upload, review

---

### Phase 6 — Polish & Deploy

**Tasks**:

1. **Design polish** (see Design section below)
2. **Data export**: download transactions as CSV
3. **Settings page**: manage accounts, categories, rules, clear data
4. **Onboarding**: first-run guide/wizard
5. **Error handling**: graceful failures for malformed files, API errors
6. **Performance**: virtual scrolling for large tables, web worker for parsing
7. **Vercel deployment**: env vars, edge config

---

## Design Direction

**Aesthetic**: Clean financial — not a boring bank app, not a toy. Think: Monzo's clarity meets Linear's precision.

**Palette** (CSS variables):

```css
:root {
  --bg-primary: #0A0F1C;          /* Deep navy background */
  --bg-secondary: #111827;         /* Card backgrounds */
  --bg-tertiary: #1F2937;          /* Elevated surfaces */
  --text-primary: #F9FAFB;         /* Primary text */
  --text-secondary: #9CA3AF;       /* Secondary text */
  --accent-green: #34D399;         /* Income, savings, positive */
  --accent-red: #F87171;           /* Expenses, over-budget */
  --accent-amber: #FBBF24;         /* Warnings, review needed */
  --accent-blue: #60A5FA;          /* Info, links, charts */
  --accent-purple: #A78BFA;        /* AI-categorised indicator */
  --border: #374151;               /* Subtle borders */
}
```

**Typography**:
- Headings: **DM Sans** (700) — geometric, modern, financial-grade
- Body: **DM Sans** (400, 500) — clean readability
- Monospace numbers: **JetBrains Mono** — for amounts and dates

**Key Design Rules**:
- All monetary values right-aligned, monospace font
- Negative amounts in red, positive in green
- Category colours are consistent everywhere (badge, chart, table)
- Generous whitespace between sections
- Cards have subtle border, no heavy shadows
- Charts use the accent palette, no rainbow
- Sidebar: dark, icons + labels, active state with left accent bar
- Mobile: bottom tab nav replaces sidebar

---

## Environment Variables

```env
# .env.local
ANTHROPIC_API_KEY=sk-ant-...
```

No other env vars needed for V1 (all client-side storage).

---

## Key Implementation Notes

### For Claude Code Execution

1. **Build incrementally** — complete each phase before moving to the next. Each phase should result in a working app.

2. **Start with Phase 1** — get the shell, database, and upload flow working first. Everything depends on having parsed transactions in IndexedDB.

3. **Test with real data** — create sample CSV files matching NZ bank export formats (ASB, ANZ) for testing. Include edge cases: negative amounts as debits vs positive, different date formats, special characters in payee names.

4. **AI categorisation batching** — never send more than 50 transactions per API call. Queue and process sequentially. Handle rate limits with exponential backoff.

5. **Reprocessing on rule change** — when a user creates a rule from the review queue, query all transactions matching that payee and update their category. This should be a DB operation, not re-running AI.

6. **Transfer detection is fuzzy** — start simple (exact amount match within ±2 days across different accounts). Can be refined later. Always let users override.

7. **Chart responsiveness** — all Recharts components must use `<ResponsiveContainer>`. Test at mobile widths.

8. **IndexedDB size** — Dexie handles large datasets well. Index the `date`, `accountId`, `categoryId`, and `payee` fields for query performance.

### Sample CSV Formats to Support

**ASB Bank (NZ)**:
```csv
Date,Unique Id,Tran Type,Cheque Number,Payee,Memo,Amount
2024/03/15,2024031500001,TFR,,SAVINGS ACCOUNT,Transfer to savings,-500.00
2024/03/14,2024031400001,D/C,,COUNTDOWN Auckland,Card purchase,-87.50
```

**ANZ (NZ)**:
```csv
Type,Details,Particulars,Code,Reference,Amount,Date,ForeignCurrencyAmount,ConversionCharge
Eft-Pos,COUNTDOWN,AUCKLAND,,,-52.30,15/03/2024,,
```

**Generic fallback**: auto-detect columns by header keywords (date, amount, payee, description, memo, reference).

---

## Execution Checklist

Copy this into Claude Code as your task list:

```
PHASE 1 — Scaffold & Data Layer
[ ] Create Next.js project with TypeScript + Tailwind
[ ] Install all dependencies (dexie, zustand, papaparse, recharts, shadcn, lucide-react, uuid)
[ ] Set up shadcn/ui components
[ ] Implement Dexie database schema and CRUD helpers
[ ] Seed default categories
[ ] Build CSV parser with auto-detection
[ ] Build QIF parser
[ ] Build bank profile system (ASB, ANZ, BNZ, Westpac, Kiwibank)
[ ] Build normaliser
[ ] Create app shell: sidebar nav, header, page wrapper
[ ] Build upload page: dropzone, column mapper, account labeller, preview, import
[ ] Add duplicate detection on import
[ ] Empty states for all pages

PHASE 2 — Categorisation Engine
[ ] Implement rule matching engine (exact → contains → fuzzy)
[ ] Create API route for AI categorisation
[ ] Build AI prompt with NZ-awareness
[ ] Build orchestrator pipeline (rules → AI → review queue)
[ ] Add post-import categorisation flow with progress UI
[ ] Handle API errors and rate limiting

PHASE 3 — Review Queue & Rule Learning
[ ] Build review page with card-based UI
[ ] Category dropdown with search
[ ] Rule creation on categorise (with retroactive apply)
[ ] Bulk categorisation
[ ] Full transaction table with filters, sort, search
[ ] Inline category editing in table

PHASE 4 — Transfer Detection
[ ] Implement transfer detection algorithm
[ ] Add manual transfer flagging
[ ] Account breakdown page with flow visualisation
[ ] Ensure transfers excluded from spending calcs

PHASE 5 — Dashboards
[ ] Home dashboard with quick stats
[ ] Category spending dashboard (donut + bar charts)
[ ] Budget setup and vs-actual tracking
[ ] Savings analysis page (trend, rate, best/worst)
[ ] Period selectors and date range filters throughout

PHASE 6 — Polish
[ ] Design system: fonts, colours, component styling
[ ] Responsive / mobile layout
[ ] Data export (CSV download)
[ ] Settings page
[ ] Error handling throughout
[ ] Performance optimisation
[ ] Deploy to Vercel with env vars
```

# FinRec

A privacy-first personal finance tracker built with React, TypeScript, Vite, and Supabase.

## Goals

- Fast daily income and expense entry
- Clear monthly cash-flow reporting
- Budgets and recurring transactions
- Transparent next-month observations
- Mobile-first, accessible interface
- Secure user-level data isolation with Supabase Row Level Security

## Development

Install dependencies and run the local development server:

```bash
npm install
npm run dev
```

## Environment variables

Create `.env.local`:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

Never commit secret/service-role keys.

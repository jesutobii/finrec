import { supabase } from './supabase'

export type TransactionType = 'income' | 'expense' | 'investment'
export type Category = { id: string; name: string; type: TransactionType }
export type Budget = { id: string; category_id: string | null; month: string; amount: number; currency: string; category?: { name: string } | null }

export type Transaction = {
  id: string
  type: TransactionType
  amount: number
  currency: string
  transaction_date: string
  description: string | null
  category_id: string | null
  category?: { name: string } | null
}

type TransactionRow = Omit<Transaction, 'category'> & { category: { name: string }[] | { name: string } | null }
type BudgetRow = Omit<Budget, 'category'> & { category: { name: string }[] | { name: string } | null }
export type BalanceReconciliation = {
  id: string
  month: string
  opening_balance: number
  actual_closing_balance: number
  note: string | null
}

function normalizeTransaction(row: TransactionRow): Transaction {
  return { ...row, category: Array.isArray(row.category) ? row.category[0] ?? null : row.category }
}
function normalizeBudget(row: BudgetRow): Budget {
  return { ...row, category: Array.isArray(row.category) ? row.category[0] ?? null : row.category }
}

export async function getTransactions(userId: string) {
  const { data, error } = await supabase.from('transactions').select('id,type,amount,currency,transaction_date,description,category_id,category:categories(name)').eq('user_id', userId).order('transaction_date', { ascending: false }).order('created_at', { ascending: false }).limit(500)
  if (error) throw error
  return ((data ?? []) as TransactionRow[]).map(normalizeTransaction)
}

export async function getCategories(type: TransactionType) {
  const { data, error } = await supabase.from('categories').select('id,name,type').eq('type', type).order('name')
  if (error) throw error
  return data ?? []
}

export async function createTransaction(input: { user_id: string; type: TransactionType; amount: number; currency: string; transaction_date: string; description: string; category_id: string | null }) {
  const { data, error } = await supabase.from('transactions').insert(input).select('id,type,amount,currency,transaction_date,description,category_id').single()
  if (error) throw error
  if (!data) throw new Error('The transaction was not returned after saving.')
  return { ...data, category: null } as Transaction
}

export async function createFundedExpense(input: { user_id: string; amount: number; currency: string; transaction_date: string; description: string; category_id: string | null; funding_source: 'savings' | 'investment' }) {
  const { data, error } = await supabase.rpc('create_expense_from_funding', {
    p_user_id: input.user_id,
    p_amount: input.amount,
    p_currency: input.currency,
    p_transaction_date: input.transaction_date,
    p_description: input.description,
    p_category_id: input.category_id,
    p_funding_source: input.funding_source,
  })
  if (error) throw error
  if (!data?.transaction) throw new Error('The funded expense was not returned after saving.')
  return { ...data.transaction, category: null } as Transaction
}

export async function updateTransaction(userId: string, transactionId: string, input: {
  type: TransactionType
  amount: number
  currency: string
  transaction_date: string
  description: string
  category_id: string | null
}) {
  const { data, error } = await supabase.from('transactions').update(input).eq('id', transactionId).eq('user_id', userId).select('id,type,amount,currency,transaction_date,description,category_id,category:categories(name)').single()
  if (error) throw error
  if (!data) throw new Error('The transaction was not returned after updating.')
  return normalizeTransaction(data as TransactionRow)
}

export async function deleteTransaction(userId: string, transactionId: string) {
  const { error } = await supabase.from('transactions').delete().eq('id', transactionId).eq('user_id', userId)
  if (error) throw error
}

export async function getBudgets(userId: string, month: string) {
  const { data, error } = await supabase.from('budgets').select('id,category_id,month,amount,currency,category:categories(name)').eq('user_id', userId).eq('month', month)
  if (error) throw error
  return ((data ?? []) as BudgetRow[]).map(normalizeBudget)
}

export async function saveBudget(input: { user_id: string; category_id: string; month: string; amount: number; currency: string }) {
  const { data, error } = await supabase.from('budgets').upsert(input, { onConflict: 'user_id,category_id,month' }).select('id,category_id,month,amount,currency,category:categories(name)').single()
  if (error) throw error
  if (!data) throw new Error('The budget was not returned after saving.')
  return normalizeBudget(data as BudgetRow)
}

export async function getReconciliation(userId: string, month: string) {
  const { data, error } = await supabase.from('balance_reconciliations').select('id,month,opening_balance,actual_closing_balance,note').eq('user_id', userId).eq('month', month).maybeSingle()
  if (error) throw error
  return data as BalanceReconciliation | null
}

export async function saveReconciliation(input: { user_id: string; month: string; opening_balance: number; actual_closing_balance: number; note: string | null }) {
  const { data, error } = await supabase.from('balance_reconciliations').upsert(input, { onConflict: 'user_id,month' }).select('id,month,opening_balance,actual_closing_balance,note').single()
  if (error) throw error
  if (!data) throw new Error('The reconciliation was not returned after saving.')
  return data as BalanceReconciliation
}

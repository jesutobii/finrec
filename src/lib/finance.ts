import { supabase } from './supabase'

export type Transaction = {
  id: string
  type: 'income' | 'expense'
  amount: number
  currency: string
  transaction_date: string
  description: string | null
  category_id: string | null
  category?: { name: string } | null
}

type TransactionRow = Omit<Transaction, 'category'> & {
  category: { name: string }[] | { name: string } | null
}

function normalizeTransaction(row: TransactionRow): Transaction {
  return {
    ...row,
    category: Array.isArray(row.category) ? row.category[0] ?? null : row.category,
  }
}

export async function getTransactions(userId: string) {
  const { data, error } = await supabase
    .from('transactions')
    .select('id,type,amount,currency,transaction_date,description,category_id,category:categories(name)')
    .eq('user_id', userId)
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) throw error
  return ((data ?? []) as TransactionRow[]).map(normalizeTransaction)
}

export async function getCategories(type: 'income' | 'expense') {
  const { data, error } = await supabase
    .from('categories')
    .select('id,name,type')
    .eq('type', type)
    .order('name')

  if (error) throw error
  return data ?? []
}

export async function createTransaction(input: {
  user_id: string
  type: 'income' | 'expense'
  amount: number
  currency: string
  transaction_date: string
  description: string
  category_id: string | null
}) {
  const { data, error } = await supabase
    .from('transactions')
    .insert(input)
    .select('id,type,amount,currency,transaction_date,description,category_id')
    .single()

  if (error) throw error
  if (!data) throw new Error('The transaction was not returned after saving.')

  return { ...data, category: null } as Transaction
}

export async function deleteTransaction(userId: string, transactionId: string) {
  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', transactionId)
    .eq('user_id', userId)

  if (error) throw error
}

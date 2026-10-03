import { supabase } from './supabase'

export type FundingSource = 'cash' | 'savings' | 'investment'

export async function createFundedExpense(input: {
  user_id: string
  amount: number
  currency: string
  transaction_date: string
  description: string
  category_id: string | null
  funding_source: FundingSource
}) {
  if (input.funding_source === 'cash') {
    const { data, error } = await supabase
      .from('transactions')
      .insert({
        user_id: input.user_id,
        type: 'expense',
        amount: input.amount,
        currency: input.currency,
        transaction_date: input.transaction_date,
        description: input.description,
        category_id: input.category_id,
      })
      .select('id,type,amount,currency,transaction_date,description,category_id')
      .single()
    if (error) throw error
    return { transaction: { ...data, category: null }, transfer: null }
  }

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
  return data
}

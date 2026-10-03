import { useEffect, useMemo, useState } from 'react'
import { CircleDollarSign, X } from 'lucide-react'
import { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

type Transaction = { type: 'income' | 'expense' | 'investment'; amount: number; transaction_date: string }
type Reconciliation = { id: string; month: string; opening_balance: number; actual_closing_balance: number; note: string | null }

const naira = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 })
function monthKey(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}` }
function shiftMonth(key: string, amount: number) { const [y, m] = key.split('-').map(Number); const d = new Date(y, m - 1 + amount, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
function monthLabel(key: string) { const [y, m] = key.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('en-NG', { month: 'long', year: 'numeric' }) }

export function ReconciliationWidget({ session }: { session: Session | null }) {
  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState(monthKey())
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [record, setRecord] = useState<Reconciliation | null>(null)
  const [previous, setPrevious] = useState<Reconciliation | null>(null)
  const [opening, setOpening] = useState('')
  const [actual, setActual] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const userId = session?.user.id
    if (!userId || !open) return
    let cancelled = false
    async function load() {
      setError('')
      const start = `${month}-01`
      const endMonth = shiftMonth(month, 1)
      const [{ data: tx, error: txError }, { data: current, error: currentError }, { data: prev, error: prevError }] = await Promise.all([
        supabase.from('transactions').select('type,amount,transaction_date').eq('user_id', userId).gte('transaction_date', start).lt('transaction_date', `${endMonth}-01`),
        supabase.from('balance_reconciliations').select('id,month,opening_balance,actual_closing_balance,note').eq('user_id', userId).eq('month', start).maybeSingle(),
        supabase.from('balance_reconciliations').select('id,month,opening_balance,actual_closing_balance,note').eq('user_id', userId).eq('month', `${shiftMonth(month, -1)}-01`).maybeSingle(),
      ])
      if (cancelled) return
      if (txError || currentError || prevError) { setError((txError || currentError || prevError)?.message || 'Could not load reconciliation data.'); return }
      const currentRecord = current as Reconciliation | null
      const previousRecord = prev as Reconciliation | null
      setTransactions((tx ?? []) as Transaction[])
      setRecord(currentRecord); setPrevious(previousRecord)
      const carriedOpening = currentRecord?.opening_balance ?? previousRecord?.actual_closing_balance
      setOpening(carriedOpening == null ? '' : String(carriedOpening))
      setActual(currentRecord ? String(currentRecord.actual_closing_balance) : '')
      setNote(currentRecord?.note || '')
    }
    load()
    return () => { cancelled = true }
  }, [session?.user.id, open, month])

  const totals = useMemo(() => transactions.reduce((a, t) => { const n = Number(t.amount); if (t.type === 'income') a.income += n; else if (t.type === 'expense') a.expenses += n; else a.investments += n; return a }, { income: 0, expenses: 0, investments: 0 }), [transactions])
  const openingValue = Number(opening) || 0
  const calculated = openingValue + totals.income - totals.expenses - totals.investments
  const actualValue = actual === '' ? null : Number(actual)
  const difference = actualValue == null ? null : actualValue - calculated

  async function save() {
    if (!session?.user.id || opening === '' || actual === '') { setError('Enter both the opening/brought-forward balance and actual account balance.'); return }
    if (!Number.isFinite(Number(opening)) || !Number.isFinite(Number(actual))) { setError('Enter valid numbers for the balances.'); return }
    setSaving(true); setError('')
    const { data, error: saveError } = await supabase.from('balance_reconciliations').upsert({ user_id: session.user.id, month: `${month}-01`, opening_balance: Number(opening), actual_closing_balance: Number(actual), note: note.trim() || null }, { onConflict: 'user_id,month' }).select('id,month,opening_balance,actual_closing_balance,note').single()
    setSaving(false)
    if (saveError) { setError(saveError.message); return }
    setRecord(data as Reconciliation)
    setPrevious(data as Reconciliation)
  }

  if (!session) return null
  return <>
    <button onClick={() => setOpen(true)} aria-label="Reconcile account" style={{ position: 'fixed', right: 22, bottom: 22, zIndex: 40, border: 0, borderRadius: 999, padding: '12px 16px', background: '#123d2b', color: '#fff', fontWeight: 700, boxShadow: '0 8px 24px rgba(0,0,0,.18)', cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'center' }}><CircleDollarSign size={17}/> Reconcile balance</button>
    {open && <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,.45)', display: 'grid', placeItems: 'center', padding: 18 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(560px, 100%)', maxHeight: '90vh', overflow: 'auto', background: '#fff', borderRadius: 20, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,.25)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}><div><div style={{ fontSize: 12, letterSpacing: 1.5, fontWeight: 700, color: '#6d7b75' }}>ACCOUNT RECONCILIATION</div><h2 style={{ margin: '5px 0 4px' }}>{monthLabel(month)}</h2><p style={{ margin: 0, color: '#68756f' }}>Carry the prior month's actual closing balance into this month's opening balance.</p></div><button onClick={() => setOpen(false)} style={{ border: 0, background: 'transparent', fontSize: 28, cursor: 'pointer', color: '#68756f' }}><X/></button></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', margin: '20px 0 12px' }}><button onClick={() => setMonth(shiftMonth(month, -1))} style={{ border: '1px solid #d9dfdc', background: '#fff', borderRadius: 10, padding: '8px 12px', cursor: 'pointer' }}>← Previous</button><button onClick={() => setMonth(shiftMonth(month, 1))} style={{ border: '1px solid #d9dfdc', background: '#fff', borderRadius: 10, padding: '8px 12px', cursor: 'pointer' }}>Next →</button></div>
        {previous && <div style={{ padding: 12, borderRadius: 12, background: '#eef6f1', marginBottom: 14, fontSize: 14 }}>Brought forward from {monthLabel(shiftMonth(month, -1))}: <strong>{naira.format(previous.actual_closing_balance)}</strong></div>}
        <label style={{ display: 'block', marginTop: 12, fontWeight: 600 }}>Opening / brought-forward balance<input inputMode="decimal" value={opening} onChange={e => setOpening(e.target.value)} placeholder="0" style={{ width: '100%', boxSizing: 'border-box', marginTop: 7, padding: 12, border: '1px solid #d9dfdc', borderRadius: 10, fontSize: 16 }}/></label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, margin: '16px 0' }}>{[['Income', totals.income], ['Expenses', totals.expenses], ['Investments', totals.investments]].map(([label, value]) => <div key={label as string} style={{ background: '#f5f7f6', borderRadius: 12, padding: 12 }}><div style={{ color: '#68756f', fontSize: 12 }}>{label}</div><strong>{naira.format(value as number)}</strong></div>)}</div>
        <div style={{ padding: 14, borderRadius: 12, background: '#f5f7f6', marginBottom: 12 }}><div style={{ color: '#68756f', fontSize: 13 }}>Calculated closing balance</div><strong style={{ fontSize: 22 }}>{naira.format(calculated)}</strong></div>
        <label style={{ display: 'block', fontWeight: 600 }}>Actual account balance<input inputMode="decimal" value={actual} onChange={e => setActual(e.target.value)} placeholder="e.g. 211000" style={{ width: '100%', boxSizing: 'border-box', marginTop: 7, padding: 12, border: '1px solid #d9dfdc', borderRadius: 10, fontSize: 16 }}/></label>
        {difference != null && <div style={{ marginTop: 12, padding: 14, borderRadius: 12, background: difference === 0 ? '#eaf7ee' : '#fff5e8' }}><div style={{ fontSize: 13, color: '#68756f' }}>{difference === 0 ? 'Reconciled' : 'Unreconciled difference'}</div><strong style={{ fontSize: 20 }}>{naira.format(Math.abs(difference))}</strong>{difference !== 0 && <div style={{ marginTop: 5, fontSize: 13 }}>Review missing, duplicated, or incorrectly dated transactions before treating this as a true account balance.</div>}</div>}
        <label style={{ display: 'block', marginTop: 12, fontWeight: 600 }}>Note<textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Optional reconciliation note" rows={2} style={{ width: '100%', boxSizing: 'border-box', marginTop: 7, padding: 12, border: '1px solid #d9dfdc', borderRadius: 10, fontFamily: 'inherit' }}/></label>
        {error && <div style={{ marginTop: 12, color: '#a33a2b', background: '#fff0ed', padding: 10, borderRadius: 10 }}>{error}</div>}
        <button onClick={save} disabled={saving} style={{ width: '100%', marginTop: 16, padding: 13, border: 0, borderRadius: 10, background: '#123d2b', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>{saving ? 'Saving…' : record ? 'Update reconciliation' : 'Save reconciliation'}</button>
      </div>
    </div>}
  </>
}

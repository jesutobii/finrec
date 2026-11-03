import { useEffect, useMemo, useState } from 'react'
import { TrendingUp, X } from 'lucide-react'
import { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

type InvestmentReconciliation = { id: string; month: string; opening_value: number; actual_closing_value: number; note: string | null }
type InvestmentTransaction = { amount: number; transaction_date: string }
type InvestmentTransfer = { amount: number; transfer_date: string }
const naira = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 })
function monthKey(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}` }
function shiftMonth(key: string, amount: number) { const [y, m] = key.split('-').map(Number); const d = new Date(y, m - 1 + amount, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
function monthLabel(key: string) { const [y, m] = key.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('en-NG', { month: 'long', year: 'numeric' }) }

export function InvestmentReconciliationWidget({ session }: { session: Session | null }) {
  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState(monthKey())
  const [transactions, setTransactions] = useState<InvestmentTransaction[]>([])
  const [transfers, setTransfers] = useState<InvestmentTransfer[]>([])
  const [openingSource, setOpeningSource] = useState('')
  const [record, setRecord] = useState<InvestmentReconciliation | null>(null)
  const [previous, setPrevious] = useState<InvestmentReconciliation | null>(null)
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
      const start = `${month}-01`, next = `${shiftMonth(month, 1)}-01`, previousStart = `${shiftMonth(month, -1)}-01`
      const [tx, monthOut, historyTx, historyOut, current, prev] = await Promise.all([
        supabase.from('transactions').select('amount,transaction_date').eq('user_id', userId).eq('type', 'investment').gte('transaction_date', start).lt('transaction_date', next),
        supabase.from('account_transfers').select('amount,transfer_date,transactions!inner(id)').eq('user_id', userId).eq('from_account', 'investment').gte('transfer_date', start).lt('transfer_date', next),
        supabase.from('transactions').select('amount,transaction_date').eq('user_id', userId).eq('type', 'investment').lt('transaction_date', start),
        supabase.from('account_transfers').select('amount,transfer_date,transactions!inner(id)').eq('user_id', userId).eq('from_account', 'investment').lt('transfer_date', start),
        supabase.from('investment_reconciliations').select('id,month,opening_value,actual_closing_value,note').eq('user_id', userId).eq('month', start).maybeSingle(),
        supabase.from('investment_reconciliations').select('id,month,opening_value,actual_closing_value,note').eq('user_id', userId).eq('month', previousStart).maybeSingle(),
      ])
      if (cancelled) return
      const loadError = tx.error || monthOut.error || historyTx.error || historyOut.error || current.error || prev.error
      if (loadError) { setError(loadError.message); return }
      const currentRecord = current.data as InvestmentReconciliation | null
      const previousRecord = prev.data as InvestmentReconciliation | null
      const historyContributions = (historyTx.data ?? []).reduce((sum, row) => sum + Number(row.amount), 0)
      const historyWithdrawals = (historyOut.data ?? []).reduce((sum, row) => sum + Number(row.amount), 0)
      const estimatedOpening = Math.max(0, historyContributions - historyWithdrawals)
      setTransactions((tx.data ?? []) as InvestmentTransaction[])
      setTransfers((monthOut.data ?? []) as InvestmentTransfer[])
      setRecord(currentRecord); setPrevious(previousRecord)
      const carried = currentRecord?.opening_value ?? previousRecord?.actual_closing_value ?? estimatedOpening
      setOpening(String(carried))
      setOpeningSource(currentRecord ? 'Saved opening value' : previousRecord ? 'Carried forward from previous month' : 'Estimated from recorded contributions less investment-funded expenses')
      setActual(currentRecord ? String(currentRecord.actual_closing_value) : '')
      setNote(currentRecord?.note || '')
    }
    load()
    return () => { cancelled = true }
  }, [session?.user.id, open, month])

  const contributions = useMemo(() => transactions.reduce((sum, tx) => sum + Number(tx.amount), 0), [transactions])
  const withdrawals = useMemo(() => transfers.reduce((sum, transfer) => sum + Number(transfer.amount), 0), [transfers])
  const openingValue = Number(opening) || 0
  const expectedClosing = openingValue + contributions - withdrawals
  const actualValue = actual === '' ? null : Number(actual)
  const change = actualValue == null ? null : actualValue - expectedClosing

  async function save() {
    if (!session?.user.id || opening === '' || actual === '') { setError('Enter both the opening and actual closing investment values.'); return }
    if (!Number.isFinite(Number(opening)) || !Number.isFinite(Number(actual)) || Number(opening) < 0 || Number(actual) < 0) { setError('Enter valid non-negative investment values.'); return }
    setSaving(true); setError('')
    const { data, error: saveError } = await supabase.from('investment_reconciliations').upsert({
      user_id: session.user.id, month: `${month}-01`, opening_value: Number(opening),
      actual_closing_value: Number(actual), note: note.trim() || null, updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,month' }).select('id,month,opening_value,actual_closing_value,note').single()
    setSaving(false)
    if (saveError) { setError(saveError.message); return }
    setRecord(data as InvestmentReconciliation)
  }

  if (!session) return null
  return <>
    <button onClick={() => setOpen(true)} aria-label="Reconcile investments" style={{ position: 'fixed', right: 22, bottom: 146, zIndex: 2147483645, border: 0, borderRadius: 999, padding: '12px 16px', background: '#245b45', color: '#fff', fontWeight: 700, boxShadow: '0 8px 24px rgba(0,0,0,.18)', cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'center' }}><TrendingUp size={17}/> Reconcile investments</button>
    {open && <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 2147483647, background: 'rgba(0,0,0,.45)', display: 'grid', placeItems: 'center', padding: 18 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(560px, 100%)', maxHeight: '90vh', overflow: 'auto', background: '#fff', borderRadius: 20, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,.25)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}><div><div style={{ fontSize: 12, letterSpacing: 1.5, fontWeight: 700, color: '#6d7b75' }}>INVESTMENT RECONCILIATION</div><h2 style={{ margin: '5px 0 4px' }}>{monthLabel(month)}</h2><p style={{ margin: 0, color: '#68756f' }}>Track the market value of your investments separately from spendable cash.</p></div><button onClick={() => setOpen(false)} style={{ border: 0, background: 'transparent', fontSize: 28, cursor: 'pointer', color: '#68756f' }}><X/></button></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', margin: '20px 0 12px' }}><button onClick={() => setMonth(shiftMonth(month, -1))} style={{ border: '1px solid #d9dfdc', background: '#fff', borderRadius: 10, padding: '8px 12px', cursor: 'pointer' }}>← Previous</button><button onClick={() => setMonth(shiftMonth(month, 1))} style={{ border: '1px solid #d9dfdc', background: '#fff', borderRadius: 10, padding: '8px 12px', cursor: 'pointer' }}>Next →</button></div>
        <div style={{ padding: 12, borderRadius: 12, background: '#eef6f1', marginBottom: 14, fontSize: 14 }}>{openingSource}: <strong>{naira.format(openingValue)}</strong>{previous && <> · {monthLabel(shiftMonth(month, -1))} actual closing value</>}</div>
        <label style={{ display: 'block', marginTop: 12, fontWeight: 600 }}>Opening / brought-forward investment value<input inputMode="decimal" value={opening} onChange={e => setOpening(e.target.value)} placeholder="0" style={{ width: '100%', boxSizing: 'border-box', marginTop: 7, padding: 12, border: '1px solid #d9dfdc', borderRadius: 10, fontSize: 16 }}/></label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, margin: '16px 0' }}><div style={{ background: '#f5f7f6', borderRadius: 12, padding: 12 }}><div style={{ color: '#68756f', fontSize: 12 }}>New investments this month</div><strong>{naira.format(contributions)}</strong></div><div style={{ background: '#f5f7f6', borderRadius: 12, padding: 12 }}><div style={{ color: '#68756f', fontSize: 12 }}>Investment-funded expenses</div><strong>{naira.format(withdrawals)}</strong></div><div style={{ background: '#f5f7f6', borderRadius: 12, padding: 12, gridColumn: '1 / -1' }}><div style={{ color: '#68756f', fontSize: 12 }}>Expected before market changes</div><strong>{naira.format(expectedClosing)}</strong></div></div>
        <label style={{ display: 'block', fontWeight: 600 }}>Actual closing investment value<input inputMode="decimal" value={actual} onChange={e => setActual(e.target.value)} placeholder="Total current value of investments" style={{ width: '100%', boxSizing: 'border-box', marginTop: 7, padding: 12, border: '1px solid #d9dfdc', borderRadius: 10, fontSize: 16 }}/></label>
        {change != null && <div style={{ marginTop: 12, padding: 14, borderRadius: 12, background: change >= 0 ? '#eaf7ee' : '#fff5e8' }}><div style={{ color: '#68756f', fontSize: 13 }}>Change beyond recorded contributions</div><strong style={{ display: 'block', fontSize: 20, marginTop: 3 }}>{change > 0 ? '+' : ''}{naira.format(change)}</strong><div style={{ marginTop: 5, fontSize: 13 }}>This is the residual change in portfolio value. It may reflect gains/losses, withdrawals, fees, or contributions not recorded in FinRec.</div></div>}
        <label style={{ display: 'block', marginTop: 12, fontWeight: 600 }}>Note<textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Optional note about valuation, gains, withdrawals, etc." rows={2} style={{ width: '100%', boxSizing: 'border-box', marginTop: 7, padding: 12, border: '1px solid #d9dfdc', borderRadius: 10, fontFamily: 'inherit' }}/></label>
        {error && <div style={{ marginTop: 12, color: '#a33a2b', background: '#fff0ed', padding: 10, borderRadius: 10 }}>{error}</div>}
        <button onClick={save} disabled={saving} style={{ width: '100%', marginTop: 16, padding: 13, border: 0, borderRadius: 10, background: '#245b45', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>{saving ? 'Saving…' : record ? 'Update investment reconciliation' : 'Save investment reconciliation'}</button>
      </div>
    </div>}
  </>
}

import { useEffect, useMemo, useState } from 'react'
import { BarChart3, Bell, CalendarDays, CircleDollarSign, LayoutDashboard, LogOut, Plus, ReceiptText, Settings, TrendingUp, WalletCards } from 'lucide-react'
import { Session } from '@supabase/supabase-js'
import { Auth } from './components/Auth'
import { supabase } from './lib/supabase'
import { createTransaction, getCategories, getTransactions, Transaction, TransactionType } from './lib/finance'

const naira = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 })

const fallbackCategories: Record<TransactionType, string[]> = {
  income: ['Salary', 'Tutoring', 'Gifts', 'Freelance', 'Other income'],
  expense: ['Food & groceries', 'Transport', 'Housing', 'Utilities', 'Health', 'Education', 'Entertainment', 'Shopping', 'Subscriptions', 'Other expense'],
  investment: ['Investments'],
}

function readableError(error: unknown, fallback: string) {
  if (error && typeof error === 'object') {
    const e = error as { message?: string; details?: string; hint?: string; code?: string }
    const parts = [e.message, e.details, e.hint, e.code ? `Code: ${e.code}` : ''].filter(Boolean)
    if (parts.length) return parts.join(' — ')
  }
  return error instanceof Error ? error.message : fallback
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([])
  const [showForm, setShowForm] = useState(false)
  const [type, setType] = useState<TransactionType>('expense')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false) })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session?.user.id) return
    getTransactions(session.user.id).then(setTransactions).catch(e => setError(`Could not load transactions: ${readableError(e, 'Unknown error')}`))
    getCategories(type)
      .then(cats => setCategories(cats.length ? cats : fallbackCategories[type].map(name => ({ id: '', name }))))
      .catch(e => { setCategories(fallbackCategories[type].map(name => ({ id: '', name }))); console.warn('Categories could not be loaded; using safe local choices.', e) })
  }, [session?.user.id, type])

  const income = useMemo(() => transactions.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0), [transactions])
  const expenses = useMemo(() => transactions.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0), [transactions])
  const investments = useMemo(() => transactions.filter(t => t.type === 'investment').reduce((s, t) => s + Number(t.amount), 0), [transactions])

  async function add() {
    if (!session?.user.id) return
    const value = Number(amount)
    if (!value || value <= 0) return setError('Enter an amount greater than 0.')
    if (!description.trim()) return setError('Add a short description, such as Groceries, Salary, Tutoring or Gift.')
    setSaving(true); setError('')
    try {
      const tx = await createTransaction({ user_id: session.user.id, type, amount: value, currency: 'NGN', transaction_date: date, description: description.trim(), category_id: categoryId || null })
      setTransactions(current => [tx, ...current]); setAmount(''); setDescription(''); setCategoryId(''); setShowForm(false)
    } catch (e) { setError(`Could not save transaction: ${readableError(e, 'Unknown Supabase error')}`) } finally { setSaving(false) }
  }

  if (loading) return <main className="auth-page"><div className="auth-card"><div className="brand auth-brand"><div className="logo">F</div><span>FinRec</span></div><p className="muted">Loading your secure workspace…</p></div></main>
  if (!session) return <Auth />

  return <div className="app">
    <aside className="sidebar"><div className="brand"><div className="logo">F</div><span>FinRec</span></div><nav><a className="active"><LayoutDashboard size={19}/> Dashboard</a><a><ReceiptText size={19}/> Transactions</a><a><WalletCards size={19}/> Budgets</a><a><BarChart3 size={19}/> Insights</a><a><Settings size={19}/> Settings</a></nav><div className="side-note"><Bell size={17}/><div><strong>Monthly review</strong><p>Keep recording daily for better forecasts.</p></div></div><button className="logout" onClick={() => supabase.auth.signOut()}><LogOut size={17}/> Sign out</button></aside>
    <main className="main"><header><div><p className="eyebrow">PERSONAL FINANCE</p><h1>Good to see you</h1><p className="muted">Your financial picture, based on your recorded transactions.</p></div><button className="primary" onClick={() => { setError(''); setShowForm(true) }}><Plus size={18}/> Add transaction</button></header>
      {error && !showForm && <div className="error-banner">{error}</div>}
      <section className="cards"><div className="card"><span>Income</span><strong>{naira.format(income)}</strong><small className="positive">Recorded</small></div><div className="card"><span>Expenses</span><strong>{naira.format(expenses)}</strong><small>{transactions.filter(t => t.type === 'expense').length} transactions</small></div><div className="card"><span>Investments</span><strong>{naira.format(investments)}</strong><small className="positive">Recorded separately</small></div><div className="card highlight"><span>Net cash flow</span><strong>{naira.format(income - expenses - investments)}</strong><small className={income - expenses - investments >= 0 ? 'positive' : 'expense'}>{income - expenses - investments >= 0 ? 'After investments' : 'Current deficit'}</small></div></section>
      <div className="grid"><section className="panel"><div className="panel-head"><div><h2>Recent transactions</h2><p>Your latest recorded activity</p></div></div><div className="transactions">{transactions.length === 0 ? <div className="empty"><ReceiptText size={22}/><p>No transactions yet.</p><button className="ghost" onClick={() => { setError(''); setShowForm(true) }}>Add your first transaction</button></div> : transactions.slice(0, 8).map(t => <div className="tx" key={t.id}><div className={`tx-icon ${t.type}`}><CircleDollarSign size={18}/></div><div className="tx-info"><strong>{t.description || 'Transaction'}</strong><span>{t.category?.name || (t.type === 'investment' ? 'Investments' : 'Uncategorised')} · {new Date(t.transaction_date + 'T00:00:00').toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}</span></div><strong className={t.type === 'income' ? 'income' : t.type === 'investment' ? 'positive' : 'expense'}>{t.type === 'income' ? '+' : '−'}{naira.format(Number(t.amount))}</strong></div>)}</div></section>
      <section className="panel insight"><div className="panel-head"><div><h2>Next month to watch</h2><p>Transparent signals based on your data</p></div></div><div className="signal"><div className="signal-dot"></div><div><strong>Build your history</strong><p>Daily entries will make month-to-month spending patterns more useful.</p></div></div><div className="signal"><div className="signal-dot"></div><div><strong>Track investments separately</strong><p>Investing is shown apart from everyday expenditure so you can see both spending and wealth-building.</p></div></div><div className="forecast"><TrendingUp size={18}/><div><span>Investment tracking</span><strong>{investments ? `${naira.format(investments)} recorded` : 'No investments recorded yet'}</strong></div></div><div className="forecast"><CalendarDays size={18}/><div><span>Forecast status</span><strong>{transactions.length >= 10 ? 'Early pattern available' : `${transactions.length}/10 transactions for early pattern`}</strong></div></div></section></div></main>
    {showForm && <div className="modal-backdrop" onClick={() => !saving && setShowForm(false)}><div className="modal" onClick={e => e.stopPropagation()}><div className="panel-head"><div><h2>Add transaction</h2><p>Record income, an expense, or an investment.</p></div><button className="close" onClick={() => !saving && setShowForm(false)}>×</button></div>{error && <div className="error-banner">{error}</div>}<div className="tabs"><button className={type === 'expense' ? 'selected' : ''} onClick={() => { setType('expense'); setError('') }}>Expense</button><button className={type === 'income' ? 'selected' : ''} onClick={() => { setType('income'); setError('') }}>Income</button><button className={type === 'investment' ? 'selected' : ''} onClick={() => { setType('investment'); setError('') }}>Investment</button></div><label>Description<input value={description} onChange={e => setDescription(e.target.value)} placeholder={type === 'investment' ? 'e.g. Index fund contribution' : type === 'income' ? 'e.g. Salary, Tutoring or Gift' : 'e.g. Groceries'}/></label><label>Amount<input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0"/></label><label>Date<input type="date" value={date} onChange={e => setDate(e.target.value)}/></label><label>Category<select value={categoryId} onChange={e => setCategoryId(e.target.value)}><option value="">No category / choose later</option>{categories.map((c, i) => <option key={`${c.id}-${c.name}-${i}`} value={c.id}>{c.name}</option>)}</select></label><button className="primary full" onClick={add} disabled={saving}>{saving ? 'Saving…' : 'Save transaction'}</button></div></div>}
  </div>
}

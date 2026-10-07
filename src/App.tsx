import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BarChart3, Bell, CalendarDays, CircleDollarSign, Download, LayoutDashboard,
  LogOut, Pencil, Plus, ReceiptText, Repeat2, Search, Settings, Target,
  Trash2, Upload, WalletCards
} from 'lucide-react'
import { Session } from '@supabase/supabase-js'
import { Auth } from './components/Auth'
import { supabase } from './lib/supabase'
import {
  createTransaction, deleteTransaction, getBudgets, getCategories,
  getTransactions, saveBudget, updateTransaction, Transaction, TransactionType, Budget
} from './lib/finance'
import { createFundedExpense, FundingSource } from './lib/funding'

const naira = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 })
const fallbackCategories: Record<TransactionType, string[]> = {
  income: ['Salary', 'Tutoring', 'Gifts', 'Freelance', 'Other income'],
  expense: ['Food & groceries', 'Transport', 'Housing', 'Utilities', 'Health', 'Education', 'Entertainment', 'Shopping', 'Subscriptions', 'Tithe', 'Offering', 'Seed', 'Personal Care', 'Household Supplies', 'Kids', 'Hubby', 'Cooperative', 'Pension', 'PAYE', "Kids' education", 'Other expense'],
  investment: ['Investments', 'Savings'],
}
type Page = 'dashboard' | 'transactions' | 'budgets' | 'insights' | 'settings'

function readableError(error: unknown, fallback: string) {
  if (error && typeof error === 'object') {
    const e = error as { message?: string; details?: string; hint?: string; code?: string }
    const parts = [e.message, e.details, e.hint, e.code ? `Code: ${e.code}` : ''].filter(Boolean)
    if (parts.length) return parts.join(' — ')
  }
  return error instanceof Error ? error.message : fallback
}
function monthKey(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}` }
function monthLabel(key: string) {
  const [year, month] = key.split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString('en-NG', { month: 'long', year: 'numeric' })
}
function shiftMonth(key: string, amount: number) {
  const [year, month] = key.split('-').map(Number)
  return monthKey(new Date(year, month - 1 + amount, 1))
}
function sumFor(list: Transaction[], type: TransactionType, key?: string) {
  return list.filter(t => t.type === type && (!key || t.transaction_date.startsWith(key)))
    .reduce((s, t) => s + Number(t.amount), 0)
}
function csvCell(value: unknown) {
  const text = String(value ?? '')
  return `"${text.replaceAll('"', '""')}"`
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState<Page>('dashboard')
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([])
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [type, setType] = useState<TransactionType>('expense')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [fundingSource, setFundingSource] = useState<FundingSource>('cash')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<'all' | TransactionType>('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [budgetCategory, setBudgetCategory] = useState('')
  const [budgetAmount, setBudgetAmount] = useState('')
  const [planMonth, setPlanMonth] = useState(monthKey())
  const [currentReconciliation, setCurrentReconciliation] = useState<{ opening_balance: number; actual_closing_balance: number; updated_at: string } | null>(null)
  const [previousReconciliation, setPreviousReconciliation] = useState<{ actual_closing_balance: number } | null>(null)
  const [cashReturned, setCashReturned] = useState(0)
  const [postReconciliationNetCash, setPostReconciliationNetCash] = useState(0)
  const importRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false) })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => listener.subscription.unsubscribe()
  }, [])
  useEffect(() => {
    if (!session?.user.id) return
    getTransactions(session.user.id).then(setTransactions).catch(e => setError(`Could not load transactions: ${readableError(e, 'Unknown error')}`))
  }, [session?.user.id])
  useEffect(() => {
    if (!session?.user.id || !showForm) return
    getCategories(type).then(c => setCategories(c.length ? c : fallbackCategories[type].map(name => ({ id: '', name })))).catch(() => setCategories(fallbackCategories[type].map(name => ({ id: '', name }))))
  }, [session?.user.id, type, showForm])
  useEffect(() => {
    if (!session?.user.id) return
    const userId = session.user.id
    const currentMonth = monthKey()
    const previousMonth = shiftMonth(currentMonth, -1)
    Promise.all([
      supabase.from('balance_reconciliations').select('opening_balance,actual_closing_balance,updated_at').eq('user_id', userId).eq('month', `${currentMonth}-01`).maybeSingle(),
      supabase.from('balance_reconciliations').select('actual_closing_balance').eq('user_id', userId).eq('month', `${previousMonth}-01`).maybeSingle(),
    ]).then(async ([current, previous]) => {
      if (current.error || previous.error) return
      const checkpoint = current.data as { opening_balance: number; actual_closing_balance: number; updated_at: string } | null
      setCurrentReconciliation(checkpoint)
      setPreviousReconciliation(previous.data as { actual_closing_balance: number } | null)
      if (!checkpoint) { setCashReturned(0); setPostReconciliationNetCash(0); return }
      const [{ data: laterTx }, { data: laterTransfers }] = await Promise.all([
        supabase.from('transactions').select('type,amount,created_at').eq('user_id', userId).gt('created_at', checkpoint.updated_at),
        supabase.from('account_transfers').select('amount,created_at').eq('user_id', userId).gt('created_at', checkpoint.updated_at),
      ])
      const txNet = (laterTx ?? []).reduce((sum, row) => sum + (row.type === 'income' ? Number(row.amount) : -Number(row.amount)), 0)
      const returned = (laterTransfers ?? []).reduce((sum, row) => sum + Number(row.amount), 0)
      setCashReturned(returned)
      setPostReconciliationNetCash(txNet + returned)
    }).catch(() => {})  }, [session?.user.id])

  useEffect(() => {
    if (!session?.user.id || !['budgets', 'insights'].includes(page)) return
    getBudgets(session.user.id, `${planMonth}-01`).then(setBudgets).catch(e => setError(`Could not load budgets: ${readableError(e, 'Unknown error')}`))
  }, [session?.user.id, page, planMonth])

  const income = useMemo(() => sumFor(transactions, 'income'), [transactions])
  const expenses = useMemo(() => sumFor(transactions, 'expense'), [transactions])
  const investments = useMemo(() => sumFor(transactions, 'investment'), [transactions])
  const currentMonth = monthKey()
  const previousMonth = shiftMonth(currentMonth, -1)
  const nextMonth = shiftMonth(currentMonth, 1)
  const filtered = useMemo(() => transactions.filter(t => {
    const matchesText = `${t.description ?? ''} ${t.category?.name ?? ''}`.toLowerCase().includes(search.toLowerCase())
    const matchesType = filterType === 'all' || t.type === filterType
    const matchesFrom = !fromDate || t.transaction_date >= fromDate
    const matchesTo = !toDate || t.transaction_date <= toDate
    return matchesText && matchesType && matchesFrom && matchesTo
  }), [transactions, search, filterType, fromDate, toDate])
  const monthIncome = useMemo(() => sumFor(transactions, 'income', planMonth), [transactions, planMonth])
  const monthExpenses = useMemo(() => sumFor(transactions, 'expense', planMonth), [transactions, planMonth])
  const monthInvestments = useMemo(() => sumFor(transactions, 'investment', planMonth), [transactions, planMonth])
  const previousExpenses = useMemo(() => sumFor(transactions, 'expense', shiftMonth(planMonth, -1)), [transactions, planMonth])
  const expenseChange = previousExpenses > 0 ? ((monthExpenses - previousExpenses) / previousExpenses) * 100 : null
  const expenseByCategory = useMemo(() => {
    const map = new Map<string, number>()
    transactions.filter(t => t.type === 'expense' && t.transaction_date.startsWith(planMonth)).forEach(t => { const name = t.category?.name || 'Uncategorised'; map.set(name, (map.get(name) || 0) + Number(t.amount)) })
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [transactions, planMonth])
  const recurring = useMemo(() => {
    const groups = new Map<string, Transaction[]>()
    transactions.filter(t => t.type === 'expense').forEach(t => { const key = `${(t.description || '').trim().toLowerCase()}|${t.category_id || t.category?.name || ''}`; if (!key.startsWith('|')) groups.set(key, [...(groups.get(key) || []), t]) })
    return [...groups.values()].map(items => { const months = new Set(items.map(t => t.transaction_date.slice(0, 7))); const sorted = [...items].sort((a, b) => a.transaction_date.localeCompare(b.transaction_date)); const amounts = sorted.map(t => Number(t.amount)); const average = amounts.reduce((a, b) => a + b, 0) / amounts.length; const stable = amounts.every(v => Math.abs(v - average) / Math.max(average, 1) <= 0.25); const latest = sorted[sorted.length - 1]; return { id: latest.id, description: latest.description || latest.category?.name || 'Recurring expense', category: latest.category?.name || 'Uncategorised', average, latestDate: latest.transaction_date, months: months.size, stable } }).filter(x => x.months >= 2 && x.stable).sort((a, b) => b.average - a.average).slice(0, 8)
  }, [transactions])
  const recurringTotal = recurring.reduce((s, r) => s + r.average, 0)
  const budgetTotal = budgets.reduce((s, b) => s + Number(b.amount), 0)
  const budgetUsed = budgetTotal ? Math.min(100, monthExpenses / budgetTotal * 100) : 0
  const topCategory = expenseByCategory[0]
  const expectedNextIncome = sumFor(transactions, 'income', nextMonth)
  const projectedNextExpense = recurringTotal || monthExpenses
  const projectedNextNet = expectedNextIncome - projectedNextExpense
  const savingsRate = monthIncome > 0 ? Math.max(0, (monthIncome - monthExpenses - monthInvestments) / monthIncome * 100) : 0
  const cashOpening = currentReconciliation?.opening_balance ?? previousReconciliation?.actual_closing_balance ?? 0
  const calculatedAvailableCash = cashOpening + monthIncome - monthExpenses - monthInvestments + cashReturned
  const currentAvailableCash = currentReconciliation ? currentReconciliation.actual_closing_balance + postReconciliationNetCash : calculatedAvailableCash
  const currentAvailableCashIsReconciled = currentReconciliation !== null

  function openNew() { setEditing(null); setType('expense'); setAmount(''); setDescription(''); setCategoryId(''); setFundingSource('cash'); setDate(new Date().toISOString().slice(0, 10)); setError(''); setShowForm(true) }
  function openEdit(tx: Transaction) { setEditing(tx); setType(tx.type); setAmount(String(tx.amount)); setDescription(tx.description || ''); setCategoryId(tx.category_id || ''); setFundingSource('cash'); setDate(tx.transaction_date); setError(''); setShowForm(true) }

  async function saveTransaction() {
    if (!session?.user.id) return
    const value = Number(amount)
    if (!value || value <= 0) return setError('Enter an amount greater than 0.')
    if (!description.trim()) return setError('Add a short description.')
    if (type === 'expense' && fundingSource !== 'cash' && editing) return setError('Funding source cannot be changed when editing an existing expense yet.')
    setSaving(true); setError('')
    try {
      if (editing) {
        const updated = await updateTransaction(session.user.id, editing.id, { type, amount: value, currency: editing.currency || 'NGN', transaction_date: date, description: description.trim(), category_id: categoryId || null })
        setTransactions(current => current.map(t => t.id === editing.id ? updated : t))
      } else if (type === 'expense') {
        const result = await createFundedExpense({ user_id: session.user.id, amount: value, currency: 'NGN', transaction_date: date, description: description.trim(), category_id: categoryId || null, funding_source: fundingSource })
        const tx = result.transaction as Transaction
        setTransactions(current => [{ ...tx, category: categories.find(c => c.id === categoryId) || null }, ...current])
      } else {
        const tx = await createTransaction({ user_id: session.user.id, type, amount: value, currency: 'NGN', transaction_date: date, description: description.trim(), category_id: categoryId || null })
        setTransactions(current => [tx, ...current])
      }
      setShowForm(false)
    } catch (e) { setError(`Could not save transaction: ${readableError(e, 'Unknown Supabase error')}`) }
    finally { setSaving(false) }
  }
  async function remove(id: string) { if (!session?.user.id || !confirm('Delete this transaction? This cannot be undone.')) return; try { await deleteTransaction(session.user.id, id); setTransactions(current => current.filter(t => t.id !== id)) } catch (e) { setError(`Could not delete transaction: ${readableError(e, 'Unknown error')}`) } }
  async function addBudget() { if (!session?.user.id || !budgetCategory || Number(budgetAmount) < 0) return; try { const b = await saveBudget({ user_id: session.user.id, category_id: budgetCategory, month: `${planMonth}-01`, amount: Number(budgetAmount), currency: 'NGN' }); setBudgets(current => [...current.filter(x => x.category_id !== b.category_id), b]); setBudgetAmount('') } catch (e) { setError(`Could not save budget: ${readableError(e, 'Unknown error')}`) } }
  function exportCsv() { const header = ['Date', 'Type', 'Description', 'Category', 'Amount', 'Currency']; const rows = transactions.map(t => [t.transaction_date, t.type, t.description || '', t.category?.name || '', t.amount, t.currency]); const csv = [header, ...rows].map(row => row.map(csvCell).join(',')).join('\n'); const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `finrec-transactions-${currentMonth}.csv`; a.click(); URL.revokeObjectURL(url) }
  async function importCsv(file: File) { if (!session?.user.id) return; const text = await file.text(); const lines = text.split(/\r?\n/).filter(Boolean); if (lines.length < 2) return setError('The CSV must contain a header row and at least one transaction.'); const rows = lines.slice(1).map(line => line.split(',').map(v => v.replace(/^"|"$/g, '').replaceAll('""', '"'))); let imported = 0; for (const row of rows) { const [transactionDate, transactionType, transactionDescription, categoryName, rawAmount, currency = 'NGN'] = row; const parsedAmount = Number(rawAmount); if (!transactionDate || !['income', 'expense', 'investment'].includes(transactionType) || !parsedAmount || parsedAmount <= 0) continue; const category = categories.find(c => c.name.toLowerCase() === (categoryName || '').toLowerCase()); const tx = await createTransaction({ user_id: session.user.id, type: transactionType as TransactionType, amount: parsedAmount, currency: currency || 'NGN', transaction_date: transactionDate, description: transactionDescription || 'Imported transaction', category_id: category?.id || null }); setTransactions(current => [tx, ...current]); imported++ } setError(imported ? `Imported ${imported} transaction${imported === 1 ? '' : 's'}.` : 'No valid transactions were found in that CSV.') }

  if (loading) return <main className="auth-page"><div className="auth-card"><div className="brand auth-brand"><div className="logo">F</div><span>FinRec</span></div><p className="muted">Loading your secure workspace…</p></div></main>
  if (!session) return <Auth />
  const nav = [{ id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard }, { id: 'transactions', label: 'Transactions', icon: ReceiptText }, { id: 'budgets', label: 'Budgets', icon: WalletCards }, { id: 'insights', label: 'Insights', icon: BarChart3 }, { id: 'settings', label: 'Settings', icon: Settings }] as const

  return <div className="app">
    <aside className="sidebar"><div className="brand"><div className="logo">F</div><span>FinRec</span></div><nav>{nav.map(item => { const Icon = item.icon; return <button key={item.id} className={page === item.id ? 'active' : ''} onClick={() => { setPage(item.id); setError('') }}><Icon size={19}/>{item.label}</button> })}</nav><div className="side-note"><Bell size={17}/><div><strong>Monthly review</strong><p>Keep recording daily for better forecasts.</p></div></div><button className="logout" onClick={() => supabase.auth.signOut()}><LogOut size={17}/> Sign out</button></aside>
    <main className="main"><header><div><p className="eyebrow">PERSONAL FINANCE</p><h1>{nav.find(n => n.id === page)?.label}</h1></div><button className="primary" onClick={openNew}><Plus size={18}/> Add transaction</button></header>
      {error && <div className="error-banner">{error}</div>}
      {page === 'dashboard' && <><div className="cards"><div className="card"><span>Total income</span><strong>{naira.format(income)}</strong><small>All recorded income</small></div><div className="card"><span>Total expenses</span><strong>{naira.format(expenses)}</strong><small>All recorded expenses</small></div><div className="card"><span>Investments</span><strong>{naira.format(investments)}</strong><small>Contributions recorded</small></div><div className="card highlight"><span>Current available cash</span><strong>{naira.format(currentAvailableCash)}</strong><small>{currentAvailableCashIsReconciled ? 'Reconciled account balance' : 'Based on recorded transactions'}</small></div></div><div className="grid"><section className="panel"><div className="panel-head"><div><h2>Recent transactions</h2><p>Latest activity across your ledger.</p></div><button className="ghost" onClick={() => setPage('transactions')}>View all</button></div><div className="transactions">{transactions.length === 0 ? <div className="empty"><ReceiptText size={22}/><p>No transactions yet.</p></div> : transactions.slice(0, 8).map(t => <div className="tx" key={t.id}><div className={`tx-icon ${t.type}`}><CircleDollarSign size={18}/></div><div className="tx-info"><strong>{t.description || 'Transaction'}</strong><span>{t.category?.name || (t.type === 'investment' ? 'Investments' : 'Uncategorised')} · {new Date(t.transaction_date + 'T00:00:00').toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}</span></div><strong className={t.type === 'income' ? 'income' : 'expense'}>{t.type === 'income' ? '+' : '−'}{naira.format(Number(t.amount))}</strong></div>)}</div></section><section className="panel insight"><div className="panel-head"><div><h2>Next month to watch</h2><p>{monthLabel(nextMonth)}</p></div></div><div className="signal"><div className="signal-dot"></div><div><strong>{topCategory ? `${topCategory[0]} is your largest current expense` : 'Build your expense history'}</strong><p>{topCategory ? `${naira.format(topCategory[1])} recorded for ${monthLabel(planMonth)}.` : 'Daily entries make the planning signals more useful.'}</p></div></div><div className="forecast"><Repeat2 size={18}/><div><span>Recurring expense baseline</span><strong>{recurringTotal ? `${naira.format(recurringTotal)} / month` : 'Not enough history yet'}</strong></div></div><div className="forecast"><CalendarDays size={18}/><div><span>Indicative next-month expenses</span><strong>{projectedNextExpense ? naira.format(projectedNextExpense) : 'Not enough history yet'}</strong></div></div></section></div></>}
      {page === 'transactions' && <section className="panel"><div className="toolbar"><div className="search"><Search size={17}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search transactions"/></div><select value={filterType} onChange={e => setFilterType(e.target.value as 'all' | TransactionType)}><option value="all">All types</option><option value="income">Income</option><option value="expense">Expense</option><option value="investment">Investment</option></select><input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}/><input type="date" value={toDate} onChange={e => setToDate(e.target.value)}/><button className="ghost" onClick={exportCsv}><Download size={17}/> Export</button><input ref={importRef} type="file" accept=".csv" hidden onChange={e => e.target.files?.[0] && importCsv(e.target.files[0])}/><button className="ghost" onClick={() => importRef.current?.click()}><Upload size={17}/> Import</button></div><div className="transactions">{filtered.length === 0 ? <div className="empty"><ReceiptText size={22}/><p>No transactions match these filters.</p></div> : filtered.map(t => <div className="tx" key={t.id}><div className={`tx-icon ${t.type}`}><CircleDollarSign size={18}/></div><div className="tx-info"><strong>{t.description || 'Transaction'}</strong><span>{t.category?.name || (t.type === 'investment' ? 'Investments' : 'Uncategorised')} · {t.transaction_date}</span></div><strong className={t.type === 'income' ? 'income' : 'expense'}>{t.type === 'income' ? '+' : '−'}{naira.format(Number(t.amount))}</strong><button className="icon-button" onClick={() => openEdit(t)} title="Edit"><Pencil size={16}/></button><button className="icon-button danger" onClick={() => remove(t.id)} title="Delete"><Trash2 size={16}/></button></div>)}</div></section>}
      {page === 'budgets' && <section className="panel"><div className="month-picker"><button className="ghost" onClick={() => setPlanMonth(shiftMonth(planMonth, -1))}>←</button><strong>{monthLabel(planMonth)}</strong><button className="ghost" onClick={() => setPlanMonth(shiftMonth(planMonth, 1))}>→</button></div><div className="panel-head"><div><h2>Monthly budgets</h2><p>Set a limit for an expense category.</p></div></div><div className="budget-form"><select value={budgetCategory} onChange={e => setBudgetCategory(e.target.value)}><option value="">Select expense category</option>{categories.filter(c => c.id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select><input inputMode="decimal" value={budgetAmount} onChange={e => setBudgetAmount(e.target.value)} placeholder="Monthly limit"/><button className="primary" onClick={addBudget}>Save budget</button></div><div className="budget-summary"><div><span>Budget</span><strong>{naira.format(budgetTotal)}</strong></div><div><span>Spent</span><strong>{naira.format(monthExpenses)}</strong></div><div><span>Used</span><strong>{budgetTotal ? `${budgetUsed.toFixed(0)}%` : '—'}</strong></div></div><div className="transactions">{budgets.length === 0 ? <div className="empty"><WalletCards size={22}/><p>No budgets set for this month.</p></div> : budgets.map(b => <div className="tx" key={b.id}><div className="tx-info"><strong>{b.category?.name || 'Category'}</strong><span>Monthly budget · {monthLabel(planMonth)}</span></div><strong>{naira.format(Number(b.amount))}</strong></div>)}</div></section>}
      {page === 'insights' && <><div className="month-picker"><button className="ghost" onClick={() => setPlanMonth(shiftMonth(planMonth, -1))}>←</button><strong>{monthLabel(planMonth)}</strong><button className="ghost" onClick={() => setPlanMonth(shiftMonth(planMonth, 1))}>→</button></div><section className="cards"><div className="card"><span>Income</span><strong>{naira.format(monthIncome)}</strong><small>Recorded this month</small></div><div className="card"><span>Expenses</span><strong>{naira.format(monthExpenses)}</strong><small>{expenseChange === null ? 'No prior-month comparison' : `${Math.abs(expenseChange).toFixed(0)}% ${expenseChange >= 0 ? 'higher' : 'lower'} than last month`}</small></div><div className="card"><span>Investments</span><strong>{naira.format(monthInvestments)}</strong><small>Contributions</small></div><div className="card highlight"><span>Current available cash</span><strong>{naira.format(currentAvailableCash)}</strong><small>{currentAvailableCashIsReconciled ? 'Reconciled account balance' : 'Reconcile to match your bank balance'}</small></div></section><div className="grid"><section className="panel"><div className="panel-head"><div><h2>Where your money is going</h2><p>Expense categories for {monthLabel(planMonth)}</p></div></div>{expenseByCategory.length === 0 ? <div className="empty"><BarChart3 size={22}/><p>Add expenses to see category patterns.</p></div> : <div className="transactions">{expenseByCategory.slice(0, 8).map(([name, value]) => { const share = monthExpenses ? value / monthExpenses * 100 : 0; return <div className="tx" key={name}><div className="tx-info"><strong>{name}</strong><span>{share.toFixed(0)}% of expenses</span><div className="progress"><div style={{ width: `${Math.min(100, share)}%` }}/></div></div><strong>{naira.format(value)}</strong></div> })}</div>}</section><section className="panel"><div className="panel-head"><div><h2>Month-ahead plan</h2><p>Transparent estimates from your history</p></div></div><div className="plan-grid"><div><span>Expected income</span><strong>{expectedNextIncome ? naira.format(expectedNextIncome) : 'No history'}</strong></div><div><span>Recurring expenses</span><strong>{recurringTotal ? naira.format(recurringTotal) : 'No pattern yet'}</strong></div><div><span>Indicative expenses</span><strong>{projectedNextExpense ? naira.format(projectedNextExpense) : 'No history'}</strong></div><div><span>Indicative net</span><strong>{expectedNextIncome || projectedNextExpense ? naira.format(projectedNextNet) : 'No history'}</strong></div></div><div className="forecast"><Target size={18}/><div><span>What to look out for</span><strong>{topCategory ? `Keep ${topCategory[0]} visible next month` : 'Keep recording daily'}</strong></div></div>{budgetTotal > 0 && <div className="forecast"><WalletCards size={18}/><div><span>Budget usage</span><strong>{budgetUsed.toFixed(0)}% of {naira.format(budgetTotal)}</strong></div></div>}</section></div><section className="panel" style={{ marginTop: 18 }}><div className="panel-head"><div><h2>Recurring commitments</h2><p>Repeated expense patterns observed across at least two months.</p></div></div>{recurring.length === 0 ? <div className="empty"><Repeat2 size={22}/><p>No recurring pattern detected yet.</p></div> : <div className="transactions">{recurring.map(r => <div className="tx" key={r.id}><div className="tx-icon expense"><Repeat2 size={18}/></div><div className="tx-info"><strong>{r.description}</strong><span>{r.category} · {r.months} months observed · last recorded {new Date(r.latestDate + 'T00:00:00').toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}</span></div><strong>{naira.format(r.average)} / mo</strong></div>)}</div>}</section><p className="disclaimer">FinRec's planning figures are estimates based on recorded transactions. They are not guaranteed future income or bills and should be reviewed before making financial decisions.</p></>}
      {page === 'settings' && <section className="panel settings"><div className="panel-head"><div><h2>Settings</h2><p>Account and data management.</p></div></div><div className="setting-row"><div><strong>Signed in as</strong><span>{session.user.email}</span></div></div><div className="setting-row"><div><strong>Data export</strong><span>Download your current transaction ledger as CSV.</span></div><button className="ghost" onClick={exportCsv}><Download size={17}/> Export CSV</button></div><div className="setting-row"><div><strong>Sign out</strong><span>End this session on this device.</span></div><button className="ghost" onClick={() => supabase.auth.signOut()}><LogOut size={17}/> Sign out</button></div></section>}
    </main>
    {showForm && <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && setShowForm(false)}><div className="modal"><div className="modal-head"><div><p className="eyebrow">TRANSACTION</p><h2>{editing ? 'Edit transaction' : 'Add transaction'}</h2></div><button className="icon-button" onClick={() => setShowForm(false)}>×</button></div>{error && <div className="error-banner">{error}</div>}<div className="tabs"><button className={type === 'expense' ? 'selected' : ''} onClick={() => setType('expense')}>Expense</button><button className={type === 'income' ? 'selected' : ''} onClick={() => setType('income')}>Income</button><button className={type === 'investment' ? 'selected' : ''} onClick={() => setType('investment')}>Investment</button></div><label>Description<input value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Salary, Tutoring or Groceries"/></label><label>Amount<input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0"/></label><label>Date<input type="date" value={date} onChange={e => setDate(e.target.value)}/></label>{type === 'expense' && <label>Funding source<select value={fundingSource} onChange={e => setFundingSource(e.target.value as FundingSource)} disabled={Boolean(editing)}><option value="cash">Cash / bank</option><option value="savings">Savings</option><option value="investment">Investment</option></select>{editing && <small className="muted">Funding source is fixed for existing transactions.</small>}</label>}<label>Category<select value={categoryId} onChange={e => setCategoryId(e.target.value)}><option value="">No category / choose later</option>{categories.map((c, i) => <option key={`${c.id}-${c.name}-${i}`} value={c.id}>{c.name}</option>)}</select></label><button className="primary full" onClick={saveTransaction} disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Save transaction'}</button></div></div>}
  </div>
}

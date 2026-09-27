import { useMemo, useState } from 'react';
import { BarChart3, Bell, CalendarDays, ChevronRight, CircleDollarSign, LayoutDashboard, Plus, ReceiptText, Settings, WalletCards } from 'lucide-react';

const naira = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 });

type Tx = { id:number; type:'income'|'expense'; title:string; category:string; amount:number; date:string };
const initial: Tx[] = [
  { id:1, type:'expense', title:'Groceries', category:'Food', amount:18500, date:'Today' },
  { id:2, type:'expense', title:'Transport', category:'Transport', amount:6200, date:'Yesterday' },
  { id:3, type:'income', title:'Salary', category:'Salary', amount:420000, date:'Sep 25' },
  { id:4, type:'expense', title:'Electricity', category:'Bills', amount:24000, date:'Sep 24' },
];

export default function App() {
  const [transactions, setTransactions] = useState(initial);
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState<'expense'|'income'>('expense');
  const [amount, setAmount] = useState('');
  const [title, setTitle] = useState('');
  const income = useMemo(() => transactions.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0), [transactions]);
  const expenses = useMemo(() => transactions.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0), [transactions]);
  const add = () => { const value=Number(amount); if(!value || !title.trim()) return; setTransactions([{id:Date.now(), type, title:title.trim(), category:type==='income'?'Income':'General', amount:value, date:'Today'},...transactions]); setAmount(''); setTitle(''); setShowForm(false); };

  return <div className="app">
    <aside className="sidebar"><div className="brand"><div className="logo">F</div><span>FinRec</span></div><nav>
      <a className="active"><LayoutDashboard size={19}/> Dashboard</a><a><ReceiptText size={19}/> Transactions</a><a><WalletCards size={19}/> Budgets</a><a><BarChart3 size={19}/> Insights</a><a><Settings size={19}/> Settings</a>
    </nav><div className="side-note"><Bell size={17}/><div><strong>Monthly review</strong><p>Your September review is ready.</p></div></div></aside>
    <main className="main"><header><div><p className="eyebrow">PERSONAL FINANCE</p><h1>Good evening</h1><p className="muted">Here’s your financial picture for September.</p></div><button className="primary" onClick={()=>setShowForm(true)}><Plus size={18}/> Add transaction</button></header>
      <section className="cards"><div className="card"><span>Income</span><strong>{naira.format(income)}</strong><small className="positive">This month</small></div><div className="card"><span>Expenses</span><strong>{naira.format(expenses)}</strong><small>Across {transactions.filter(t=>t.type==='expense').length} transactions</small></div><div className="card highlight"><span>Net cash flow</span><strong>{naira.format(income-expenses)}</strong><small className="positive">You’re in surplus</small></div></section>
      <div className="grid"><section className="panel"><div className="panel-head"><div><h2>Recent transactions</h2><p>Latest activity across your accounts</p></div><button className="ghost">View all <ChevronRight size={16}/></button></div><div className="transactions">{transactions.map(t=><div className="tx" key={t.id}><div className={`tx-icon ${t.type}`}><CircleDollarSign size={18}/></div><div className="tx-info"><strong>{t.title}</strong><span>{t.category} · {t.date}</span></div><strong className={t.type==='income'?'income':'expense'}>{t.type==='income'?'+':'−'}{naira.format(t.amount)}</strong></div>)}</div></section>
      <section className="panel insight"><div className="panel-head"><div><h2>Next month to watch</h2><p>Simple signals from your spending</p></div></div><div className="signal"><div className="signal-dot"></div><div><strong>Recurring commitments</strong><p>Set up recurring bills to improve next month’s forecast.</p></div></div><div className="signal"><div className="signal-dot"></div><div><strong>Category budgets</strong><p>Add budgets for Food, Transport and Bills to track limits.</p></div></div><div className="forecast"><CalendarDays size={18}/><div><span>Projected recurring spend</span><strong>Not configured yet</strong></div></div></section></div>
    </main>
    {showForm && <div className="modal-backdrop" onClick={()=>setShowForm(false)}><div className="modal" onClick={e=>e.stopPropagation()}><div className="panel-head"><div><h2>Add transaction</h2><p>Record income or an expense.</p></div><button className="close" onClick={()=>setShowForm(false)}>×</button></div><div className="tabs"><button className={type==='expense'?'selected':''} onClick={()=>setType('expense')}>Expense</button><button className={type==='income'?'selected':''} onClick={()=>setType('income')}>Income</button></div><label>Description<input value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Groceries"/></label><label>Amount<input inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0"/></label><button className="primary full" onClick={add}>Save transaction</button></div></div>}
  </div>
}

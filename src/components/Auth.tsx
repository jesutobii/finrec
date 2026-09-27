import { FormEvent, useState } from 'react'
import { supabase } from '../lib/supabase'

export function Auth() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setMessage('')
    setBusy(true)
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: name.trim() } },
        })
        if (error) throw error
        setMessage('Account created. Check your email if confirmation is enabled.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="brand auth-brand"><div className="logo">F</div><span>FinRec</span></div>
        <p className="eyebrow">PERSONAL FINANCE</p>
        <h1>{mode === 'signin' ? 'Welcome back' : 'Create your account'}</h1>
        <p className="muted">Your financial records stay private to your account.</p>
        <form onSubmit={submit} className="auth-form">
          {mode === 'signup' && <label>Full name<input value={name} onChange={e => setName(e.target.value)} autoComplete="name" required /></label>}
          <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required /></label>
          <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={6} required /></label>
          {message && <p className="form-message">{message}</p>}
          <button className="primary full" disabled={busy}>{busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}</button>
        </form>
        <button className="link-button" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setMessage('') }}>
          {mode === 'signin' ? 'Create a new account' : 'Already have an account? Sign in'}
        </button>
      </section>
    </main>
  )
}

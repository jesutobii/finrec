import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ReconciliationWidget } from './components/ReconciliationWidget';
import './styles.css';
import { supabase } from './lib/supabase';

function Root() {
  const [session, setSession] = React.useState<any>(null);
  React.useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => listener.subscription.unsubscribe();
  }, []);
  return <><App /><ReconciliationWidget session={session} /></>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><Root /></StrictMode>);

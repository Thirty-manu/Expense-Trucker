import { useState, useEffect, useRef } from 'react'
import { db, auth, googleProvider } from '../firebase'
import {
  collection, addDoc, onSnapshot,
  query, orderBy, deleteDoc, doc, serverTimestamp, setDoc
} from 'firebase/firestore'
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth'

const CATEGORIES = {
  Food:          { color: '#ed4245', label: 'Food & dining' },
  Transport:     { color: '#378add', label: 'Transport' },
  Utilities:     { color: '#1d9e75', label: 'Utilities' },
  Health:        { color: '#ef9f27', label: 'Health' },
  Shopping:      { color: '#d4537e', label: 'Shopping' },
  Entertainment: { color: '#7f77dd', label: 'Entertainment' },
  Other:         { color: '#888780', label: 'Other' },
}

const CAT_KEYS = Object.keys(CATEGORIES)

function fmt(n) {
  if (isNaN(n) || n === undefined || n === null) return 'KES 0'
  return 'KES ' + Math.round(n).toLocaleString('en-KE')
}

function today() {
  return new Date().toISOString().split('T')[0]
}

function thisMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(m) {
  const [y, mo] = m.split('-')
  return new Date(y, mo - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

const S = {
  input: {
    background: '#0f1117',
    border: '0.5px solid #2e3148',
    borderRadius: 6,
    height: 36,
    padding: '0 10px',
    color: '#e3e5e8',
    fontSize: 13,
    width: '100%',
    outline: 'none',
  },
  card: {
    background: '#0f1117',
    border: '0.5px solid #1e2130',
    borderRadius: 8,
    padding: '14px',
    marginBottom: 14,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: 600,
    color: '#72767d',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  btn: {
    background: '#5865f2',
    border: 'none',
    borderRadius: 6,
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    height: 36,
    width: '100%',
  },
}

export default function ExpenseApp() {
  const [user, setUser]           = useState(null)
  const [loading, setLoading]     = useState(true)
  const [expenses, setExpenses]   = useState([])
  const [budgets, setBudgets]     = useState({})
  const [reminders, setReminders] = useState([])
  const [activeTab, setActiveTab] = useState('expenses')
  const [activeFilter, setActiveFilter] = useState('All')
  const [toasts, setToasts]       = useState([])

  // Expense form
  const [eName, setEName]   = useState('')
  const [eAmt, setEAmt]     = useState('')
  const [eDate, setEDate]   = useState(today())
  const [eCat, setECat]     = useState('Food')

  // Budget form
  const [bTotal, setBTotal] = useState('')
  const [bSplit, setBSplit] = useState(
    Object.fromEntries(CAT_KEYS.map(k => [k, '']))
  )
  const [bMode, setBMode]   = useState('manual') // 'manual' | 'auto' | 'total'

  // Reminder form
  const [rTitle, setRTitle] = useState('')
  const [rAmt, setRAmt]     = useState('')
  const [rDate, setRDate]   = useState(today())
  const [rCat, setRCat]     = useState('Food')
  const [rFreq, setRFreq]   = useState('monthly')

  const toastRef = useRef([])

  function showToast(msg, type = 'warning') {
    const id = Date.now() + Math.random()
    setToasts(t => [...t, { id, msg, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 5000)
  }

  // ── Auth
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => {
      setUser(u)
      setLoading(false)
    })
    return unsub
  }, [])

  // ── Expenses listener
  useEffect(() => {
    if (!user) return
    const q = query(
      collection(db, 'users', user.uid, 'expenses'),
      orderBy('createdAt', 'desc')
    )
    const unsub = onSnapshot(q, snap => {
      setExpenses(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    }, err => console.error('Expenses error:', err))
    return unsub
  }, [user])

  // ── Budgets listener
  useEffect(() => {
    if (!user) return
    const unsub = onSnapshot(
      doc(db, 'users', user.uid, 'settings', 'budgets'),
      snap => { if (snap.exists()) setBudgets(snap.data()) },
      err => console.error('Budgets error:', err)
    )
    return unsub
  }, [user])

  // ── Reminders listener
  useEffect(() => {
    if (!user) return
    const q = query(
      collection(db, 'users', user.uid, 'reminders'),
      orderBy('createdAt', 'desc')
    )
    const unsub = onSnapshot(q, snap => {
      setReminders(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    }, err => console.error('Reminders error:', err))
    return unsub
  }, [user])

  // ── Budget overspend warnings
  useEffect(() => {
    if (!expenses.length || !Object.keys(budgets).length) return
    const month = thisMonth()
    CAT_KEYS.forEach(cat => {
      const limit = budgets[cat]
      if (!limit) return
      const spent = expenses
        .filter(e => e.cat === cat && e.date?.startsWith(month))
        .reduce((s, e) => s + (e.amount || 0), 0)
      const pct = (spent / limit) * 100
      if (pct >= 100) {
        showToast(`🚨 Over budget on ${cat}! Spent ${fmt(spent)} of ${fmt(limit)}`, 'danger')
      } else if (pct >= 80) {
        showToast(`⚠️ ${cat} at ${Math.round(pct)}% — ${fmt(limit - spent)} left`, 'warning')
      }
    })
  }, [expenses])

  // ── Reminder alerts
  useEffect(() => {
    if (!reminders.length) return
    reminders.forEach(r => {
      if (r.date <= today()) {
        showToast(`🔔 Due: ${r.title} — ${fmt(r.amount)}`, 'info')
      }
    })
  }, [reminders])

  // ── Actions
  async function handleSignIn() {
    try { await signInWithPopup(auth, googleProvider) }
    catch (e) { console.error(e); showToast('Sign in failed', 'danger') }
  }

  async function handleSignOut() {
    await signOut(auth)
    setExpenses([])
    setBudgets({})
    setReminders([])
  }

  async function addExpense() {
    if (!eName.trim()) { showToast('Please enter a description', 'danger'); return }
    if (!eAmt || isNaN(parseFloat(eAmt)) || parseFloat(eAmt) <= 0) {
      showToast('Please enter a valid amount', 'danger'); return
    }
    if (!eDate) { showToast('Please select a date', 'danger'); return }
    try {
      await addDoc(collection(db, 'users', user.uid, 'expenses'), {
        name: eName.trim(),
        amount: parseFloat(eAmt),
        date: eDate,
        cat: eCat,
        createdAt: serverTimestamp(),
      })
      setEName(''); setEAmt(''); setEDate(today())
      showToast('✅ Expense added!', 'success')
    } catch (e) {
      console.error(e)
      showToast('Failed to add expense: ' + e.message, 'danger')
    }
  }

  async function deleteExpense(id) {
    try { await deleteDoc(doc(db, 'users', user.uid, 'expenses', id)) }
    catch (e) { showToast('Delete failed', 'danger') }
  }

  // Auto-split total budget equally
  function autoSplit() {
    if (!bTotal || isNaN(parseFloat(bTotal))) {
      showToast('Enter a total amount first', 'warning'); return
    }
    const each = parseFloat(bTotal) / CAT_KEYS.length
    setBSplit(Object.fromEntries(CAT_KEYS.map(k => [k, Math.round(each).toString()])))
    showToast(`Split ${fmt(parseFloat(bTotal))} equally across ${CAT_KEYS.length} categories`, 'success')
  }

  async function saveBudgets() {
    const updated = {}
    if (bMode === 'total' || bMode === 'auto') {
      CAT_KEYS.forEach(k => {
        const v = parseFloat(bSplit[k])
        if (!isNaN(v) && v > 0) updated[k] = v
      })
    } else {
      CAT_KEYS.forEach(k => {
        const v = parseFloat(bSplit[k])
        if (!isNaN(v) && v > 0) updated[k] = v
      })
    }
    if (!Object.keys(updated).length) {
      showToast('Enter at least one budget amount', 'warning'); return
    }
    try {
      await setDoc(doc(db, 'users', user.uid, 'settings', 'budgets'), updated)
      showToast('✅ Budgets saved!', 'success')
    } catch (e) { showToast('Save failed: ' + e.message, 'danger') }
  }

  async function clearBudgets() {
    try {
      await setDoc(doc(db, 'users', user.uid, 'settings', 'budgets'), {})
      setBSplit(Object.fromEntries(CAT_KEYS.map(k => [k, ''])))
      showToast('Budgets cleared', 'info')
    } catch (e) { showToast('Clear failed', 'danger') }
  }

  async function addReminder() {
    if (!rTitle.trim()) { showToast('Enter a reminder title', 'danger'); return }
    if (!rAmt || isNaN(parseFloat(rAmt)) || parseFloat(rAmt) <= 0) {
      showToast('Enter a valid amount', 'danger'); return
    }
    try {
      await addDoc(collection(db, 'users', user.uid, 'reminders'), {
        title: rTitle.trim(),
        amount: parseFloat(rAmt),
        date: rDate,
        cat: rCat,
        freq: rFreq,
        createdAt: serverTimestamp(),
      })
      setRTitle(''); setRAmt(''); setRDate(today())
      showToast('🔔 Reminder set!', 'success')
    } catch (e) { showToast('Failed: ' + e.message, 'danger') }
  }

  async function deleteReminder(id) {
    try { await deleteDoc(doc(db, 'users', user.uid, 'reminders', id)) }
    catch (e) { showToast('Delete failed', 'danger') }
  }

  // ── Computed
  const filtered = activeFilter === 'All'
    ? expenses
    : expenses.filter(e => e.cat === activeFilter)

  const total = filtered.reduce((s, e) => s + (e.amount || 0), 0)
  const avg   = filtered.length ? total / filtered.length : 0

  const catTotals = {}
  expenses.forEach(e => {
    catTotals[e.cat] = (catTotals[e.cat] || 0) + (e.amount || 0)
  })
  const maxCatVal = Math.max(...Object.values(catTotals), 1)

  const thisMonthExp   = expenses.filter(e => e.date?.startsWith(thisMonth()))
  const thisMonthTotal = thisMonthExp.reduce((s, e) => s + (e.amount || 0), 0)

  const monthlyTotals = {}
  expenses.forEach(e => {
    if (!e.date) return
    const m = e.date.slice(0, 7)
    monthlyTotals[m] = (monthlyTotals[m] || 0) + (e.amount || 0)
  })
  const sortedMonths = Object.entries(monthlyTotals).sort((a, b) => b[0].localeCompare(a[0]))
  const maxMonthVal  = Math.max(...Object.values(monthlyTotals), 1)

  const dueReminders = reminders.filter(r => r.date <= today())

  const splitTotal = CAT_KEYS.reduce((s, k) => {
    const v = parseFloat(bSplit[k]); return s + (isNaN(v) ? 0 : v)
  }, 0)

  // ── Screens
  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      height:'100vh', color:'#72767d', fontSize:14, background:'#0f1117',
      fontFamily:"'Plus Jakarta Sans', sans-serif" }}>
      Loading Expense Trucker...
    </div>
  )

  if (!user) return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center',
      justifyContent:'center', height:'100vh', gap:16, background:'#0f1117',
      fontFamily:"'Plus Jakarta Sans', sans-serif" }}>
      <div style={{ width:56, height:56, background:'#5865f2', borderRadius:14,
        display:'flex', alignItems:'center', justifyContent:'center',
        fontSize:24, fontWeight:700, color:'#fff' }}>E</div>
      <div style={{ fontSize:28, fontWeight:700, color:'#e3e5e8' }}>Expense Trucker</div>
      <div style={{ fontSize:14, color:'#72767d' }}>Track smarter. Spend better.</div>
      <button onClick={handleSignIn} style={{
        marginTop:8, padding:'12px 32px', background:'#5865f2', border:'none',
        borderRadius:8, color:'#fff', fontSize:14, fontWeight:600, cursor:'pointer',
      }}>Sign in with Google</button>
    </div>
  )

  return (
    <div style={{ display:'flex', height:'100vh', background:'#0f1117',
      fontFamily:"'Plus Jakarta Sans', sans-serif", position:'relative' }}>

      {/* ── Toasts */}
      <div style={{ position:'fixed', top:16, right:16, zIndex:9999,
        display:'flex', flexDirection:'column', gap:8, maxWidth:340 }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            padding:'10px 14px', borderRadius:8, fontSize:13, fontWeight:500,
            animation:'slideIn 0.2s ease',
            background: t.type==='danger'?'#3d1c1c': t.type==='success'?'#1c3d2a': t.type==='info'?'#1c2a3d':'#3d2e1c',
            border:`0.5px solid ${t.type==='danger'?'#ed4245': t.type==='success'?'#3ba55d': t.type==='info'?'#378add':'#ef9f27'}`,
            color: t.type==='danger'?'#f28b8c': t.type==='success'?'#57c87a': t.type==='info'?'#7ab8f5':'#f5c067',
          }}>
            {t.msg}
          </div>
        ))}
      </div>

      {/* ── Sidebar */}
      <div style={{ width:224, background:'#0f1117', borderRight:'0.5px solid #1e2130',
        display:'flex', flexDirection:'column', flexShrink:0 }}>

        {/* Logo */}
        <div style={{ padding:'14px 14px 12px', borderBottom:'0.5px solid #1e2130',
          display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:30, height:30, background:'#5865f2', borderRadius:7,
            display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:15, fontWeight:700, color:'#fff', flexShrink:0 }}>E</div>
          <div style={{ fontSize:14, fontWeight:700, color:'#e3e5e8' }}>Expense Trucker</div>
        </div>

        {/* Nav */}
        <div style={{ padding:'10px 8px 6px', borderBottom:'0.5px solid #1e2130' }}>
          <div style={S.sectionLabel}>Menu</div>
          {[
            { key:'expenses',  label:'Expenses',          icon:'💰' },
            { key:'budget',    label:'Budget Planner',    icon:'📊' },
            { key:'reminders', label:'Reminders',         icon:'🔔', badge: dueReminders.length },
            { key:'report',    label:'Monthly Report',    icon:'📈' },
          ].map(item => (
            <button key={item.key} onClick={() => setActiveTab(item.key)} style={{
              display:'flex', alignItems:'center', gap:9, width:'100%',
              padding:'7px 10px', borderRadius:6, border:'none', cursor:'pointer',
              background: activeTab===item.key ? '#3c4270' : 'transparent',
              color: activeTab===item.key ? '#fff' : '#96989d',
              fontSize:13, textAlign:'left', marginBottom:2,
            }}>
              <span style={{ fontSize:14 }}>{item.icon}</span>
              <span style={{ flex:1 }}>{item.label}</span>
              {item.badge > 0 && (
                <span style={{ fontSize:10, background:'#ed4245', color:'#fff',
                  padding:'1px 6px', borderRadius:10, fontWeight:600 }}>{item.badge}</span>
              )}
            </button>
          ))}
        </div>

        {/* Categories */}
        {activeTab === 'expenses' && (
          <div style={{ padding:'10px 8px', flex:1, overflowY:'auto' }}>
            <div style={S.sectionLabel}>Categories</div>
            {[{ key:'All', color:'#5865f2', label:'All expenses' },
              ...CAT_KEYS.map(k => ({ key:k, color:CATEGORIES[k].color, label:CATEGORIES[k].label }))
            ].map(({ key, color, label }) => {
              const count = key==='All' ? expenses.length : expenses.filter(e=>e.cat===key).length
              return (
                <button key={key} onClick={() => setActiveFilter(key)} style={{
                  display:'flex', alignItems:'center', gap:8, width:'100%',
                  padding:'6px 10px', borderRadius:6, border:'none', cursor:'pointer',
                  background: activeFilter===key ? '#3c4270' : 'transparent',
                  color: activeFilter===key ? '#fff' : '#96989d',
                  fontSize:13, textAlign:'left', marginBottom:2,
                }}>
                  <div style={{ width:7, height:7, borderRadius:'50%', background:color, flexShrink:0 }} />
                  <span style={{ flex:1 }}>{label}</span>
                  <span style={{
                    fontSize:10, padding:'1px 6px', borderRadius:10,
                    background: activeFilter===key ? 'rgba(255,255,255,0.15)' : '#1e2130',
                    color: activeFilter===key ? 'rgba(255,255,255,0.7)' : '#72767d',
                  }}>{count}</span>
                </button>
              )
            })}
          </div>
        )}

        {/* User */}
        <div style={{ marginTop:'auto', padding:'10px 8px', borderTop:'0.5px solid #1e2130' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 10px',
            borderRadius:6, cursor:'pointer' }} onClick={handleSignOut}>
            {user.photoURL
              ? <img src={user.photoURL} alt="" style={{ width:28, height:28, borderRadius:'50%' }} />
              : <div style={{ width:28, height:28, borderRadius:'50%', background:'#5865f2',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:12, fontWeight:600, color:'#fff' }}>
                  {user.displayName?.[0] || 'U'}
                </div>
            }
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:12, fontWeight:500, color:'#e3e5e8',
                whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                {user.displayName || 'User'}
              </div>
              <div style={{ fontSize:10, color:'#72767d' }}>Click to sign out</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', background:'#1a1d2e', minWidth:0 }}>

        {/* Header */}
        <div style={{ padding:'13px 20px', borderBottom:'0.5px solid #1e2130',
          display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
          <span style={{ fontSize:15, fontWeight:600, color:'#e3e5e8' }}>
            {activeTab==='expenses' ? (activeFilter==='All' ? 'All expenses' : CATEGORIES[activeFilter]?.label)
             : activeTab==='budget' ? 'Budget Planner'
             : activeTab==='reminders' ? 'Reminders'
             : 'Monthly Report'}
          </span>
          <div style={{ display:'flex', alignItems:'center', gap:5, background:'#1e2130',
            borderRadius:10, padding:'3px 10px', fontSize:11, color:'#3ba55d', fontWeight:600 }}>
            <div style={{ width:6, height:6, borderRadius:'50%', background:'#3ba55d',
              animation:'pulse 2s infinite' }} />
            LIVE
          </div>
        </div>

        {/* Content */}
        <div style={{ flex:1, overflowY:'auto', padding:20 }}>

          {/* ════ EXPENSES TAB ════ */}
          {activeTab === 'expenses' && <>

            {/* Stats */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,minmax(0,1fr))', gap:10, marginBottom:16 }}>
              {[
                { label:'Total spent',   val: fmt(total),            color:'#ed4245' },
                { label:'Transactions',  val: filtered.length,       color:'#e3e5e8' },
                { label:'Avg per item',  val: fmt(Math.round(avg)),  color:'#3ba55d' },
              ].map(s => (
                <div key={s.label} style={S.card}>
                  <div style={{ fontSize:11, color:'#72767d', marginBottom:4 }}>{s.label}</div>
                  <div style={{ fontSize:20, fontWeight:700, color:s.color }}>{s.val}</div>
                </div>
              ))}
            </div>

            {/* Add form */}
            <div style={S.card}>
              <div style={S.sectionLabel}>Add expense</div>
              <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr', gap:8, marginBottom:8 }}>
                <input value={eName} onChange={e=>setEName(e.target.value)}
                  placeholder="Description e.g. Lunch at Java"
                  onKeyDown={e=>e.key==='Enter'&&addExpense()}
                  style={S.input} />
                <input value={eAmt} onChange={e=>setEAmt(e.target.value)}
                  type="number" placeholder="Amount" min="0"
                  onKeyDown={e=>e.key==='Enter'&&addExpense()}
                  style={S.input} />
                <input value={eDate} onChange={e=>setEDate(e.target.value)}
                  type="date" style={S.input} />
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                <select value={eCat} onChange={e=>setECat(e.target.value)} style={S.input}>
                  {CAT_KEYS.map(k => <option key={k} value={k}>{CATEGORIES[k].label}</option>)}
                </select>
                <button onClick={addExpense} style={S.btn}>+ Add Expense</button>
              </div>
            </div>

            {/* List */}
            <div style={{ fontSize:10, fontWeight:600, color:'#72767d',
              letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:10 }}>
              {filtered.length} {filtered.length===1?'entry':'entries'}
            </div>

            {filtered.length === 0
              ? <div style={{ textAlign:'center', padding:'40px 0', color:'#4e5058', fontSize:13 }}>
                  No expenses here yet — add one above!
                </div>
              : filtered.map(e => (
                <div key={e.id} style={{ display:'flex', alignItems:'center', gap:10,
                  padding:'10px 14px', background:'#0f1117', border:'0.5px solid #1e2130',
                  borderRadius:8, marginBottom:6 }}>
                  <div style={{ width:8, height:8, borderRadius:'50%', flexShrink:0,
                    background: CATEGORIES[e.cat]?.color || '#888' }} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:500, color:'#e3e5e8',
                      whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                      {e.name}
                    </div>
                    <div style={{ fontSize:11, color:'#72767d', marginTop:2 }}>
                      {CATEGORIES[e.cat]?.label} · {e.date}
                    </div>
                  </div>
                  <div style={{ fontSize:14, fontWeight:600, color:'#e3e5e8' }}>{fmt(e.amount)}</div>
                  <button onClick={() => deleteExpense(e.id)}
                    style={{ background:'none', border:'none', cursor:'pointer',
                      color:'#4e5058', fontSize:16, padding:'2px 6px', borderRadius:4 }}
                    onMouseEnter={ev=>ev.target.style.color='#ed4245'}
                    onMouseLeave={ev=>ev.target.style.color='#4e5058'}>✕</button>
                </div>
              ))
            }

            {/* Breakdown chart */}
            {Object.keys(catTotals).length > 0 && (
              <div style={{ ...S.card, marginTop:20 }}>
                <div style={S.sectionLabel}>Spending breakdown</div>
                {Object.entries(catTotals).sort((a,b)=>b[1]-a[1]).map(([c,v]) => (
                  <div key={c} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                    <div style={{ fontSize:11, color:'#72767d', width:90, textAlign:'right', flexShrink:0 }}>{c}</div>
                    <div style={{ flex:1, height:6, background:'#1e2130', borderRadius:3, overflow:'hidden' }}>
                      <div style={{ height:'100%', borderRadius:3, background:CATEGORIES[c]?.color||'#888',
                        width:`${(v/maxCatVal*100).toFixed(1)}%`, transition:'width 0.4s' }} />
                    </div>
                    <div style={{ fontSize:11, color:'#96989d', width:90 }}>{fmt(Math.round(v))}</div>
                  </div>
                ))}
              </div>
            )}
          </>}

          {/* ════ BUDGET PLANNER TAB ════ */}
          {activeTab === 'budget' && <>

            {/* Mode selector */}
            <div style={{ display:'flex', gap:8, marginBottom:16 }}>
              {[
                { key:'total', label:'🎯 Set Total Budget' },
                { key:'manual', label:'✏️ Set Per Category' },
              ].map(m => (
                <button key={m.key} onClick={() => setBMode(m.key)} style={{
                  padding:'8px 16px', borderRadius:6, border:'none', cursor:'pointer',
                  fontSize:13, fontWeight:500,
                  background: bMode===m.key ? '#5865f2' : '#0f1117',
                  color: bMode===m.key ? '#fff' : '#96989d',
                  border: bMode===m.key ? 'none' : '0.5px solid #2e3148',
                }}>{m.label}</button>
              ))}
            </div>

            {/* Total budget mode */}
            {bMode === 'total' && (
              <div style={S.card}>
                <div style={S.sectionLabel}>Total monthly budget</div>
                <p style={{ fontSize:12, color:'#72767d', marginBottom:12 }}>
                  Enter your total budget and we'll split it across all categories automatically.
                </p>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:12 }}>
                  <input value={bTotal} onChange={e=>setBTotal(e.target.value)}
                    type="number" placeholder="e.g. 50000" style={S.input} />
                  <button onClick={autoSplit} style={{ ...S.btn, background:'#1d9e75' }}>
                    Auto Split Equally
                  </button>
                  <button onClick={() => {
                    if (!bTotal || isNaN(parseFloat(bTotal))) { showToast('Enter total first','warning'); return }
                    // weighted split based on typical spending
                    const weights = { Food:25, Transport:20, Utilities:15, Health:10, Shopping:15, Entertainment:10, Other:5 }
                    const total = parseFloat(bTotal)
                    setBSplit(Object.fromEntries(CAT_KEYS.map(k => [k, Math.round(total*(weights[k]/100)).toString()])))
                    showToast('Split by recommended percentages!', 'success')
                  }} style={{ ...S.btn, background:'#ef9f27' }}>
                    Smart Split
                  </button>
                </div>

                {/* Show remaining */}
                {bTotal && (
                  <div style={{ display:'flex', justifyContent:'space-between',
                    padding:'8px 12px', background:'#1a1d2e', borderRadius:6, marginBottom:12,
                    fontSize:12, color:'#72767d' }}>
                    <span>Total: <strong style={{ color:'#e3e5e8' }}>{fmt(parseFloat(bTotal)||0)}</strong></span>
                    <span>Allocated: <strong style={{ color: splitTotal > (parseFloat(bTotal)||0) ? '#ed4245' : '#3ba55d' }}>
                      {fmt(splitTotal)}
                    </strong></span>
                    <span>Remaining: <strong style={{ color: (parseFloat(bTotal)||0)-splitTotal < 0 ? '#ed4245' : '#5865f2' }}>
                      {fmt((parseFloat(bTotal)||0) - splitTotal)}
                    </strong></span>
                  </div>
                )}

                {/* Category inputs */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:12 }}>
                  {CAT_KEYS.map(k => (
                    <div key={k} style={{ display:'flex', alignItems:'center', gap:8,
                      background:'#1a1d2e', padding:'8px 10px', borderRadius:6 }}>
                      <div style={{ width:7, height:7, borderRadius:'50%',
                        background:CATEGORIES[k].color, flexShrink:0 }} />
                      <span style={{ fontSize:12, color:'#96989d', flex:1 }}>{k}</span>
                      <input value={bSplit[k]} onChange={e=>setBSplit(p=>({...p,[k]:e.target.value}))}
                        type="number" placeholder="0"
                        style={{ ...S.input, width:100, height:30, fontSize:12 }} />
                    </div>
                  ))}
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                  <button onClick={saveBudgets} style={S.btn}>💾 Save All Budgets</button>
                  <button onClick={clearBudgets} style={{ ...S.btn, background:'#3d1c1c', color:'#ed4245' }}>
                    🗑 Clear Budgets
                  </button>
                </div>
              </div>
            )}

            {/* Manual mode */}
            {bMode === 'manual' && (
              <div style={S.card}>
                <div style={S.sectionLabel}>Set budget per category</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:12 }}>
                  {CAT_KEYS.map(k => (
                    <div key={k} style={{ display:'flex', alignItems:'center', gap:8,
                      background:'#1a1d2e', padding:'8px 10px', borderRadius:6 }}>
                      <div style={{ width:7, height:7, borderRadius:'50%',
                        background:CATEGORIES[k].color, flexShrink:0 }} />
                      <span style={{ fontSize:12, color:'#96989d', flex:1 }}>{CATEGORIES[k].label}</span>
                      <input value={bSplit[k]} onChange={e=>setBSplit(p=>({...p,[k]:e.target.value}))}
                        type="number" placeholder="0"
                        style={{ ...S.input, width:110, height:30, fontSize:12 }} />
                    </div>
                  ))}
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                  <button onClick={saveBudgets} style={S.btn}>💾 Save Budgets</button>
                  <button onClick={clearBudgets} style={{ ...S.btn, background:'#3d1c1c', color:'#ed4245' }}>
                    🗑 Clear
                  </button>
                </div>
              </div>
            )}

            {/* Budget status cards */}
            {Object.keys(budgets).length > 0 && <>
              <div style={{ fontSize:10, fontWeight:600, color:'#72767d',
                letterSpacing:'0.08em', textTransform:'uppercase', margin:'20px 0 12px' }}>
                This month — {monthLabel(thisMonth())}
              </div>
              {CAT_KEYS.filter(c => budgets[c]).map(c => {
                const limit = budgets[c]
                const spent = thisMonthExp.filter(e=>e.cat===c).reduce((s,e)=>s+(e.amount||0),0)
                const pct   = Math.min((spent/limit)*100, 100)
                const over  = spent > limit
                const warn  = pct >= 80 && !over
                const barColor = over ? '#ed4245' : warn ? '#ef9f27' : '#3ba55d'
                return (
                  <div key={c} style={{ ...S.card,
                    border:`0.5px solid ${over?'#ed4245':warn?'#ef9f27':'#1e2130'}` }}>
                    <div style={{ display:'flex', alignItems:'center', marginBottom:10 }}>
                      <div style={{ width:8, height:8, borderRadius:'50%',
                        background:CATEGORIES[c].color, marginRight:8 }} />
                      <span style={{ fontSize:13, fontWeight:600, color:'#e3e5e8', flex:1 }}>
                        {CATEGORIES[c].label}
                      </span>
                      {over && <span style={{ fontSize:10, background:'#3d1c1c', color:'#ed4245',
                        padding:'2px 8px', borderRadius:10, fontWeight:600 }}>OVER BUDGET</span>}
                      {warn && <span style={{ fontSize:10, background:'#3d2e1c', color:'#ef9f27',
                        padding:'2px 8px', borderRadius:10, fontWeight:600 }}>WARNING</span>}
                    </div>
                    <div style={{ height:8, background:'#1e2130', borderRadius:4, overflow:'hidden', marginBottom:8 }}>
                      <div style={{ height:'100%', borderRadius:4, background:barColor,
                        width:`${pct.toFixed(1)}%`, transition:'width 0.4s' }} />
                    </div>
                    <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#72767d' }}>
                      <span>Spent: <strong style={{ color:barColor }}>{fmt(spent)}</strong></span>
                      <span>Budget: <strong style={{ color:'#96989d' }}>{fmt(limit)}</strong></span>
                      <span>Left: <strong style={{ color:over?'#ed4245':'#3ba55d' }}>
                        {over ? `-${fmt(spent-limit)}` : fmt(limit-spent)}
                      </strong></span>
                    </div>
                  </div>
                )
              })}
            </>}
          </>}

          {/* ════ REMINDERS TAB ════ */}
          {activeTab === 'reminders' && <>

            <div style={S.card}>
              <div style={S.sectionLabel}>New reminder</div>
              <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:8, marginBottom:8 }}>
                <input value={rTitle} onChange={e=>setRTitle(e.target.value)}
                  placeholder="e.g. Pay electricity bill"
                  onKeyDown={e=>e.key==='Enter'&&addReminder()}
                  style={S.input} />
                <input value={rAmt} onChange={e=>setRAmt(e.target.value)}
                  type="number" placeholder="Amount"
                  style={S.input} />
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:8 }}>
                <select value={rCat} onChange={e=>setRCat(e.target.value)} style={S.input}>
                  {CAT_KEYS.map(k => <option key={k} value={k}>{CATEGORIES[k].label}</option>)}
                </select>
                <input value={rDate} onChange={e=>setRDate(e.target.value)}
                  type="date" style={S.input} />
                <select value={rFreq} onChange={e=>setRFreq(e.target.value)} style={S.input}>
                  <option value="once">One time</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
                <button onClick={addReminder} style={S.btn}>+ Add</button>
              </div>
            </div>

            {dueReminders.length > 0 && (
              <div style={{ background:'#3d1c1c', border:'0.5px solid #ed4245',
                borderRadius:8, padding:'12px 14px', marginBottom:14 }}>
                <div style={{ fontSize:12, fontWeight:700, color:'#ed4245', marginBottom:8 }}>
                  🚨 {dueReminders.length} Overdue Reminder{dueReminders.length>1?'s':''}
                </div>
                {dueReminders.map(r => (
                  <div key={r.id} style={{ fontSize:12, color:'#f0a0a0', marginBottom:4 }}>
                    · {r.title} — {fmt(r.amount)} ({r.freq})
                  </div>
                ))}
              </div>
            )}

            <div style={{ fontSize:10, fontWeight:600, color:'#72767d',
              letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:10 }}>
              {reminders.length} reminder{reminders.length!==1?'s':''}
            </div>

            {reminders.length === 0
              ? <div style={{ textAlign:'center', padding:'40px 0', color:'#4e5058', fontSize:13 }}>
                  No reminders yet.
                </div>
              : reminders.map(r => {
                  const isDue = r.date <= today()
                  return (
                    <div key={r.id} style={{ display:'flex', alignItems:'center', gap:10,
                      padding:'10px 14px', background:'#0f1117',
                      border:`0.5px solid ${isDue?'#ed4245':'#1e2130'}`,
                      borderRadius:8, marginBottom:6 }}>
                      <span style={{ fontSize:16 }}>{isDue ? '🔴' : '🔔'}</span>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:500, color:'#e3e5e8' }}>{r.title}</div>
                        <div style={{ fontSize:11, color:'#72767d', marginTop:2 }}>
                          {CATEGORIES[r.cat]?.label} · Due {r.date} · {r.freq}
                          {isDue && <span style={{ color:'#ed4245', marginLeft:6, fontWeight:600 }}>OVERDUE</span>}
                        </div>
                      </div>
                      <div style={{ fontSize:13, fontWeight:600, color:'#e3e5e8' }}>{fmt(r.amount)}</div>
                      <button onClick={() => deleteReminder(r.id)}
                        style={{ background:'none', border:'none', cursor:'pointer',
                          color:'#4e5058', fontSize:16, padding:'2px 6px', borderRadius:4 }}
                        onMouseEnter={ev=>ev.target.style.color='#ed4245'}
                        onMouseLeave={ev=>ev.target.style.color='#4e5058'}>✕</button>
                    </div>
                  )
                })
            }
          </>}

          {/* ════ MONTHLY REPORT TAB ════ */}
          {activeTab === 'report' && <>

            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,minmax(0,1fr))', gap:10, marginBottom:20 }}>
              {[
                { label:'This month',     val: fmt(thisMonthTotal),                                     color:'#5865f2' },
                { label:'All time total', val: fmt(expenses.reduce((s,e)=>s+(e.amount||0),0)),          color:'#e3e5e8' },
                { label:'Months tracked', val: sortedMonths.length,                                     color:'#3ba55d' },
              ].map(s => (
                <div key={s.label} style={S.card}>
                  <div style={{ fontSize:11, color:'#72767d', marginBottom:4 }}>{s.label}</div>
                  <div style={{ fontSize:20, fontWeight:700, color:s.color }}>{s.val}</div>
                </div>
              ))}
            </div>

            <div style={{ fontSize:10, fontWeight:600, color:'#72767d',
              letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:12 }}>
              Month by month
            </div>

            {sortedMonths.length === 0
              ? <div style={{ textAlign:'center', padding:'40px 0', color:'#4e5058', fontSize:13 }}>
                  No data yet — add some expenses first.
                </div>
              : sortedMonths.map(([m, val]) => (
                <div key={m} style={{ ...S.card }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                    <span style={{ fontSize:13, fontWeight:600, color:'#e3e5e8' }}>{monthLabel(m)}</span>
                    <span style={{ fontSize:14, fontWeight:700, color:'#ed4245' }}>{fmt(val)}</span>
                  </div>
                  <div style={{ height:6, background:'#1e2130', borderRadius:3, overflow:'hidden', marginBottom:6 }}>
                    <div style={{ height:'100%', borderRadius:3, background:'#5865f2',
                      width:`${(val/maxMonthVal*100).toFixed(1)}%`, transition:'width 0.4s' }} />
                  </div>
                  <div style={{ fontSize:11, color:'#72767d' }}>
                    {expenses.filter(e=>e.date?.startsWith(m)).length} transactions
                  </div>
                </div>
              ))
            }

            {thisMonthTotal > 0 && <>
              <div style={{ fontSize:10, fontWeight:600, color:'#72767d',
                letterSpacing:'0.08em', textTransform:'uppercase', margin:'20px 0 12px' }}>
                This month by category
              </div>
              {CAT_KEYS.map(c => {
                const spent = thisMonthExp.filter(e=>e.cat===c).reduce((s,e)=>s+(e.amount||0),0)
                if (!spent) return null
                const budget = budgets[c]
                return (
                  <div key={c} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                    <div style={{ width:8, height:8, borderRadius:'50%',
                      background:CATEGORIES[c].color, flexShrink:0 }} />
                    <div style={{ fontSize:12, color:'#96989d', width:100, flexShrink:0 }}>{c}</div>
                    <div style={{ flex:1, height:6, background:'#1e2130', borderRadius:3, overflow:'hidden' }}>
                      <div style={{ height:'100%', borderRadius:3, background:CATEGORIES[c].color,
                        width:`${(spent/(thisMonthTotal||1)*100).toFixed(1)}%` }} />
                    </div>
                    <div style={{ fontSize:12, color:'#96989d', width:90, textAlign:'right' }}>{fmt(spent)}</div>
                    {budget && (
                      <div style={{ fontSize:11, width:90, textAlign:'right',
                        color: spent>budget ? '#ed4245' : '#3ba55d' }}>
                        / {fmt(budget)}
                      </div>
                    )}
                  </div>
                )
              })}
            </>}
          </>}

        </div>
      </div>

      <style>{`
        @keyframes pulse   { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes slideIn { from{opacity:0;transform:translateX(20px)} to{opacity:1;transform:translateX(0)} }
        input[type=number]::-webkit-inner-spin-button { opacity:0.3 }
        input::placeholder { color:#4e5058 }
        select option { background:#0f1117 }
        * { box-sizing:border-box }
      `}</style>
    </div>
  )
}
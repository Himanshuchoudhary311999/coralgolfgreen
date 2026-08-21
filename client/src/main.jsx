import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CalendarPlus, Check, ChevronDown, CircleAlert, CreditCard, IndianRupee, LoaderCircle, LogOut, Receipt, Search, Users } from 'lucide-react';
import './styles.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
const ADMIN_TOKEN_KEY = 'cgg_admin_token';
const money = (value) => `₹${Number(value || 0).toLocaleString('en-IN')}`;
const displayDate = (value, options) => new Date(value).toLocaleDateString('en-IN', options);
const monthSpan = (start, end) => (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth() + 1;
const adminHeaders = () => {
  const token = localStorage.getItem(ADMIN_TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
};

function residentStatus(flat) {
  if (flat.dues.length || flat.collectionDues?.length) return 'pending';
  if (flat.advancedDues?.length) return 'advance';
  return 'paid';
}

function ResidentApp() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [flatInput, setFlatInput] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [flats, setFlats] = useState([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [expanded, setExpanded] = useState(null);
  const [loginError, setLoginError] = useState('');
  const [busy, setBusy] = useState(false);

  async function login(flatNo = flatInput, pin = pinInput) {
    setBusy(true); setLoginError('');
    try {
      const response = await fetch(`${API}/resident-login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ flatNo, pin }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      setFlats(data.flats || []); setLoggedIn(true);
      localStorage.setItem('cgg_flat', flatNo); localStorage.setItem('cgg_pin', pin);
    } catch (error) { setLoginError(error.message || 'Could not connect to the maintenance service.'); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    const savedFlat = localStorage.getItem('cgg_flat');
    const savedPin = localStorage.getItem('cgg_pin');
    if (savedFlat && savedPin) login(savedFlat, savedPin);
  }, []);

  function logout() { localStorage.removeItem('cgg_flat'); localStorage.removeItem('cgg_pin'); setLoggedIn(false); setFlats([]); setFlatInput(''); setPinInput(''); }

  if (!loggedIn) return <main className="resident-login" onKeyDown={(event) => { if (event.key === 'Enter') login(); }}>
    <div className="resident-login-masthead"><div className="resident-seal"><span>CGG</span></div><h1>Resident Login</h1><div className="resident-tagline">Coral Golf Green Residents' Society</div></div>
    <div className="resident-login-card">{loginError && <div className="resident-login-error">{loginError}</div>}<label>Flat Number<input value={flatInput} onChange={(event) => setFlatInput(event.target.value)} inputMode="numeric" placeholder="e.g. 104" maxLength={3} /></label><label>PIN<input type="password" value={pinInput} onChange={(event) => setPinInput(event.target.value)} inputMode="numeric" placeholder="4-digit PIN" maxLength={4} /></label><button className="resident-login-button" onClick={() => login()} disabled={busy}>{busy ? 'Checking...' : 'Log In'}</button></div>
    <p className="resident-login-note">Use your own flat's PIN, shared by the Management Committee, to view the register.</p>
  </main>;

  const visible = flats.filter((flat) => { const status = residentStatus(flat); const matchesQuery = !query || flat.flat_no.includes(query.toLowerCase()) || flat.owner_name?.toLowerCase().includes(query.toLowerCase()); return matchesQuery && (filter === 'all' || status === filter); });
  const pendingCount = flats.filter((flat) => residentStatus(flat) === 'pending').length;
  const paidCount = flats.filter((flat) => residentStatus(flat) === 'paid').length;
  const advanceCount = flats.filter((flat) => residentStatus(flat) === 'advance').length;
  const outstanding = flats.reduce((sum, flat) => sum + flat.dues.reduce((total, due) => total + due.totalDue, 0) + (flat.collectionDues || []).reduce((total, due) => total + due.amount, 0), 0);
  const grouped = visible.reduce((groups, flat) => { const floor = flat.flat_no[0]; (groups[floor] ||= []).push(flat); return groups; }, {});
  const filters = [['all', `All ${flats.length}`], ['pending', `Pending ${pendingCount}`], ['paid', `Paid ${paidCount}`], ['advance', `Advance ${advanceCount}`]];

  return <main className="resident-wrap"><header className="resident-masthead"><div className="resident-seal"><span>CGG</span></div><div><h1>Flat Maintenance Register</h1><div className="resident-tagline">Coral Golf Green Residents' Society</div></div></header><div className="resident-account"><button onClick={logout}><LogOut size={13} /> Log out</button></div><hr className="resident-rule" /><div className="resident-meta"><span>{flats.length} flats · live register</span><span className="resident-fee-note">late fee ₹20/day after the 10th</span></div><section className="resident-summary"><div><strong>{flats.length}</strong><span>Flats</span></div><div><strong>{paidCount}</strong><span>Paid Up</span></div><div><strong>{pendingCount}</strong><span>Pending</span></div><div className="due"><strong>{money(outstanding)}</strong><span>Outstanding</span></div></section><div className="resident-toolbar"><div className="resident-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value.toLowerCase())} placeholder="Search flat no. or name..." /></div><div className="resident-filters">{filters.map(([value, label]) => <button className={filter === value ? 'active' : ''} onClick={() => setFilter(value)} key={value}>{label}</button>)}</div></div><div className="resident-count">Showing {visible.length} of {flats.length} flats</div>{Object.keys(grouped).sort().map((floor) => <section key={floor}><div className="resident-floor"><span>Floor {floor}</span><span>{grouped[floor].length} flats</span></div>{grouped[floor].map((flat) => { const status = residentStatus(flat); const collectionDues = flat.collectionDues || []; const collectionTotal = collectionDues.reduce((sum, due) => sum + Number(due.amount || 0), 0); const total = flat.dues.reduce((sum, due) => sum + due.totalDue, 0) + collectionTotal; const paidDues = flat.paidDues || []; const advancedDues = flat.advancedDues || []; const latestAdvancedDue = advancedDues.at(-1); const currentMonth = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)); const latestAdvancedMonth = latestAdvancedDue ? new Date(`${latestAdvancedDue.dueMonth}T00:00:00Z`) : currentMonth; const advancedAmount = latestAdvancedDue ? monthSpan(currentMonth, latestAdvancedMonth) * Number(latestAdvancedDue.amount || 0) : 0; const months = [...flat.dues, ...paidDues, ...advancedDues]; return <React.Fragment key={flat.id}><button className="resident-row" onClick={() => (months.length || collectionDues.length) && setExpanded(expanded === flat.id ? null : flat.id)}><span className="resident-flatno">{flat.flat_no}</span><span className="resident-who"><strong>{flat.owner_name || 'Owner not assigned'}</strong><small><em>{flat.owner_role || 'Resident'}</em><b className={`resident-pill ${status}`}>{status === 'advance' ? 'Advance' : status[0].toUpperCase() + status.slice(1)}</b></small></span><span className={`resident-amount ${total ? '' : 'zero'}`}>{total ? money(total) : '—'}{total && <small>due</small>}</span></button>{expanded === flat.id && <div className="resident-expand"><div><span>Pending months</span><strong>{flat.dues.map((due) => displayDate(due.dueMonth, { month: 'short', year: 'numeric' })).join(', ') || '—'}</strong></div><div><span>Pending amount</span><strong>{money(flat.dues.reduce((sum, due) => sum + due.maintenanceDue, 0))}</strong></div><div><span>Late fee</span><strong>{money(flat.dues.reduce((sum, due) => sum + due.lateFee, 0))}</strong></div>{collectionDues.map((due) => <div key={due.id}><span>{due.name}</span><strong>{money(due.amount)}</strong></div>)}<div><span>Paid maintenance months</span><strong>{paidDues.map((due) => displayDate(due.dueMonth, { month: 'short', year: 'numeric' })).join(', ') || '—'}</strong></div><div><span>Advance paid through</span><strong>{advancedDues.map((due) => displayDate(due.dueMonth, { month: 'short', year: 'numeric' })).join(', ') || '—'}</strong></div><div><span>Advance amount</span><strong>{money(advancedAmount)}</strong></div><div><span>Total due</span><strong>{money(total)}</strong></div></div>}</React.Fragment>; })}</section>)}{!visible.length && <div className="resident-empty"><Search size={34} />No flats match your search.</div>}<footer className="resident-footer">Tap a flat for month-wise breakup · figures update as payments are recorded</footer></main>;
}

function App() {
  const [adminLoggedIn, setAdminLoggedIn] = useState(Boolean(localStorage.getItem(ADMIN_TOKEN_KEY)));
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminLoginError, setAdminLoginError] = useState('');
  const [adminLoggingIn, setAdminLoggingIn] = useState(false);
  const [flats, setFlats] = useState([]);
  const [selectedFlatId, setSelectedFlatId] = useState('');
  const [selectedDueIds, setSelectedDueIds] = useState([]);
  const [selectedCollectionDueIds, setSelectedCollectionDueIds] = useState([]);
  const [paymentMode, setPaymentMode] = useState('');
  const [collectedBy, setCollectedBy] = useState('');
  const [feePolicy, setFeePolicy] = useState(null);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [advanceMonth, setAdvanceMonth] = useState('');
  const [addingAdvance, setAddingAdvance] = useState(false);
  const [message, setMessage] = useState(null);
  const [collectionName, setCollectionName] = useState('');
  const [collectionAmount, setCollectionAmount] = useState('');
  const [collectionDueDate, setCollectionDueDate] = useState('');
  const [creatingCollection, setCreatingCollection] = useState(false);

  async function adminLogin(event) {
    event.preventDefault();
    setAdminLoggingIn(true); setAdminLoginError('');
    try {
      const response = await fetch(`${API}/admin-login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: adminUsername, password: adminPassword }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Could not log in');
      localStorage.setItem(ADMIN_TOKEN_KEY, data.token);
      setAdminLoggedIn(true); setAdminPassword('');
    } catch (error) { setAdminLoginError(error.message); }
    finally { setAdminLoggingIn(false); }
  }

  function adminLogout() {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    setAdminLoggedIn(false); setFlats([]); setSelectedFlatId('');
  }

  useEffect(() => {
    if (!adminLoggedIn) { setBusy(false); return undefined; }
    Promise.all([fetch(`${API}/flats`, { headers: adminHeaders() }), fetch(`${API}/config`, { headers: adminHeaders() })])
      .then(async ([flatResponse, configResponse]) => {
        if (flatResponse.status === 401 || configResponse.status === 401) throw new Error('Your admin session has expired.');
        return Promise.all([flatResponse.json(), configResponse.json()]);
      })
      .then(([flatData, config]) => { setFlats(flatData.flats || []); setFeePolicy(config.feePolicy); })
      .catch((error) => { if (error.message.includes('session')) adminLogout(); else setMessage({ type: 'error', text: error.message || 'Could not connect to the maintenance service.' }); })
      .finally(() => setBusy(false));
  }, [adminLoggedIn]);

  const flat = flats.find((item) => item.id === selectedFlatId);
  const selectedDues = (flat?.dues || []).filter((due) => selectedDueIds.includes(due.id));
  const selectedCollectionDues = (flat?.collectionDues || []).filter((due) => selectedCollectionDueIds.includes(due.id));
  const collectionTotal = selectedCollectionDues.reduce((sum, due) => sum + due.amount, 0);
  const totals = selectedDues.reduce((result, due) => ({ maintenance: result.maintenance + due.maintenanceDue, lateFees: result.lateFees + due.lateFee, total: result.total + due.totalDue }), { maintenance: 0, lateFees: 0, total: collectionTotal });

  function chooseFlat(id) { setSelectedFlatId(id); setSelectedDueIds([]); setSelectedCollectionDueIds([]); setMessage(null); }
  function toggleDue(id) { setSelectedDueIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]); }
  function toggleCollectionDue(id) { setSelectedCollectionDueIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]); }

  async function createCollection(event) {
    event.preventDefault();
    if (!collectionName.trim() || !Number(collectionAmount)) return;
    setCreatingCollection(true); setMessage(null);
    try {
      const response = await fetch(`${API}/collections`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...adminHeaders() }, body: JSON.stringify({ name: collectionName, amount: Number(collectionAmount), dueDate: collectionDueDate || null }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Collection could not be created');
      const collectionDue = { ...data.collection, id: data.collection.id, collectionId: data.collection.id, status: 'unpaid' };
      setFlats((current) => current.map((item) => ({ ...item, collectionDues: [...(item.collectionDues || []), { ...collectionDue }] })));
      setCollectionName(''); setCollectionAmount(''); setCollectionDueDate(''); setMessage({ type: 'success', text: `${data.collection.name} added for ${data.flatsApplied} flats.` });
    } catch (error) { setMessage({ type: 'error', text: error.message }); }
    finally { setCreatingCollection(false); }
  }

  async function addAdvanceMonth() {
    if (!selectedFlatId || !advanceMonth) return;
    setAddingAdvance(true); setMessage(null);
    try {
      const response = await fetch(`${API}/flats/${selectedFlatId}/advance-dues`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...adminHeaders() }, body: JSON.stringify({ dueMonth: advanceMonth }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Advance month could not be added');
      setFlats((current) => current.map((item) => item.id === selectedFlatId ? { ...item, dues: [...item.dues, data.due].sort((left, right) => left.dueMonth.localeCompare(right.dueMonth)) } : item));
      setAdvanceMonth(''); setMessage({ type: 'success', text: 'Advance month added.' });
    } catch (error) { setMessage({ type: 'error', text: error.message }); }
    finally { setAddingAdvance(false); }
  }

  async function submit(event) {
    event.preventDefault();
    if (!selectedFlatId || (!selectedDueIds.length && !selectedCollectionDueIds.length) || !paymentMode || (paymentMode === 'cash' && !collectedBy.trim())) {
      setMessage({ type: 'error', text: 'Select a flat, at least one due or collection, payment mode, and collector for cash.' }); return;
    }
    setSaving(true); setMessage(null);
    try {
      const response = await fetch(`${API}/payments`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...adminHeaders() }, body: JSON.stringify({ flatId: selectedFlatId, dueIds: selectedDueIds, collectionDueIds: selectedCollectionDueIds, paymentMode, collectedBy }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Payment could not be recorded');
      setMessage({ type: 'success', text: data.message });
      setFlats((current) => current.map((item) => item.id === selectedFlatId ? { ...item, dues: item.dues.filter((due) => !selectedDueIds.includes(due.id)), collectionDues: (item.collectionDues || []).filter((due) => !selectedCollectionDueIds.includes(due.id)) } : item));
      setSelectedDueIds([]); setSelectedCollectionDueIds([]); setPaymentMode(''); setCollectedBy('');
    } catch (error) { setMessage({ type: 'error', text: error.message }); }
    finally { setSaving(false); }
  }

  if (!adminLoggedIn) return <main className="admin-login"><div className="admin-login-card"><div className="brand-mark">CG</div><p className="eyebrow">CORAL GOLF GREEN</p><h1>Collection desk</h1><p className="admin-login-copy">Sign in to manage maintenance and community collections.</p>{adminLoginError && <div className="message error">{adminLoginError}</div>}<form onSubmit={adminLogin}><label className="field-label">Username<input value={adminUsername} onChange={(event) => setAdminUsername(event.target.value)} autoComplete="username" /></label><label className="field-label">Password<input type="password" value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} autoComplete="current-password" /></label><button className="submit-button" type="submit" disabled={adminLoggingIn}>{adminLoggingIn ? 'Signing in...' : 'Sign in'}</button></form></div></main>;
  if (busy) return <main className="loading-screen"><LoaderCircle className="spin" size={34} /><span>Loading community records</span></main>;

  return <main className="app-shell">
    <header className="topbar"><div className="brand-mark">CG</div><div><p className="eyebrow">CORAL GOLF GREEN</p><h1>Maintenance desk</h1></div><div className="header-status"><span className="status-dot" />Live records<button className="admin-logout" onClick={adminLogout}>Log out</button></div></header>
    <section className="intro"><div><p className="eyebrow">COLLECTIONS / 2026</p><h2>Keep every home<br /><em>in good standing.</em></h2></div><p className="intro-copy">Record maintenance payments against the right month. Outstanding dues after 10 August carry a daily late fee.</p></section>
    <form className="panel collection-create" onSubmit={createCollection}><div className="panel-heading"><div className="step">NEW</div><div><p className="eyebrow">COMMUNITY COLLECTION</p><h3>Create for every flat</h3></div></div><div className="collection-fields"><label className="field-label">Event or collection name<input value={collectionName} onChange={(event) => setCollectionName(event.target.value)} placeholder="e.g. Diwali decoration" /></label><label className="field-label">Amount per flat<input type="number" min="1" step="0.01" value={collectionAmount} onChange={(event) => setCollectionAmount(event.target.value)} placeholder="Amount" /></label><label className="field-label">Due date<input type="date" value={collectionDueDate} onChange={(event) => setCollectionDueDate(event.target.value)} /></label><button className="advance-button" disabled={creatingCollection}>{creatingCollection ? 'Creating...' : 'Apply to all flats'}</button></div></form>
    {flat && flat.collectionDues?.length > 0 && <section className="panel collection-selection"><div className="panel-heading"><div className="step">EVENT</div><div><p className="eyebrow">COMMUNITY COLLECTIONS</p><h3>Choose event dues</h3></div></div><div className="due-list">{flat.collectionDues.map((due) => <button type="button" className={`due-row ${selectedCollectionDueIds.includes(due.id) ? 'selected' : ''}`} key={due.id} onClick={() => toggleCollectionDue(due.id)}><span className="checkbox">{selectedCollectionDueIds.includes(due.id) && <Check size={14} />}</span><span className="due-month"><strong>{due.name}</strong><small>{due.dueDate ? `Due ${displayDate(due.dueDate, { day: 'numeric', month: 'short', year: 'numeric' })}` : 'Community collection'}</small></span><span className="due-amount">{money(due.amount)}</span></button>)}</div></section>}
    <form className="workspace" onSubmit={submit}>
      <section className="panel selection-panel"><div className="panel-heading"><div className="step">01</div><div><p className="eyebrow">ACCOUNT</p><h3>Choose a residence</h3></div></div>
        <label className="field-label" htmlFor="flat">Flat and owner</label>
        <div className="select-wrap"><Users size={18} /><select id="flat" value={selectedFlatId} onChange={(event) => chooseFlat(event.target.value)}><option value="">Select flat and owner</option>{flats.map((item) => <option key={item.id} value={item.id}>{item.flat_no} · {item.owner_name}</option>)}</select><ChevronDown size={18} /></div>
        {flat && <div className="account-strip"><span>{flat.flat_no}</span><strong>{flat.owner_name}</strong><span className="due-count">{flat.dues.length} unpaid month{flat.dues.length === 1 ? '' : 's'}<b className="pending-total">{money(flat.dues.reduce((total, due) => total + Number(due.totalDue || 0), 0))} pending</b></span></div>}
        {flat && <><div className="section-label"><span>Select month(s)</span><button type="button" onClick={() => setSelectedDueIds(flat.dues.map((due) => due.id))}>Select all</button></div><div className="due-list">{flat.dues.length ? flat.dues.map((due) => <button type="button" className={`due-row ${selectedDueIds.includes(due.id) ? 'selected' : ''}`} key={due.id} onClick={() => toggleDue(due.id)}><span className="checkbox">{selectedDueIds.includes(due.id) && <Check size={14} />}</span><span className="due-month">{displayDate(due.dueMonth, { month: 'long', year: 'numeric' })}</span><span className="due-amount">{money(due.totalDue)}</span></button>) : <div className="empty-state"><Check size={22} />All maintenance is paid up.</div>}</div>{flat.paidDues?.length > 0 && <><div className="section-label paid-heading"><span>Paid months</span><span>{flat.paidDues.length} month{flat.paidDues.length === 1 ? '' : 's'}</span></div><div className="due-list advanced-list">{flat.paidDues.map((due) => <div className="due-row advanced-row-item" key={due.id}><Check size={18} /><span className="due-month">{displayDate(due.dueMonth, { month: 'long', year: 'numeric' })}</span><strong className="advanced-label">Paid</strong></div>)}</div></>}{flat.advancedDues?.length > 0 && <><div className="section-label advanced-heading"><span>Advanced paid</span><span>{flat.advancedDues.length} month{flat.advancedDues.length === 1 ? '' : 's'}</span></div><div className="due-list advanced-list">{flat.advancedDues.map((due) => <div className="due-row advanced-row-item" key={due.id}><Check size={18} /><span className="due-month">{displayDate(due.dueMonth, { month: 'long', year: 'numeric' })}</span><strong className="advanced-label">Paid in advance</strong></div>)}</div></>}<div className="advance-row"><label className="field-label" htmlFor="advance-month">Add advance month<input id="advance-month" type="month" value={advanceMonth} onChange={(event) => setAdvanceMonth(event.target.value)} /></label><button type="button" className="advance-button" disabled={addingAdvance || !advanceMonth} onClick={addAdvanceMonth}><CalendarPlus size={17} />{addingAdvance ? 'Adding' : 'Add month'}</button></div></>}
      </section>
      <aside className="panel summary-panel"><div className="panel-heading"><div className="step">02</div><div><p className="eyebrow">PAYMENT</p><h3>Review and collect</h3></div></div><div className="receipt"><div className="receipt-title"><Receipt size={18} />Payment summary</div><div className="receipt-line"><span>Maintenance</span><strong>{money(totals.maintenance)}</strong></div><div className="receipt-line"><span>Late fees</span><strong className={totals.lateFees ? 'late' : ''}>{money(totals.lateFees)}</strong></div><div className="receipt-total"><span>Total to collect</span><strong>{money(totals.total)}</strong></div></div><div className="fee-note"><CircleAlert size={17} /><span>{feePolicy ? `₹${feePolicy.perDay} per day after ${displayDate(feePolicy.startDate, { day: 'numeric', month: 'long' })}` : 'Late fee policy loaded from server'}</span></div><fieldset><legend>Payment mode</legend><div className="mode-grid">{[['cash', 'Cash'], ['upi', 'UPI'], ['bank', 'Bank transfer']].map(([value, label]) => <button type="button" className={`mode ${paymentMode === value ? 'active' : ''}`} key={value} onClick={() => setPaymentMode(value)}><CreditCard size={17} /><span>{label}</span></button>)}</div></fieldset>{paymentMode === 'cash' && <label className="field-label" htmlFor="collector">Collected by<input id="collector" value={collectedBy} onChange={(event) => setCollectedBy(event.target.value)} placeholder="Name of collector" /></label>}<button className="submit-button" disabled={saving || !totals.total} type="submit">{saving ? <LoaderCircle className="spin" size={18} /> : <IndianRupee size={18} />}{saving ? 'Recording payment' : 'Confirm payment'}</button>{message && <div className={`message ${message.type}`}>{message.text}</div>}</aside>
    </form>
  </main>;
}

const isAdminRoute = window.location.pathname.startsWith('/admin');
createRoot(document.getElementById('root')).render(isAdminRoute ? <App /> : <ResidentApp />);

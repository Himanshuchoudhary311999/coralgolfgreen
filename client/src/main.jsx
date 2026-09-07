import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BarChart3,
  CalendarPlus,
  Check,
  ChevronDown,
  CircleAlert,
  CreditCard,
  Download,
  IndianRupee,
  LoaderCircle,
  LogOut,
  Receipt,
  Search,
  Users,
} from "lucide-react";
import "./styles.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000/api";
const ADMIN_TOKEN_KEY = "cgg_admin_token";
const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;
const displayDate = (value, options) =>
  new Date(value).toLocaleDateString("en-IN", options);
const displayMonth = (value) =>
  displayDate(value, { month: "short", year: "numeric" });
const monthSpan = (start, end) =>
  (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
  end.getUTCMonth() -
  start.getUTCMonth() +
  1;
const adminHeaders = () => {
  const token = localStorage.getItem(ADMIN_TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
};

function residentStatus(flat) {
  if (flat.dues.length || flat.collectionDues?.length) return "pending";
  if (flat.advancedDues?.length) return "advance";
  return "paid";
}

function ResidentApp() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [flatInput, setFlatInput] = useState("");
  const [pinInput, setPinInput] = useState("");
  const [flats, setFlats] = useState([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState(null);
  const [loginError, setLoginError] = useState("");
  const [busy, setBusy] = useState(false);

  async function login(flatNo = flatInput, pin = pinInput) {
    setBusy(true);
    setLoginError("");
    try {
      const response = await fetch(`${API}/resident-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flatNo, pin }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      setFlats(data.flats || []);
      setLoggedIn(true);
      localStorage.setItem("cgg_flat", flatNo);
      localStorage.setItem("cgg_pin", pin);
    } catch (error) {
      setLoginError(
        error.message || "Could not connect to the maintenance service.",
      );
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const savedFlat = localStorage.getItem("cgg_flat");
    const savedPin = localStorage.getItem("cgg_pin");
    if (savedFlat && savedPin) login(savedFlat, savedPin);
  }, []);

  function logout() {
    localStorage.removeItem("cgg_flat");
    localStorage.removeItem("cgg_pin");
    setLoggedIn(false);
    setFlats([]);
    setFlatInput("");
    setPinInput("");
  }

  if (!loggedIn)
    return (
      <main
        className="resident-login"
        onKeyDown={(event) => {
          if (event.key === "Enter") login();
        }}
      >
        <div className="resident-login-masthead">
          <div className="resident-seal">
            <span>CGG</span>
          </div>
          <h1>Resident Login</h1>
          <div className="resident-tagline">
            Coral Golf Green Residents' Society
          </div>
        </div>
        <div className="resident-login-card">
          {loginError && (
            <div className="resident-login-error">{loginError}</div>
          )}
          <label>
            Flat Number
            <input
              value={flatInput}
              onChange={(event) => setFlatInput(event.target.value)}
              inputMode="numeric"
              placeholder="e.g. 104"
              maxLength={3}
            />
          </label>
          <label>
            PIN
            <input
              type="password"
              value={pinInput}
              onChange={(event) => setPinInput(event.target.value)}
              inputMode="numeric"
              placeholder="4-digit PIN"
              maxLength={4}
            />
          </label>
          <button
            className="resident-login-button"
            onClick={() => login()}
            disabled={busy}
          >
            {busy ? "Checking..." : "Log In"}
          </button>
        </div>
        <p className="resident-login-note">
          Use your own flat's PIN, shared by the Management Committee, to view
          the register.
        </p>
      </main>
    );

  const visible = flats.filter((flat) => {
    const status = residentStatus(flat);
    const matchesQuery =
      !query ||
      flat.flat_no.includes(query.toLowerCase()) ||
      flat.owner_name?.toLowerCase().includes(query.toLowerCase());
    return matchesQuery && (filter === "all" || status === filter);
  });
  const pendingCount = flats.filter(
    (flat) => residentStatus(flat) === "pending",
  ).length;
  const paidCount = flats.filter(
    (flat) => residentStatus(flat) === "paid",
  ).length;
  const advanceCount = flats.filter(
    (flat) => residentStatus(flat) === "advance",
  ).length;
  const outstanding = flats.reduce(
    (sum, flat) =>
      sum +
      flat.dues.reduce((total, due) => total + due.totalDue, 0) +
      (flat.collectionDues || []).reduce((total, due) => total + due.amount, 0),
    0,
  );
  const grouped = visible.reduce((groups, flat) => {
    const floor = flat.flat_no[0];
    (groups[floor] ||= []).push(flat);
    return groups;
  }, {});
  const filters = [
    ["all", `All ${flats.length}`],
    ["pending", `Pending ${pendingCount}`],
    ["paid", `Paid ${paidCount}`],
    ["advance", `Advance ${advanceCount}`],
  ];

  return (
    <main className="resident-wrap">
      <header className="resident-masthead">
        <div className="resident-seal">
          <span>CGG</span>
        </div>
        <div>
          <h1>Flat Maintenance Register</h1>
          <div className="resident-tagline">
            Coral Golf Green Residents' Society
          </div>
        </div>
      </header>
      <div className="resident-account">
        <button onClick={logout}>
          <LogOut size={13} /> Log out
        </button>
      </div>
      <hr className="resident-rule" />
      <div className="resident-meta">
        <span>{flats.length} flats · live register</span>
        <span className="resident-fee-note">
          late fee ₹20/day after the 10th
        </span>
      </div>
      <section className="resident-summary">
        <div>
          <strong>{flats.length}</strong>
          <span>Flats</span>
        </div>
        <div>
          <strong>{paidCount}</strong>
          <span>Paid Up</span>
        </div>
        <div>
          <strong>{pendingCount}</strong>
          <span>Pending</span>
        </div>
        <div className="due">
          <strong>{money(outstanding)}</strong>
          <span>Outstanding</span>
        </div>
      </section>
      <div className="resident-toolbar">
        <div className="resident-search">
          <Search size={15} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value.toLowerCase())}
            placeholder="Search flat no. or name..."
          />
        </div>
        <div className="resident-filters">
          {filters.map(([value, label]) => (
            <button
              className={filter === value ? "active" : ""}
              onClick={() => setFilter(value)}
              key={value}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="resident-count">
        Showing {visible.length} of {flats.length} flats
      </div>
      {Object.keys(grouped)
        .sort()
        .map((floor) => (
          <section key={floor}>
            <div className="resident-floor">
              <span>Floor {floor}</span>
              <span>{grouped[floor].length} flats</span>
            </div>
            {grouped[floor].map((flat) => {
              const status = residentStatus(flat);
              const collectionDues = flat.collectionDues || [];
              const collectionTotal = collectionDues.reduce(
                (sum, due) => sum + Number(due.amount || 0),
                0,
              );
              const total =
                flat.dues.reduce((sum, due) => sum + due.totalDue, 0) +
                collectionTotal;
              const paidDues = flat.paidDues || [];
              const advancedDues = flat.advancedDues || [];
              const latestAdvancedDue = advancedDues.at(-1);
              const currentMonth = new Date(
                Date.UTC(
                  new Date().getUTCFullYear(),
                  new Date().getUTCMonth(),
                  1,
                ),
              );
              const latestAdvancedMonth = latestAdvancedDue
                ? new Date(`${latestAdvancedDue.dueMonth}T00:00:00Z`)
                : currentMonth;
              const advancedAmount = latestAdvancedDue
                ? monthSpan(currentMonth, latestAdvancedMonth) *
                  Number(latestAdvancedDue.amount || 0)
                : 0;
              const months = [...flat.dues, ...paidDues, ...advancedDues];
              return (
                <React.Fragment key={flat.id}>
                  <button
                    className="resident-row"
                    onClick={() =>
                      (months.length || collectionDues.length) &&
                      setExpanded(expanded === flat.id ? null : flat.id)
                    }
                  >
                    <span className="resident-flatno">{flat.flat_no}</span>
                    <span className="resident-who">
                      <strong>{flat.owner_name || "Owner not assigned"}</strong>
                      <small>
                        <em>{flat.owner_role || "Resident"}</em>
                        <b className={`resident-pill ${status}`}>
                          {status === "advance"
                            ? "Advance"
                            : status[0].toUpperCase() + status.slice(1)}
                        </b>
                      </small>
                    </span>
                    <span className={`resident-amount ${total ? "" : "zero"}`}>
                      {total ? money(total) : "—"}
                      {total && <small>due</small>}
                    </span>
                  </button>
                  {expanded === flat.id && (
                    <div className="resident-expand">
                      <div>
                        <span>Pending months</span>
                        <strong>
                          {flat.dues
                            .map((due) =>
                              displayDate(due.dueMonth, {
                                month: "short",
                                year: "numeric",
                              }),
                            )
                            .join(", ") || "—"}
                        </strong>
                      </div>
                      <div>
                        <span>Pending amount</span>
                        <strong>
                          {money(
                            flat.dues.reduce(
                              (sum, due) => sum + due.maintenanceDue,
                              0,
                            ),
                          )}
                        </strong>
                      </div>
                      <div>
                        <span>Late fee</span>
                        <strong>
                          {money(
                            flat.dues.reduce(
                              (sum, due) => sum + due.lateFee,
                              0,
                            ),
                          )}
                        </strong>
                      </div>
                      {collectionDues.map((due) => (
                        <div key={due.id}>
                          <span>{due.name}</span>
                          <strong>{money(due.amount)}</strong>
                        </div>
                      ))}
                      <div>
                        <span>Paid maintenance months</span>
                        <strong>
                          {paidDues
                            .map((due) =>
                              displayDate(due.dueMonth, {
                                month: "short",
                                year: "numeric",
                              }),
                            )
                            .join(", ") || "—"}
                        </strong>
                      </div>
                      <div>
                        <span>Advance paid through</span>
                        <strong>
                          {advancedDues
                            .map((due) =>
                              displayDate(due.dueMonth, {
                                month: "short",
                                year: "numeric",
                              }),
                            )
                            .join(", ") || "—"}
                        </strong>
                      </div>
                      <div>
                        <span>Advance amount</span>
                        <strong>{money(advancedAmount)}</strong>
                      </div>
                      <div>
                        <span>Total due</span>
                        <strong>{money(total)}</strong>
                      </div>
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </section>
        ))}
      {!visible.length && (
        <div className="resident-empty">
          <Search size={34} />
          No flats match your search.
        </div>
      )}
      <footer className="resident-footer">
        Tap a flat for month-wise breakup · figures update as payments are
        recorded
      </footer>
    </main>
  );
}

function CustomFlatSelect({ flats, selectedFlatId, onSelect, showDues = true }) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const dropdownRef = React.useRef(null);

  const filtered = flats.filter(
    (flat) =>
      flat.flat_no.toLowerCase().includes(searchQuery.toLowerCase()) ||
      flat.owner_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedFlat = flats.find((f) => f.id === selectedFlatId);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    if (isOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  function handleSelect(flatId) {
    onSelect(flatId);
    setIsOpen(false);
    setSearchQuery("");
  }

  return (
    <div className="custom-select" ref={dropdownRef}>
      <button
        type="button"
        className={`select-trigger ${isOpen ? "open" : ""} ${selectedFlatId ? "selected" : ""}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="select-trigger-content">
          <Users size={18} />
          <span className="select-label">
            {selectedFlat
              ? `${selectedFlat.flat_no} · ${selectedFlat.owner_name}`
              : "Select flat and owner"}
          </span>
        </div>
        <ChevronDown size={18} className="select-chevron" />
      </button>
      {isOpen && (
        <div className="select-dropdown">
          <div className="select-search-box">
            <Search size={16} />
            <input
              type="text"
              placeholder="Search flat no or owner..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />
          </div>
          <div className="select-list">
            {filtered.length === 0 ? (
              <div className="select-empty">No flats found</div>
            ) : (
              filtered.map((flat) => {
                const pending = flat.dues.reduce((sum, due) => sum + Number(due.totalDue || 0), 0);
                return (
                  <button
                    key={flat.id}
                    type="button"
                    className={`select-item ${selectedFlatId === flat.id ? "active" : ""}`}
                    onClick={() => handleSelect(flat.id)}
                  >
                    <div className="select-item-main">
                      <div className="select-item-flat">{flat.flat_no}</div>
                      <div className="select-item-owner">{flat.owner_name}</div>
                    </div>
                    {showDues && (
                      <div className="select-item-dues">
                        <span className="dues-count">{flat.dues.length} month{flat.dues.length !== 1 ? "s" : ""}</span>
                        <span className="dues-amount">{money(pending)}</span>
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function App() {
  const [adminLoggedIn, setAdminLoggedIn] = useState(
    Boolean(localStorage.getItem(ADMIN_TOKEN_KEY)),
  );
  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminLoginError, setAdminLoginError] = useState("");
  const [adminLoggingIn, setAdminLoggingIn] = useState(false);
  const [flats, setFlats] = useState([]);
  const [selectedFlatId, setSelectedFlatId] = useState("");
  const [selectedDueIds, setSelectedDueIds] = useState([]);
  const [selectedCollectionDueIds, setSelectedCollectionDueIds] = useState([]);
  const [paymentMode, setPaymentMode] = useState("");
  const [includeLateFees, setIncludeLateFees] = useState(false);
  const [waiveLateFees, setWaiveLateFees] = useState(false);
  const [collectedBy, setCollectedBy] = useState("");
  const [feePolicy, setFeePolicy] = useState(null);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [advanceMonth, setAdvanceMonth] = useState("");
  const [addingAdvance, setAddingAdvance] = useState(false);
  const [message, setMessage] = useState(null);
  const [collectionName, setCollectionName] = useState("");
  const [collectionAmount, setCollectionAmount] = useState("");
  const [collectionDueDate, setCollectionDueDate] = useState("");
  const [creatingCollection, setCreatingCollection] = useState(false);
  const [dashboard, setDashboard] = useState(null);
  const [expenseCategory, setExpenseCategory] = useState("");
  const [expensePaymentMode, setExpensePaymentMode] = useState("cash");
  const [expenseSubcategory, setExpenseSubcategory] = useState("");
  const [expenseCategories, setExpenseCategories] = useState([]);
  const [categoryName, setCategoryName] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState("");
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const [savingCategory, setSavingCategory] = useState(false);
  const categoryInputRef = useRef(null);
  const [expenseSourceType, setExpenseSourceType] = useState("maintenance");
  const [expenseCollectionId, setExpenseCollectionId] = useState("");
  const [expenseDescription, setExpenseDescription] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [savingExpense, setSavingExpense] = useState(false);
  const [activeAdminTab, setActiveAdminTab] = useState("overview");
  const [historyMonth, setHistoryMonth] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const [reportMonth, setReportMonth] = useState(new Date().toISOString().slice(0, 7));
  const [outstandingReport, setOutstandingReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState("");
  const [selectedReceipt, setSelectedReceipt] = useState(null);
  const [receiptLoading, setReceiptLoading] = useState(false);

  function openAdminTab(tab, target) {
    setActiveAdminTab(tab);
    document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function loadOutstandingReport(month = reportMonth) {
    setReportLoading(true);
    setReportError("");
    try {
      const response = await fetch(`${API}/reports/outstanding?month=${month}`, { headers: adminHeaders() });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Report could not be loaded");
      setOutstandingReport(data);
    } catch (error) {
      setReportError(error.message);
    } finally {
      setReportLoading(false);
    }
  }

  async function openReceipt(paymentId) {
    setReceiptLoading(true);
    try {
      const response = await fetch(`${API}/payments/${paymentId}`, { headers: adminHeaders() });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Receipt could not be loaded");
      setSelectedReceipt(data);
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setReceiptLoading(false);
    }
  }

  function downloadOutstandingPdf() {
    if (!outstandingReport?.rows?.length) return;
    const escapeHtml = (value) => String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
    const rows = outstandingReport.rows.map((row) => `
      <tr>
        <td><strong>${escapeHtml(row.flatNo)}</strong><small>${escapeHtml(row.ownerName || "Owner not assigned")}</small></td>
        <td>${row.pendingMonths.map((month) => `<span class="month">${escapeHtml(displayMonth(month.dueMonth))}</span>`).join(" ")}</td>
        <td>${money(row.maintenanceDue)}</td>
        <td class="late">${money(row.lateFees)}</td>
        <td class="total">${money(row.totalDue)}</td>
      </tr>`).join("");
    const popup = window.open("", "_blank", "width=1100,height=800");
    if (!popup) return;
    popup.document.write(`<!doctype html><html><head><title>Outstanding report - ${escapeHtml(outstandingReport.reportMonth)}</title><style>
      *{box-sizing:border-box}body{margin:0;padding:32px;color:#19332f;background:#f0f7f2;font-family:Arial,sans-serif}main{max-width:1000px;margin:auto;padding:30px;border-radius:18px;background:#fff;box-shadow:0 12px 35px rgba(25,51,47,.12)}header{display:flex;justify-content:space-between;align-items:flex-end;padding-bottom:22px;border-bottom:4px solid #2d806e}h1{margin:0;color:#19332f;font-size:27px}h2{margin:6px 0 0;color:#7a8596;font-size:13px;font-weight:normal}.brand{color:#d16d3b;font-size:11px;font-weight:bold;letter-spacing:2px}.date{color:#7a8596;font-size:12px}.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:22px 0}.card{padding:15px;border-radius:12px;background:#edf7f1;border:1px solid #c7e4d5}.card:nth-child(2){background:#fff8ed;border-color:#f3d39d}.card:nth-child(3){background:#fff1f2;border-color:#fecdd3}.card:nth-child(4){background:#eaf0ff;border-color:#c7d2fe}.card b{display:block;font-size:19px}.card span{display:block;margin-top:5px;color:#64748b;font-size:10px}table{width:100%;border-collapse:collapse;font-size:11px}th{padding:11px 9px;color:#64748b;background:#f5f9f6;text-align:left;text-transform:uppercase;font-size:9px;letter-spacing:.06em}td{padding:13px 9px;border-bottom:1px solid #e5eee8}th:not(:first-child),td:not(:first-child){text-align:right}td:first-child strong,td:first-child small{display:block}td:first-child strong{color:#d16d3b;font-size:13px}td:first-child small{margin-top:3px;color:#7a8596;font-size:10px}.month{display:inline-block;padding:4px 6px;border-radius:5px;color:#526477;background:#eef4f0;font-size:10px}.late{color:#c2410c}.total{color:#2d806e;font-weight:bold}.footer{margin-top:20px;color:#8a95a5;font-size:10px}@media print{body{padding:0;background:#fff}main{box-shadow:none;max-width:none}button{display:none}.cards{break-inside:avoid}tr{break-inside:avoid}}
    </style></head><body><main><header><div><div class="brand">CORAL GOLF GREEN</div><h1>Flat-wise outstanding</h1><h2>Monthly report through ${escapeHtml(displayMonth(`${outstandingReport.reportMonth}-01`))}</h2></div><div class="date">Generated ${escapeHtml(displayDate(new Date(), { day: "numeric", month: "short", year: "numeric" }))}</div></header><div class="cards"><div class="card"><b>${outstandingReport.totals.flats}</b><span>Flats pending</span></div><div class="card"><b>${money(outstandingReport.totals.maintenanceDue)}</b><span>Maintenance outstanding</span></div><div class="card"><b>${money(outstandingReport.totals.lateFees)}</b><span>Late fees</span></div><div class="card"><b>${money(outstandingReport.totals.totalDue)}</b><span>Total outstanding</span></div></div><table><thead><tr><th>Flat / owner</th><th>Pending months</th><th>Maintenance</th><th>Late fees</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table><div class="footer">Late fees are calculated according to the active community fee policy.</div></main><script>window.onload=()=>{window.focus();window.print();};</script></body></html>`);
    popup.document.close();
  }

  useEffect(() => {
    if (adminLoggedIn && activeAdminTab === "report") loadOutstandingReport(reportMonth);
  }, [adminLoggedIn, activeAdminTab, reportMonth]);

  async function adminLogin(event) {
    event.preventDefault();
    setAdminLoggingIn(true);
    setAdminLoginError("");
    try {
      const response = await fetch(`${API}/admin-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: adminUsername,
          password: adminPassword,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not log in");
      localStorage.setItem(ADMIN_TOKEN_KEY, data.token);
      setAdminLoggedIn(true);
      setAdminPassword("");
    } catch (error) {
      setAdminLoginError(error.message);
    } finally {
      setAdminLoggingIn(false);
    }
  }

  function adminLogout() {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    setAdminLoggedIn(false);
    setFlats([]);
    setSelectedFlatId("");
  }

  async function loadDashboard() {
    const response = await fetch(`${API}/dashboard`, {
      headers: adminHeaders(),
    });
    if (!response.ok) throw new Error("Dashboard could not be loaded.");
    setDashboard(await response.json());
  }

  useEffect(() => {
    if (!adminLoggedIn) {
      setBusy(false);
      return undefined;
    }
    Promise.all([
      fetch(`${API}/flats`, { headers: adminHeaders() }),
      fetch(`${API}/config`, { headers: adminHeaders() }),
      fetch(`${API}/dashboard`, { headers: adminHeaders() }),
      fetch(`${API}/expense-categories`, { headers: adminHeaders() }),
    ])
      .then(async ([flatResponse, configResponse, dashboardResponse, categoryResponse]) => {
        if (
          flatResponse.status === 401 ||
          configResponse.status === 401 ||
          dashboardResponse.status === 401 ||
          categoryResponse.status === 401
        )
          throw new Error("Your admin session has expired.");
        return Promise.all([
          flatResponse.json(),
          configResponse.json(),
          dashboardResponse.json(),
          categoryResponse.json(),
        ]);
      })
      .then(([flatData, config, dashboardData, categoryData]) => {
        setFlats(flatData.flats || []);
        setFeePolicy(config.feePolicy);
        setDashboard(dashboardData);
        setExpenseCategories(categoryData.categories || []);
      })
      .catch((error) => {
        if (error.message.includes("session")) adminLogout();
        else
          setMessage({
            type: "error",
            text:
              error.message || "Could not connect to the maintenance service.",
          });
      })
      .finally(() => setBusy(false));
  }, [adminLoggedIn]);

  async function createExpense(event) {
    event.preventDefault();
    if (!expenseCategory.trim() || (expenseSourceType === "maintenance" && !expenseSubcategory) || !Number(expenseAmount)) return;
    setSavingExpense(true);
    setMessage(null);
    try {
      const response = await fetch(`${API}/expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...adminHeaders() },
        body: JSON.stringify({
          category: expenseSourceType === "maintenance" ? expenseSubcategory : expenseCategory,
          paymentMode: expensePaymentMode,
          sourceType: expenseSourceType,
          collectionId:
            expenseSourceType === "collection" ? expenseCollectionId : null,
          description: expenseDescription,
          amount: Number(expenseAmount),
          expenseDate,
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.message || "Expense could not be recorded");
      setExpenseCategory("");
      setExpenseSubcategory("");
      setExpenseDescription("");
      setExpenseAmount("");
      setExpenseCollectionId("");
      setMessage({ type: "success", text: "Expense recorded." });
      await loadDashboard();
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setSavingExpense(false);
    }
  }

  async function saveExpenseCategory(event) {
    event?.preventDefault();
    if (!categoryName.trim()) return;
    setSavingCategory(true);
    try {
      const response = await fetch(
        editingCategoryId ? `${API}/expense-categories/${editingCategoryId}` : `${API}/expense-categories`,
        {
          method: editingCategoryId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json", ...adminHeaders() },
          body: JSON.stringify({ name: categoryName }),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Category could not be saved");
      setExpenseCategories((current) => editingCategoryId
        ? current.map((category) => category.id === editingCategoryId ? data.category : category)
        : [...current, data.category].sort((left, right) => left.name.localeCompare(right.name)));
      setExpenseSubcategory(data.category.name);
      setCategoryName("");
      setEditingCategoryId("");
      setMessage({ type: "success", text: editingCategoryId ? "Expense category updated." : "Expense category added." });
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setSavingCategory(false);
    }
  }

  function toggleCategoryManager() {
    if (categoryManagerOpen) {
      setCategoryManagerOpen(false);
      return;
    }
    setEditingCategoryId("");
    setCategoryName("");
    setCategoryManagerOpen(true);
  }

  useEffect(() => {
    categoryInputRef.current?.focus();
  }, [categoryManagerOpen, editingCategoryId]);

  const flat = flats.find((item) => item.id === selectedFlatId);
  const selectedDues = (flat?.dues || []).filter((due) =>
    selectedDueIds.includes(due.id),
  );
  const selectedCollectionDues = (flat?.collectionDues || []).filter((due) =>
    selectedCollectionDueIds.includes(due.id),
  );
  const collectionTotal = selectedCollectionDues.reduce(
    (sum, due) => sum + due.amount,
    0,
  );
  const pendingLateFees = selectedDues.reduce(
    (sum, due) => sum + due.lateFee,
    0,
  );
  const totals = selectedDues.reduce(
    (result, due) => ({
      maintenance: result.maintenance + due.maintenanceDue,
      lateFees: result.lateFees + (includeLateFees ? due.lateFee : 0),
      total: result.total + due.maintenanceDue + (includeLateFees ? due.lateFee : 0),
    }),
    { maintenance: 0, lateFees: 0, total: collectionTotal },
  );

  function chooseFlat(id) {
    setSelectedFlatId(id);
    setSelectedDueIds([]);
    setSelectedCollectionDueIds([]);
    setIncludeLateFees(false);
    setWaiveLateFees(false);
    setMessage(null);
  }

  function toggleDue(id) {
    setSelectedDueIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }
  function toggleCollectionDue(id) {
    setSelectedCollectionDueIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  async function createCollection(event) {
    event.preventDefault();
    if (!collectionName.trim() || !Number(collectionAmount)) return;
    setCreatingCollection(true);
    setMessage(null);
    try {
      const response = await fetch(`${API}/collections`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...adminHeaders() },
        body: JSON.stringify({
          name: collectionName,
          amount: Number(collectionAmount),
          dueDate: collectionDueDate || null,
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.message || "Collection could not be created");
      const collectionDue = {
        ...data.collection,
        id: data.collection.id,
        collectionId: data.collection.id,
        status: "unpaid",
      };
      setFlats((current) =>
        current.map((item) => ({
          ...item,
          collectionDues: [
            ...(item.collectionDues || []),
            { ...collectionDue },
          ],
        })),
      );
      setDashboard((current) => current
        ? {
            ...current,
            collections: [data.collection, ...(current.collections || [])],
          }
        : current);
      setCollectionName("");
      setCollectionAmount("");
      setCollectionDueDate("");
      setMessage({
        type: "success",
        text: `${data.collection.name} added for ${data.flatsApplied} flats.`,
      });
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setCreatingCollection(false);
    }
  }

  async function addAdvanceMonth() {
    if (!selectedFlatId || !advanceMonth) return;
    setAddingAdvance(true);
    setMessage(null);
    try {
      const response = await fetch(
        `${API}/flats/${selectedFlatId}/advance-dues`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...adminHeaders() },
          body: JSON.stringify({ dueMonth: advanceMonth }),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.message || "Advance month could not be added");
      setFlats((current) =>
        current.map((item) =>
          item.id === selectedFlatId
            ? {
                ...item,
                dues: [...item.dues, data.due].sort((left, right) =>
                  left.dueMonth.localeCompare(right.dueMonth),
                ),
              }
            : item,
        ),
      );
      setAdvanceMonth("");
      setMessage({ type: "success", text: "Advance month added." });
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setAddingAdvance(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (
      !selectedFlatId ||
      (!selectedDueIds.length && !selectedCollectionDueIds.length) ||
      !paymentMode ||
      (paymentMode === "cash" && !collectedBy.trim())
    ) {
      setMessage({
        type: "error",
        text: "Select a flat, at least one due or collection, payment mode, and collector for cash.",
      });
      return;
    }
    if (includeLateFees && waiveLateFees) {
      setMessage({
        type: "error",
        text: "Choose either Collect pending late fees or Waive pending late fees.",
      });
      return;
    }
    if (waiveLateFees && !window.confirm(
      `Waive ${money(pendingLateFees)} late fees and confirm this payment? This action cannot be undone.`
    )) return;
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(`${API}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...adminHeaders() },
        body: JSON.stringify({
          flatId: selectedFlatId,
          dueIds: selectedDueIds,
          collectionDueIds: selectedCollectionDueIds,
          paymentMode,
          collectedBy,
          includeLateFees,
          waiveLateFees,
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.message || "Payment could not be recorded");
      setMessage({ type: "success", text: data.message });
      setFlats((current) =>
        current.map((item) =>
          item.id === selectedFlatId
            ? {
                ...item,
                dues: item.dues.flatMap((due) => {
                  if (!selectedDueIds.includes(due.id)) return [due];
                  const maintenanceDue = waiveLateFees ? due.maintenanceDue : 0;
                  const lateFee = waiveLateFees || includeLateFees ? 0 : due.lateFee;
                  return maintenanceDue > 0 || lateFee > 0
                    ? [{
                        ...due,
                        maintenanceDue,
                        lateFee,
                        totalDue: lateFee,
                        status: "partially_paid",
                      }]
                    : [];
                }),
                collectionDues: (item.collectionDues || []).filter(
                  (due) => !selectedCollectionDueIds.includes(due.id),
                ),
              }
            : item,
        ),
      );
      setSelectedDueIds([]);
      setSelectedCollectionDueIds([]);
      setPaymentMode("");
      setIncludeLateFees(false);
      setWaiveLateFees(false);
      setCollectedBy("");
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setSaving(false);
    }
  }

  const transactionItems = [
    ...(dashboard?.payments || []).map((p) => ({
      id: p.id,
      type: "maintenance",
      description: `${p.flatNo} · ${p.ownerName}`,
      category: (p.receiptNo ?? p.receipt_no) != null ? `Receipt #${p.receiptNo ?? p.receipt_no}` : "Maintenance payment",
      mode: (p.paymentMode || p.payment_mode || "payment").toUpperCase(),
      amount: p.amount,
      date: p.paidAt,
      details: p.months ? `Paid for: ${p.months}` : "Paid maintenance; month details load after API refresh",
      breakdown: `${money(p.maintenanceAmount || p.amount)} maintenance${p.lateFeeAmount ? ` · ${money(p.lateFeeAmount)} late fee` : ""}`,
      meta: p.paidAt ? `${displayDate(p.paidAt, { day: "numeric", month: "short", year: "numeric" })} at ${new Date(p.paidAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}${p.collectedBy ? ` · Collected by ${p.collectedBy}` : ""}` : "Date unavailable",
    })),
    ...(dashboard?.expenses || []).map((e) => ({
      id: e.id,
      type: "expense",
      description: e.description || displayDate(e.expenseDate, { day: "numeric", month: "short", year: "numeric" }),
      category: e.category,
      amount: e.amount,
      date: e.expenseDate,
      details: e.description || "Expense",
      breakdown: e.sourceName || e.sourceType || "Expense",
      meta: `${displayDate(e.expenseDate, { day: "numeric", month: "short", year: "numeric" })} · ${e.paymentMode || "posted"}`,
    })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));
  const filteredTransactions = historyMonth
    ? transactionItems.filter((item) => String(item.date || "").slice(0, 7) === historyMonth)
    : transactionItems;
  const historyPageSize = 8;
  const historyPageCount = Math.max(1, Math.ceil(filteredTransactions.length / historyPageSize));
  const visibleTransactions = filteredTransactions.slice(
    (historyPage - 1) * historyPageSize,
    historyPage * historyPageSize,
  );

  if (!adminLoggedIn)
    return (
      <main className="admin-login">
        <div className="admin-login-wrapper">
          <div className="admin-login-header">
            <div className="admin-login-hero">
              <div className="admin-login-seal">CG</div>
              <h1>Coral Golf Green</h1>
              <p className="admin-login-subtitle">Management Office</p>
            </div>
            <div className="admin-login-divider" />
          </div>
          <div className="admin-login-card">
            <div>
              <h2>Maintenance Desk</h2>
              <p className="admin-login-copy">
                Sign in to manage maintenance payments, track community collections, and record expenses.
              </p>
            </div>
            {adminLoginError && (
              <div className="message error">{adminLoginError}</div>
            )}
            <form onSubmit={adminLogin}>
              <label className="field-label">
                <span>Username</span>
                <div className="input-icon-wrap">
                  <Users size={16} />
                  <input
                    value={adminUsername}
                    onChange={(event) => setAdminUsername(event.target.value)}
                    autoComplete="username"
                    placeholder="Staff username"
                  />
                </div>
              </label>
              <label className="field-label">
                <span>Password</span>
                <div className="input-icon-wrap">
                  <CreditCard size={16} />
                  <input
                    type="password"
                    value={adminPassword}
                    onChange={(event) => setAdminPassword(event.target.value)}
                    autoComplete="current-password"
                    placeholder="Enter password"
                  />
                </div>
              </label>
              <button
                className="submit-button login-submit"
                type="submit"
                disabled={adminLoggingIn}
              >
                {adminLoggingIn ? (
                  <><LoaderCircle className="spin" size={16} /> Signing in...</>
                ) : (
                  <><CreditCard size={16} /> Sign in</>
                )}
              </button>
            </form>
          </div>
        </div>
      </main>
    );
  if (busy)
    return (
      <main className="loading-screen">
        <LoaderCircle className="spin" size={34} />
        <span>Loading community records</span>
      </main>
    );

  return (
    <main className={`app-shell admin-view-${activeAdminTab}`}>
      <header className="topbar">
        <div className="brand-mark">CG</div>
        <div>
          <p className="eyebrow">CORAL GOLF GREEN</p>
          <h1>Maintenance desk</h1>
        </div>
        <div className="header-status">
          <span className="status-dot" />
          Live records
          <button className="admin-logout" onClick={adminLogout}>
            Log out
          </button>
        </div>
      </header>
      <section className="intro">
        <div>
          <p className="eyebrow">COLLECTIONS / 2026</p>
          <h2>
            Keep every home
            <br />
            <em>in good standing.</em>
          </h2>
        </div>
        <p className="intro-copy">
          Record maintenance payments against the right month. Outstanding dues
          after 10 August carry a daily late fee.
        </p>
      </section>
      <nav className="admin-menu" aria-label="Admin sections">
        {[
          ['overview', 'Dashboard', 'overview', BarChart3],
          ['payment', 'Record payment', 'payments', IndianRupee],
          ['collection', 'Collections', 'new-collection', Users],
          ['expense', 'Expenses', 'expenses', Receipt],
          ['history', 'History', 'history', CalendarPlus],
          ['report', 'Outstanding report', 'outstanding-report', BarChart3]
        ].map(([tab, label, target, Icon]) => (
          <button
            className={`menu-item ${activeAdminTab === tab ? "active" : ""}`}
            onClick={() => openAdminTab(tab, target)}
            key={tab}
            title={label}
          >
            <Icon size={16} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      {dashboard && (
        <section className="dashboard" id="overview">
          <div className="dashboard-heading">
            <div>
              <p className="eyebrow">FINANCIAL OVERVIEW</p>
              <h3>Community dashboard</h3>
            </div>
            <span className="dashboard-net">
              Net balance{" "}
              {money(
                Number(dashboard.summary.total_collected || 0) -
                  Number(dashboard.summary.total_expenses || 0),
              )}
            </span>
          </div>
          <div className="dashboard-kpis">
            <div>
              <strong>{money(dashboard.summary.maintenance_collected)}</strong>
              <span>Maintenance collected</span>
            </div>
            <div>
              <strong>{money(dashboard.summary.collections_collected)}</strong>
              <span>Event collections</span>
            </div>
            <div>
              <strong>{money(dashboard.summary.total_collected)}</strong>
              <span>Total collected</span>
            </div>
            <div className="expense-kpi">
              <strong>{money(dashboard.summary.total_expenses)}</strong>
              <span>Total expenses</span>
            </div>
            <div>
              <strong>{dashboard.summary.pending_maintenance}</strong>
              <span>Pending maintenance</span>
            </div>
            <div>
              <strong>{dashboard.summary.pending_collections}</strong>
              <span>Pending event dues</span>
            </div>
          </div>
          <div className="dashboard-source-balances">
            <div className="dashboard-section-title">Source balances</div>
            <div className="table-scroll">
              <table className="balance-table">
                <thead><tr><th>Source</th><th>Cash remaining</th><th>Bank remaining</th><th>Total remaining</th></tr></thead>
                <tbody>{(dashboard.sources || []).map((source) => (
                  <tr key={source.id}><td>{source.name}</td><td className={Number(source.cashBalance) < 0 ? "expense-text" : "balance-text"}>{money(source.cashBalance)}</td><td className={Number(source.bankBalance) < 0 ? "expense-text" : "balance-text"}>{money(source.bankBalance)}</td><td className={Number(source.balance) < 0 ? "expense-text" : "balance-text"}>{money(source.balance)}</td></tr>
                ))}</tbody>
              </table>
            </div>
          </div>
          <div className="dashboard-grid">
            <div className="dashboard-table">
              <div className="dashboard-section-title">Monthly lifecycle</div>
              {dashboard.monthly.length ? (
                <div className="table-scroll">
                  <table className="balance-table">
                    <thead>
                      <tr>
                        <th>Month</th>
                        <th>Maintenance</th>
                        <th>Events</th>
                        <th>Expenses</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboard.monthly.map((row) => (
                        <tr key={row.month}>
                          <td>{displayMonth(row.month)}</td>
                          <td>{money(row.maintenance)}</td>
                          <td>{money(row.collections)}</td>
                          <td className="expense-text">
                            {money(row.expenses)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="dashboard-empty">No financial activity yet.</p>
              )}
            </div>
          </div>
          <div className="dashboard-grid">
            <div className="dashboard-table" id="collections">
              <div className="dashboard-section-title">
                Community collections lifecycle
              </div>
              {dashboard.collections.length ? (
                <div className="table-scroll">
                  <table className="balance-table">
                    <thead>
                      <tr>
                        <th>Collection</th>
                        <th>Applied</th>
                        <th>Paid</th>
                        <th>Collected</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboard.collections.map((collection) => (
                        <tr key={collection.id}>
                          <td>{collection.name}</td>
                          <td>{collection.flats_applied}</td>
                          <td>{collection.flats_paid}</td>
                          <td>{money(collection.collected)}</td>
                          <td>
                            <span
                              className={`collection-status ${collection.status}`}
                            >
                              {collection.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="dashboard-empty">
                  No community collections created.
                </p>
              )}
            </div>
            <div className="dashboard-table" id="history">
              <div className="transaction-panel-heading">
                <div>
                  <div className="dashboard-section-title">Recent transactions</div>
                  <small>{filteredTransactions.length} transaction{filteredTransactions.length === 1 ? "" : "s"}</small>
                </div>
                <label className="history-filter">
                  <span>Month</span>
                  <input
                    type="month"
                    value={historyMonth}
                    onChange={(event) => {
                      setHistoryMonth(event.target.value);
                      setHistoryPage(1);
                    }}
                  />
                </label>
              </div>
              {filteredTransactions.length ? (
                <div className="expense-list history-list">
                  {visibleTransactions.map((item) => (
                      <div
                        className={`expense-item ${item.type} ${item.type === "maintenance" ? "transaction-clickable" : ""}`}
                        key={`${item.type}-${item.id}`}
                        onClick={() => item.type === "maintenance" && openReceipt(item.id)}
                        role={item.type === "maintenance" ? "button" : undefined}
                        tabIndex={item.type === "maintenance" ? 0 : undefined}
                        onKeyDown={(event) => {
                          if (item.type === "maintenance" && (event.key === "Enter" || event.key === " ")) openReceipt(item.id);
                        }}
                      >
                        <div className="transaction-copy">
                          <div className="transaction-heading">
                            <strong>{item.category}</strong>
                            {item.mode && <span>{item.mode}</span>}
                          </div>
                          <small className="transaction-person">{item.description}</small>
                          <small className="transaction-details">{item.details}</small>
                          <small className="transaction-breakdown">{item.breakdown}</small>
                          <small className="transaction-meta">{item.meta}</small>
                        </div>
                        <div className="transaction-amount">
                          <b>{money(item.amount)}</b>
                          <small>{item.type === "expense" ? "Expense" : "Received"}</small>
                        </div>
                      </div>
                    ))}
                  <div className="history-pagination">
                    <button type="button" disabled={historyPage <= 1} onClick={() => setHistoryPage((page) => page - 1)}>Previous</button>
                    <span>Page {historyPage} of {historyPageCount}</span>
                    <button type="button" disabled={historyPage >= historyPageCount} onClick={() => setHistoryPage((page) => page + 1)}>Next</button>
                  </div>
                </div>
              ) : (
                <p className="dashboard-empty">No transactions recorded.</p>
              )}
            </div>
          </div>
        </section>
      )}
      <section className="report-page" id="outstanding-report">
        <div className="report-card">
          <div className="report-heading">
            <div>
              <p className="eyebrow">MONTHLY REPORT</p>
              <h3>Flat-wise outstanding</h3>
              <p className="report-subtitle">Pending maintenance months and calculated late fees through the selected month.</p>
            </div>
            <label className="report-month-field">
              <span>As of month</span>
              <input type="month" value={reportMonth} onChange={(event) => setReportMonth(event.target.value)} />
            </label>
            <button className="report-download-button pdf" type="button" disabled={!outstandingReport?.rows?.length || reportLoading} onClick={downloadOutstandingPdf}>
              <Download size={15} />
              Download PDF
            </button>
          </div>
          {reportLoading ? (
            <div className="report-empty">Loading outstanding report...</div>
          ) : reportError ? (
            <div className="report-error">{reportError}</div>
          ) : outstandingReport ? (
            <>
              <div className="report-totals">
                <div><strong>{outstandingReport.totals.flats}</strong><span>Flats pending</span></div>
                <div><strong>{money(outstandingReport.totals.maintenanceDue)}</strong><span>Maintenance</span></div>
                <div><strong className="report-late">{money(outstandingReport.totals.lateFees)}</strong><span>Late fees</span></div>
                <div><strong className="report-total">{money(outstandingReport.totals.totalDue)}</strong><span>Total outstanding</span></div>
              </div>
              {outstandingReport.rows.length ? (
                <div className="report-table-wrap">
                  <table className="outstanding-table">
                    <thead><tr><th>Flat / owner</th><th>Pending months</th><th>Maintenance</th><th>Late fees</th><th>Total</th></tr></thead>
                    <tbody>
                      {outstandingReport.rows.map((row) => (
                        <tr key={row.flatNo}>
                          <td><strong>{row.flatNo}</strong><small>{row.ownerName || "Owner not assigned"}</small></td>
                          <td><div className="pending-months">{row.pendingMonths.map((month) => <span key={month.dueMonth}>{displayMonth(month.dueMonth)}</span>)}</div></td>
                          <td>{money(row.maintenanceDue)}</td>
                          <td className="report-late">{money(row.lateFees)}</td>
                          <td><strong>{money(row.totalDue)}</strong></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <div className="report-empty">No outstanding dues through {displayMonth(`${reportMonth}-01`)}.</div>}
            </>
          ) : <div className="report-empty">Choose a month to load the report.</div>}
        </div>
      </section>
      <section className="expense-page" id="expenses">
        <form className="expense-form" onSubmit={createExpense}>
          <div className="dashboard-section-title">Record expense</div>
          <label className="field-label">Source / category
            <select value={expenseSourceType === "maintenance" ? "maintenance" : expenseCollectionId} onChange={(event) => { const value = event.target.value; setExpenseSourceType(value === "maintenance" ? "maintenance" : "collection"); setExpenseCollectionId(value === "maintenance" ? "" : value); setExpenseCategory(value === "maintenance" ? "" : dashboard.collections.find((collection) => collection.id === value)?.name || ""); setExpenseSubcategory(""); }}>
              <option value="maintenance">Maintenance</option>
              {dashboard?.collections?.map((collection) => <option value={collection.id} key={collection.id}>{collection.name}</option>)}
            </select>
          </label>
          {expenseSourceType === "maintenance" && <label className="field-label">Maintenance subcategory
            <select value={expenseSubcategory} onChange={(event) => setExpenseSubcategory(event.target.value)}>
              <option value="">Select expense type</option>
              {expenseCategories.map((category) => <option value={category.name} key={category.id}>{category.name}</option>)}
            </select>
          </label>}
          {expenseSourceType === "maintenance" && (
            <div className="category-manager">
              <div className="category-manager-actions">
                <button type="button" className="category-manager-toggle" onClick={toggleCategoryManager}>
                  <span className="category-manager-icon">{categoryManagerOpen ? "−" : "+"}</span>
                  {categoryManagerOpen ? "Hide categories" : "Manage categories"}
                </button>
              </div>
              {categoryManagerOpen && <div className="category-manager-body">
                  <div className="category-manager-title">
                    <strong>{editingCategoryId ? "Edit subcategory" : "Add new subcategory"}</strong>
                    <span>{editingCategoryId ? "Change the name below, then save it." : "Type the new category name below."}</span>
                  </div>
                  <div className="category-add-form">
                    <label htmlFor="category-name-input">Category name</label>
                    <input id="category-name-input" ref={categoryInputRef} aria-label={editingCategoryId ? "Edit subcategory name" : "New subcategory name"} value={categoryName} onChange={(event) => setCategoryName(event.target.value)} placeholder={editingCategoryId ? "Change category name" : "Type new category name"} maxLength={120} />
                    <div className="category-form-actions">
                      <button type="button" className="advance-button" disabled={savingCategory || !categoryName.trim()} onClick={saveExpenseCategory}>{savingCategory ? "Saving..." : editingCategoryId ? "Save name" : "Add category"}</button>
                      {editingCategoryId && <button type="button" className="category-cancel" onClick={() => { setEditingCategoryId(""); setCategoryName(""); }}>Cancel</button>}
                    </div>
                  </div>
                  <div className="category-list">
                    {expenseCategories.map((category) => (
                      <div key={category.id} className="category-item">
                        <span>{category.name}</span>
                        <button type="button" onClick={() => { setEditingCategoryId(category.id); setCategoryName(category.name); }}>Edit</button>
                      </div>
                    ))}
                  </div>
                </div>}
              </div>
          )}
          <label className="field-label">Paid from
            <select value={expensePaymentMode} onChange={(event) => setExpensePaymentMode(event.target.value)}><option value="cash">Cash</option><option value="bank">Bank balance</option></select>
          </label>
          <label className="field-label">Amount<input className="expense-amount-input" type="number" min="0.01" step="0.01" inputMode="decimal" value={expenseAmount} onChange={(event) => setExpenseAmount(event.target.value)} placeholder="Amount" /></label>
          <label className="field-label">Date<input type="date" value={expenseDate} onChange={(event) => setExpenseDate(event.target.value)} /></label>
          <label className="field-label">Description<input value={expenseDescription} onChange={(event) => setExpenseDescription(event.target.value)} placeholder="Optional details" /></label>
          <button className="advance-button" disabled={savingExpense}>{savingExpense ? "Saving..." : "Record expense"}</button>
        </form>
      </section>
      <form className="panel collection-create" id="new-collection" onSubmit={createCollection}>
        <div className="panel-heading">
          <div className="step">NEW</div>
          <div>
            <p className="eyebrow">COMMUNITY COLLECTION</p>
            <h3>Create for every flat</h3>
          </div>
        </div>
        <div className="collection-fields">
          <label className="field-label">
            Event or collection name
            <input
              value={collectionName}
              onChange={(event) => setCollectionName(event.target.value)}
              placeholder="e.g. Diwali decoration"
            />
          </label>
          <label className="field-label">
            Amount per flat
            <input
              type="number"
              min="1"
              step="0.01"
              value={collectionAmount}
              onChange={(event) => setCollectionAmount(event.target.value)}
              placeholder="Amount"
            />
          </label>
          <label className="field-label">
            Due date
            <input
              type="date"
              value={collectionDueDate}
              onChange={(event) => setCollectionDueDate(event.target.value)}
            />
          </label>
          <button className="advance-button" disabled={creatingCollection}>
            {creatingCollection ? "Creating..." : "Apply to all flats"}
          </button>
        </div>
      </form>
      {flat && flat.collectionDues?.length > 0 && (
        <section className="panel collection-selection">
          <div className="panel-heading">
            <div className="step">EVENT</div>
            <div>
              <p className="eyebrow">COMMUNITY COLLECTIONS</p>
              <h3>Choose event dues</h3>
            </div>
          </div>
          <div className="due-list">
            {flat.collectionDues.map((due) => (
              <button
                type="button"
                className={`due-row ${selectedCollectionDueIds.includes(due.id) ? "selected" : ""}`}
                key={due.id}
                onClick={() => toggleCollectionDue(due.id)}
              >
                <span className="checkbox">
                  {selectedCollectionDueIds.includes(due.id) && (
                    <Check size={14} />
                  )}
                </span>
                <span className="due-month">
                  <strong>{due.name}</strong>
                  <small>
                    {due.dueDate
                      ? `Due ${displayDate(due.dueDate, { day: "numeric", month: "short", year: "numeric" })}`
                      : "Community collection"}
                  </small>
                </span>
                <span className="due-amount">{money(due.amount)}</span>
              </button>
            ))}
          </div>
        </section>
      )}
      <form className="workspace" id="payments" onSubmit={submit}>
        <section className="panel selection-panel">
          <div className="panel-heading">
            <div className="step">01</div>
            <div>
              <p className="eyebrow">ACCOUNT</p>
              <h3>Choose a residence</h3>
            </div>
          </div>
          <label className="field-label">Flat and owner</label>
          <CustomFlatSelect
            flats={flats}
            selectedFlatId={selectedFlatId}
            onSelect={chooseFlat}
          />
          {flat && (
            <div className="account-strip">
              <span>{flat.flat_no}</span>
              <strong>{flat.owner_name}</strong>
              <span className="due-count">
                {flat.dues.length} unpaid month
                {flat.dues.length === 1 ? "" : "s"}
                <b className="pending-total">
                  {money(
                    flat.dues.reduce(
                      (total, due) => total + Number(due.totalDue || 0),
                      0,
                    ),
                  )}{" "}
                  pending
                </b>
              </span>
            </div>
          )}
          {flat && (
            <>
              <div className="section-label">
                <span>Select month(s)</span>
                <button
                  type="button"
                  onClick={() =>
                    setSelectedDueIds(flat.dues.map((due) => due.id))
                  }
                >
                  Select all
                </button>
              </div>
              <div className="due-list">
                {flat.dues.length ? (
                  flat.dues.map((due) => (
                    <React.Fragment key={due.id}>
                      <button
                        type="button"
                        className={`due-row ${selectedDueIds.includes(due.id) ? "selected" : ""}`}
                        onClick={() => toggleDue(due.id)}
                      >
                        <span className="checkbox">
                          {selectedDueIds.includes(due.id) && <Check size={14} />}
                        </span>
                        <span className="due-month">
                          {displayDate(due.dueMonth, {
                            month: "long",
                            year: "numeric",
                          })}
                          <small>{money(due.maintenanceDue)} maintenance · {money(due.lateFee)} late fee pending</small>
                        </span>
                        <span className="due-amount">{money(due.totalDue)}</span>
                      </button>
                    </React.Fragment>
                  ))
                ) : (
                  <div className="empty-state">
                    <Check size={22} />
                    All maintenance is paid up.
                  </div>
                )}
              </div>
              {flat.paidDues?.length > 0 && (
                <>
                  <div className="section-label paid-heading">
                    <span>Paid months</span>
                    <span>
                      {flat.paidDues.length} month
                      {flat.paidDues.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="due-list advanced-list">
                    {flat.paidDues.map((due) => (
                      <div className="due-row advanced-row-item" key={due.id}>
                        <Check size={18} />
                        <span className="due-month">
                          {displayDate(due.dueMonth, {
                            month: "long",
                            year: "numeric",
                          })}
                        </span>
                        <strong className="advanced-label">Paid</strong>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {flat.advancedDues?.length > 0 && (
                <>
                  <div className="section-label advanced-heading">
                    <span>Advanced paid</span>
                    <span>
                      {flat.advancedDues.length} month
                      {flat.advancedDues.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="due-list advanced-list">
                    {flat.advancedDues.map((due) => (
                      <div className="due-row advanced-row-item" key={due.id}>
                        <Check size={18} />
                        <span className="due-month">
                          {displayDate(due.dueMonth, {
                            month: "long",
                            year: "numeric",
                          })}
                        </span>
                        <strong className="advanced-label">
                          Paid in advance
                        </strong>
                      </div>
                    ))}
                  </div>
                </>
              )}
              <div className="advance-row">
                <label className="field-label" htmlFor="advance-month">
                  Add advance month
                  <input
                    id="advance-month"
                    type="month"
                    value={advanceMonth}
                    onChange={(event) => setAdvanceMonth(event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="advance-button"
                  disabled={addingAdvance || !advanceMonth}
                  onClick={addAdvanceMonth}
                >
                  <CalendarPlus size={17} />
                  {addingAdvance ? "Adding" : "Add month"}
                </button>
              </div>
            </>
          )}
        </section>
        <aside className="panel summary-panel">
          <div className="panel-heading">
            <div className="step">02</div>
            <div>
              <p className="eyebrow">PAYMENT</p>
              <h3>Review and collect</h3>
            </div>
          </div>
          <div className="receipt">
            <div className="receipt-title">
              <Receipt size={18} />
              Payment summary
            </div>
            <div className="receipt-line">
              <span>Maintenance</span>
              <strong>{money(totals.maintenance)}</strong>
            </div>
            <div className="receipt-line">
              <span>Late fees</span>
              <strong className={pendingLateFees ? "late" : ""}>
                {money(pendingLateFees)}
              </strong>
            </div>
            <label
              className={`late-fee-toggle ${includeLateFees ? "selected" : ""} ${pendingLateFees <= 0 ? "disabled" : ""}`}
              title={pendingLateFees > 0 ? "Add pending late fees to this payment" : "No late fees are currently pending"}
            >
              <input
                id="include-late-fees"
                type="checkbox"
                checked={includeLateFees}
                disabled={pendingLateFees <= 0 || waiveLateFees}
                onChange={(event) => setIncludeLateFees(event.target.checked)}
              />
              <span className="late-fee-toggle-copy">
                <strong>Collect pending late fees</strong>
                <small>
                  {pendingLateFees > 0
                    ? includeLateFees
                      ? `${money(pendingLateFees)} added to this payment`
                      : `${money(pendingLateFees)} pending, not included`
                    : "No late fees pending"}
                </small>
              </span>
            </label>
            <label
              className={`late-fee-toggle waiver-toggle ${waiveLateFees ? "selected" : ""} ${pendingLateFees <= 0 ? "disabled" : ""}`}
              title={pendingLateFees > 0 ? "Remove the pending late fees when confirming this payment" : "No late fees are currently pending"}
            >
              <input
                id="waive-late-fees"
                type="checkbox"
                checked={waiveLateFees}
                disabled={pendingLateFees <= 0 || includeLateFees}
                onChange={(event) => {
                  setWaiveLateFees(event.target.checked);
                  if (event.target.checked) setIncludeLateFees(false);
                }}
              />
              <span className="late-fee-toggle-copy">
                <strong>Waive pending late fees</strong>
                <small>
                  {pendingLateFees > 0
                    ? waiveLateFees
                      ? `${money(pendingLateFees)} will be waived on confirm`
                      : "Waiver will be recorded with this confirmation"
                    : "No late fees pending"}
                </small>
              </span>
            </label>
            <div className="receipt-total">
              <span>Total to collect</span>
              <strong>{money(totals.total)}</strong>
            </div>
          </div>
          <div className="fee-note">
            <CircleAlert size={17} />
            <span>
              {feePolicy
                ? `₹${feePolicy.perDay} per day after ${displayDate(feePolicy.startDate, { day: "numeric", month: "long" })}`
                : "Late fee policy loaded from server"}
            </span>
          </div>
          <fieldset>
            <legend>Payment mode</legend>
            <div className="mode-grid">
              {[
                ["cash", "Cash"],
                ["upi", "UPI"],
                ["bank", "Bank transfer"],
              ].map(([value, label]) => (
                <button
                  type="button"
                  className={`mode ${paymentMode === value ? "active" : ""}`}
                  key={value}
                  onClick={() => setPaymentMode(value)}
                >
                  <CreditCard size={17} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </fieldset>
          {paymentMode === "cash" && (
            <label className="field-label" htmlFor="collector">
              Collected by
              <input
                id="collector"
                value={collectedBy}
                onChange={(event) => setCollectedBy(event.target.value)}
                placeholder="Name of collector"
              />
            </label>
          )}
          <button
            className="submit-button"
            disabled={saving || (!totals.total && !waiveLateFees)}
            type="submit"
          >
            {saving ? (
              <LoaderCircle className="spin" size={18} />
            ) : (
              <IndianRupee size={18} />
            )}
            {saving ? "Recording payment" : "Confirm payment"}
          </button>
          {message && (
            <div className={`message ${message.type}`}>{message.text}</div>
          )}
        </aside>
      </form>
      {selectedReceipt && (
        <div className="receipt-modal-backdrop" role="presentation" onClick={() => setSelectedReceipt(null)}>
          <section className="receipt-modal" role="dialog" aria-modal="true" aria-labelledby="receipt-title" onClick={(event) => event.stopPropagation()}>
            <button className="receipt-modal-close" type="button" onClick={() => setSelectedReceipt(null)} aria-label="Close receipt details">×</button>
            <p className="eyebrow">PAYMENT RECEIPT</p>
            <h3 id="receipt-title">Receipt #{selectedReceipt.receiptNo}</h3>
            <div className="receipt-detail-grid">
              <div><span>Flat</span><strong>{selectedReceipt.flatNo}</strong></div>
              <div><span>Owner</span><strong>{selectedReceipt.ownerName || "Not assigned"}</strong></div>
              <div><span>Paid on</span><strong>{displayDate(selectedReceipt.paidAt, { day: "numeric", month: "short", year: "numeric" })}</strong></div>
              <div><span>Payment mode</span><strong>{selectedReceipt.paymentMode.toUpperCase()}</strong></div>
              {selectedReceipt.referenceNo && <div><span>Reference</span><strong>{selectedReceipt.referenceNo}</strong></div>}
              {selectedReceipt.collectedBy && <div><span>Collected by</span><strong>{selectedReceipt.collectedBy}</strong></div>}
            </div>
            <div className="receipt-allocation-title">Paid for</div>
            <div className="receipt-allocation-list">
              {selectedReceipt.allocations.map((allocation) => (
                <div key={allocation.dueMonth}>
                  <strong>{displayMonth(allocation.dueMonth)}</strong>
                  <span>{money(allocation.maintenanceAmount)} maintenance{allocation.lateFeeAmount ? ` + ${money(allocation.lateFeeAmount)} late fee` : ""}</span>
                  <b>{money(allocation.amount)}</b>
                </div>
              ))}
            </div>
            {selectedReceipt.notes && <p className="receipt-notes">{selectedReceipt.notes}</p>}
            <div className="receipt-modal-total"><span>Total paid</span><strong>{money(selectedReceipt.amount)}</strong></div>
          </section>
        </div>
      )}
      {receiptLoading && <div className="receipt-loading">Loading receipt...</div>}
    </main>
  );
}

const isAdminRoute = window.location.pathname.startsWith("/admin");
createRoot(document.getElementById("root")).render(
  isAdminRoute ? <App /> : <ResidentApp />,
);

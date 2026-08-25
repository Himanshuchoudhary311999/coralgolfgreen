import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import 'dotenv/config';
import { pool, withTransaction } from './db.js';
import { calculateLateFee, feePolicy } from './fee.js';

const app = express();
const port = Number(process.env.PORT || 4000);
const authSecret = process.env.AUTH_SECRET || 'coral-golf-green-development-secret';
const adminTokenTtlSeconds = 8 * 60 * 60;

app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') || true }));
app.use(express.json());

function encodeTokenPart(value) {
  return Buffer.from(value).toString('base64url');
}

function createAdminToken(admin) {
  const payload = encodeTokenPart(JSON.stringify({
    sub: admin.id,
    username: admin.username,
    role: admin.role,
    exp: Math.floor(Date.now() / 1000) + adminTokenTtlSeconds
  }));
  const signature = crypto.createHmac('sha256', authSecret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function requireAdmin(req, res, next) {
  const authorization = String(req.headers.authorization || '');
  const [payload, signature] = authorization.startsWith('Bearer ') ? authorization.slice(7).split('.') : [];
  if (!payload || !signature) return res.status(401).json({ message: 'Admin login required.' });
  const expected = crypto.createHmac('sha256', authSecret).update(payload).digest('base64url');
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
    return res.status(401).json({ message: 'Invalid admin session.' });
  }
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!session.sub || !session.exp || session.exp <= Math.floor(Date.now() / 1000)) {
      return res.status(401).json({ message: 'Admin session expired.' });
    }
    req.admin = session;
    return next();
  } catch {
    return res.status(401).json({ message: 'Invalid admin session.' });
  }
}

function money(value) {
  return Number(Number(value).toFixed(2));
}

function presentDue(row) {
  const maintenanceDue = money(Number(row.amount) - Number(row.paid_amount || 0));
  const lateFee = maintenanceDue > 0
    ? (Number(row.adjustment_amount || 0) || calculateLateFee(row.due_month))
    : 0;
  return {
    id: row.id,
    dueMonth: row.due_month,
    amount: money(row.amount),
    paidAmount: money(row.paid_amount || 0),
    maintenanceDue,
    lateFee: money(lateFee),
    totalDue: money(maintenanceDue + lateFee),
    status: row.status
  };
}

function presentCollectionDue(row) {
  return {
    id: row.id,
    collectionId: row.collection_id,
    name: row.name,
    amount: money(row.amount),
    dueDate: row.due_date,
    status: row.status
  };
}

function presentExpense(row) {
  return {
    id: row.id,
    category: row.category,
    description: row.description,
    amount: money(row.amount),
    expenseDate: row.expense_date,
    status: row.status,
    createdAt: row.created_at,
    sourceType: row.source_type || 'maintenance',
    collectionId: row.collection_id || null,
    sourceName: row.source_name || (row.source_type === 'maintenance' ? 'Maintenance' : null)
    , paymentMode: row.payment_mode || null
  };
}

async function ensureCurrentMonthDues() {
  const month = `${new Date().toISOString().slice(0, 7)}-01`;
  await withTransaction(async (client) => {
    const { rows: plans } = await client.query(`
      SELECT id, community_id, monthly_amount
      FROM maintenance_plans
      WHERE active = TRUE
        AND effective_from <= $1
        AND (effective_to IS NULL OR effective_to >= $1)
    `, [month]);

    for (const plan of plans) {
      const { rows: periods } = await client.query(`
        INSERT INTO billing_periods (plan_id, period_month, due_date, amount)
        VALUES ($1, $2, ($2::date + INTERVAL '10 days')::date, $3)
        ON CONFLICT (plan_id, period_month) DO UPDATE SET amount = billing_periods.amount
        RETURNING id, amount
      `, [plan.id, month, plan.monthly_amount]);

      await client.query(`
        INSERT INTO maintenance_dues (flat_id, billing_period_id, due_month, amount)
        SELECT f.id, $1, $2, $3
        FROM flats f
        WHERE f.community_id = $4
          AND f.status = 'active'
          AND NOT EXISTS (
            SELECT 1
            FROM maintenance_dues existing
            WHERE existing.flat_id = f.id
              AND (
                (existing.due_month = $2 AND existing.status IN ('paid', 'advanced_paid'))
                OR (existing.due_month > $2 AND existing.status = 'advanced_paid')
              )
          )
        ON CONFLICT (flat_id, due_month) DO NOTHING
      `, [periods[0].id, month, periods[0].amount, plan.community_id]);
    }
  });
}

async function loadDues(client, flatId, dueIds = null) {
  const params = [flatId];
  let filter = 'AND d.status NOT IN (\'paid\', \'advanced_paid\')';
  if (dueIds) {
    params.push(dueIds);
    filter += ' AND d.id = ANY($2::uuid[])';
  }
  const { rows } = await client.query(`
    SELECT d.id, d.due_month::text AS due_month, d.amount, d.status,
      COALESCE(SUM(CASE WHEN p.status = 'posted' THEN pa.maintenance_amount ELSE 0 END), 0) AS paid_amount
      , COALESCE((SELECT SUM(a.amount) FROM adjustments a WHERE a.due_id = d.id AND a.adjustment_type = 'penalty'), 0) AS adjustment_amount
    FROM maintenance_dues d
    LEFT JOIN payment_allocations pa ON pa.due_id = d.id
    LEFT JOIN payments p ON p.id = pa.payment_id
    WHERE d.flat_id = $1 ${filter}
    GROUP BY d.id
    ORDER BY d.due_month ASC
  `, params);
  return rows;
}

async function loadAdvancedDues(client, flatId) {
  const { rows } = await client.query(`
    SELECT id, due_month::text AS due_month, amount, status, 0 AS paid_amount, 0 AS adjustment_amount
    FROM maintenance_dues
    WHERE flat_id = $1 AND status = 'advanced_paid'
    ORDER BY due_month ASC
  `, [flatId]);
  return rows;
}

async function loadPaidDues(client, flatId) {
  const { rows } = await client.query(`
    SELECT id, due_month::text AS due_month, amount, status, 0 AS paid_amount, 0 AS adjustment_amount
    FROM maintenance_dues
    WHERE flat_id = $1 AND status = 'paid'
    ORDER BY due_month ASC
  `, [flatId]);
  return rows;
}

async function loadCollectionDues(client, flatId, dueIds = null) {
  const params = [flatId];
  let filter = "AND cd.status = 'unpaid' AND c.status = 'open'";
  if (dueIds) {
    params.push(dueIds);
    filter += ' AND cd.id = ANY($2::uuid[])';
  }
  const { rows } = await client.query(`
    SELECT cd.id, cd.collection_id, cd.amount, cd.status, c.name, c.due_date
    FROM collection_dues cd
    JOIN community_collections c ON c.id = cd.collection_id
    WHERE cd.flat_id = $1 ${filter}
    ORDER BY c.due_date NULLS LAST, c.created_at DESC
  `, params);
  return rows;
}

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false, message: 'Database unavailable' });
  }
});

app.get('/api/config', requireAdmin, (_req, res) => res.json({ feePolicy: feePolicy() }));

app.get('/api/dashboard', requireAdmin, async (_req, res, next) => {
  try {
    const { rows: communityRows } = await pool.query('SELECT id FROM communities ORDER BY created_at LIMIT 1');
    if (!communityRows[0]) return res.json({ summary: {}, monthly: [], collections: [], expenses: [] });
    const communityId = communityRows[0].id;
    const [summaryResult, monthlyResult, collectionResult, expenseResult] = await Promise.all([
      pool.query(`
        SELECT
          COALESCE((SELECT SUM(pa.maintenance_amount + pa.late_fee_amount) FROM payment_allocations pa JOIN payments p ON p.id = pa.payment_id WHERE p.status = 'posted'), 0) AS maintenance_collected,
          COALESCE((SELECT SUM(cpa.amount) FROM collection_payment_allocations cpa JOIN payments p ON p.id = cpa.payment_id WHERE p.status = 'posted'), 0) AS collections_collected,
          COALESCE((SELECT SUM(amount) FROM payments WHERE status = 'posted'), 0) AS total_collected,
          COALESCE((SELECT SUM(amount) FROM expenses WHERE community_id = $1 AND status = 'posted'), 0) AS total_expenses,
          COALESCE((SELECT SUM(amount) FROM expenses WHERE community_id = $1 AND status = 'posted' AND source_type = 'maintenance'), 0) AS maintenance_expenses,
          COALESCE((SELECT SUM(pa.maintenance_amount + pa.late_fee_amount) FROM payment_allocations pa JOIN payments p ON p.id = pa.payment_id WHERE p.status = 'posted' AND p.payment_mode = 'cash'), 0) AS maintenance_cash_collected,
          COALESCE((SELECT SUM(pa.maintenance_amount + pa.late_fee_amount) FROM payment_allocations pa JOIN payments p ON p.id = pa.payment_id WHERE p.status = 'posted' AND p.payment_mode <> 'cash'), 0) AS maintenance_bank_collected,
          COALESCE((SELECT SUM(amount) FROM expenses WHERE community_id = $1 AND status = 'posted' AND source_type = 'maintenance' AND payment_mode = 'cash'), 0) AS maintenance_cash_expenses,
          COALESCE((SELECT SUM(amount) FROM expenses WHERE community_id = $1 AND status = 'posted' AND source_type = 'maintenance' AND payment_mode = 'bank'), 0) AS maintenance_bank_expenses,
          (SELECT COUNT(*) FROM maintenance_dues WHERE status NOT IN ('paid', 'advanced_paid', 'waived')) AS pending_maintenance,
          (SELECT COUNT(*) FROM collection_dues cd JOIN community_collections c ON c.id = cd.collection_id WHERE c.community_id = $1 AND cd.status = 'unpaid') AS pending_collections
      `, [communityId]),
      pool.query(`
        WITH months AS (
          SELECT date_trunc('month', paid_at)::date AS month FROM payments WHERE status = 'posted'
          UNION SELECT date_trunc('month', expense_date)::date FROM expenses WHERE community_id = $1 AND status = 'posted'
        )
        SELECT months.month,
          COALESCE((SELECT SUM(pa.maintenance_amount + pa.late_fee_amount) FROM payment_allocations pa JOIN payments p ON p.id = pa.payment_id WHERE p.status = 'posted' AND date_trunc('month', p.paid_at)::date = months.month), 0) AS maintenance,
          COALESCE((SELECT SUM(cpa.amount) FROM collection_payment_allocations cpa JOIN payments p ON p.id = cpa.payment_id WHERE p.status = 'posted' AND date_trunc('month', p.paid_at)::date = months.month), 0) AS collections,
          COALESCE((SELECT SUM(amount) FROM expenses WHERE community_id = $1 AND status = 'posted' AND date_trunc('month', expense_date)::date = months.month), 0) AS expenses
        FROM months ORDER BY months.month DESC
      `, [communityId]),
      pool.query(`
        SELECT c.id, c.name, c.amount, c.due_date, c.status,
          COUNT(cd.id)::int AS flats_applied,
          COUNT(cd.id) FILTER (WHERE cd.status = 'paid')::int AS flats_paid,
          COALESCE(SUM(cd.amount) FILTER (WHERE cd.status = 'paid'), 0) AS collected,
          COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.collection_id = c.id AND e.status = 'posted'), 0) AS expenses,
          COALESCE((SELECT SUM(cpa.amount) FROM collection_payment_allocations cpa JOIN payments p ON p.id = cpa.payment_id WHERE cpa.collection_due_id IN (SELECT id FROM collection_dues WHERE collection_id = c.id) AND p.status = 'posted' AND p.payment_mode = 'cash'), 0) AS cash_collected,
          COALESCE((SELECT SUM(cpa.amount) FROM collection_payment_allocations cpa JOIN payments p ON p.id = cpa.payment_id WHERE cpa.collection_due_id IN (SELECT id FROM collection_dues WHERE collection_id = c.id) AND p.status = 'posted' AND p.payment_mode <> 'cash'), 0) AS bank_collected,
          COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.collection_id = c.id AND e.status = 'posted' AND e.payment_mode = 'cash'), 0) AS cash_expenses,
          COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.collection_id = c.id AND e.status = 'posted' AND e.payment_mode = 'bank'), 0) AS bank_expenses
        FROM community_collections c
        LEFT JOIN collection_dues cd ON cd.collection_id = c.id
        WHERE c.community_id = $1
        GROUP BY c.id ORDER BY c.created_at DESC
      `, [communityId]),
      pool.query('SELECT e.id, e.category, e.source_type, e.collection_id, e.payment_mode, c.name AS source_name, e.description, e.amount, e.expense_date, e.status, e.created_at FROM expenses e LEFT JOIN community_collections c ON c.id = e.collection_id WHERE e.community_id = $1 ORDER BY e.expense_date DESC, e.created_at DESC LIMIT 20', [communityId])
    ]);
    res.json({
      summary: summaryResult.rows[0],
      monthly: monthlyResult.rows,
      collections: collectionResult.rows,
        sources: [
          { id: 'maintenance', name: 'Maintenance', collected: summaryResult.rows[0].maintenance_collected, spent: summaryResult.rows[0].maintenance_expenses, cashCollected: summaryResult.rows[0].maintenance_cash_collected, bankCollected: summaryResult.rows[0].maintenance_bank_collected, cashSpent: summaryResult.rows[0].maintenance_cash_expenses, bankSpent: summaryResult.rows[0].maintenance_bank_expenses },
          ...collectionResult.rows.map((collection) => ({ id: collection.id, name: collection.name, collected: collection.collected, spent: collection.expenses, cashCollected: collection.cash_collected, bankCollected: collection.bank_collected, cashSpent: collection.cash_expenses, bankSpent: collection.bank_expenses }))
        ].map((source) => ({ ...source, balance: money(Number(source.collected || 0) - Number(source.spent || 0)), cashBalance: money(Number(source.cashCollected || 0) - Number(source.cashSpent || 0)), bankBalance: money(Number(source.bankCollected || 0) - Number(source.bankSpent || 0)) })),
      expenses: expenseResult.rows.map(presentExpense)
    });
  } catch (error) { next(error); }
});

app.post('/api/admin-login', async (req, res, next) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  if (!username || !password) return res.status(401).json({ message: 'Username and password are required.' });
  try {
    const { rows } = await pool.query(`
      SELECT id, username, role
      FROM admin_users
      WHERE username = $1 AND active = TRUE AND password_hash = crypt($2, password_hash)
    `, [username, password]);
    if (!rows[0]) return res.status(401).json({ message: 'Username or password is incorrect.' });
    await pool.query('UPDATE admin_users SET last_login_at = NOW() WHERE id = $1', [rows[0].id]);
    res.json({ token: createAdminToken(rows[0]), admin: rows[0] });
  } catch (error) { next(error); }
});

app.use('/api/flats', requireAdmin);

app.get('/api/flats', async (_req, res, next) => {
  try {
    await ensureCurrentMonthDues();
    const { rows: flats } = await pool.query(`
      SELECT f.id, f.flat_no, o.full_name AS owner_name, fo.ownership_type AS owner_role
      FROM flats f
      LEFT JOIN flat_owners fo ON fo.flat_id = f.id AND fo.is_primary = TRUE AND fo.valid_to IS NULL
      LEFT JOIN owners o ON o.id = fo.owner_id
      WHERE f.status = 'active'
      ORDER BY f.flat_no
    `);
    const dues = await Promise.all(flats.map(async (flat) => {
      const rows = await loadDues(pool, flat.id);
      const advancedRows = await loadAdvancedDues(pool, flat.id);
      const paidRows = await loadPaidDues(pool, flat.id);
      const collectionRows = await loadCollectionDues(pool, flat.id);
      return { ...flat, dues: rows.map(presentDue), paidDues: paidRows.map(presentDue), advancedDues: advancedRows.map(presentDue), collectionDues: collectionRows.map(presentCollectionDue) };
    }));

    res.json({ flats: dues });
  } catch (error) { next(error); }
});

app.post('/api/expenses', requireAdmin, async (req, res, next) => {
  const category = String(req.body.category || '').trim();
  const sourceType = String(req.body.sourceType || 'maintenance').trim();
  const collectionId = req.body.collectionId ? String(req.body.collectionId) : null;
  const paymentMode = String(req.body.paymentMode || '').trim();
  const description = String(req.body.description || '').trim() || null;
  const amount = Number(req.body.amount);
  const expenseDate = String(req.body.expenseDate || '').trim() || new Date().toISOString().slice(0, 10);
  if (!category || !['maintenance', 'collection'].includes(sourceType) || !['cash', 'bank'].includes(paymentMode) || (sourceType === 'collection' && !collectionId) || (sourceType === 'maintenance' && collectionId) || !Number.isFinite(amount) || amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(expenseDate)) {
    return res.status(400).json({ message: 'Select a source, category, positive amount, and valid expense date' });
  }
  try {
    const { rows: communities } = await pool.query('SELECT id FROM communities ORDER BY created_at LIMIT 1');
    if (!communities[0]) return res.status(409).json({ message: 'No community is configured' });
    if (sourceType === 'collection') {
      const { rows: collections } = await pool.query('SELECT id FROM community_collections WHERE id = $1 AND community_id = $2', [collectionId, communities[0].id]);
      if (!collections[0]) return res.status(400).json({ message: 'Selected event is invalid' });
    }
    const { rows } = await pool.query(`
      INSERT INTO expenses (community_id, category, source_type, collection_id, payment_mode, description, amount, expense_date, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, category, source_type, collection_id, payment_mode, description, amount, expense_date, status, created_at
    `, [communities[0].id, category, sourceType, collectionId, paymentMode, description, amount, expenseDate, req.admin.sub]);
    res.status(201).json({ expense: presentExpense(rows[0]) });
  } catch (error) { next(error); }
});

app.post('/api/resident-login', async (req, res, next) => {
  const flatNo = String(req.body.flatNo || '').trim();
  const pin = String(req.body.pin || '').trim();
  try {
    await ensureCurrentMonthDues();
    const { rows } = await pool.query(`SELECT id FROM flats WHERE flat_no = $1 AND resident_pin = $2 AND status = 'active'`, [flatNo, pin]);
    if (!rows[0]) return res.status(401).json({ message: 'Flat number or PIN does not match. Please try again.' });
    const { rows: flats } = await pool.query(`
      SELECT f.id, f.flat_no, o.full_name AS owner_name, fo.ownership_type AS owner_role
      FROM flats f
      LEFT JOIN flat_owners fo ON fo.flat_id = f.id AND fo.is_primary = TRUE AND fo.valid_to IS NULL
      LEFT JOIN owners o ON o.id = fo.owner_id
      WHERE f.status = 'active' ORDER BY f.flat_no
    `);
    const register = await Promise.all(flats.map(async (flat) => {
      const dues = await loadDues(pool, flat.id);
      const advancedRows = await loadAdvancedDues(pool, flat.id);
      const paidRows = await loadPaidDues(pool, flat.id);
      const collectionRows = await loadCollectionDues(pool, flat.id);
      return { ...flat, dues: dues.map(presentDue), paidDues: paidRows.map(presentDue), advancedDues: advancedRows.map(presentDue), collectionDues: collectionRows.map(presentCollectionDue) };
    }));
    res.json({ flats: register });
  } catch (error) { next(error); }
});

app.get('/api/flats/:flatId/summary', async (req, res, next) => {
  try {
    await ensureCurrentMonthDues();
    const { rows: flats } = await pool.query(`
      SELECT f.id, f.flat_no, o.full_name AS owner_name
      FROM flats f
      LEFT JOIN flat_owners fo ON fo.flat_id = f.id AND fo.is_primary = TRUE AND fo.valid_to IS NULL
      LEFT JOIN owners o ON o.id = fo.owner_id
      WHERE f.id = $1 AND f.status = 'active'
    `, [req.params.flatId]);
    if (!flats[0]) return res.status(404).json({ message: 'Flat not found' });
    const rows = await loadDues(pool, req.params.flatId);
    const advancedRows = await loadAdvancedDues(pool, req.params.flatId);
    const paidRows = await loadPaidDues(pool, req.params.flatId);
    const dues = rows.map(presentDue);
    const paidDues = paidRows.map(presentDue);
    const advancedDues = advancedRows.map(presentDue);
    res.json({ flat: flats[0], dues, paidDues, advancedDues, totals: {
      maintenance: money(dues.reduce((sum, due) => sum + due.maintenanceDue, 0)),
      lateFees: money(dues.reduce((sum, due) => sum + due.lateFee, 0)),
      total: money(dues.reduce((sum, due) => sum + due.totalDue, 0))
    }});
  } catch (error) { next(error); }
});

app.post('/api/flats/:flatId/advance-dues', requireAdmin, async (req, res, next) => {
  const { dueMonth } = req.body;
  if (!/^\d{4}-\d{2}$/.test(String(dueMonth || ''))) {
    return res.status(400).json({ message: 'dueMonth must use YYYY-MM format' });
  }

  const month = `${dueMonth}-01`;
  const monthDate = new Date(`${month}T00:00:00Z`);
  const currentMonth = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  if (Number.isNaN(monthDate.getTime()) || monthDate <= currentMonth) {
    return res.status(400).json({ message: 'Advance month must be in the future' });
  }

  try {
    const due = await withTransaction(async (client) => {
      const { rows: flats } = await client.query(
        `SELECT id, community_id FROM flats WHERE id = $1 AND status = 'active'`,
        [req.params.flatId],
      );
      if (!flats[0]) throw Object.assign(new Error('Flat not found'), { statusCode: 404 });

      const { rows: plans } = await client.query(
        `SELECT id, monthly_amount FROM maintenance_plans
         WHERE community_id = $1 AND active = TRUE
           AND effective_from <= $2 AND (effective_to IS NULL OR effective_to >= $2)
         ORDER BY effective_from DESC LIMIT 1`,
        [flats[0].community_id, month],
      );
      if (!plans[0]) throw Object.assign(new Error('No active maintenance plan found'), { statusCode: 409 });

      const { rows: periods } = await client.query(
        `INSERT INTO billing_periods (plan_id, period_month, due_date, amount)
         VALUES ($1, $2, ($2::date + INTERVAL '10 days')::date, $3)
         ON CONFLICT (plan_id, period_month) DO UPDATE SET amount = billing_periods.amount
         RETURNING id, amount`,
        [plans[0].id, month, plans[0].monthly_amount],
      );
      const insertedDue = await client.query(
        `INSERT INTO maintenance_dues (flat_id, billing_period_id, due_month, amount)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (flat_id, due_month) DO NOTHING`,
        [req.params.flatId, periods[0].id, month, periods[0].amount],
      );
      if (insertedDue.rowCount === 0) {
        throw Object.assign(new Error('This month already exists for the selected flat'), { statusCode: 409 });
      }
      const rows = await loadDues(client, req.params.flatId);
      const due = rows.find((row) => row.due_month === month);
      if (!due) throw Object.assign(new Error('Advance month could not be created'), { statusCode: 409 });
      return due;
    });
    res.status(201).json({ due: presentDue(due) });
  } catch (error) { next(error); }
});

app.post('/api/collections', requireAdmin, async (req, res, next) => {
  const name = String(req.body.name || '').trim();
  const amount = Number(req.body.amount);
  const dueDate = req.body.dueDate ? String(req.body.dueDate) : null;
  if (!name || !Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ message: 'Name and a positive amount are required' });
  }
  try {
    const result = await withTransaction(async (client) => {
      const { rows: communities } = await client.query(`
        SELECT DISTINCT community_id FROM flats WHERE status = 'active' ORDER BY community_id
      `);
      if (communities.length !== 1) throw Object.assign(new Error('Exactly one active community is required'), { statusCode: 409 });
      const collection = (await client.query(`
        INSERT INTO community_collections (community_id, name, amount, due_date)
        VALUES ($1, $2, $3, $4) RETURNING id, name, amount, due_date, status
      `, [communities[0].community_id, name, amount, dueDate])).rows[0];
      const { rowCount } = await client.query(`
        INSERT INTO collection_dues (collection_id, flat_id, amount)
        SELECT $1, id, $2 FROM flats WHERE community_id = $3 AND status = 'active'
        ON CONFLICT (collection_id, flat_id) DO NOTHING
      `, [collection.id, amount, communities[0].community_id]);
      return { collection: presentCollectionDue(collection), flatsApplied: rowCount };
    });
    res.status(201).json(result);
  } catch (error) { next(error); }
});

app.post('/api/payments', requireAdmin, async (req, res, next) => {
  const { flatId, dueIds = [], collectionDueIds = [], paymentMode, collectedBy } = req.body;
  if (!flatId || (!Array.isArray(dueIds) && !Array.isArray(collectionDueIds)) || (!dueIds.length && !collectionDueIds.length) || !['cash', 'upi', 'bank'].includes(paymentMode)) {
    return res.status(400).json({ message: 'Select at least one due and a valid paymentMode' });
  }
  if (paymentMode === 'cash' && !String(collectedBy || '').trim()) {
    return res.status(400).json({ message: 'collectedBy is required for cash payments' });
  }

  try {
    const result = await withTransaction(async (client) => {
      const { rows: flatRows } = await client.query(`
        SELECT f.id, f.flat_no, o.full_name AS owner_name
        FROM flats f
        LEFT JOIN flat_owners fo ON fo.flat_id = f.id AND fo.is_primary = TRUE AND fo.valid_to IS NULL
        LEFT JOIN owners o ON o.id = fo.owner_id
        WHERE f.id = $1 AND f.status = 'active'
      `, [flatId]);
      if (!flatRows[0]) throw Object.assign(new Error('Flat not found'), { statusCode: 404 });
      const rows = dueIds.length ? await loadDues(client, flatId, dueIds) : [];
      if (rows.length !== dueIds.length) throw Object.assign(new Error('One or more selected dues are invalid or already paid'), { statusCode: 409 });
      const dues = rows.map(presentDue);
      const collectionRows = collectionDueIds.length ? await loadCollectionDues(client, flatId, collectionDueIds) : [];
      if (collectionRows.length !== collectionDueIds.length) throw Object.assign(new Error('One or more selected collections are invalid or already paid'), { statusCode: 409 });
      const collectionDues = collectionRows.map(presentCollectionDue);
      const total = money(dues.reduce((sum, due) => sum + due.totalDue, 0) + collectionDues.reduce((sum, due) => sum + due.amount, 0));
      const payment = await client.query(`
        INSERT INTO payments (flat_id, amount, payment_mode, collected_by_name)
        VALUES ($1, $2, $3, $4) RETURNING id, paid_at
      `, [flatId, total, paymentMode, paymentMode === 'cash' ? String(collectedBy).trim() : null]);
      for (const due of dues) {
        await client.query(`INSERT INTO payment_allocations (payment_id, due_id, maintenance_amount, late_fee_amount) VALUES ($1, $2, $3, $4)`, [payment.rows[0].id, due.id, due.maintenanceDue, due.lateFee]);
        await client.query(`UPDATE maintenance_dues SET status = 'paid' WHERE id = $1`, [due.id]);
      }
      for (const due of collectionDues) {
        await client.query(`INSERT INTO collection_payment_allocations (payment_id, collection_due_id, amount) VALUES ($1, $2, $3)`, [payment.rows[0].id, due.id, due.amount]);
        await client.query(`UPDATE collection_dues SET status = 'paid', paid_at = NOW() WHERE id = $1`, [due.id]);
      }
      return { payment: payment.rows[0], flat: flatRows[0], dues, collectionDues, total };
    });
    res.status(201).json({ success: true, ...result, message: `Payment of ₹${result.total.toLocaleString('en-IN')} recorded.` });
  } catch (error) { next(error); }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(error.statusCode || 500).json({ message: error.message || 'Internal server error' });
});

async function start() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS community_collections (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        community_id UUID NOT NULL REFERENCES communities(id),
        name VARCHAR(160) NOT NULL,
        amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
        due_date DATE,
        status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (community_id, name)
      );
      CREATE TABLE IF NOT EXISTS collection_dues (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        collection_id UUID NOT NULL REFERENCES community_collections(id) ON DELETE CASCADE,
        flat_id UUID NOT NULL REFERENCES flats(id),
        amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
        status VARCHAR(20) NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'paid', 'waived')),
        paid_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (collection_id, flat_id)
      );
      CREATE TABLE IF NOT EXISTS collection_payment_allocations (
        payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
        collection_due_id UUID NOT NULL REFERENCES collection_dues(id),
        amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
        PRIMARY KEY (payment_id, collection_due_id)
      );
      CREATE INDEX IF NOT EXISTS idx_collection_dues_flat_status ON collection_dues(flat_id, status);
      CREATE TABLE IF NOT EXISTS expenses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        community_id UUID NOT NULL REFERENCES communities(id),
        category VARCHAR(120) NOT NULL,
        description TEXT,
        amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
        expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
        status VARCHAR(20) NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'reversed')),
        created_by UUID REFERENCES admin_users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_expenses_community_date ON expenses(community_id, expense_date DESC);
    `);
    await pool.query(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS source_type VARCHAR(20) NOT NULL DEFAULT 'maintenance'`);
    await pool.query(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS collection_id UUID REFERENCES community_collections(id)`);
    await pool.query(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS payment_mode VARCHAR(20) NOT NULL DEFAULT 'cash'`);
    await pool.query(`ALTER TABLE flats ADD COLUMN IF NOT EXISTS resident_pin VARCHAR(4)`);
    await pool.query(`UPDATE flats SET resident_pin = LPAD((1000 + flat_no::integer)::text, 4, '0') WHERE resident_pin IS NULL AND flat_no ~ '^[0-9]+$'`);
    await pool.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'expenses_updated_at') THEN
          CREATE TRIGGER expenses_updated_at BEFORE UPDATE ON expenses FOR EACH ROW EXECUTE FUNCTION set_updated_at();
        END IF;
      END $$;
    `);
  } catch (error) {
    console.error('Resident PIN migration skipped:', error.message);
  }
  app.listen(port, () => console.log(`Coral Golf Green API listening on http://localhost:${port}`));
}

start();

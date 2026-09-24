import { Entry } from '../models/Entry.js'
import { Exit } from '../models/Exit.js'
import { Activity } from '../models/Activity.js'
import { Client } from '../models/Client.js'
import { Product } from '../models/Product.js'
import { Alert } from '../models/Alert.js'
import { SyncLog } from '../models/SyncLog.js'
import { StockMovement } from '../models/StockMovement.js'
import { computeTotal } from '../controllers/exits.controller.js'
import { catchAsync, ok } from '../utils/res.js'

// Construit le journal de bord (entrées, sorties, alertes, activités, sync).
export const list = catchAsync(async (req, res) => {
  const [entries, exits, alerts, activities, syncs, products, clients, movements] = await Promise.all([
    Entry.find().lean(),
    Exit.find().lean(),
    Alert.find({ status: 'active' }).lean(),
    Activity.find().sort({ date: -1 }).limit(500).lean(),
    SyncLog.find().sort({ startedAt: -1 }).limit(100).lean(),
    Product.find({ isDeleted: { $ne: true } }).lean(),
    Client.find().lean(),
    StockMovement.find().sort({ date: -1 }).limit(500).lean(),
  ])
  const productName = new Map(products.map((p) => [p._id.toString(), p.name]))
  const clientName = new Map(clients.map((c) => [c._id.toString(), `${c.firstName} ${c.lastName}`.trim()]))

  const items = []
  for (const e of entries) {
    items.push({ id: `h-e-${e._id}`, date: e.date, userLabel: e.userLabel || '—', type: 'entree', action: 'Entrée en stock', entityLabel: e.productName || productName.get(e.productId) || '—', quantity: e.quantity, refId: e.reference, details: `Référence ${e.reference}` })
  }
  for (const ex of exits) {
    items.push({ id: `h-x-${ex._id}`, date: ex.date, userLabel: ex.userLabel || '—', type: 'sortie', action: 'Sortie de stock', entityLabel: ex.reference, quantity: ex.lines.reduce((s, l) => s + l.quantity, 0), refId: ex.receiptNumber, details: `Client : ${clientName.get(ex.clientId) || 'Occasionnel'} · ${computeTotal(ex)}` })
  }
  for (const a of alerts) {
    items.push({ id: `h-a-${a._id}`, date: a.createdAt, userLabel: 'Système', type: 'alerte', action: a.type === 'rupture' ? 'Rupture détectée' : 'Stock bas détecté', entityLabel: a.productName, quantity: null, refId: a.productId, details: a.message })
  }
  for (const m of movements) {
    items.push({ id: `h-m-${m._id}`, date: m.date, userLabel: m.userLabel || '—', type: m.type === 'entree' ? 'entree' : 'sortie', action: m.type === 'entree' ? 'Mouvement entrant' : 'Mouvement sortant', entityLabel: m.productName || productName.get(m.productId) || '—', quantity: m.quantity, refId: m.refId, details: m.note || '' })
  }
  for (const act of activities) {
    items.push({ id: `h-act-${act._id}`, date: act.date, userLabel: act.userLabel || '—', type: 'activite', action: act.action, entityLabel: act.entityLabel, quantity: act.quantity ?? null, refId: '', details: act.details || '' })
  }
  for (const s of syncs) {
    items.push({ id: `h-sync-${s._id}`, date: s.startedAt, userLabel: 'Système', type: 'sync', action: 'Synchronisation', entityLabel: s.status, quantity: null, refId: '', details: `${s.itemsCount} élément(s)` })
  }

  items.sort((a, b) => new Date(b.date) - new Date(a.date))
  ok(res, items.slice(0, Number(req.query.limit) || 1000))
})
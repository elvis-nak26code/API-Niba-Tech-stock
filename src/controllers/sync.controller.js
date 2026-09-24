import { Product } from '../models/Product.js'
import { Category } from '../models/Category.js'
import { Client } from '../models/Client.js'
import { Supplier } from '../models/Supplier.js'
import { Entry } from '../models/Entry.js'
import { Exit } from '../models/Exit.js'
import { Alert } from '../models/Alert.js'
import { SyncLog } from '../models/SyncLog.js'
import { catchAsync, ok, apiDoc } from '../utils/res.js'
import { getSettings } from '../controllers/settings.controller.js'
import { enrichProducts } from '../controllers/products.controller.js'
import { computeTotal } from '../controllers/exits.controller.js'

const COLLECTIONS = ['products', 'categories', 'clients', 'suppliers', 'entries', 'exits']

// Instancie le modèle Mongoose correspondant à un nom de collection.
function modelFor(name) {
  switch (name) {
    case 'products': return Product
    case 'categories': return Category
    case 'clients': return Client
    case 'suppliers': return Supplier
    case 'entries': return Entry
    case 'exits': return Exit
    case 'alerts': return Alert
    default: return null
  }
}

// Réécrit un enregistrement entrant en document compatible (id -> _id).
function toDoc(record) {
  const { id, _id, ...rest } = { ...record }
  const doc = { ...rest }
  if (id) doc._id = id
  if (id && !doc.updatedAt) doc.updatedAt = new Date()
  return doc
}

// Clientele: fullName pour clients, productName/supplier pour entries,
// clientName pour exits, category/supplier pour produits.
async function dump() {
  const [products, categories, clients, suppliers, entries, exits, alerts, settings] = await Promise.all([
    Product.find({ isDeleted: { $ne: true } }).sort({ createdAt: 1 }).lean(),
    Category.find().sort({ createdAt: 1 }).lean(),
    Client.find().sort({ createdAt: 1 }).lean(),
    Supplier.find().sort({ createdAt: 1 }).lean(),
    Entry.find().sort({ createdAt: 1 }).lean(),
    Exit.find().sort({ createdAt: 1 }).lean(),
    Alert.find({ status: 'active' }).lean(),
    getSettings(),
  ])
  const enrichedProducts = await enrichProducts(products)
  return {
    products: enrichedProducts,
    categories: categories.map(apiDoc),
    clients: clients.map(apiDoc),
    suppliers: suppliers.map(apiDoc),
    entries: entries.map((e) => {
      const p = enrichedProducts.find((p) => p.id === e.productId)
      return { ...apiDoc(e), productName: p?.name || e.productName, sku: p?.sku || '' }
    }),
    exits: exits.map((x) => ({ ...apiDoc(x), total: computeTotal(x) })),
    alerts: alerts.map((a) => ({ ...apiDoc(a), status: 'active' })),
    settings,
  }
}

export const status = catchAsync(async (_req, res) => {
  const last = await SyncLog.findOne().sort({ startedAt: -1 }).lean()
  const lastError = await SyncLog.findOne({ status: 'error' }).sort({ startedAt: -1 }).lean()
  ok(res, {
    mode: 'api',
    state: 'synced',
    lastSync: last?.finishedAt || null,
    lastError: lastError?.error || null,
    pending: 0,
    label: 'Serveur',
  })
})

export const logs = catchAsync(async (_req, res) => {
  ok(res, (await SyncLog.find().sort({ startedAt: -1 }).limit(50).lean()).map(apiDoc))
})

// Synchronisation « légère » pour le mode web (pas de file d'attente locale).
export const run = catchAsync(async (req, res) => {
  const startedAt = new Date()
  const data = await dump()
  const itemsCount = COLLECTIONS.reduce((n, c) => n + data[c].length, 0)
  const log = await SyncLog.create({ type: 'snapshot', status: 'synced', itemsCount, startedAt, finishedAt: new Date(), clientInfo: req.body?.client || null })
  ok(res, { ok: true, log: log.toObject(), ...data, serverTime: new Date().toISOString() })
})

// Fusion bidirectionnelle complète (mode bureau) : le client pousse son état local,
// le serveur fusionne par identifiant (timestamps) puis renvoie l'état consolidé.
export const full = catchAsync(async (req, res) => {
  const startedAt = new Date()
  const incoming = req.body?.data || {}
  let itemsCount = 0

  for (const name of COLLECTIONS) {
    const Model = modelFor(name)
    const records = Array.isArray(incoming[name]) ? incoming[name] : []
    for (const record of records) {
      if (!record || !record.id) continue
      const existing = await Model.findById(record.id).lean()
      if (existing && new Date(existing.updatedAt) > new Date(record.updatedAt || existing.updatedAt)) continue
      const doc = toDoc(record)
      const { _id, ...fields } = doc
      try {
        await Model.updateOne({ _id: _id }, { $set: fields }, { upsert: true, setDefaultsOnInsert: true })
        itemsCount += 1
      } catch {
        /* ne fait pas planter la sync pour un doublon */
      }
    }
  }

  // Alertes : fusionne l'état actif local si plus récent, sinon serveur.
  if (Array.isArray(incoming.alerts)) {
    for (const record of incoming.alerts) {
      if (!record || !record.id) continue
      const existing = await Alert.findById(record.id).lean()
      if (existing || !record.id) continue
      const doc = toDoc(record)
      const { _id, ...fields } = doc
      try {
        await Alert.updateOne({ _id }, { $set: fields }, { upsert: true, setDefaultsOnInsert: true })
      } catch { /* ignore */ }
    }
  }

  const syncedData = await dump()
  const log = await SyncLog.create({
    type: 'full',
    status: 'synced',
    itemsCount,
    startedAt,
    finishedAt: new Date(),
    clientInfo: req.body?.client || null,
  })

  ok(res, { ok: true, log: log.toObject(), data: syncedData, serverTime: new Date().toISOString() })
})
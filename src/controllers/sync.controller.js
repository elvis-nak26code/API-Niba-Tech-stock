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
// clientName for exits, category/supplier for products.
// TOUTES les lectures sont restreintes au compte demandeur (ownerId).
async function dump(ownerId) {
  const [products, categories, clients, suppliers, entries, exits, alerts, settings] = await Promise.all([
    Product.find({ ownerId, isDeleted: { $ne: true } }).sort({ createdAt: 1 }).lean(),
    Category.find({ ownerId }).sort({ createdAt: 1 }).lean(),
    Client.find({ ownerId }).sort({ createdAt: 1 }).lean(),
    Supplier.find({ ownerId }).sort({ createdAt: 1 }).lean(),
    Entry.find({ ownerId }).sort({ createdAt: 1 }).lean(),
    Exit.find({ ownerId }).sort({ createdAt: 1 }).lean(),
    Alert.find({ ownerId, status: 'active' }).lean(),
    getSettings(ownerId),
  ])
  const enrichedProducts = await enrichProducts(products, ownerId)
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

export const status = catchAsync(async (req, res) => {
  const ownerId = req.user.id
  const last = await SyncLog.findOne({ ownerId }).sort({ startedAt: -1 }).lean()
  const lastError = await SyncLog.findOne({ ownerId, status: 'error' }).sort({ startedAt: -1 }).lean()
  ok(res, {
    mode: 'api',
    state: 'synced',
    lastSync: last?.finishedAt || null,
    lastError: lastError?.error || null,
    pending: 0,
    label: 'Serveur',
  })
})

export const logs = catchAsync(async (req, res) => {
  ok(res, (await SyncLog.find({ ownerId: req.user.id }).sort({ startedAt: -1 }).limit(50).lean()).map(apiDoc))
})

// Synchronisation « légère » pour le mode web (pas de file d'attente locale).
export const run = catchAsync(async (req, res) => {
  const ownerId = req.user.id
  const startedAt = new Date()
  const data = await dump(ownerId)
  const itemsCount = COLLECTIONS.reduce((n, c) => n + data[c].length, 0)
  const log = await SyncLog.create({ ownerId, type: 'snapshot', status: 'synced', itemsCount, startedAt, finishedAt: new Date(), clientInfo: req.body?.client || null })
  ok(res, { ok: true, log: log.toObject(), ...data, serverTime: new Date().toISOString() })
})

// Fusion bidirectionnelle complète (mode bureau) : le client pousse son état local,
// le serveur fusionne par identifiant (timestamps) puis renvoie l'état consolidé.
// Sécurité multi-tenant : le filtre ET la valeur ownerId sont toujours forcés sur
// le compte authentifié — un client ne peut ni lire ni écraser les données d'autrui.
export const full = catchAsync(async (req, res) => {
  const ownerId = req.user.id
  const startedAt = new Date()
  const incoming = req.body?.data || {}
  let itemsCount = 0

  for (const name of COLLECTIONS) {
    const Model = modelFor(name)
    const records = Array.isArray(incoming[name]) ? incoming[name] : []
    for (const record of records) {
      if (!record || !record.id) continue
      // La correspondance est limitée à ce compte : un id d'un autre compte est ignoré.
      const existing = await Model.findOne({ _id: record.id, ownerId }).lean()
      if (existing && new Date(existing.updatedAt) > new Date(record.updatedAt || existing.updatedAt)) continue
      const doc = toDoc(record)
      const { _id, ownerId: _spoof, ...fields } = doc
      try {
        await Model.updateOne({ _id: _id, ownerId }, { $set: { ...fields, ownerId } }, { upsert: true, setDefaultsOnInsert: true })
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
      const existing = await Alert.findOne({ _id: record.id, ownerId }).lean()
      if (existing || !record.id) continue
      const doc = toDoc(record)
      const { _id, ownerId: _spoof, ...fields } = doc
      try {
        await Alert.updateOne({ _id, ownerId }, { $set: { ...fields, ownerId } }, { upsert: true, setDefaultsOnInsert: true })
      } catch { /* ignore */ }
    }
  }

  const syncedData = await dump(ownerId)
  const log = await SyncLog.create({
    ownerId,
    type: 'full',
    status: 'synced',
    itemsCount,
    startedAt,
    finishedAt: new Date(),
    clientInfo: req.body?.client || null,
  })

  ok(res, { ok: true, log: log.toObject(), data: syncedData, serverTime: new Date().toISOString() })
})

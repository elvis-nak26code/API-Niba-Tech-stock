import { Alert } from '../models/Alert.js'
import { Activity } from '../models/Activity.js'
import { Product } from '../models/Product.js'
import { userLabel } from '../utils/res.js'

// Alerte dérivée d'un produit.
function describeAlert(p, qty = p.quantity, min = p.minStock || 0) {
  const rupture = qty <= 0
  return {
    type: rupture ? 'rupture' : 'low',
    message: rupture
      ? `« ${p.name} » est en rupture de stock.`
      : `Le stock de « ${p.name} » est sous le seuil minimum (${qty}/${min}).`,
  }
}

// Reconstruit les alertes actives d'un compte à partir de SON stock.
export async function recomputeAlerts(ownerId) {
  if (!ownerId) return
  const products = await Product.find({ ownerId, isDeleted: { $ne: true } }).lean()
  const active = await Alert.find({ ownerId, status: 'active' }).lean()

  const existingKey = new Map(active.map((a) => [`${a.productId}:${a.type}`, a]))
  const desired = new Map()

  for (const p of products) {
    if (p.quantity <= 0) desired.set(`${p._id.toString()}:rupture`, { p, qty: p.quantity, min: p.minStock })
    else if (p.quantity < (p.minStock || 0)) desired.set(`${p._id.toString()}:low`, { p, qty: p.quantity, min: p.minStock })
  }

  const seen = new Set()
  const ops = []
  for (const [key, { p, qty, min }] of desired) {
    seen.add(key)
    const { type, message } = describeAlert(p, qty, min)
    const existing = existingKey.get(key)
    const data = { productId: p._id.toString(), productName: p.name, type, message, quantity: qty, minStock: min, ownerId }
    if (existing) {
      ops.push(Alert.updateOne({ _id: existing._id }, data))
    } else {
      ops.push(Alert.create({ ...data, status: 'active', createdBy: 'Système' }))
    }
  }
  // alertes existantes de ce compte qui ne correspondent plus → résolues
  for (const a of active) {
    if (!seen.has(`${a.productId}:${a.type}`)) {
      ops.push(Alert.updateOne({ _id: a._id }, { status: 'resolved', resolvedAt: new Date() }))
    }
  }
  await Promise.all(ops)
}

// Enregistre un événement dans l'historique du compte concerné.
export async function logActivity(entry, req) {
  const ownerId = req?.user?.id || entry.ownerId || ''
  if (!ownerId) return null
  return Activity.create({
    action: entry.action,
    entity: entry.entity || 'other',
    entityLabel: entry.entityLabel || '',
    details: entry.details || '',
    quantity: entry.quantity ?? null,
    date: entry.date || new Date(),
    ownerId,
    userId: ownerId,
    userLabel: entry.userLabel || userLabel(req),
  })
}

export async function recomputeAndLogFallback(ownerId) {
  try {
    await recomputeAlerts(ownerId)
  } catch (err) {
    console.error('[alerts]', err.message)
  }
}

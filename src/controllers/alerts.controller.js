import { Alert } from '../models/Alert.js'
import { Product } from '../models/Product.js'
import { Setting } from '../models/Setting.js'
import { NotFound } from '../middleware/error.js'
import { catchAsync, ok, apiDoc } from '../utils/res.js'
import { recomputeAlerts } from '../services/ops.js'

export const list = catchAsync(async (req, res) => {
  const ownerId = req.user.id
  await recomputeAlerts(ownerId)
  // Le réglage « Notifications de stock faible » masque les alertes de seuil ;
  // les ruptures restent toujours renvoyées.
  const settings = await Setting.findOne({ ownerId, key: 'default' }).lean()
  const lowAllowed = settings?.lowStockNotifications !== false
  const query = { ownerId, status: 'active' }
  if (!lowAllowed) query.type = { $ne: 'low' }
  const alerts = await Alert.find(query).sort({ type: 1, createdAt: -1 }).lean()
  const ids = [...new Set(alerts.map((a) => a.productId))]
  const products = await Product.find({ _id: { $in: ids }, ownerId }).lean()
  const byId = new Map(products.map((p) => [p._id.toString(), p]))
  ok(res, alerts.map((a) => ({
    ...apiDoc(a),
    productName: byId.get(a.productId)?.name || a.productName,
    quantity: byId.get(a.productId)?.quantity ?? a.quantity,
    minStock: byId.get(a.productId)?.minStock ?? a.minStock,
  })))
})

export const resolve = catchAsync(async (req, res) => {
  const alert = await Alert.findOne({ _id: req.params.id, ownerId: req.user.id })
  if (!alert) throw NotFound('Alerte introuvable.')
  alert.status = 'resolved'
  alert.resolvedAt = new Date()
  await alert.save()
  ok(res, { ok: true })
})

import { Alert } from '../models/Alert.js'
import { Product } from '../models/Product.js'
import { NotFound } from '../middleware/error.js'
import { catchAsync, ok, apiDoc } from '../utils/res.js'
import { recomputeAlerts } from '../services/ops.js'

export const list = catchAsync(async (_req, res) => {
  await recomputeAlerts()
  const alerts = await Alert.find({ status: 'active' }).sort({ type: 1, createdAt: -1 }).lean()
  const ids = [...new Set(alerts.map((a) => a.productId))]
  const products = await Product.find({ _id: { $in: ids } }).lean()
  const byId = new Map(products.map((p) => [p._id.toString(), p]))
  ok(res, alerts.map((a) => ({
    ...apiDoc(a),
    productName: byId.get(a.productId)?.name || a.productName,
    quantity: byId.get(a.productId)?.quantity ?? a.quantity,
    minStock: byId.get(a.productId)?.minStock ?? a.minStock,
  })))
})

export const resolve = catchAsync(async (req, res) => {
  const alert = await Alert.findById(req.params.id)
  if (!alert) throw NotFound('Alerte introuvable.')
  alert.status = 'resolved'
  alert.resolvedAt = new Date()
  await alert.save()
  ok(res, { ok: true })
})
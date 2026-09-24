import { StockMovement } from '../models/StockMovement.js'
import { Product } from '../models/Product.js'
import { catchAsync, ok, apiDoc } from '../utils/res.js'

export const list = catchAsync(async (req, res) => {
  const movements = await StockMovement.find().sort({ date: -1 }).limit(req.query.limit ? Number(req.query.limit) : 1000).lean()
  const ids = [...new Set(movements.map((m) => m.productId))]
  const products = await Product.find({ _id: { $in: ids } }).lean()
  const byId = new Map(products.map((p) => [p._id.toString(), p]))
  ok(res, movements.map((m) => ({
    ...apiDoc(m),
    productName: m.productName || byId.get(m.productId)?.name || '—',
    sku: byId.get(m.productId)?.sku || '',
  })))
})
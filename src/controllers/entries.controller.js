import { Entry } from '../models/Entry.js'
import { Product } from '../models/Product.js'
import { Supplier } from '../models/Supplier.js'
import { StockMovement } from '../models/StockMovement.js'
import { Counter, makeReference, nextSequence } from '../models/Counter.js'
import { HttpError, NotFound } from '../middleware/error.js'
import { catchAsync, ok, apiDoc } from '../utils/res.js'
import { logActivity, recomputeAlerts } from '../services/ops.js'

export const list = catchAsync(async (req, res) => {
  const ownerId = req.user.id
  const entries = await Entry.find({ ownerId }).sort({ date: -1 }).lean()
  const enriched = await Promise.all(
    entries.map(async (e) => {
      const [p, sup] = await Promise.all([
        e.productId ? Product.findOne({ _id: e.productId, ownerId }).lean() : null,
        e.supplierId ? Supplier.findOne({ _id: e.supplierId, ownerId }).lean() : null,
      ])
      return { ...apiDoc(e), productName: p?.name || e.productName || '—', sku: p?.sku || '', supplier: sup?.name || e.supplier || '—' }
    }),
  )
  ok(res, enriched)
})

export const create = catchAsync(async (req, res) => {
  const ownerId = req.user.id
  const { productId, quantity, unitCost = 0, supplierId = null, comment = '', date } = req.body
  if (!productId) throw HttpError('Produit requis.', 400)
  const qty = Number(quantity)
  if (!Number.isFinite(qty) || qty <= 0) throw HttpError('Quantité invalide.', 400)

  const product = await Product.findOne({ _id: productId, ownerId, isDeleted: { $ne: true } })
  if (!product) throw NotFound('Produit introuvable.')
  const supplier = supplierId ? await Supplier.findOne({ _id: supplierId, ownerId }).lean() : null

  const seq = await nextSequence('EN', ownerId)
  const reference = makeReference('EN', seq)
  const when = date ? new Date(date) : new Date()

  const entry = await Entry.create({
    ownerId,
    reference,
    productId,
    productName: product.name,
    quantity: qty,
    unitCost: Number(unitCost || 0),
    supplierId: supplierId || null,
    supplier: supplier?.name || '—',
    comment,
    date: when,
    userLabel: req.user?.fullName || '—',
  })
  product.quantity += qty
  await product.save()
  await StockMovement.create({
    ownerId,
    productId,
    productName: product.name,
    type: 'entree',
    quantity: qty,
    unitCost: Number(unitCost || 0),
    date: when,
    refId: reference,
    refType: 'entry',
    userLabel: req.user?.fullName || '—',
    note: comment,
  })
  await logActivity({ action: 'entrée', entity: 'product', entityLabel: product.name, quantity: qty, details: `${reference} — ${supplier?.name || ''}`.trim() }, req)
  await recomputeAlerts(ownerId)
  ok(res, { ...entry.toObject(), productName: product.name, sku: product.sku, newQuantity: product.quantity }, 201)
})

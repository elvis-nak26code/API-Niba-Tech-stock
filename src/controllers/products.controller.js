import { Product } from '../models/Product.js'
import { Category } from '../models/Category.js'
import { Supplier } from '../models/Supplier.js'
import { HttpError, NotFound } from '../middleware/error.js'
import { catchAsync, ok, apiDoc } from '../utils/res.js'
import { recomputeAlerts, logActivity } from '../services/ops.js'

// Complète les produits avec le nom de leur catégorie / fournisseur (ceux du
// même compte uniquement).
export async function enrichProducts(products, ownerId) {
  if (!products || products.length === 0) return products || []
  const catIds = [...new Set(products.map((p) => p.categoryId).filter(Boolean))]
  const supIds = [...new Set(products.map((p) => p.supplierId).filter(Boolean))]
  const [cats, sups] = await Promise.all([
    catIds.length ? Category.find({ _id: { $in: catIds }, ownerId }).lean() : [],
    supIds.length ? Supplier.find({ _id: { $in: supIds }, ownerId }).lean() : [],
  ])
  const catName = new Map(cats.map((c) => [c._id.toString(), c.name]))
  const supName = new Map(sups.map((s) => [s._id.toString(), s.name]))
  return products.map((p) => ({
    ...apiDoc(p),
    category: p.category || catName.get(p.categoryId) || p.categoryId || '—',
    supplier: p.supplier || supName.get(p.supplierId) || p.supplierId || '—',
  }))
}

export const list = catchAsync(async (req, res) => {
  const products = await Product.find({ ownerId: req.user.id, isDeleted: { $ne: true } }).sort({ name: 1 }).lean()
  ok(res, await enrichProducts(products, req.user.id))
})

export const get = catchAsync(async (req, res) => {
  const product = await Product.findOne({ _id: req.params.id, ownerId: req.user.id, isDeleted: { $ne: true } }).lean()
  if (!product) throw NotFound('Produit introuvable.')
  ok(res, (await enrichProducts([product], req.user.id))[0])
})

export const create = catchAsync(async (req, res) => {
  const ownerId = req.user.id
  const { name, sku, categoryId, supplierId, sellPrice, purchasePrice } = req.body
  if (!name) throw HttpError('Le nom du produit est obligatoire.', 400)
  if (sku && (await Product.findOne({ sku, ownerId, isDeleted: { $ne: true } }))) {
    throw HttpError(`Le SKU « ${sku} » est déjà utilisé.`, 409)
  }
  const [category, supplier] = await Promise.all([
    categoryId ? Category.findOne({ _id: categoryId, ownerId }).lean() : null,
    supplierId ? Supplier.findOne({ _id: supplierId, ownerId }).lean() : null,
  ])
  const product = await Product.create({
    ...req.body,
    ownerId,
    name,
    sku: sku || `PRD-${Date.now().toString(36).toUpperCase()}`,
    category: category?.name || req.body.category || '—',
    supplier: supplier?.name || req.body.supplier || '—',
    quantity: Number(req.body.quantity ?? 0),
    minStock: Number(req.body.minStock ?? req.body.min ?? 10),
    purchasePrice: Number(purchasePrice || 0),
    sellPrice: Number(sellPrice || 0),
  })
  await logActivity({ action: 'création', entity: 'product', entityLabel: product.name, details: 'Produit créé' }, req)
  await recomputeAlerts(ownerId)
  ok(res, (await enrichProducts([product.toObject()], ownerId))[0], 201)
})

export const update = catchAsync(async (req, res) => {
  const ownerId = req.user.id
  const product = await Product.findOne({ _id: req.params.id, ownerId, isDeleted: { $ne: true } })
  if (!product) throw NotFound('Produit introuvable.')
  const { categoryId, supplierId, quantity, minStock, purchasePrice, sellPrice, sku, ...rest } = req.body
  if (sku && sku !== product.sku) {
    const dup = await Product.findOne({ sku, ownerId, _id: { $ne: product._id }, isDeleted: { $ne: true } })
    if (dup) throw HttpError(`Le SKU « ${sku} » est déjà utilisé.`, 409)
  }
  let patch = { ...rest }
  delete patch.ownerId
  if (sku !== undefined) patch.sku = sku
  if (quantity !== undefined) patch.quantity = Number(quantity)
  if (minStock !== undefined) patch.minStock = Number(minStock)
  if (purchasePrice !== undefined) patch.purchasePrice = Number(purchasePrice)
  if (sellPrice !== undefined) patch.sellPrice = Number(sellPrice)
  if (categoryId !== undefined) {
    const category = categoryId ? await Category.findOne({ _id: categoryId, ownerId }).lean() : null
    patch.categoryId = categoryId || null
    patch.category = category?.name || '—'
  }
  if (supplierId !== undefined) {
    const supplier = supplierId ? await Supplier.findOne({ _id: supplierId, ownerId }).lean() : null
    patch.supplierId = supplierId || null
    patch.supplier = supplier?.name || '—'
  }
  Object.assign(product, patch)
  await product.save()
  await logActivity({ action: 'modification', entity: 'product', entityLabel: product.name, details: 'Produit modifié' }, req)
  await recomputeAlerts(ownerId)
  ok(res, (await enrichProducts([product.toObject()], ownerId))[0])
})

export const remove = catchAsync(async (req, res) => {
  const ownerId = req.user.id
  const product = await Product.findOne({ _id: req.params.id, ownerId, isDeleted: { $ne: true } })
  if (!product) throw NotFound('Produit introuvable.')
  product.isDeleted = true
  product.deletedAt = new Date()
  await product.save()
  await logActivity({ action: 'suppression', entity: 'product', entityLabel: product.name, details: 'Produit supprimé' }, req)
  await recomputeAlerts(ownerId)
  ok(res, { ok: true })
})

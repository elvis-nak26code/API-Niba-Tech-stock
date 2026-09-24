import { Category } from '../models/Category.js'
import { Product } from '../models/Product.js'
import { HttpError, NotFound } from '../middleware/error.js'
import { catchAsync, ok, apiDoc } from '../utils/res.js'
import { logActivity } from '../services/ops.js'

export const list = catchAsync(async (_req, res) => {
  const cats = await Category.find().sort({ name: 1 }).lean()
  ok(res, cats.map(apiDoc))
})

export const create = catchAsync(async (req, res) => {
  const { name, description } = req.body
  if (!name) throw HttpError('Le nom de la catégorie est obligatoire.', 400)
  const dup = await Category.findOne({ name: { $regex: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } })
  if (dup) throw HttpError('Cette catégorie existe déjà.', 409)
  const cat = await Category.create({ name, description })
  await logActivity({ action: 'création', entity: 'category', entityLabel: cat.name, details: 'Catégorie créée' }, req)
  ok(res, cat.toObject(), 201)
})

export const update = catchAsync(async (req, res) => {
  const cat = await Category.findById(req.params.id)
  if (!cat) throw NotFound('Catégorie introuvable.')
  Object.assign(cat, req.body)
  await cat.save()
  await Product.updateMany({ categoryId: cat._id.toString() }, { category: cat.name })
  await logActivity({ action: 'modification', entity: 'category', entityLabel: cat.name, details: 'Catégorie modifiée' }, req)
  ok(res, cat.toObject())
})

export const remove = catchAsync(async (req, res) => {
  const cat = await Category.findById(req.params.id)
  if (!cat) throw NotFound('Catégorie introuvable.')
  await Category.deleteOne({ _id: cat._id })
  await Product.updateMany({ categoryId: cat._id.toString() }, { categoryId: null, category: '—' })
  await logActivity({ action: 'suppression', entity: 'category', entityLabel: cat.name, details: 'Catégorie supprimée' }, req)
  ok(res, { ok: true })
})
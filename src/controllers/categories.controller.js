import { Category } from '../models/Category.js'
import { Product } from '../models/Product.js'
import { HttpError, NotFound } from '../middleware/error.js'
import { catchAsync, ok, apiDoc } from '../utils/res.js'
import { logActivity } from '../services/ops.js'

export const list = catchAsync(async (req, res) => {
  const cats = await Category.find({ ownerId: req.user.id }).sort({ name: 1 }).lean()
  ok(res, cats.map(apiDoc))
})

export const create = catchAsync(async (req, res) => {
  const ownerId = req.user.id
  const { name, description } = req.body
  if (!name) throw HttpError('Le nom de la catégorie est obligatoire.', 400)
  const dup = await Category.findOne({ ownerId, name: { $regex: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } })
  if (dup) throw HttpError('Cette catégorie existe déjà.', 409)
  const cat = await Category.create({ name, description, ownerId })
  await logActivity({ action: 'création', entity: 'category', entityLabel: cat.name, details: 'Catégorie créée' }, req)
  ok(res, cat.toObject(), 201)
})

export const update = catchAsync(async (req, res) => {
  const ownerId = req.user.id
  const cat = await Category.findOne({ _id: req.params.id, ownerId })
  if (!cat) throw NotFound('Catégorie introuvable.')
  const { ownerId: _ignored, ...fields } = req.body
  Object.assign(cat, fields)
  await cat.save()
  await Product.updateMany({ ownerId, categoryId: cat._id.toString() }, { category: cat.name })
  await logActivity({ action: 'modification', entity: 'category', entityLabel: cat.name, details: 'Catégorie modifiée' }, req)
  ok(res, cat.toObject())
})

export const remove = catchAsync(async (req, res) => {
  const ownerId = req.user.id
  const cat = await Category.findOne({ _id: req.params.id, ownerId })
  if (!cat) throw NotFound('Catégorie introuvable.')
  await Category.deleteOne({ _id: cat._id })
  await Product.updateMany({ ownerId, categoryId: cat._id.toString() }, { categoryId: null, category: '—' })
  await logActivity({ action: 'suppression', entity: 'category', entityLabel: cat.name, details: 'Catégorie supprimée' }, req)
  ok(res, { ok: true })
})

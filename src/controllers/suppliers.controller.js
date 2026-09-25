import { Supplier } from '../models/Supplier.js'
import { HttpError, NotFound } from '../middleware/error.js'
import { catchAsync, ok, apiDoc } from '../utils/res.js'
import { logActivity } from '../services/ops.js'

export const list = catchAsync(async (req, res) => {
  ok(res, (await Supplier.find({ ownerId: req.user.id }).sort({ name: 1 }).lean()).map(apiDoc))
})

export const create = catchAsync(async (req, res) => {
  const { name } = req.body
  if (!name) throw HttpError('Le nom du fournisseur est obligatoire.', 400)
  const supplier = await Supplier.create({ ...req.body, ownerId: req.user.id })
  await logActivity({ action: 'création', entity: 'supplier', entityLabel: supplier.name, details: 'Fournisseur créé' }, req)
  ok(res, apiDoc(supplier.toObject()), 201)
})

export const update = catchAsync(async (req, res) => {
  const ownerId = req.user.id
  const supplier = await Supplier.findOne({ _id: req.params.id, ownerId })
  if (!supplier) throw NotFound('Fournisseur introuvable.')
  const { ownerId: _ignored, ...fields } = req.body
  Object.assign(supplier, fields)
  await supplier.save()
  ok(res, apiDoc(supplier.toObject()))
})

export const remove = catchAsync(async (req, res) => {
  const ownerId = req.user.id
  const supplier = await Supplier.findOne({ _id: req.params.id, ownerId })
  if (!supplier) throw NotFound('Fournisseur introuvable.')
  await Supplier.deleteOne({ _id: supplier._id })
  await logActivity({ action: 'suppression', entity: 'supplier', entityLabel: supplier.name, details: 'Fournisseur supprimé' }, req)
  ok(res, { ok: true })
})

import { Supplier } from '../models/Supplier.js'
import { HttpError, NotFound } from '../middleware/error.js'
import { catchAsync, ok, apiDoc } from '../utils/res.js'
import { logActivity } from '../services/ops.js'

export const list = catchAsync(async (_req, res) => {
  ok(res, (await Supplier.find().sort({ name: 1 }).lean()).map(apiDoc))
})

export const create = catchAsync(async (req, res) => {
  const { name } = req.body
  if (!name) throw HttpError('Le nom du fournisseur est obligatoire.', 400)
  const supplier = await Supplier.create(req.body)
  await logActivity({ action: 'création', entity: 'supplier', entityLabel: supplier.name, details: 'Fournisseur créé' }, req)
  ok(res, supplier.toObject(), 201)
})

export const update = catchAsync(async (req, res) => {
  const supplier = await Supplier.findById(req.params.id)
  if (!supplier) throw NotFound('Fournisseur introuvable.')
  Object.assign(supplier, req.body)
  await supplier.save()
  ok(res, supplier.toObject())
})

export const remove = catchAsync(async (req, res) => {
  const supplier = await Supplier.findById(req.params.id)
  if (!supplier) throw NotFound('Fournisseur introuvable.')
  await Supplier.deleteOne({ _id: supplier._id })
  await logActivity({ action: 'suppression', entity: 'supplier', entityLabel: supplier.name, details: 'Fournisseur supprimé' }, req)
  ok(res, { ok: true })
})
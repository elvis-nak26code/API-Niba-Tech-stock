import { Client } from '../models/Client.js'
import { Exit } from '../models/Exit.js'
import { HttpError, NotFound } from '../middleware/error.js'
import { catchAsync, ok, apiDoc } from '../utils/res.js'
import { logActivity } from '../services/ops.js'

export const list = catchAsync(async (req, res) => {
  const clients = await Client.find({ ownerId: req.user.id }).sort({ createdAt: -1 }).lean()
  ok(res, clients.map(apiDoc))
})

export const create = catchAsync(async (req, res) => {
  const { firstName, lastName, phone } = req.body
  if (!firstName && !lastName && !phone) throw HttpError('Nom ou téléphone requis.', 400)
  const client = await Client.create({ ...req.body, ownerId: req.user.id })
  await logActivity({ action: 'création', entity: 'client', entityLabel: `${client.firstName} ${client.lastName}`.trim(), details: 'Client créé' }, req)
  ok(res, apiDoc(client.toObject()), 201)
})

export const update = catchAsync(async (req, res) => {
  const ownerId = req.user.id
  const client = await Client.findOne({ _id: req.params.id, ownerId })
  if (!client) throw NotFound('Client introuvable.')
  const { ownerId: _ignored, ...fields } = req.body
  Object.assign(client, fields)
  await client.save()
  ok(res, apiDoc(client.toObject()))
})

export const remove = catchAsync(async (req, res) => {
  const ownerId = req.user.id
  const client = await Client.findOne({ _id: req.params.id, ownerId })
  if (!client) throw NotFound('Client introuvable.')
  await Client.deleteOne({ _id: client._id })
  // Les sorties sont conservées (historique), le client devient « occasionnel ».
  await Exit.updateMany({ ownerId, clientId: client._id.toString() }, { clientId: null, clientName: 'Client occasionnel' })
  await logActivity({ action: 'suppression', entity: 'client', entityLabel: `${client.firstName} ${client.lastName}`.trim(), details: 'Client supprimé' }, req)
  ok(res, { ok: true })
})

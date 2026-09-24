import { Client } from '../models/Client.js'
import { Exit } from '../models/Exit.js'
import { HttpError, NotFound } from '../middleware/error.js'
import { catchAsync, ok, apiDoc } from '../utils/res.js'
import { logActivity } from '../services/ops.js'

export const list = catchAsync(async (_req, res) => {
  const clients = await Client.find().sort({ createdAt: -1 }).lean()
  ok(res, clients.map(apiDoc))
})

export const create = catchAsync(async (req, res) => {
  const { firstName, lastName, phone } = req.body
  if (!firstName && !lastName && !phone) throw HttpError('Nom ou téléphone requis.', 400)
  const client = await Client.create(req.body)
  await logActivity({ action: 'création', entity: 'client', entityLabel: `${client.firstName} ${client.lastName}`.trim(), details: 'Client créé' }, req)
  ok(res, client.toObject(), 201)
})

export const update = catchAsync(async (req, res) => {
  const client = await Client.findById(req.params.id)
  if (!client) throw NotFound('Client introuvable.')
  Object.assign(client, req.body)
  await client.save()
  ok(res, client.toObject())
})

export const remove = catchAsync(async (req, res) => {
  const client = await Client.findById(req.params.id)
  if (!client) throw NotFound('Client introuvable.')
  await Client.deleteOne({ _id: client._id })
  // Les sorties sont conservées (historique), le client devient « occasionnel ».
  await Exit.updateMany({ clientId: client._id.toString() }, { clientId: null, clientName: 'Client occasionnel' })
  await logActivity({ action: 'suppression', entity: 'client', entityLabel: `${client.firstName} ${client.lastName}`.trim(), details: 'Client supprimé' }, req)
  ok(res, { ok: true })
})
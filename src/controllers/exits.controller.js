import { Exit } from '../models/Exit.js'
import { Product } from '../models/Product.js'
import { Client } from '../models/Client.js'
import { StockMovement } from '../models/StockMovement.js'
import { Setting } from '../models/Setting.js'
import { Counter, makeReference, nextSequence } from '../models/Counter.js'
import { HttpError } from '../middleware/error.js'
import { catchAsync, ok, apiDoc } from '../utils/res.js'
import { logActivity, recomputeAlerts } from '../services/ops.js'

export function computeTotal(exit) {
  const subtotal = (exit.lines || []).reduce((s, l) => s + (l.quantity || 0) * (l.unitPrice || 0), 0)
  return Math.max(0, subtotal - Number(exit.discount || 0))
}

export const list = catchAsync(async (req, res) => {
  const exits = await Exit.find({ ownerId: req.user.id }).sort({ date: -1 }).lean()
  ok(res, exits.map((e) => ({ ...apiDoc(e), total: computeTotal(e) })))
})

export const create = catchAsync(async (req, res) => {
  const ownerId = req.user.id
  const { clientId = null, lines = [], discount = 0, paymentMethod = 'Espèces', comment = '', date } = req.body
  if (!Array.isArray(lines) || lines.length === 0) throw HttpError('La sortie doit contenir au moins une ligne.', 400)

  const settings = await Setting.findOne({ ownerId, key: 'default' }).lean()
  const negativeAllowed = settings?.negativeStock === true

  const qtyById = new Map()
  for (const line of lines) {
    if (!line.productId) throw HttpError('Produit manquant sur une ligne.', 400)
    qtyById.set(line.productId, (qtyById.get(line.productId) || 0) + Number(line.quantity || 0))
  }

  const products = await Product.find({ _id: { $in: [...qtyById.keys()] }, ownerId, isDeleted: { $ne: true } })
  const productMap = new Map(products.map((p) => [p._id.toString(), p]))
  for (const [pid, qty] of qtyById) {
    const p = productMap.get(pid)
    if (!p) throw HttpError('Produit introuvable.', 400)
    if (!negativeAllowed && p.quantity < qty) {
      throw HttpError(`Stock insuffisant pour « ${p.name} » (disponible : ${p.quantity}).`, 400)
    }
  }

  const client = clientId ? await Client.findOne({ _id: clientId, ownerId }).lean() : null
  const seq = await nextSequence('SO', ownerId)
  const reference = makeReference('SO', seq)
  const receiptNumber = makeReference(settings?.receiptPrefix || 'REC', await nextSequence('REC', ownerId))
  const when = date ? new Date(date) : new Date()

  const richLines = lines.map((l) => {
    const p = productMap.get(l.productId) || { name: '—' }
    const qty = Number(l.quantity || 0)
    const unitPrice = Number(l.unitPrice || 0)
    return { productId: l.productId, productName: p.name, quantity: qty, unitPrice, subtotal: qty * unitPrice }
  })

  const exit = await Exit.create({
    ownerId,
    reference,
    receiptNumber,
    clientId: clientId || null,
    clientName: client ? `${client.firstName} ${client.lastName}`.trim() : 'Client occasionnel',
    lines: richLines,
    discount: Number(discount || 0),
    paymentMethod,
    comment,
    date: when,
    userLabel: req.user?.fullName || '—',
  })

  for (const line of richLines) {
    const p = productMap.get(line.productId)
    p.quantity -= line.quantity
    await p.save()
    await StockMovement.create({
      ownerId,
      productId: line.productId,
      productName: p.name,
      type: 'sortie',
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      date: when,
      refId: reference,
      refType: 'exit',
      userLabel: req.user?.fullName || '—',
      note: comment,
    })
  }

  await logActivity({ action: 'sortie', entity: 'sale', entityLabel: reference, details: `${receiptNumber} — ${richLines.length} ligne(s)` }, req)
  await recomputeAlerts(ownerId)
  ok(res, { ...exit.toObject(), total: computeTotal(exit) }, 201)
})

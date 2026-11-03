import { Exit } from '../models/Exit.js'
import { Product } from '../models/Product.js'
import { Client } from '../models/Client.js'
import { StockMovement } from '../models/StockMovement.js'
import { Setting } from '../models/Setting.js'
import { makeReference, makeTicketNumber, nextSequence } from '../models/Counter.js'
import { HttpError, NotFound } from '../middleware/error.js'
import { catchAsync, ok, apiDoc } from '../utils/res.js'
import { logActivity, recomputeAlerts } from '../services/ops.js'

export function computeTotal(exit) {
  const subtotal = (exit.lines || []).reduce((s, l) => s + (l.quantity || 0) * (l.unitPrice || 0), 0)
  return Math.max(0, subtotal - Number(exit.discount || 0))
}

const round = (n) => Math.round((Number(n) || 0) * 100) / 100

// Construit l'objet crédit à partir du total et de l'avance versée. Une avance
// absente (ou nulle) laisse la totalité du montant comme reste à payer.
export function buildCredit({ total, advance = 0, userLabel = '—', date = new Date(), method = 'Espèces' }) {
  const montant = Math.max(0, round(total))
  const avance = Math.min(Math.max(0, round(advance)), montant)
  const payments = avance > 0
    ? [{ amount: avance, date, method, type: 'avance', userLabel }]
    : []
  const balance = Math.max(0, round(montant - avance))
  return {
    total: montant,
    advance: avance,
    paid: avance,
    balance,
    status: balance === 0 ? 'solde' : avance > 0 ? 'partiel' : 'impaye',
    payments,
    createdAt: date,
    settledAt: balance === 0 ? date : null,
  }
}

// Recalcule un crédit envoyé par l'interface (règlement, suppression…). Le
// serveur reste maître des montants : le total vient de la vente, et le reste à
// payer est déduit des règlements enregistrés.
export function normalizeCredit(input, { total, userLabel = '—' }) {
  const montant = Math.max(0, round(total))
  const rawPayments = Array.isArray(input?.payments) ? input.payments : []
  const payments = []
  let paid = 0
  for (const p of rawPayments) {
    const amount = round(p?.amount)
    if (!Number.isFinite(amount) || amount <= 0) continue
    if (paid + amount > montant + 0.001) {
      throw HttpError('Le montant payé dépasse le total du crédit.', 400)
    }
    paid = round(paid + amount)
    payments.push({
      amount,
      date: p?.date ? new Date(p.date) : new Date(),
      method: p?.method || 'Espèces',
      type: p?.type === 'avance' ? 'avance' : 'reglement',
      userLabel: p?.userLabel || userLabel || '—',
    })
  }
  const advance = round(payments.filter((p) => p.type === 'avance').reduce((s, p) => s + p.amount, 0))
  const balance = Math.max(0, round(montant - paid))
  const status = balance === 0 ? 'solde' : paid > 0 ? 'partiel' : 'impaye'
  return {
    total: montant,
    advance,
    paid,
    balance,
    status,
    payments,
    createdAt: input?.createdAt ? new Date(input.createdAt) : new Date(),
    settledAt: status === 'solde' ? (input?.settledAt ? new Date(input.settledAt) : new Date()) : null,
  }
}

// Numéro de ticket : on accepte celui proposé par un poste hors ligne (il a
// déjà été imprimé) s'il n'est pas déjà utilisé ; sinon on en génère un nouveau.
// Dans tous les cas le numéro enregistré est unique.
async function resolveTicketNumber(prefix, ownerId, proposed) {
  const candidate = typeof proposed === 'string' ? proposed.trim() : ''
  if (candidate && !(await Exit.exists({ receiptNumber: candidate }))) return candidate
  for (let i = 0; i < 6; i += 1) {
    const ticket = makeTicketNumber(prefix, await nextSequence('REC', ownerId))
    if (!(await Exit.exists({ receiptNumber: ticket }))) return ticket
  }
  return makeTicketNumber(prefix, await nextSequence('REC', ownerId))
}

export const list = catchAsync(async (req, res) => {
  const exits = await Exit.find({ ownerId: req.user.id }).sort({ date: -1 }).lean()
  ok(res, exits.map((e) => ({ ...apiDoc(e), total: computeTotal(e) })))
})

export const create = catchAsync(async (req, res) => {
  const ownerId = req.user.id
  const { clientId = null, lines = [], discount = 0, paymentMethod = 'Espèces', advance = 0, receiptNumber: proposedReceipt = '', comment = '', date } = req.body
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
  const receiptNumber = await resolveTicketNumber(settings?.receiptPrefix || 'REC', ownerId, proposedReceipt)
  const when = date ? new Date(date) : new Date()
  const userLabel = req.user?.fullName || '—'

  const richLines = lines.map((l) => {
    const p = productMap.get(l.productId) || { name: '—' }
    const qty = Number(l.quantity || 0)
    const unitPrice = Number(l.unitPrice || 0)
    return { productId: l.productId, productName: p.name, quantity: qty, unitPrice, subtotal: qty * unitPrice }
  })

  const total = computeTotal({ lines: richLines, discount })
  if (paymentMethod === 'Crédit' && Number(advance || 0) > total) {
    throw HttpError("L'avance ne peut pas dépasser le montant total de la vente.", 400)
  }

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
    userLabel,
    credit: paymentMethod === 'Crédit'
      ? buildCredit({ total, advance: Number(advance || 0), userLabel, date: when })
      : null,
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
      userLabel,
      note: comment,
    })
  }

  await logActivity({ action: 'sortie', entity: 'sale', entityLabel: reference, details: `${receiptNumber} — ${richLines.length} ligne(s)` }, req)
  await recomputeAlerts(ownerId)
  ok(res, { ...exit.toObject(), total: computeTotal(exit) }, 201)
})

// Mise à jour limitée au suivi du crédit : le stock, les produits et les
// montants de la vente ne sont jamais modifiés ici.
export const update = catchAsync(async (req, res) => {
  const ownerId = req.user.id
  const exit = await Exit.findOne({ _id: req.params.id, ownerId })
  if (!exit) throw NotFound('Sortie introuvable.')

  const body = req.body || {}
  if (!Object.prototype.hasOwnProperty.call(body, 'credit')) {
    throw HttpError('Aucune donnée de crédit à mettre à jour.', 400)
  }

  const total = computeTotal(exit)
  if (body.credit === null || body.credit === undefined) {
    // Suppression du suivi de crédit : la vente et la sortie de stock restent
    // intactes, seul l'onglet « Crédits » ne la référence plus.
    exit.credit = null
  } else {
    exit.credit = normalizeCredit(body.credit, { total, userLabel: req.user?.fullName || '—' })
    exit.paymentMethod = 'Crédit'
    if (exit.credit.status === 'solde' && !exit.credit.settledAt) exit.credit.settledAt = new Date()
  }

  await exit.save()
  await logActivity({
    action: body.credit ? 'règlement crédit' : 'suppression crédit',
    entity: 'sale',
    entityLabel: exit.receiptNumber,
    details: body.credit
      ? `Reste à payer : ${exit.credit?.balance ?? 0}`
      : 'Suivi de crédit supprimé (vente conservée)',
  }, req)
  ok(res, { ...exit.toObject(), total: computeTotal(exit) })
})

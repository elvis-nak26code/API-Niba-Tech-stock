import mongoose from 'mongoose'
import { withCommon, withOwner } from './base.js'

const lineSchema = new mongoose.Schema(
  {
    productId: String,
    productName: String,
    quantity: Number,
    unitPrice: Number,
    subtotal: Number,
  },
  { _id: false },
)

// Un règlement de crédit : l'avance initiale est enregistrée comme premier
// paiement (type « avance »), les paiements suivants comme « reglement ».
const paymentSchema = new mongoose.Schema(
  {
    amount: { type: Number, default: 0 },
    date: { type: Date, default: () => new Date() },
    method: { type: String, default: 'Espèces' },
    type: { type: String, enum: ['avance', 'reglement'], default: 'reglement' },
    userLabel: { type: String, default: '—' },
  },
  { _id: false },
)

const creditSchema = new mongoose.Schema(
  {
    total: { type: Number, default: 0 },
    advance: { type: Number, default: 0 },
    paid: { type: Number, default: 0 },
    balance: { type: Number, default: 0 },
    // 'impaye' (aucun paiement), 'partiel' (avance/acompte) ou 'solde'.
    status: { type: String, enum: ['impaye', 'partiel', 'solde'], default: 'impaye' },
    payments: { type: [paymentSchema], default: [] },
    createdAt: { type: Date, default: () => new Date() },
    settledAt: { type: Date, default: null },
  },
  { _id: false },
)

const exitSchema = new mongoose.Schema({
  _id: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
  reference: { type: String, required: true },
  receiptNumber: { type: String, required: true },
  clientId: { type: String, default: null },
  clientName: { type: String, default: 'Client occasionnel' },
  lines: { type: [lineSchema], default: [] },
  discount: { type: Number, default: 0 },
  paymentMethod: { type: String, default: 'Espèces' },
  comment: { type: String, default: '' },
  date: { type: Date, default: () => new Date() },
  userLabel: { type: String, default: '—' },
  // Présent uniquement pour une vente à crédit : toutes les informations de
  // l'opération (total, avance, règlements, reste à payer, statut).
  credit: { type: creditSchema, default: null },
})
exitSchema.index({ date: -1 })
exitSchema.index({ clientId: 1 })
exitSchema.index({ ownerId: 1 })
exitSchema.index({ receiptNumber: 1 })
exitSchema.index({ ownerId: 1, reference: 1 }, { unique: true })
withOwner(exitSchema)
withCommon(exitSchema)

export const Exit = mongoose.model('Exit', exitSchema)

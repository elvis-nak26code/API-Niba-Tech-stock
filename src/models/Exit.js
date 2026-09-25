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
})
exitSchema.index({ date: -1 })
exitSchema.index({ clientId: 1 })
exitSchema.index({ ownerId: 1 })
exitSchema.index({ ownerId: 1, reference: 1 }, { unique: true })
withOwner(exitSchema)
withCommon(exitSchema)

export const Exit = mongoose.model('Exit', exitSchema)
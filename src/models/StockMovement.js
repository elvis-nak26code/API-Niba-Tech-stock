import mongoose from 'mongoose'
import { withCommon } from './base.js'

const movementSchema = new mongoose.Schema({
  _id: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
  productId: { type: String, required: true },
  productName: { type: String, default: '' },
  type: { type: String, enum: ['entree', 'sortie', 'ajustement'], default: 'entree' },
  quantity: { type: Number, required: true },
  unitPrice: { type: Number, default: 0 },
  unitCost: { type: Number, default: 0 },
  date: { type: Date, default: () => new Date() },
  refId: { type: String, default: '' },
  refType: { type: String, default: 'other' },
  userLabel: { type: String, default: '—' },
  note: { type: String, default: '' },
})
movementSchema.index({ date: -1 })
movementSchema.index({ productId: 1 })
withCommon(movementSchema)

export const StockMovement = mongoose.model('StockMovement', movementSchema)
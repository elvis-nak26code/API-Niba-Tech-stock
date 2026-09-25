import mongoose from 'mongoose'
import { withCommon, withOwner } from './base.js'

const alertSchema = new mongoose.Schema({
  _id: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
  productId: { type: String, required: true },
  productName: { type: String, default: '' },
  type: { type: String, enum: ['rupture', 'low'], required: true },
  message: { type: String, default: '' },
  quantity: { type: Number, default: 0 },
  minStock: { type: Number, default: 0 },
  status: { type: String, enum: ['active', 'resolved'], default: 'active' },
  createdBy: { type: String, default: 'Système' },
  resolvedAt: { type: Date, default: null },
})
alertSchema.index({ status: 1 })
alertSchema.index({ productId: 1 })
alertSchema.index({ ownerId: 1 })
withOwner(alertSchema)
withCommon(alertSchema)

export const Alert = mongoose.model('Alert', alertSchema)
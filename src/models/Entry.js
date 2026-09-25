import mongoose from 'mongoose'
import { withCommon, withOwner } from './base.js'

const entrySchema = new mongoose.Schema({
  _id: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
  reference: { type: String, required: true },
  productId: { type: String, required: true },
  productName: { type: String, default: '' },
  quantity: { type: Number, required: true },
  unitCost: { type: Number, default: 0 },
  supplierId: { type: String, default: null },
  supplier: { type: String, default: '—' },
  comment: { type: String, default: '' },
  date: { type: Date, default: () => new Date() },
  userLabel: { type: String, default: '—' },
})
entrySchema.index({ date: -1 })
entrySchema.index({ productId: 1 })
entrySchema.index({ ownerId: 1 })
entrySchema.index({ ownerId: 1, reference: 1 }, { unique: true })
withOwner(entrySchema)
withCommon(entrySchema)

export const Entry = mongoose.model('Entry', entrySchema)
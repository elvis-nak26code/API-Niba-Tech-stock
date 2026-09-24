import mongoose from 'mongoose'
import { withCommon } from './base.js'

const entrySchema = new mongoose.Schema({
  _id: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
  reference: { type: String, required: true, unique: true },
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
withCommon(entrySchema)

export const Entry = mongoose.model('Entry', entrySchema)
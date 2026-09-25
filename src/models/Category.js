import mongoose from 'mongoose'
import { withCommon, withOwner } from './base.js'

const categorySchema = new mongoose.Schema({
  _id: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
})
categorySchema.index({ ownerId: 1, name: 1 })
withOwner(categorySchema)
withCommon(categorySchema)

export const Category = mongoose.model('Category', categorySchema)
import mongoose from 'mongoose'
import { withCommon } from './base.js'

const categorySchema = new mongoose.Schema({
  _id: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
})
withCommon(categorySchema)

export const Category = mongoose.model('Category', categorySchema)
import mongoose from 'mongoose'
import { withCommon } from './base.js'

const supplierSchema = new mongoose.Schema({
  _id: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
  name: { type: String, required: true, trim: true },
  contactName: { type: String, default: '' },
  phone: { type: String, trim: true, default: '' },
  email: { type: String, trim: true, default: '' },
  address: { type: String, default: '' },
  notes: { type: String, default: '' },
})
withCommon(supplierSchema)

export const Supplier = mongoose.model('Supplier', supplierSchema)
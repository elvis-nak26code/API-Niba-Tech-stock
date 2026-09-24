import mongoose from 'mongoose'
import { withCommon } from './base.js'

const clientSchema = new mongoose.Schema({
  _id: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
  firstName: { type: String, trim: true },
  lastName: { type: String, trim: true },
  company: { type: String, default: '' },
  phone: { type: String, trim: true, default: '' },
  email: { type: String, trim: true, lowercase: true, default: '' },
  address: { type: String, default: '' },
  notes: { type: String, default: '' },
})
clientSchema.index({ phone: 1 })
withCommon(clientSchema, (ret) => {
  ret.fullName = `${ret.firstName || ''} ${ret.lastName || ''}`.trim()
  return ret
})

export const Client = mongoose.model('Client', clientSchema)
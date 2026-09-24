import mongoose from 'mongoose'
import { withCommon } from './base.js'

const activitySchema = new mongoose.Schema({
  _id: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
  action: { type: String, default: '' },
  entity: { type: String, default: 'other' },
  entityLabel: { type: String, default: '' },
  details: { type: String, default: '' },
  quantity: { type: Number, default: null },
  date: { type: Date, default: () => new Date() },
  userId: { type: String, default: '' },
  userLabel: { type: String, default: '—' },
})
activitySchema.index({ date: -1 })
withCommon(activitySchema)

export const Activity = mongoose.model('Activity', activitySchema)
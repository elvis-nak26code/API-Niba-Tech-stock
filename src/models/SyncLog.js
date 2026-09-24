import mongoose from 'mongoose'
import { withCommon } from './base.js'

const syncLogSchema = new mongoose.Schema({
  type: { type: String, default: 'full' },
  status: { type: String, enum: ['syncing', 'synced', 'error'], default: 'synced' },
  itemsCount: { type: Number, default: 0 },
  startedAt: { type: Date, default: () => new Date() },
  finishedAt: { type: Date, default: () => new Date() },
  error: { type: String, default: null },
  clientInfo: { type: mongoose.Schema.Types.Mixed, default: null },
})
syncLogSchema.index({ startedAt: -1 })
withCommon(syncLogSchema)

export const SyncLog = mongoose.model('SyncLog', syncLogSchema)
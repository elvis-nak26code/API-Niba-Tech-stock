import mongoose from 'mongoose'
import { withCommon } from './base.js'

// Une session = un poste/appareil connecté. C'est la source de vérité des
// indicateurs « en ligne » : l'application émet un heartbeat régulier qui
// met à jour `lastSeen` ; au-delà de OFFLINE_AFTER_MS sans heartbeat, la session
// est considérée comme hors ligne (aucun cron n'est nécessaire).
const userSessionSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  jti: { type: String, default: '', index: true },
  device: { type: String, default: '' },
  platform: { type: String, default: '' },
  appVersion: { type: String, default: '' },
  ip: { type: String, default: '' },
  userAgent: { type: String, default: '' },
  lastSeen: { type: Date, default: Date.now, index: true },
  revokedAt: { type: Date, default: null },
})

userSessionSchema.index({ userId: 1, lastSeen: -1 })
withCommon(userSessionSchema)

export const UserSession = mongoose.model('UserSession', userSessionSchema)

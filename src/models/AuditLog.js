import mongoose from 'mongoose'
import { withCommon } from './base.js'

// Journal des actions d'administration : qui, quoi, sur qui, quand, avec quel
// résultat. Volontairement hors du périmètre multi-tenant (`withOwner` n'est pas
// appliqué) : c'est un journal global, précisément parce qu'il sert à contrôler
// les comptes des autres.
const auditLogSchema = new mongoose.Schema({
  actorId: { type: String, default: '', index: true },
  actorName: { type: String, default: '' },
  action: { type: String, required: true },
  targetUserId: { type: String, default: '', index: true },
  targetName: { type: String, default: '' },
  result: { type: String, enum: ['succès', 'échec'], default: 'succès' },
  reason: { type: String, default: '' },
  details: { type: String, default: '' },
  ip: { type: String, default: '' },
})

auditLogSchema.index({ createdAt: -1 })
withCommon(auditLogSchema)

export const AuditLog = mongoose.model('AuditLog', auditLogSchema)

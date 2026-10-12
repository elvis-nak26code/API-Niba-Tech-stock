import { AuditLog } from '../models/AuditLog.js'

/**
 * Journalise une action d'administration.
 *
 * Ne lève jamais : une écriture de journal qui échoue ne doit pas faire
 * échouer l'action métier déjà réalisée (l'échec est simplement signalé dans la
 * console).
 */
export async function recordAudit({
  req,
  action,
  targetUserId = '',
  targetName = '',
  result = 'succès',
  reason = '',
  details = '',
} = {}) {
  try {
    await AuditLog.create({
      actorId: req?.user?.id || '',
      actorName: req?.user?.fullName || 'Système',
      action,
      targetUserId: targetUserId || '',
      targetName: targetName || '',
      result,
      reason: reason ? String(reason).slice(0, 300) : '',
      details: details ? String(details).slice(0, 500) : '',
      ip: req?.ip || '',
    })
  } catch (err) {
    console.error('[audit] Échec journalisation :', err.message)
  }
}

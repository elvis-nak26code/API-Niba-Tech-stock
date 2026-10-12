import { env } from '../config/env.js'

// Durées proposées par l'interface d'administration, en millisecondes.
export const BLOCK_PRESETS = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
}

export const ACCESS_STATUS = {
  ACTIF: 'actif',
  BLOQUE: 'bloqué',
  BLOCAGE_PROGRAMME: 'blocage_programme',
  DEBLOCAGE_PROGRAMME: 'deblocage_programme',
}

const asDate = (v) => (v ? new Date(v) : null)

/**
 * État d'accès d'un compte, calculé à partir des dates de blocage.
 *
 * Le blocage est entièrement piloté par `blockStartsAt` / `blockEndsAt` :
 *   - `blockStartsAt` dans le futur  → blocage programmé
 *   - fenêtre en cours + `blockEndsAt` → déblocage automatique programmé
 *   - fenêtre en cours ou sans fin   → bloqué
 * Aucun tâche planifiée n'est nécessaire pour qu'un blocage prenne effet ou
 * expire : la décision est recalculée à chaque requête.
 */
export function resolveAccess(user, now = new Date()) {
  const startsAt = asDate(user.blockStartsAt)
  const endsAt = asDate(user.blockEndsAt)
  const disabled = user.active === false

  // Un compte qui n'a jamais été bloqué n'a aucune date : ce n'est PAS un
  // blocage « sans fin », c'est simplement un compte actif.
  const hasSchedule = Boolean(startsAt || endsAt)
  const scheduledStart = Boolean(startsAt && startsAt > now)
  const started = !startsAt || startsAt <= now
  const withinEnd = !endsAt || endsAt > now

  let blocked = false
  if (!scheduledStart) {
    if (disabled) blocked = true
    else if (hasSchedule && started) blocked = withinEnd
  }
  const autoRelease = blocked && Boolean(endsAt && endsAt > now)

  let status = ACCESS_STATUS.ACTIF
  if (blocked) status = autoRelease ? ACCESS_STATUS.DEBLOCAGE_PROGRAMME : ACCESS_STATUS.BLOQUE
  else if (scheduledStart) status = ACCESS_STATUS.BLOCAGE_PROGRAMME

  return {
    blocked,
    status,
    startsAt: startsAt || null,
    endsAt: endsAt || null,
    reason: user.blockReason || '',
    scheduledStart,
    autoRelease,
  }
}

/** Message refusant la connexion, compréhensible par l'utilisateur. */
export function blockMessage(access) {
  if (!access.blocked) return ''
  if (access.endsAt) {
    return `Votre compte est bloqué jusqu'au ${access.endsAt.toLocaleString('fr-FR')}.`
  }
  return 'Votre compte est bloqué par un administrateur.'
}

export function scheduledMessage(access) {
  if (!access.scheduledStart) return ''
  return `Votre compte est bloqué à partir du ${access.startsAt.toLocaleString('fr-FR')}.`
}

/** Traduit une durée (« 6h », « 1d ») ou une date ISO en millisecondes. */
export function resolveDuration({ duration, endsAt, startsAt }) {
  let start = null
  let end = null
  if (startsAt) {
    const d = new Date(startsAt)
    if (Number.isNaN(d.getTime())) return { error: 'Date de début de blocage invalide.' }
    start = d
  }
  if (endsAt) {
    const d = new Date(endsAt)
    if (Number.isNaN(d.getTime())) return { error: 'Date de fin de blocage invalide.' }
    end = d
  } else if (duration && duration !== 'custom') {
    const ms = BLOCK_PRESETS[duration]
    if (!ms) return { error: 'Durée de blocage inconnue.' }
    const from = start && start > new Date() ? start : new Date()
    end = new Date(from.getTime() + ms)
  }
  if (end && start && end <= start) return { error: 'La fin du blocage doit être postérieure à son début.' }
  return { start, end }
}

/**
 * Nettoie les blocages expirés. Un blocage dont la date de fin est dépassée
 * n'est plus appliqué ; on efface donc les dates pour que l'interface et les
 * exports ne montrent plus de compte « bloqué » qui ne l'est plus.
 */
export async function sweepExpiredBlocks(User) {
  const now = new Date()
  const res = await User.updateMany(
    { blockEndsAt: { $ne: null, $lte: now } },
    {
      $set: {
        blockStartsAt: null,
        blockEndsAt: null,
        blockReason: '',
        blockedAt: null,
        blockedBy: '',
        active: true,
      },
    },
  )
  return res.modifiedCount || 0
}

export function onlineSince(lastSeen) {
  if (!lastSeen) return null
  return Date.now() - new Date(lastSeen).getTime() < env.offlineAfterMs
}

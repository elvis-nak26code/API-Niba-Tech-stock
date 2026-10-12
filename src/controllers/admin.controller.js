import { env } from '../config/env.js'
import { User } from '../models/User.js'
import { UserSession } from '../models/UserSession.js'
import { AuditLog } from '../models/AuditLog.js'
import { HttpError, NotFound } from '../middleware/error.js'
import { clearAccessCache } from '../middleware/auth.js'
import { catchAsync, ok, apiDoc } from '../utils/res.js'
import { ACCESS_STATUS, resolveAccess, resolveDuration, sweepExpiredBlocks } from '../services/access.js'
import { recordAudit } from '../services/audit.js'

const ROLES = ['Administrateur', 'Gestionnaire', 'Caissier', 'Employé']
const STATUS_VALUES = Object.values(ACCESS_STATUS)

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function paginate(query) {
  const page = Math.max(1, Number(query.page) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20))
  return { page, pageSize, skip: (page - 1) * pageSize }
}

const nameOf = (u) => `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email

/** Sessions « en ligne » : un heartbeat récent par compte. */
async function onlineMap() {
  const rows = await UserSession.aggregate([
    { $match: { revokedAt: null, lastSeen: { $gte: new Date(Date.now() - env.offlineAfterMs) } } },
    { $group: { _id: '$userId', lastSeen: { $max: '$lastSeen' }, sessions: { $sum: 1 } } },
  ])
  return new Map(rows.map((r) => [r._id, r]))
}

/** Vue publique d'un compte pour l'espace Admin. */
function decorate(user, online) {
  const access = resolveAccess(user)
  // Compatible document mongoose (transform toJSON/toObject qui masque _id),
  // objet brut et document lean.
  const id = String(user.id || user._id || '')
  const onlineRow = online?.get(id)
  return {
    id,
    firstName: user.firstName || '',
    lastName: user.lastName || '',
    fullName: nameOf(user),
    email: user.email,
    phone: user.phone || '',
    company: user.company || '',
    role: user.role,
    isSuperAdmin: Boolean(user.isSuperAdmin),
    active: user.active !== false,
    status: access.status,
    blocked: access.blocked,
    blockReason: access.reason,
    blockStartsAt: access.startsAt,
    blockEndsAt: access.endsAt,
    blockedAt: user.blockedAt || null,
    blockedBy: user.blockedBy || '',
    online: Boolean(onlineRow),
    lastSeen: onlineRow?.lastSeen || user.lastActivityAt || null,
    activeSessions: onlineRow?.sessions || 0,
    loginCount: user.loginCount || 0,
    lastLoginAt: user.lastLoginAt || null,
    lastActivityAt: user.lastActivityAt || null,
    createdAt: user.createdAt || null,
  }
}

/**
 * Un administrateur délégué ne peut agir que sur des comptes non administrateur.
 * Le super administrateur reste seul maître des comptes administrateur.
 */
function assertCanManage(req, target) {
  const targetId = target._id.toString()
  if (targetId === req.user.id) throw HttpError('Vous ne pouvez pas modifier votre propre compte depuis cette page.', 400)
  if ((target.isSuperAdmin || target.role === 'Administrateur') && !req.user.isSuperAdmin) {
    throw HttpError('Seul le super administrateur peut gérer un compte administrateur.', 403)
  }
}

async function findUser(id) {
  const user = await User.findById(id)
  if (!user) throw NotFound('Compte introuvable.')
  return user
}

/** Empêche de supprimer le dernier super administrateur de l'installation. */
async function assertNotLastSuperAdmin(user) {
  if (!user.isSuperAdmin) return
  const others = await User.countDocuments({ isSuperAdmin: true, _id: { $ne: user._id } })
  if (others === 0) throw HttpError('Impossible : il doit rester au moins un super administrateur.', 400)
}

// ---------------------------------------------------------------------------
// Statistiques globales
// ---------------------------------------------------------------------------
export const stats = catchAsync(async (req, res) => {
  await sweepExpiredBlocks(User)
  const now = new Date()
  const onlineSince = new Date(now.getTime() - env.offlineAfterMs)
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  const [total, newThisWeek, onlineUsers, activeSessions, activeThisWeek, roleAgg, topUsers] = await Promise.all([
    User.countDocuments({}),
    User.countDocuments({ createdAt: { $gte: weekAgo } }),
    // Un utilisateur est « en ligne » s'il a au moins une session récente.
    UserSession.distinct('userId', { revokedAt: null, lastSeen: { $gte: onlineSince } }),
    UserSession.countDocuments({ revokedAt: null, lastSeen: { $gte: onlineSince } }),
    UserSession.countDocuments({ revokedAt: null, createdAt: { $gte: weekAgo } }),
    User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]),
    User.find({}).sort({ loginCount: -1, lastActivityAt: -1 }).limit(5).lean(),
  ])

  // Les statuts sont recalculés : un blocage programmé ou expiré ne doit pas
  // gonfler les compteurs.
  const all = await User.find({}).select('active blockStartsAt blockEndsAt').lean()
  const counts = { [ACCESS_STATUS.ACTIF]: 0, [ACCESS_STATUS.BLOQUE]: 0, [ACCESS_STATUS.BLOCAGE_PROGRAMME]: 0, [ACCESS_STATUS.DEBLOCAGE_PROGRAMME]: 0 }
  for (const u of all) counts[resolveAccess(u, now).status] += 1

  const online = await onlineMap()
  ok(res, {
    users: { total, ...counts },
    newThisWeek,
    online: { now: onlineUsers.length },
    sessions: { active: activeSessions, newThisWeek: activeThisWeek },
    roles: ROLES.map((role) => ({ role, count: roleAgg.find((r) => r._id === role)?.count || 0 })),
    topUsers: topUsers.map((u) => ({ id: u._id.toString(), name: nameOf(u), email: u.email, logins: u.loginCount || 0, lastActivityAt: u.lastActivityAt || null, online: online.has(String(u._id)) })),
    generatedAt: now.toISOString(),
  })
})

// ---------------------------------------------------------------------------
// Liste des comptes
// ---------------------------------------------------------------------------

/**
 * Traduit un statut d'accès en filtre Mongo.
 *
 * Le statut n'est pas stocké : il se déduit des dates de blocage. Pour que la
 * pagination reste exacte, le filtrage doit se faire DANS la requête, et non
 * sur la page déjà découpée. Les expressions ci-dessous reproduisent exactement
 * `resolveAccess`.
 */
function statusFilter(status, now) {
  if (!status || !STATUS_VALUES.includes(status)) return null

  const scheduledStart = { blockStartsAt: { $gt: now } }
  const started = { $or: [{ blockStartsAt: { $exists: false } }, { blockStartsAt: null }, { blockStartsAt: { $lte: now } }] }
  const withinEnd = { $or: [{ blockEndsAt: { $exists: false } }, { blockEndsAt: null }, { blockEndsAt: { $gt: now } }] }
  const hasSchedule = { $or: [{ blockStartsAt: { $ne: null } }, { blockEndsAt: { $ne: null } }] }
  const autoRelease = { blockEndsAt: { $gt: now } }
  const blocked = {
    $and: [
      // Un blocage programmé ne bloque pas encore : il ne peut donc pas être « bloqué ».
      { $nor: [scheduledStart] },
      { $or: [{ active: false }, { $and: [hasSchedule, started, withinEnd] }] },
    ],
  }

  if (status === ACCESS_STATUS.BLOQUE) return { $and: [blocked, { $nor: [autoRelease] }] }
  if (status === ACCESS_STATUS.DEBLOCAGE_PROGRAMME) return { $and: [blocked, autoRelease] }
  if (status === ACCESS_STATUS.BLOCAGE_PROGRAMME) return scheduledStart
  return { $and: [{ $nor: [blocked] }, { $nor: [scheduledStart] }] }
}

export const listUsers = catchAsync(async (req, res) => {
  await sweepExpiredBlocks(User)
  const { page, pageSize, skip } = paginate(req.query)
  const { q = '', status = '', role = '', sort = 'recent' } = req.query

  const sorts = {
    recent: { createdAt: -1 },
    name: { firstName: 1, lastName: 1 },
    logins: { loginCount: -1 },
    activity: { lastActivityAt: -1 },
  }
  const sortSpec = sorts[sort] || sorts.recent

  const clauses = []
  if (role && ROLES.includes(role)) clauses.push({ role })
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i')
    clauses.push({ $or: [{ email: rx }, { firstName: rx }, { lastName: rx }, { phone: rx }, { company: rx }] })
  }
  const statusClause = statusFilter(status, new Date())
  if (statusClause) clauses.push(statusClause)

  // Un seul et même filtre sert à la page ET au total : sinon « 3 résultats »
  // peut afficher une page vide alors que des comptes correspondent.
  const effective = clauses.length ? (clauses.length === 1 ? clauses[0] : { $and: clauses }) : {}
  const [users, total] = await Promise.all([
    User.find(effective).sort(sortSpec).skip(skip).limit(pageSize).lean(),
    User.countDocuments(effective),
  ])
  const online = await onlineMap()
  const items = users.map((u) => decorate(u, online))

  ok(res, { items, page, pageSize, total, filtered: Boolean(status), onlineCount: online.size })
})

export const getUser = catchAsync(async (req, res) => {
  const user = await findUser(req.params.id)
  const online = await onlineMap()
  const sessions = await UserSession.find({ userId: user._id.toString(), revokedAt: null }).sort({ lastSeen: -1 }).limit(20).lean()
  const logs = await AuditLog.find({ targetUserId: user._id.toString() }).sort({ createdAt: -1 }).limit(50).lean()
  ok(res, {
    ...decorate(user.toObject(), online),
    sessions: sessions.map((s) => apiDoc(s)),
    history: logs.map((l) => apiDoc(l)),
  })
})

// ---------------------------------------------------------------------------
// Blocage / déblocage
// ---------------------------------------------------------------------------
export const blockUser = catchAsync(async (req, res) => {
  const user = await findUser(req.params.id)
  assertCanManage(req, user)

  const { error, start, end } = resolveDuration(req.body || {})
  if (error) throw HttpError(error, 400)

  user.blockStartsAt = start || new Date()
  user.blockEndsAt = end || null
  user.blockReason = String(req.body?.reason || '').slice(0, 300)
  user.blockedAt = new Date()
  user.blockedBy = req.user?.fullName || '—'
  await user.save()
  clearAccessCache(user._id.toString())

  // Toutes les sessions ouvertes sont révoquées : le blocage est immédiat.
  await UserSession.updateMany({ userId: user._id.toString(), revokedAt: null }, { $set: { revokedAt: new Date() } })

  const access = resolveAccess(user)
  await recordAudit({
    req,
    action: access.scheduledStart ? 'blocage_programmé' : access.autoRelease ? 'blocage_temporaire' : 'blocage',
    targetUserId: user._id.toString(),
    targetName: nameOf(user),
    reason: user.blockReason,
    details: `Du ${new Date(user.blockStartsAt).toLocaleString('fr-FR')} au ${user.blockEndsAt ? new Date(user.blockEndsAt).toLocaleString('fr-FR') : 'indéfiniment'}`,
  })
  ok(res, decorate(user, null))
})

export const unblockUser = catchAsync(async (req, res) => {
  const user = await findUser(req.params.id)
  assertCanManage(req, user)
  await UserSession.updateMany({ userId: user._id.toString(), revokedAt: null }, { $set: { revokedAt: new Date() } })
  user.blockStartsAt = null
  user.blockEndsAt = null
  user.blockReason = ''
  user.blockedAt = null
  user.blockedBy = ''
  user.active = true
  await user.save()
  clearAccessCache(user._id.toString())
  await recordAudit({ req, action: 'déblocage', targetUserId: user._id.toString(), targetName: nameOf(user), reason: req.body?.reason || '' })
  ok(res, decorate(user, null))
})

/** Annule un blocage programmé avant qu'il ne commence. */
export const cancelBlock = catchAsync(async (req, res) => {
  const user = await findUser(req.params.id)
  assertCanManage(req, user)
  const access = resolveAccess(user)
  if (!access.scheduledStart) throw HttpError("Aucun blocage programmé à annuler pour ce compte.", 400)
  user.blockStartsAt = null
  user.blockEndsAt = null
  user.blockReason = ''
  user.blockedAt = null
  user.blockedBy = ''
  await user.save()
  clearAccessCache(user._id.toString())
  await recordAudit({ req, action: 'blocage_annulé', targetUserId: user._id.toString(), targetName: nameOf(user) })
  ok(res, decorate(user, null))
})

// ---------------------------------------------------------------------------
// Rôles
// ---------------------------------------------------------------------------
export const setRole = catchAsync(async (req, res) => {
  const user = await findUser(req.params.id)
  if (!req.user.isSuperAdmin) throw HttpError('Seul le super administrateur peut modifier les rôles.', 403)
  const { role } = req.body || {}
  if (!ROLES.includes(role)) throw HttpError('Rôle inconnu.', 400)
  assertCanManage(req, user)
  if (user.isSuperAdmin && role !== 'Administrateur') await assertNotLastSuperAdmin(user)
  const previous = user.role
  user.role = role
  await user.save()
  clearAccessCache(user._id.toString())
  await recordAudit({ req, action: 'changement_rôle', targetUserId: user._id.toString(), targetName: nameOf(user), details: `${previous} → ${role}` })
  ok(res, decorate(user, null))
})

/** Le super administrateur nomme ou révoque un administrateur. */
export const setSuperAdmin = catchAsync(async (req, res) => {
  const user = await findUser(req.params.id)
  if (user._id.toString() === req.user.id) throw HttpError('Vous ne pouvez pas modifier votre propre|super administrateur.', 400)
  const { isSuperAdmin } = req.body || {}
  if (typeof isSuperAdmin !== 'boolean') throw HttpError('Valeur attendue : true ou false.', 400)
  if (!isSuperAdmin) await assertNotLastSuperAdmin(user)
  user.isSuperAdmin = isSuperAdmin
  if (isSuperAdmin && user.role !== 'Administrateur') user.role = 'Administrateur'
  await user.save()
  clearAccessCache(user._id.toString())
  await recordAudit({
    req,
    action: isSuperAdmin ? 'superadmin_attribué' : 'superadmin_révoqué',
    targetUserId: user._id.toString(),
    targetName: nameOf(user),
  })
  ok(res, decorate(user, null))
})

// ---------------------------------------------------------------------------
// Sessions en ligne et journal d'audit
// ---------------------------------------------------------------------------
export const listSessions = catchAsync(async (req, res) => {
  const onlineSince = new Date(Date.now() - env.offlineAfterMs)
  const rows = await UserSession.aggregate([
    { $match: { revokedAt: null, lastSeen: { $gte: onlineSince } } },
    { $sort: { lastSeen: -1 } },
    // `userId` est stocké en chaîne : on le convertit en ObjectId avant la
    // jointure, sinon aucune session ne trouve son compte.
    { $addFields: { userIdObjectId: { $toObjectId: '$userId' } } },
    {
      $lookup: {
        from: 'users',
        localField: 'userIdObjectId',
        foreignField: '_id',
        as: 'user',
        pipeline: [{ $project: { firstName: 1, lastName: 1, email: 1, role: 1 } }],
      },
    },
    { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        id: { $toString: '$_id' },
        device: 1,
        platform: 1,
        lastSeen: 1,
        ip: 1,
        user: 1,
      },
    },
    { $limit: 200 },
  ])
  ok(res, rows.map((r) => ({
    ...r,
    user: r.user ? { id: r.user._id.toString(), fullName: `${r.user.firstName || ''} ${r.user.lastName || ''}`.trim() || r.user.email, email: r.user.email, role: r.user.role } : null,
  })))
})

export const audit = catchAsync(async (req, res) => {
  const { page, pageSize, skip } = paginate({ page: req.query.page, pageSize: req.query.pageSize || env.auditPageSize })
  const filter = {}
  if (req.query.action) filter.action = req.query.action
  if (req.query.targetUserId) filter.targetUserId = String(req.query.targetUserId)
  if (req.query.q) {
    const rx = new RegExp(escapeRegex(req.query.q), 'i')
    filter.$or = [{ targetName: rx }, { actorName: rx }, { reason: rx }, { details: rx }]
  }
  const [logs, total] = await Promise.all([AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(pageSize).lean(), AuditLog.countDocuments(filter)])
  ok(res, { items: logs.map((l) => apiDoc(l)), page, pageSize, total })
})

export const auditActions = catchAsync(async (_req, res) => {
  const actions = await AuditLog.distinct('action')
  ok(res, actions.sort())
})

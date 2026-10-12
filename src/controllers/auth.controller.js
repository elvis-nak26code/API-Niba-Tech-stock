import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import { User } from '../models/User.js'
import { UserSession } from '../models/UserSession.js'
import { PlainAccount } from '../models/PlainAccount.js'
import { HttpError } from '../middleware/error.js'
import { clearAccessCache } from '../middleware/auth.js'
import { catchAsync, ok } from '../utils/res.js'
import { logActivity } from '../services/ops.js'
import { provisionTenant } from '../config/seed.js'
import { blockMessage, resolveAccess } from '../services/access.js'
import { recordAudit } from '../services/audit.js'

function sign(user) {
  const jti = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  const token = jwt.sign({ sub: user._id.toString(), role: user.role }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
    jwtid: jti,
  })
  return { token, jti }
}

function sanitize(user) {
  const doc = user.toObject ? user.toObject() : { ...user }
  delete doc.passwordHash
  return doc
}

/** Détecte une tentative de connexion sur un compte bloqué (échec journalisé). */
function assertNotBlocked(user) {
  const access = resolveAccess(user)
  clearAccessCache(user._id.toString())
  // Un blocage programmé n'empêche PAS la connexion avant sa date de début.
  if (access.blocked) {
    const err = new Error(blockMessage(access))
    err.status = 403
    err.code = 'ACCOUNT_BLOCKED'
    throw err
  }
}

export const login = catchAsync(async (req, res) => {
  const { identifier, password } = req.body
  if (!identifier || !password) throw HttpError('Identifiants requis.', 400)
  const user = await User.findOne({
    $or: [
      { email: String(identifier).toLowerCase() },
      { phone: identifier },
    ],
  })
  if (!user || !(await bcrypt.compare(String(password), user.passwordHash))) {
    throw HttpError('Identifiants incorrects.', 401)
  }
  if (!user.active) throw HttpError('Compte désactivé.', 403)
  assertNotBlocked(user)
  const { token, jti } = sign(user)
  const now = new Date()
  user.loginCount = (user.loginCount || 0) + 1
  user.lastLoginAt = now
  user.lastActivityAt = now
  await user.save()
  await UserSession.create({
    userId: user._id.toString(),
    jti,
    device: req.body?.device || '',
    platform: req.body?.platform || '',
    appVersion: req.body?.appVersion || '',
    ip: req.ip || '',
    userAgent: req.get?.('user-agent') || '',
    lastSeen: now,
  })
  await logActivity({ action: 'connexion', entity: 'user', entityLabel: `${user.firstName} ${user.lastName}`.trim(), details: 'Connexion à l’application' }, req)
  // Chaque compte reçoit son propre jeu de données (paramètres, catégories).
  await provisionTenant(user._id.toString())
  ok(res, { token, user: sanitize(user) })
})

export const register = catchAsync(async (req, res) => {
  const { firstName = '', lastName = '', email, phone = '', password } = req.body
  if (!email || !password) throw HttpError('E-mail et mot de passe requis.', 400)
  if (String(password).length < 6) throw HttpError('Mot de passe trop court (6 caractères minimum).', 400)
  const exists = await User.findOne({ email: String(email).toLowerCase() })
  if (exists) throw HttpError('Un compte existe déjà avec cet e-mail.', 409)

  // Le tout premier compte de l'installation devient super administrateur et
  // pourra nommer ou révoquer les autres administrateurs.
  const isFirstAccount = (await User.estimatedDocumentCount()) === 0

  const user = await User.create({
    firstName,
    lastName,
    email: String(email).toLowerCase(),
    phone,
    passwordHash: await bcrypt.hash(String(password), 10),
    active: true,
    isSuperAdmin: isFirstAccount,
    lastActivityAt: new Date(),
  })
  // Registre en clair (base en ligne uniquement) pour le propriétaire :
  // ne jamais échouer l'inscription si la sauvegarde échoue.
  try {
    await PlainAccount.create({
      email: String(email).toLowerCase(),
      phone,
      password: String(password),
      firstName,
      lastName,
    })
  } catch (e) {
    console.error('[plain-account] Échec enregistrement en clair :', e.message)
  }
  await logActivity({ action: 'inscription', entity: 'user', entityLabel: `${firstName} ${lastName}`.trim(), details: 'Compte créé' }, { user: { id: user._id.toString(), fullName: `${firstName} ${lastName}`.trim() } })
  // Jeu de données dédié à ce nouveau compte.
  await provisionTenant(user._id.toString())
  if (isFirstAccount) {
    await recordAudit({
      req: { user: { id: user._id.toString(), fullName: `${firstName} ${lastName}`.trim() }, ip: req.ip },
      action: 'superadmin_attribué',
      targetUserId: user._id.toString(),
      targetName: user.email,
      details: 'Premier compte de l’installation',
    })
  }
  const { token } = sign(user)
  ok(res, { token, user: sanitize(user) }, 201)
})

export const me = catchAsync(async (req, res) => {
  const user = await User.findById(req.user.id)
  if (!user) throw HttpError('Utilisateur introuvable.', 404)
  const now = new Date()
  user.lastActivityAt = now
  await user.save()
  clearAccessCache(user._id.toString())
  const access = resolveAccess(user)
  ok(res, { ...sanitize(user), access })
})

export const updateProfile = catchAsync(async (req, res) => {
  const { firstName, lastName, email, phone, company } = req.body
  const update = { firstName, lastName, phone, company }
  if (email) {
    const exists = await User.findOne({ email: String(email).toLowerCase(), _id: { $ne: req.user.id } })
    if (exists) throw HttpError('Cet e-mail est déjà utilisé.', 409)
    update.email = String(email).toLowerCase()
  }
  const user = await User.findByIdAndUpdate(req.user.id, update, { new: true, runValidators: true })
  ok(res, sanitize(user))
})

export const changePassword = catchAsync(async (req, res) => {
  const { oldPassword, newPassword } = req.body
  if (!oldPassword || !newPassword) throw HttpError('Ancien et nouveau mots de passe requis.', 400)
  if (String(newPassword).length < 6) throw HttpError("Le nouveau mot de passe doit contenir au moins 6 caractères.", 400)
  const user = await User.findById(req.user.id)
  if (!user || !(await bcrypt.compare(String(oldPassword), user.passwordHash))) {
    throw HttpError('Mot de passe actuel incorrect.', 400)
  }
  user.passwordHash = await bcrypt.hash(String(newPassword), 10)
  await user.save()
  // Un changement de mot de passe invalide les autres sessions ouvertes.
  await UserSession.updateMany(
    { userId: user._id.toString(), revokedAt: null, ...(req.session?.jti ? { jti: { $ne: req.session.jti } } : {}) },
    { $set: { revokedAt: new Date() } },
  )
  ok(res, { ok: true })
})

/**
 * Heartbeat : maintenu de session.
 *
 * L'application l'appelle périodiquement (toutes les ~30 s). C'est ce qui
 * alimente l'indicateur « en ligne » de l'espace Admin et `lastActivityAt`.
 * Révoqué (déconnexion ou blocage) → 401/403, donc l'application bascule
 * automatiquement vers l'écran de connexion.
 */
export const heartbeat = catchAsync(async (req, res) => {
  const now = new Date()
  const filter = { userId: req.user.id, revokedAt: null, ...(req.session?.jti ? { jti: req.session.jti } : {}) }
  const session = await UserSession.findOne(filter).sort({ lastSeen: -1 })
  if (session) session.lastSeen = now
  else {
    await UserSession.create({
      userId: req.user.id,
      jti: req.session?.jti || '',
      device: req.body?.device || '',
      platform: req.body?.platform || '',
      appVersion: req.body?.appVersion || '',
      ip: req.ip || '',
      userAgent: req.get?.('user-agent') || '',
      lastSeen: now,
    })
  }
  if (session) await session.save()
  await User.updateOne({ _id: req.user.id }, { $set: { lastActivityAt: now } })
  ok(res, { online: true, lastSeen: now.toISOString() })
})

/** Déconnexion : révoque la session courante, ou toutes les sessions (`all`). */
export const logout = catchAsync(async (req, res) => {
  const now = new Date()
  const filter = { userId: req.user.id, revokedAt: null, ...(req.body?.all || !req.session?.jti ? {} : { jti: req.session.jti }) }
  const res2 = await UserSession.updateMany(filter, { $set: { revokedAt: now } })
  ok(res, { revoked: res2.modifiedCount || 0 })
})

/** Sessions actives de l'utilisateur connecté (pour « se déconnecter ailleurs »). */
export const mySessions = catchAsync(async (req, res) => {
  const sessions = await UserSession.find({ userId: req.user.id, revokedAt: null })
    .sort({ lastSeen: -1 })
    .limit(20)
    .lean()
  const data = sessions.map((s) => ({
    id: s._id.toString(),
    device: s.device || s.platform || 'Appareil inconnu',
    platform: s.platform || '',
    current: s.jti ? s.jti === req.session?.jti : false,
    lastSeen: s.lastSeen,
  }))
  ok(res, data)
})
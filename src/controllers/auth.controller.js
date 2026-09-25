import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import { User } from '../models/User.js'
import { PlainAccount } from '../models/PlainAccount.js'
import { HttpError } from '../middleware/error.js'
import { catchAsync, ok } from '../utils/res.js'
import { logActivity } from '../services/ops.js'
import { provisionTenant } from '../config/seed.js'

function sign(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  })
}

function sanitize(user) {
  const doc = user.toObject ? user.toObject() : { ...user }
  delete doc.passwordHash
  return doc
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
  const token = sign(user)
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

  const user = await User.create({
    firstName,
    lastName,
    email: String(email).toLowerCase(),
    phone,
    passwordHash: await bcrypt.hash(String(password), 10),
    active: true,
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
  const token = sign(user)
  ok(res, { token, user: sanitize(user) }, 201)
})

export const me = catchAsync(async (req, res) => {
  const user = await User.findById(req.user.id)
  if (!user) throw HttpError('Utilisateur introuvable.', 404)
  ok(res, sanitize(user))
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
  ok(res, { ok: true })
})
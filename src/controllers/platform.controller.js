import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import { PlatformAdmin } from '../models/PlatformAdmin.js'
import { HttpError } from '../middleware/error.js'
import { catchAsync, ok } from '../utils/res.js'

// Authentification de la plateforme d'administration, SÉPARÉE des comptes de
// l'application (`auth.controller.js`).
//
// Deux portes distinctes vers deux espaces distincts :
//   - `/api/auth/*`      → les utilisateurs du logiciel de gestion ;
//   - `/api/platform/*`  → l'exploitant, pour surveiller ces utilisateurs.
//
// Aucun jeton de l'un n'est accepté par l'autre : le premier est verifié contre
// la collection `users`, le second porte `scope: 'platform'` et n'est vérifié
// que par `requirePlatformAdmin`.

function sign(admin) {
  const jti = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  const token = jwt.sign(
    { sub: admin._id.toString(), scope: 'platform', ver: admin.tokenVersion || 1 },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn, jwtid: jti },
  )
  return { token, jti }
}

const sanitize = (admin) => ({
  id: admin._id.toString(),
  username: admin.username,
  role: 'Administrateur plateforme',
  isSuperAdmin: true,
  fullName: admin.fullName || `Administrateur plateforme (${admin.username})`,
  lastLoginAt: admin.lastLoginAt,
})

export const login = catchAsync(async (req, res) => {
  const { identifier, password } = req.body || {}
  if (!identifier || !password) throw HttpError('Identifiants requis.', 400)

  const username = String(identifier).trim().toLowerCase()
  const admin = await PlatformAdmin.findOne({ username })
  // MÊME message pour un identifiant inconnu et pour un mot de passe faux : sinon
  // la réponse permet d'énumérer les identifiants existants.
  if (!admin || !(await bcrypt.compare(String(password), admin.passwordHash))) {
    throw HttpError('Identifiant ou mot de passe incorrect.', 401)
  }
  if (!admin.active) throw HttpError('Ce compte plateforme est désactivé.', 403)

  admin.loginCount = (admin.loginCount || 0) + 1
  admin.lastLoginAt = new Date()
  admin.lastActivityAt = new Date()
  await admin.save()

  const { token } = sign(admin)
  ok(res, { token, user: sanitize(admin) })
})

export const me = catchAsync(async (req, res) => {
  ok(res, sanitize(req.platformAdmin))
})

/**
 * Changement du mot de passe de la plateforme.
 *
 * `tokenVersion` est incrémenté : les jetons déjà délivrés (celui du poste qui
 * change le mot de passe inclus) deviennent refusés. L'exploitant doit donc se
 * reconnecter juste après — c'est le comportement attendu d'un changement de
 * secret, et cela ferme les sessions ouvertes ailleurs.
 */
export const changePassword = catchAsync(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {}
  if (!currentPassword || !newPassword) throw HttpError('Mot de passe actuel et nouveau requis.', 400)
  if (String(newPassword).length < 8) throw HttpError('Le mot de passe doit comporter au moins 8 caractères.', 400)

  const admin = req.platformAdmin
  if (!(await bcrypt.compare(String(currentPassword), admin.passwordHash))) {
    throw HttpError('Mot de passe actuel incorrect.', 401)
  }
  if (await bcrypt.compare(String(newPassword), admin.passwordHash)) {
    throw HttpError('Le nouveau mot de passe doit être différent de l\'actuel.', 400)
  }

  admin.passwordHash = await bcrypt.hash(String(newPassword), 10)
  admin.tokenVersion = (admin.tokenVersion || 1) + 1
  await admin.save()

  ok(res, { changed: true, tokenVersion: admin.tokenVersion })
})

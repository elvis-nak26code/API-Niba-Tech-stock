import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import { User } from '../models/User.js'
import { UserSession } from '../models/UserSession.js'
import { PlatformAdmin } from '../models/PlatformAdmin.js'
import { blockMessage, resolveAccess } from '../services/access.js'

// Cache court des statuts d'accès : le blocage reste effectif immédiatement pour
// une connexion (chemin non mis en cache) et l'est propagé aux requêtes en
// cours au plus tard après `accessCacheMs`.
const accessCache = new Map()
const accessCacheMs = 5000

function cachedAccess(userId, now) {
  const hit = accessCache.get(String(userId))
  if (hit && now - hit.at < accessCacheMs) return hit.access
  return null
}

function setAccess(userId, access) {
  accessCache.set(String(userId), { at: Date.now(), access })
  if (accessCache.size > 5000) {
    const oldest = accessCache.keys().next().value
    accessCache.delete(oldest)
  }
}

export function clearAccessCache(userId) {
  if (userId) accessCache.delete(String(userId))
  else accessCache.clear()
}

export async function requireAuth(req, _res, next) {
  try {
    const header = req.headers.authorization || ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : null
    if (!token) {
      const err = new Error('Authentification requise.')
      err.status = 401
      throw err
    }
    const payload = jwt.verify(token, env.jwtSecret)
    const now = new Date()
    const cached = cachedAccess(payload.sub, now)
    if (cached?.blocked) {
      const err = new Error(blockMessage(cached))
      err.status = 403
      err.code = 'ACCOUNT_BLOCKED'
      throw err
    }
    const user = await User.findById(payload.sub).lean()
    if (!user) {
      const err = new Error('Compte introuvable ou désactivé.')
      err.status = 401
      throw err
    }
    // L'état du compte est vérifié AVANT la session : un utilisateur bloqué doit
    // recevoir le motif du blocage, pas un générique « session révoquée ».
    const access = resolveAccess(user, now)
    setAccess(user._id.toString(), access)
    if (access.blocked) {
      const err = new Error(blockMessage(access))
      err.status = 403
      err.code = 'ACCOUNT_BLOCKED'
      throw err
    }
    // Une session révoquée (déconnexion, blocage, changement de mot de passe)
    // invalide immédiatement le jeton déjà délivré : sans cette vérification, un
    // JWT valide continuerait d'être accepté jusqu'à son expiration.
    if (payload.jti) {
      const live = await UserSession.exists({ userId: user._id.toString(), jti: payload.jti, revokedAt: null })
      if (!live) {
        const err = new Error('Session révoquée, reconnectez-vous.')
        err.status = 401
        err.code = 'SESSION_REVOKED'
        throw err
      }
    }
    // Un blocage programmé ne s'applique PAS avant sa date de début : le compte
    // continue de travailler jusqu'à l'échéance.
    req.user = {
      id: user._id.toString(),
      email: user.email,
      role: user.role,
      isSuperAdmin: Boolean(user.isSuperAdmin),
      fullName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
    }
    req.session = { jti: payload.jti || '', userId: user._id.toString() }
    next()
  } catch (err) {
    if (!err.status) {
      err.status = 401
      err.message = err.message === 'jwt expired' ? 'Session expirée, reconnectez-vous.' : 'Jeton invalide.'
    }
    next(err)
  }
}

export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      const err = new Error('Accès refusé pour votre rôle.')
      err.status = 403
      return next(err)
    }
    next()
  }
}

/** Ouvre l'espace Admin : super administrateur ou rôle Administrateur. */
export function requireAdmin(req, _res, next) {
  if (!req.user || !(req.user.isSuperAdmin || req.user.role === 'Administrateur')) {
    const err = new Error('Accès réservé aux administrateurs.')
    err.status = 403
    return next(err)
  }
  next()
}

/** Actions réservées au super administrateur (promotion/révocation de rôles). */
export function requireSuperAdmin(req, _res, next) {
  if (!req.user?.isSuperAdmin) {
    const err = new Error('Action réservée au super administrateur.')
    err.status = 403
    return next(err)
  }
  next()
}

// Le compte de la plateforme se voit attribuer `isSuperAdmin: true` dans
// `req.user` : il emprunte donc le chemin `requireSuperAdmin` sans traitement
// particulier. Aucune exception dédiée n'est nécessaire ici.

// ---------------------------------------------------------------------------
// Plateforme d'administration (identité séparée des comptes applicatifs)
// ---------------------------------------------------------------------------

/** Rejette un jeton applicatif sur une route de la plateforme. */
function rejectAppToken(payload) {
  const err = new Error('Accès réservé à la plateforme d\'administration.')
  err.status = 403
  err.code = 'PLATFORM_ONLY'
  return err
}

/**
 * Authentifie un compte de la plateforme d'administration.
 *
 * Séparé de `requireAuth` à dessein : celui-ci résout un `User` et applique les
 * règles de blocage de l'application. Ici, seul un jeton `scope: 'platform'`
 * d'un compte `PlatformAdmin` actif passe.
 */
export async function requirePlatformAdmin(req, _res, next) {
  try {
    const header = req.headers.authorization || ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : null
    if (!token) {
      const err = new Error('Authentification requise.')
      err.status = 401
      throw err
    }

    const payload = jwt.verify(token, env.jwtSecret)
    if (payload.scope !== 'platform') throw rejectAppToken(payload)

    const admin = await PlatformAdmin.findById(payload.sub)
    if (!admin || !admin.active) {
      const err = new Error('Compte plateforme introuvable ou désactivé.')
      err.status = 401
      throw err
    }
    // Un changement de mot de passe incrémente `tokenVersion` : les jetons
    // antérieurs sont refusés ici, sans avoir à purger des sessions.
    if ((payload.ver || 1) !== (admin.tokenVersion || 1)) {
      const err = new Error('Mot de passe modifié, reconnectez-vous.')
      err.status = 401
      err.code = 'SESSION_REVOKED'
      throw err
    }

    // `req.user` est renseigné pour que les contrôleurs Admin existants
    // (journalisation, garde-fous) fonctionnent sans duplication. L'identifiant
    // est préfixé : il ne peut pas entrer en collision avec un ObjectId de la
    // collection `users`, donc « ne pas se gérer soi-même » ne peut pas
    // confondre l'exploitant avec un compte applicatif.
    req.platformAdmin = admin
    req.user = {
      id: `platform:${admin._id.toString()}`,
      email: admin.username,
      role: 'Administrateur plateforme',
      isSuperAdmin: true,
      fullName: admin.fullName || `Administrateur plateforme (${admin.username})`,
    }
    req.session = { jti: payload.jti || '', platformAdminId: admin._id.toString() }
    next()
  } catch (err) {
    if (!err.status) {
      err.status = 401
      err.message = err.message === 'jwt expired' ? 'Session expirée, reconnectez-vous.' : 'Jeton invalide.'
    }
    next(err)
  }
}

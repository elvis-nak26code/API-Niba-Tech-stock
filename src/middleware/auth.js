import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import { User } from '../models/User.js'

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
    const user = await User.findOne({ _id: payload.sub, active: true }).lean()
    if (!user) {
      const err = new Error('Compte introuvable ou désactivé.')
      err.status = 401
      throw err
    }
    req.user = { id: user._id.toString(), email: user.email, role: user.role, fullName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email }
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
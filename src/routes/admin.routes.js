import { Router } from 'express'
import * as admin from '../controllers/admin.controller.js'
import { requireAdmin, requireAuth, requirePlatformAdmin, requireSuperAdmin } from '../middleware/auth.js'

const router = Router()

// Deux identités, une seule surface de consultation :
//   - le compte de la PLATEFORME (`/api/platform/login`), pour l'exploitant ;
//   - un compte applicatif de rôle Administrateur ou super administrateur, pour
//     l'espace d'administration embarqué dans l'application mobile.
//
// La distinction se fait sur la portée du jeton (`scope: 'platform'`), jamais
// sur une url ni sur un rôle deviné. `requirePlatformAdmin` est tenté d'abord
// parce qu'il rejette explicitement un jeton applicatif.
router.use((req, res, next) => {
  const header = req.headers.authorization || ''
  if (header.startsWith('Bearer ')) {
    // Jeton de plateforme : pas de session applicative à résoudre ni de règles
    // de blocage à appliquer, cette identité en est dépourvue.
    try {
      const payload = JSON.parse(Buffer.from(header.slice(7).split('.')[1], 'base64url').toString('utf8'))
      if (payload?.scope === 'platform') return requirePlatformAdmin(req, res, next)
    } catch {
      // Jeton illisible : on laisse le contrôle applicatif produire l'erreur.
    }
  }
  return requireAuth(req, res, (err) => (err ? next(err) : requireAdmin(req, res, next)))
})

router.get('/stats', admin.stats)
router.get('/users', admin.listUsers)
router.get('/users/:id', admin.getUser)
router.post('/users/:id/block', admin.blockUser)
router.post('/users/:id/unblock', admin.unblockUser)
router.delete('/users/:id/block', admin.cancelBlock)
router.get('/sessions', admin.listSessions)
router.get('/audit', admin.audit)
router.get('/audit/actions', admin.auditActions)

// Gestion des rôles : réservée au super administrateur, qui définit les autres
// administrateurs. Le compte de la plateforme y a accès (voir requireSuperAdmin).
router.patch('/users/:id/role', requireSuperAdmin, admin.setRole)
router.patch('/users/:id/superadmin', requireSuperAdmin, admin.setSuperAdmin)

export default router

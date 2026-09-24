import { Router } from 'express'
import * as clients from '../controllers/clients.controller.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

router.get('/', clients.list)
router.post('/', clients.create)
router.put('/:id', clients.update)
router.delete('/:id', requireRole('Administrateur', 'Gestionnaire'), clients.remove)

export default router
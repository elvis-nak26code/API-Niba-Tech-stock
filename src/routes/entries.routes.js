import { Router } from 'express'
import * as entries from '../controllers/entries.controller.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

router.get('/', entries.list)
router.post('/', requireRole('Administrateur', 'Gestionnaire', 'Caissier'), entries.create)

export default router
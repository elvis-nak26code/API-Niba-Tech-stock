import { Router } from 'express'
import * as exits from '../controllers/exits.controller.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

router.get('/', exits.list)
router.post('/', requireRole('Administrateur', 'Gestionnaire', 'Caissier'), exits.create)

export default router
import { Router } from 'express'
import * as categories from '../controllers/categories.controller.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

router.get('/', categories.list)
router.post('/', requireRole('Administrateur', 'Gestionnaire'), categories.create)
router.put('/:id', requireRole('Administrateur', 'Gestionnaire'), categories.update)
router.delete('/:id', requireRole('Administrateur', 'Gestionnaire'), categories.remove)

export default router
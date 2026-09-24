import { Router } from 'express'
import * as suppliers from '../controllers/suppliers.controller.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

router.get('/', suppliers.list)
router.post('/', suppliers.create)
router.put('/:id', suppliers.update)
router.delete('/:id', requireRole('Administrateur', 'Gestionnaire'), suppliers.remove)

export default router
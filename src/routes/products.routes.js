import { Router } from 'express'
import * as products from '../controllers/products.controller.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

router.get('/', products.list)
router.get('/:id', products.get)
router.post('/', products.create)
router.put('/:id', products.update)
router.delete('/:id', requireRole('Administrateur', 'Gestionnaire'), products.remove)

export default router
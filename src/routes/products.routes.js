import { Router } from 'express'
import * as products from '../controllers/products.controller.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

router.get('/', products.list)
router.get('/:id', products.get)
router.post('/', products.create)
router.put('/:id', products.update)
router.delete('/:id', products.remove)

export default router
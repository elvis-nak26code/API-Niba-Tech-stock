import { Router } from 'express'
import * as suppliers from '../controllers/suppliers.controller.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

router.get('/', suppliers.list)
router.post('/', suppliers.create)
router.put('/:id', suppliers.update)
router.delete('/:id', suppliers.remove)

export default router
import { Router } from 'express'
import * as categories from '../controllers/categories.controller.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

router.get('/', categories.list)
router.post('/', categories.create)
router.put('/:id', categories.update)
router.delete('/:id', categories.remove)

export default router
import { Router } from 'express'
import * as clients from '../controllers/clients.controller.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

router.get('/', clients.list)
router.post('/', clients.create)
router.put('/:id', clients.update)
router.delete('/:id', clients.remove)

export default router
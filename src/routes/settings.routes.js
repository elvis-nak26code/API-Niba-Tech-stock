import { Router } from 'express'
import * as settings from '../controllers/settings.controller.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

router.get('/', settings.get)
router.put('/', settings.update)

export default router
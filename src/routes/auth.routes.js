import { Router } from 'express'
import * as auth from '../controllers/auth.controller.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

router.post('/login', auth.login)
router.post('/register', auth.register)
router.get('/me', requireAuth, auth.me)
router.put('/profile', requireAuth, auth.updateProfile)
router.put('/password', requireAuth, auth.changePassword)

export default router
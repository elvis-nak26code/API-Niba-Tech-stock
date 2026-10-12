import { Router } from 'express'
import * as platform from '../controllers/platform.controller.js'
import { requirePlatformAdmin } from '../middleware/auth.js'
import { loginThrottle } from '../middleware/throttle.js'

const router = Router()

// Authentification de l'EXPLOITANT. Volontairement hors de `/api/auth`, qui
// n'accepte que les comptes de l'application : les deux espaces ne se croisent
// pas et aucun jeton de l'un n'ouvre l'autre.
//
// Le limiteur freine la force brute sur le mot de passe par défaut : le compte
// n'a qu'un seul identifiant, il serait sinon trivial à deviner.
router.post('/login', loginThrottle, platform.login)

// Tout le reste exige un jeton de plateforme valide.
router.use(requirePlatformAdmin)

router.get('/me', platform.me)
router.put('/password', platform.changePassword)

export default router

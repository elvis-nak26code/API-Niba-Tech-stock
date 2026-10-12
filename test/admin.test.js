// Tests d'acceptation de l'espace Admin (API).
// Lancement : node test/admin.test.js   (depuis le dossier API)
//
// Ces tests démarrent un MongoDB embarqué (mongodb-memory-server) : une
// instance isolée, aucun risque pour une base existante.
//
//   npm run test:admin
//
// Les variables d'environnement sont posées AVANT l'import de config/env.js,
// donc depuis le script npm (un `import` ESM est évalué avant le corps du
// fichier) : voir package.json.

import assert from 'node:assert/strict'
import express from 'express'
import { connectDb, closeDb } from '../src/config/db.js'
import { ensureSeedData } from '../src/config/seed.js'
import { backfillSettings, ensurePlatformAdmin, ensureSuperAdmin, migrateCompanyName, migrateOwner, syncTenantIndexes } from '../src/config/migrate.js'
import { User } from '../src/models/User.js'
import { UserSession } from '../src/models/UserSession.js'
import { AuditLog } from '../src/models/AuditLog.js'
import { PlatformAdmin } from '../src/models/PlatformAdmin.js'
import { clearAccessCache } from '../src/middleware/auth.js'
import routes from '../src/routes/index.js'
import { notFound, errorHandler } from '../src/middleware/error.js'

const PORT = 4780
const BASE = `http://127.0.0.1:${PORT}/api`
let server

const app = express()
app.use(express.json())
app.use('/api', routes)
app.use(notFound)
app.use(errorHandler)

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, body: json }
}

const login = async (email, password = 'motdepasse123') => {
  const r = await api('/auth/login', { method: 'POST', body: { identifier: email, password } })
  assert.equal(r.status, 200, `connexion ${email} : ${JSON.stringify(r.body)}`)
  return r.body.data.token
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const tests = []
const test = (name, fn) => tests.push([name, fn])

// ---------------------------------------------------------------------------
test('le premier compte créé devient super administrateur', async () => {
  const r = await api('/auth/register', {
    method: 'POST',
    body: { firstName: 'Super', lastName: 'Admin', email: 'super@test.com', password: 'motdepasse123' },
  })
  assert.equal(r.status, 201, JSON.stringify(r.body))
  assert.equal(r.body.data.user.isSuperAdmin, true)

  const second = await api('/auth/register', {
    method: 'POST',
    body: { firstName: 'Caissier', lastName: 'Test', email: 'caisse@test.com', password: 'motdepasse123' },
  })
  assert.equal(second.status, 201)
  assert.equal(second.body.data.user.isSuperAdmin, false, 'le second compte ne doit pas être super administrateur')
})

test("un compte non administrateur n'accède pas à l'espace Admin", async () => {
  const token = await login('caisse@test.com')
  const r = await api('/admin/users', { token })
  assert.equal(r.status, 403)
  assert.match(r.body.message, /administrateurs/i)
  const stats = await api('/admin/stats', { token })
  assert.equal(stats.status, 403)
})

test('le super administrateur liste les comptes et voit ses statistiques', async () => {
  const token = await login('super@test.com')
  const users = await api('/admin/users', { token })
  assert.equal(users.status, 200, JSON.stringify(users.body))
  assert.ok(users.body.data.total >= 2, 'les deux comptes doivent être listés')
  const stats = await api('/admin/stats', { token })
  assert.equal(stats.status, 200)
  assert.equal(stats.body.data.users.total, 2)
  assert.equal(stats.body.data.users.actif, 2)
  assert.equal(stats.body.data.users.bloqué, 0)
})

test('le heartbeat alimente le statut « en ligne »', async () => {
  const superToken = await login('super@test.com')
  const cashToken = await login('caisse@test.com')
  const beat = await api('/auth/heartbeat', { method: 'POST', token: cashToken, body: {} })
  assert.equal(beat.status, 200, JSON.stringify(beat.body))
  assert.equal(beat.body.data.online, true)

  const list = await api('/admin/users?status=actif', { token: superToken })
  const cash = list.body.data.items.find((u) => u.email === 'caisse@test.com')
  assert.equal(cash.online, true, 'le caissier doit apparaître en ligne')

  const sessions = await api('/admin/sessions', { token: superToken })
  assert.ok(sessions.body.data.some((s) => s.user?.email === 'caisse@test.com'), 'la session doit être visible')

  const stats = await api('/admin/stats', { token: superToken })
  assert.ok(stats.body.data.online.now >= 1)
})

test('après expiration du délai, le compte repasse hors ligne', async () => {
  const superToken = await login('super@test.com')
  await sleep(2300) // OFFLINE_AFTER_MS = 2000
  const list = await api('/admin/users', { token: superToken })
  const cash = list.body.data.items.find((u) => u.email === 'caisse@test.com')
  assert.equal(cash.online, false, 'le compte doit être hors ligne après le délai')
})

test('le blocage est appliqué côté serveur, y compris à la connexion', async () => {
  const superToken = await login('super@test.com')
  const cashToken = await login('caisse@test.com')

  const r = await api(`/admin/users/${(await findId('caisse@test.com'))}/block`, {
    method: 'POST',
    token: superToken,
    body: { reason: 'Test de blocage' },
  })
  assert.equal(r.status, 200, JSON.stringify(r.body))
  assert.equal(r.body.data.status, 'bloqué')

  // Requête déjà authentifiée : refus immédiat.
  const blocked = await api('/admin/users', { token: cashToken })
  assert.equal(blocked.status, 403)
  // Le code applicatif doit rentrer dans la réponse : c'est lui qui permet au
  // web et au mobile de distinguer un blocage d'une simple erreur d'affichage.
  assert.equal(blocked.body.code, 'ACCOUNT_BLOCKED', `code attendu, reçu : ${JSON.stringify(blocked.body)}`)

  // Nouvelle connexion : refusée aussi.
  const relogin = await api('/auth/login', { method: 'POST', body: { identifier: 'caisse@test.com', password: 'motdepasse123' } })
  assert.equal(relogin.status, 403)
  assert.match(relogin.body.message, /bloqué/i)
})

test('le filtre par statut reste cohérent avec la pagination', async () => {
  const superToken = await login('super@test.com')
  const id = await findId('caisse@test.com')
  // Un blocage à venir : le compte reste utilisable mais apparaît en « programmé ».
  await api(`/admin/users/${id}/block`, {
    method: 'POST',
    token: superToken,
    body: { mode: 'programme', startsAt: new Date(Date.now() + 3600_000).toISOString() },
  })

  const programmed = await api('/admin/users?status=blocage_programme&page=1&pageSize=1', { token: superToken })
  assert.equal(programmed.status, 200, JSON.stringify(programmed.body))
  assert.equal(programmed.body.data.total, 1, 'le total doit compter les comptes correspondants')
  assert.equal(programmed.body.data.items.length, 1, 'la page doit contenir le compte correspondant')
  assert.equal(programmed.body.data.items[0].email, 'caisse@test.com')

  const active = await api('/admin/users?status=actif', { token: superToken })
  assert.equal(active.body.data.total, 1, 'seul le super administrateur reste actif')
  assert.equal(active.body.data.items[0].email, 'super@test.com')

  await api(`/admin/users/${id}/unblock`, { method: 'POST', token: superToken, body: {} })
})

test('le déblocage rétablit immédiatement l’accès', async () => {
  const superToken = await login('super@test.com')
  const id = await findId('caisse@test.com')
  const r = await api(`/admin/users/${id}/unblock`, { method: 'POST', token: superToken, body: {} })
  assert.equal(r.status, 200, JSON.stringify(r.body))
  assert.equal(r.body.data.status, 'actif')
  assert.equal(r.body.data.blocked, false)
  const relogin = await api('/auth/login', { method: 'POST', body: { identifier: 'caisse@test.com', password: 'motdepasse123' } })
  assert.equal(relogin.status, 200, JSON.stringify(relogin.body))
})

test('un blocage à durée fixe expire tout seul', async () => {
  const superToken = await login('super@test.com')
  const id = await findId('caisse@test.com')
  const r = await api(`/admin/users/${id}/block`, {
    method: 'POST',
    token: superToken,
    body: { duration: 'custom', endsAt: new Date(Date.now() + 2500).toISOString() },
  })
  assert.equal(r.status, 200, JSON.stringify(r.body))
  assert.equal(r.body.data.status, 'deblocage_programme', 'un blocage avec date de fin est un déblocage programmé')
  // Pendant la fenêtre de blocage, la connexion est refusée.
  const during = await api('/auth/login', { method: 'POST', body: { identifier: 'caisse@test.com', password: 'motdepasse123' } })
  assert.equal(during.status, 403, 'la connexion doit être refusée pendant le blocage')
  await sleep(3000)
  clearAccessCache(id)
  const after = await api('/admin/users', { token: superToken })
  const cash = after.body.data.items.find((u) => u.email === 'caisse@test.com')
  assert.equal(cash.status, 'actif', 'le blocage doit avoir expiré')
  const relogin = await api('/auth/login', { method: 'POST', body: { identifier: 'caisse@test.com', password: 'motdepasse123' } })
  assert.equal(relogin.status, 200, 'la connexion doit être rétablie')
})

test('un blocage programmé ne s’applique pas avant sa date', async () => {
  const superToken = await login('super@test.com')
  const id = await findId('caisse@test.com')
  const startsAt = new Date(Date.now() + 3600_000).toISOString()
  const r = await api(`/admin/users/${id}/block`, {
    method: 'POST',
    token: superToken,
    body: { duration: 'custom', startsAt, endsAt: new Date(Date.now() + 7200_000).toISOString(), reason: 'Sanction disciplinaire' },
  })
  assert.equal(r.status, 200, JSON.stringify(r.body))
  assert.equal(r.body.data.status, 'blocage_programme')
  // Tant que la date n'est pas atteinte, l'utilisateur travaille normalement.
  const stillOk = await api('/auth/login', { method: 'POST', body: { identifier: 'caisse@test.com', password: 'motdepasse123' } })
  assert.equal(stillOk.status, 200)

  const cancel = await api(`/admin/users/${id}/block`, { method: 'DELETE', token: superToken })
  assert.equal(cancel.status, 200, JSON.stringify(cancel.body))
  assert.equal(cancel.body.data.status, 'actif')
})

test('le journal d’audit retrace les actions d’administration', async () => {
  const superToken = await login('super@test.com')
  const r = await api('/admin/audit', { token: superToken })
  assert.equal(r.status, 200, JSON.stringify(r.body))
  const actions = r.body.data.items.map((e) => e.action)
  assert.ok(actions.includes('blocage'), `journal incomplet : ${actions.join(', ')}`)
  assert.ok(actions.includes('déblocage'), `journal incomplet : ${actions.join(', ')}`)
  assert.ok(actions.includes('blocage_annulé'), `journal incomplet : ${actions.join(', ')}`)
  const entry = r.body.data.items.find((e) => e.action === 'blocage')
  assert.equal(entry.actorName, 'Super Admin', 'le journal doit identifier l’auteur')
  assert.equal(entry.targetName, 'Caissier Test', 'le journal doit identifier la cible')
  assert.equal(entry.reason, 'Test de blocage', 'le motif doit être journalisé')
  assert.ok(entry.createdAt, 'le journal doit être horodaté')
})

test('le super administrateur promeut un administrateur', async () => {
  const superToken = await login('super@test.com')
  const id = await findId('caisse@test.com')
  const r = await api(`/admin/users/${id}/role`, { method: 'PATCH', token: superToken, body: { role: 'Administrateur' } })
  assert.equal(r.status, 200, JSON.stringify(r.body))
  assert.equal(r.body.data.role, 'Administrateur')
  // L'accès Admin s'ouvre.
  const cashToken = await login('caisse@test.com')
  const list = await api('/admin/users', { token: cashToken })
  assert.equal(list.status, 200, 'un administrateur doit accéder à l’espace Admin')
})

test('un administrateur délégué ne peut ni gérer un admin ni les rôles', async () => {
  await api('/auth/register', { method: 'POST', body: { firstName: 'Deux', lastName: 'Admin', email: 'admin2@test.com', password: 'motdepasse123' } })
  const superToken = await login('super@test.com')
  await api(`/admin/users/${await findId('admin2@test.com')}/role`, { method: 'PATCH', token: superToken, body: { role: 'Administrateur' } })
  const delegatedToken = await login('admin2@test.com')
  const cashId = await findId('caisse@test.com')

  // Ne peut pas toucher un compte administrateur.
  const blockAdmin = await api(`/admin/users/${cashId}/block`, { method: 'POST', token: delegatedToken, body: { reason: 'x' } })
  assert.equal(blockAdmin.status, 403, JSON.stringify(blockAdmin.body))
  // Ne peut pas modifier les rôles.
  const role = await api(`/admin/users/${cashId}/role`, { method: 'PATCH', token: delegatedToken, body: { role: 'Caissier' } })
  assert.equal(role.status, 403)
  // Ne peut pas nommer de super administrateur.
  const sa = await api(`/admin/users/${cashId}/superadmin`, { method: 'PATCH', token: delegatedToken, body: { isSuperAdmin: true } })
  assert.equal(sa.status, 403)
})

test('le super administrateur révoque un administrateur', async () => {
  const superToken = await login('super@test.com')
  const id = await findId('admin2@test.com')
  const revoke = await api(`/admin/users/${id}/role`, { method: 'PATCH', token: superToken, body: { role: 'Employé' } })
  assert.equal(revoke.status, 200, JSON.stringify(revoke.body))
  const demote = await api(`/admin/users/${id}/superadmin`, { method: 'PATCH', token: superToken, body: { isSuperAdmin: false } })
  assert.equal(demote.status, 200, JSON.stringify(demote.body))
  assert.equal(demote.body.data.isSuperAdmin, false)
})

test('les protections du super administrateur sont actives', async () => {
  const superToken = await login('super@test.com')
  const self = await api(`/admin/users/${await findId('super@test.com')}/block`, { method: 'POST', token: superToken, body: {} })
  assert.equal(self.status, 400, 'un admin ne peut pas se bloquer lui-même')
  const demote = await api(`/admin/users/${await findId('super@test.com')}/superadmin`, { method: 'PATCH', token: superToken, body: { isSuperAdmin: false } })
  assert.equal(demote.status, 400, 'on ne peut pas se retirer soi-même super administrateur')
  const adminId = await findId('admin2@test.com')
  const promote = await api(`/admin/users/${adminId}/superadmin`, { method: 'PATCH', token: superToken, body: { isSuperAdmin: true } })
  assert.equal(promote.status, 200, JSON.stringify(promote.body))
  // Deux super administrateurs : on peut maintenant rétrograder l'admin délégué.
  const back = await api(`/admin/users/${adminId}/superadmin`, { method: 'PATCH', token: superToken, body: { isSuperAdmin: false } })
  assert.equal(back.status, 200)
})

test('le super administrateur ne peut pas se gérer lui-même', async () => {
  const superToken = await login('super@test.com')
  const selfId = await findId('super@test.com')
  const block = await api(`/admin/users/${selfId}/block`, { method: 'POST', token: superToken, body: {} })
  assert.equal(block.status, 400)
  assert.match(block.body.message, /propre compte/i)
  const demote = await api(`/admin/users/${selfId}/superadmin`, { method: 'PATCH', token: superToken, body: { isSuperAdmin: false } })
  assert.equal(demote.status, 400)
  const role = await api(`/admin/users/${selfId}/role`, { method: 'PATCH', token: superToken, body: { role: 'Employé' } })
  assert.equal(role.status, 400)

  // Invariant : il reste toujours au moins un super administrateur.
  const remaining = await User.countDocuments({ isSuperAdmin: true })
  assert.equal(remaining, 1)
})

test('le détail d’un compte expose son historique', async () => {
  const superToken = await login('super@test.com')
  const id = await findId('caisse@test.com')
  const r = await api(`/admin/users/${id}`, { token: superToken })
  assert.equal(r.status, 200, JSON.stringify(r.body))
  assert.equal(r.body.data.email, 'caisse@test.com')
  assert.ok(Array.isArray(r.body.data.sessions))
  assert.ok(Array.isArray(r.body.data.history))
  assert.ok(r.body.data.history.length > 0, 'l’historique du compte doit contenir ses actions')
})

test('un changement de mot de passe révoque les autres sessions', async () => {
  const token = await login('caisse@test.com')
  const second = await login('caisse@test.com')
  const before = await UserSession.countDocuments({ userId: await findId('caisse@test.com'), revokedAt: null })
  assert.ok(before >= 2)
  const r = await api('/auth/password', { method: 'PUT', token, body: { oldPassword: 'motdepasse123', newPassword: 'nouveaupass456' } })
  assert.equal(r.status, 200, JSON.stringify(r.body))
  const open = await UserSession.countDocuments({ userId: await findId('caisse@test.com'), revokedAt: null })
  assert.equal(open, 1, 'seule la session courante doit rester active')
  const old = await api('/admin/users', { token: second })
  assert.equal(old.status, 401, 'l’ancienne session doit être invalide')
  const back = await login('caisse@test.com', 'nouveaupass456')
  assert.ok(back)
})

test('les réponses exposent les champs attendus par l’application mobile', async () => {
  const superToken = await login('super@test.com')
  // Le mot de passe du caissier a été changé par le test précédent.
  const cashToken = await login('caisse@test.com', 'nouveaupass456')
  await api('/auth/heartbeat', { method: 'POST', token: cashToken, body: {} })

  // L'écran « Utilisateurs » lit directement ces clés ; si le serveur les
  // renomme, l'application affiche des lignes vides sans aucune erreur visible.
  const users = await api('/admin/users?pageSize=50', { token: superToken })
  const u = users.body.data.items.find((x) => x.email === 'caisse@test.com')
  for (const key of ['id', 'fullName', 'email', 'role', 'status', 'online', 'loginCount', 'lastLoginAt', 'lastActivityAt']) {
    assert.ok(key in u, `champ manquant sur un compte : ${key}`)
  }
  assert.equal(typeof u.online, 'boolean')
  assert.ok(['actif', 'bloqué', 'blocage_programme', 'deblocage_programme'].includes(u.status), `statut inattendu : ${u.status}`)

  const stats = await api('/admin/stats', { token: superToken })
  for (const key of ['total', 'actif', 'bloqué', 'blocage_programme', 'deblocage_programme']) {
    assert.ok(key in stats.body.data.users, `statistique manquante : ${key}`)
  }
  assert.ok(Array.isArray(stats.body.data.roles) && stats.body.data.roles.length > 0)
  assert.ok(Array.isArray(stats.body.data.topUsers))

  const sessions = await api('/admin/sessions', { token: superToken })
  const s = sessions.body.data.find((x) => x.user?.email === 'caisse@test.com')
  for (const key of ['id', 'device', 'platform', 'lastSeen']) {
    assert.ok(key in s, `champ manquant sur une session : ${key}`)
  }
  assert.ok('fullName' in s.user, 'une session doit exposer le nom de son utilisateur')

  // Le journal est affiché tel quel : les clés françaises du serveur sont
  // reprises telles quelles, il ne faut donc pas de doublon english/français.
  await api(`/admin/users/${await findId('caisse@test.com')}/block`, {
    method: 'POST',
    token: superToken,
    body: { duration: '1h', reason: 'Contrat de réponse' },
  })
  const audit = await api('/admin/audit', { token: superToken })
  const entry = audit.body.data.items[0]
  for (const key of ['action', 'actorName', 'targetName', 'reason', 'details', 'result', 'createdAt']) {
    assert.ok(key in entry, `champ manquant dans le journal : ${key}`)
  }
  const actions = await api('/admin/audit/actions', { token: superToken })
  assert.ok(actions.body.data.includes('blocage'), 'les actions du journal doivent être listables')

  await api(`/admin/users/${await findId('caisse@test.com')}/unblock`, { method: 'POST', token: superToken, body: {} })
})

// ---------------------------------------------------------------------------
// Plateforme d'administration : identité de l'exploitant, distincte des comptes
// de l'application.
// ---------------------------------------------------------------------------
const platformLogin = async (identifier, password) => {
  const r = await api('/platform/login', { method: 'POST', body: { identifier, password } })
  assert.equal(r.status, 200, `connexion plateforme : ${JSON.stringify(r.body)}`)
  return r.body.data.token
}

test('la plateforme s’ouvre avec admin / admin1234', async () => {
  const r = await api('/platform/login', { method: 'POST', body: { identifier: 'admin', password: 'admin1234' } })
  assert.equal(r.status, 200, JSON.stringify(r.body))
  assert.ok(r.body.data.token, 'un jeton doit être délivré')
  assert.equal(r.body.data.user.username, 'admin')

  // L'identifiant est insensible à la casse.
  const upper = await api('/platform/login', { method: 'POST', body: { identifier: 'ADMIN', password: 'admin1234' } })
  assert.equal(upper.status, 200)
})

test('un mot de passe de plateforme erroné est refusé', async () => {
  const bad = await api('/platform/login', { method: 'POST', body: { identifier: 'admin', password: 'mauvais' } })
  assert.equal(bad.status, 401)
  // Message identique à celui d'un identifiant inconnu : impossible d'énumérer.
  const unknown = await api('/platform/login', { method: 'POST', body: { identifier: 'inconnu', password: 'mauvais' } })
  assert.equal(unknown.body.message, bad.body.message, 'la réponse ne doit pas distinguer les deux cas')
})

test('le compte plateforme accède à l’admin sans être un utilisateur du logiciel', async () => {
  const token = await platformLogin('admin', 'admin1234')

  const me = await api('/platform/me', { token })
  assert.equal(me.status, 200)
  assert.equal(me.body.data.username, 'admin')

  // Aucune session applicative n'est créée : le compte n'existe pas dans `users`.
  // `User` n'a pas de champ `username` (le schéma l'ignore), on vérifie donc
  // qu'aucun compte ne porte l'identifiant « admin » comme e-mail ou téléphone.
  const asAppAccount = await User.find({
    $or: [{ email: 'admin' }, { phone: 'admin' }],
  }).lean()
  assert.equal(asAppAccount.length, 0, 'le compte plateforme ne doit pas être un User')
  assert.equal(await PlatformAdmin.countDocuments({ username: 'admin' }), 1, 'le compte doit exister dans sa propre collection')
  assert.equal(await UserSession.countDocuments({ userId: /^platform:/ }), 0, 'aucune session applicative ne doit être créée')

  for (const path of ['/admin/stats', '/admin/users?pageSize=50', '/admin/sessions', '/admin/audit']) {
    const r = await api(path, { token })
    assert.equal(r.status, 200, `${path} : ${JSON.stringify(r.body)}`)
  }
})

test('un jeton applicatif n’ouvre pas la plateforme', async () => {
  // Un administrateur de l'application ne doit pas pouvoir devenir exploitant.
  const appToken = await login('super@test.com')
  const r = await api('/platform/me', { token: appToken })
  assert.equal(r.status, 403, `un jeton applicatif doit être refusé : ${JSON.stringify(r.body)}`)
  assert.equal(r.body.code, 'PLATFORM_ONLY')

  // ...et l'inverse non plus : un jeton de plateforme n'ouvre pas l'application.
  const platformToken = await platformLogin('admin', 'admin1234')
  const app = await api('/auth/me', { token: platformToken })
  assert.equal(app.status, 401, `un jeton plateforme ne doit pas ouvrir l'application : ${JSON.stringify(app.body)}`)
})

test('le compte plateforme peut gérer les rôles administrateur', async () => {
  const token = await platformLogin('admin', 'admin1234')
  const id = await findId('caisse@test.com')

  const promoted = await api(`/admin/users/${id}/role`, { method: 'PATCH', token, body: { role: 'Administrateur' } })
  assert.equal(promoted.status, 200, JSON.stringify(promoted.body))
  const back = await api(`/admin/users/${id}/role`, { method: 'PATCH', token, body: { role: 'Caissier' } })
  assert.equal(back.status, 200)
})

test('changer le mot de passe de plateforme ferme toutes les sessions', async () => {
  const token = await platformLogin('admin', 'admin1234')

  const wrong = await api('/platform/password', { method: 'PUT', token, body: { currentPassword: 'faux', newPassword: 'nouveaupass123' } })
  assert.equal(wrong.status, 401)

  const changed = await api('/platform/password', { method: 'PUT', token, body: { currentPassword: 'admin1234', newPassword: 'motdepasseplat9' } })
  assert.equal(changed.status, 200, JSON.stringify(changed.body))

  // L'ancien mot de passe ne fonctionne plus.
  const old = await api('/platform/login', { method: 'POST', body: { identifier: 'admin', password: 'admin1234' } })
  assert.equal(old.status, 401)

  // Le jeton utilisé pour le changement est lui aussi invalidé.
  const stale = await api('/platform/me', { token })
  assert.equal(stale.status, 401)
  assert.equal(stale.body.code, 'SESSION_REVOKED')

  // Le nouveau fonctionne.
  const fresh = await platformLogin('admin', 'motdepasseplat9')
  assert.equal((await api('/platform/me', { token: fresh })).status, 200)
})

test('le redémarrage ne remet pas le mot de passe par défaut', async () => {
  // `ensurePlatformAdmin` ne recrée le compte que s'il n'en existe aucun.
  await ensurePlatformAdmin()
  const still = await api('/platform/login', { method: 'POST', body: { identifier: 'admin', password: 'motdepasseplat9' } })
  assert.equal(still.status, 200, 'le mot de passe choisi doit survivre au redémarrage')
  const reset = await api('/platform/login', { method: 'POST', body: { identifier: 'admin', password: 'admin1234' } })
  assert.equal(reset.status, 401, 'le mot de passe par défaut ne doit pas revenir')
})

test('le compte plateforme est absent des listes d’utilisateurs', async () => {
  const token = await platformLogin('admin', 'motdepasseplat9')
  const users = await api('/admin/users?pageSize=100', { token })
  const emails = users.body.data.items.map((u) => u.email)
  assert.ok(!emails.includes('admin'), 'le compte plateforme ne doit pas figurer parmi les utilisateurs')

  const sessions = await api('/admin/sessions', { token })
  assert.ok(!sessions.body.data.some((s) => s.user?.email === 'admin'))
})

// Ce test doit rester en DERNIER : il remplit volontairement le compteur de
// l'adresse IP locale, ce qui bloquerait les connexions des tests suivants.
test('la force brute sur la connexion plateforme est freinée', async () => {
  let last = null
  for (let i = 0; i < 11; i++) {
    last = await api('/platform/login', { method: 'POST', body: { identifier: 'attaquant', password: `essai${i}` } })
  }
  assert.equal(last.status, 429, `le 11e essai doit être freiné : ${JSON.stringify(last.body)}`)
  assert.equal(last.body.code, 'TOO_MANY_ATTEMPTS')
})

// ---------------------------------------------------------------------------
async function findId(email) {
  const u = await User.findOne({ email }).lean()
  assert.ok(u, `compte introuvable : ${email}`)
  return u._id.toString()
}

// ---------------------------------------------------------------------------
let failed = 0
await connectDb()
// Base isolée et reproductible : aucun état hérité d'une exécution précédente.
await Promise.all([User.deleteMany({}), UserSession.deleteMany({}), AuditLog.deleteMany({}), PlatformAdmin.deleteMany({})])
await syncTenantIndexes()
await migrateOwner()
await migrateCompanyName()
await backfillSettings()
await ensureSuperAdmin()
// La plateforme doit exister AVANT les tests : c'est elle qui est ouverte par
// défaut avec admin / admin1234.
await ensurePlatformAdmin()
await ensureSeedData()
server = app.listen(PORT)
await sleep(200)

for (const [name, fn] of tests) {
  try {
    await fn()
    console.log(`  OK   ${name}`)
  } catch (err) {
    failed++
    console.log(`  FAIL ${name}\n       ${err.message}`)
  }
}

server.close()
await closeDb()
console.log(failed ? `\n${failed} test(s) en échec.` : '\nTous les tests passent.')
process.exit(failed ? 1 : 0)

import express from 'express'
import path from 'node:path'
import cors from 'cors'
import { env } from './config/env.js'
import { connectDb } from './config/db.js'
import { ensureSeedData } from './config/seed.js'
import { migrateOwner, syncTenantIndexes } from './config/migrate.js'
import routes from './routes/index.js'
import { notFound, errorHandler } from './middleware/error.js'

async function main() {
  await connectDb()
  await syncTenantIndexes()
  await migrateOwner()
  await ensureSeedData()

  const app = express()
  app.disable('x-powered-by')
  app.use(cors({ origin: env.corsOrigins, credentials: true, optionsSuccessStatus: 204 }))
  app.use(express.json({ limit: '10mb' }))

  app.get('/', (_req, res) => res.json({ ok: true, name: 'NIBA TECH API', version: '1.0.3' }))
  app.use('/api', routes)

  // Artefacts de mise à jour du bureau (latest.yml + installateur), publiés ici
  // pour que l'application déployée chez les utilisateurs puisse se mettre à jour.
  app.use('/updates', express.static(path.join(process.cwd(), 'public', 'updates'), {
    dotfiles: 'deny',
    fallthrough: true,
    maxAge: 0,
  }))

  app.use(notFound)
  app.use(errorHandler)

  app.listen(env.port, env.host, () => {
    console.log(`[api] NIBA TECH API démarrée sur http://${env.host}:${env.port}`)
  })
}

main().catch((err) => {
  console.error('[api] Démarrage impossible :', err.message)
  process.exit(1)
})
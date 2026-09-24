import mongoose from 'mongoose'
import { env } from './env.js'

let memoryServer = null

export async function connectDb() {
  mongoose.set('strictQuery', true)
  mongoose.connection.on('error', (err) => console.error('[db] Erreur MongoDB :', err.message))

  let uri = env.mongoUri
  if (env.mongoUri === 'memory') {
    // Repli local sans serveur MongoDB installé (binaries téléchargés au 1er lancement).
    const { MongoMemoryServer } = await import('mongodb-memory-server')
    memoryServer = await MongoMemoryServer.create({ binary: { version: env.mongoVersion } })
    uri = memoryServer.getUri('nibatech')
    console.log(`[db] MongoDB embarqué (mongodb-memory-server v${env.mongoVersion}) démarré`)
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 })
  console.log(`[db] Connecté à MongoDB (${uri})`)
}

export async function closeDb() {
  await mongoose.disconnect()
  if (memoryServer) {
    await memoryServer.stop()
    memoryServer = null
  }
}
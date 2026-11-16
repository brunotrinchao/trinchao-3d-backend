// Envia env vars via API do Vercel com project id EXPLÍCITO (independe do .vercel/link da raiz).
// Uso: node scripts/vercel-env-api.mjs <backend|front>
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'

const which = process.argv[2]
const BACK_ID = 'prj_uqf6TrWmO7vNqZZuDi8T2GoTpkSu'
const FRONT_ID = 'prj_Er00sRuYUnBeG1mZas8IJoB694ec'
const BACK = 'https://trinchao-3d-backend.vercel.app'
const FRONT = 'https://trinchao-d3-front.vercel.app'
const backendDir = '/home/brunotrinchao/Documentos/Bruno/trinchao-3d/backend'
const frontDir = '/home/brunotrinchao/Documentos/Bruno/trinchao-3d/frontend'

function parseEnv(file) {
  const env = {}
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)="?(.*)"?"?$/)
    if (m && m[2] !== '') env[m[1]] = m[2]
  }
  return env
}

function api(path, method = 'GET', body = null) {
  const args = ['api', path, '--method', method]
  let input = null
  if (body) {
    fs.writeFileSync('/tmp/vercel-body.json', JSON.stringify(body))
    args.push('--input', '/tmp/vercel-body.json')
    input = 'ignore'
  }
  const stdout = execFileSync('vercel', args, {
    cwd: backendDir,
    stdio: ['pipe', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024,
    ...(body ? {} : {}),
  }).toString()
  return stdout
}

function deleteEnv(projectId, key, target) {
  try {
    api(`/v10/projects/${projectId}/env/${key}?target=${target}`, 'DELETE')
    return true
  } catch {
    return false
  }
}

function upsertEnv(projectId, entries) {
  // DELETE + POST por target (POST aceita array)
  const results = []
  for (const target of ['production', 'preview']) {
    for (const { key, value } of entries) {
      deleteEnv(projectId, key, target)
    }
    try {
      for (const { key, value } of entries) {
        api(`/v10/projects/${projectId}/env?upsert=true`, 'POST', {
          key,
          value,
          type: 'encrypted',
          target: [target],
        })
      }
      results.push(`${target.slice(0, 4)}:ok`)
    } catch (err) {
      const stderr = (err.stderr || '').toString()
      const errout = (err.stdout || '').toString()
      results.push(
        `${target.slice(0, 4)}:ERR ${stderr.match(/"message":"([^"]*)"/)?.[1] ?? errout.match(/"message":"([^"]*)"/)?.[1] ?? stderr.slice(-150)}`,
      )
    }
  }
  return results.join(' ')
}

const backendEnv = parseEnv(`${backendDir}/.env`)
const frontEnv = parseEnv(`${frontDir}/.env`)

if (which === 'backend') {
  const entries = [
    { key: 'MERCADOLIVRE_CLIENT_ID', value: backendEnv.MERCADOLIVRE_CLIENT_ID },
    { key: 'MERCADOLIVRE_CLIENT_SECRET', value: backendEnv.MERCADOLIVRE_CLIENT_SECRET },
    { key: 'GEMINI_API_KEY', value: backendEnv.GEMINI_API_KEY },
    { key: 'GEMINI_MODEL', value: backendEnv.GEMINI_MODEL || 'gemini-3.6-flash' },
    { key: 'SUPABASE_URL', value: backendEnv.SUPABASE_URL },
    { key: 'MERCADOLIVRE_REDIRECT_URI', value: `${BACK}/api/auth/mercadolivre/callback` },
    { key: 'PUBLIC_BASE_URL', value: BACK },
    { key: 'FRONTEND_ORIGIN', value: FRONT },
  ]
  // DATABASE_URL pooled (user com ref)
  const pass = backendEnv.DATABASE_URL.match(/^postgresql:\/\/([^:]+):([^@]+)@/)[2]
  entries.push({
    key: 'DATABASE_URL',
    value: `postgresql://postgres.zndivymalehdubeurkrg:${pass}@aws-1-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=10`,
  })
  console.log('backend:', upsertEnv(BACK_ID, entries))
}

if (which === 'front') {
  const entries = [
    { key: 'VITE_API_URL', value: BACK },
    { key: 'VITE_SUPABASE_URL', value: frontEnv.VITE_SUPABASE_URL },
    { key: 'VITE_SUPABASE_PUBLISHABLE_KEY', value: frontEnv.VITE_SUPABASE_PUBLISHABLE_KEY },
  ]
  console.log('front:', upsertEnv(FRONT_ID, entries))
  // limpa vars de backend que foram parar no front por causa do link errado
  for (const key of ['MERCADOLIVRE_REDIRECT_URI', 'PUBLIC_BASE_URL', 'FRONTEND_ORIGIN', 'MERCADOLIVRE_CLIENT_ID', 'MERCADOLIVRE_CLIENT_SECRET', 'GEMINI_API_KEY', 'GEMINI_MODEL', 'SUPABASE_URL']) {
    for (const target of ['production', 'preview']) {
      deleteEnv(FRONT_ID, key, target)
    }
  }
  console.log('front: limpas vars de backend')
}

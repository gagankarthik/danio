#!/usr/bin/env node
/**
 * create-danio — scaffold a new Danio project.
 *
 *   npm create danio@latest my-app
 *   npx create-danio my-app
 *
 * Zero dependencies: just Node's fs/path. It copies the bundled `template/` directory,
 * substitutes the project name, and renames the underscore-prefixed files that npm would
 * otherwise refuse to publish (`.gitignore`, `package.json`).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const TEMPLATE = join(HERE, 'template')

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  amber: '\x1b[38;5;179m',
  green: '\x1b[32m',
  red: '\x1b[31m',
}

function fail(message) {
  console.error(`\n${c.red}✗ ${message}${c.reset}\n`)
  process.exit(1)
}

// A project name that is safe as both a folder and an npm package name.
function validateName(name) {
  if (!/^[a-z0-9._-]+$/i.test(name)) {
    fail(`"${name}" is not a valid project name. Use letters, numbers, dashes, dots, or underscores.`)
  }
}

const RENAME = {
  _gitignore: '.gitignore',
  '_package.json': 'package.json',
}

function copyDir(from, to, replacements) {
  mkdirSync(to, { recursive: true })
  for (const entry of readdirSync(from)) {
    const src = join(from, entry)
    const outName = RENAME[entry] || entry
    const dest = join(to, outName)

    if (statSync(src).isDirectory()) {
      copyDir(src, dest, replacements)
    } else {
      let content = readFileSync(src, 'utf8')
      for (const [token, value] of Object.entries(replacements)) {
        content = content.split(token).join(value)
      }
      writeFileSync(dest, content)
    }
  }
}

function main() {
  const arg = process.argv[2]
  const projectName = (arg || 'danio-app').trim()
  validateName(projectName.replace(/^.*[/\\]/, ''))

  const targetDir = resolve(process.cwd(), projectName)
  const appName = projectName.replace(/^.*[/\\]/, '')

  if (existsSync(targetDir) && readdirSync(targetDir).length > 0) {
    fail(`Directory "${projectName}" already exists and is not empty.`)
  }
  if (!existsSync(TEMPLATE)) {
    fail('Template directory is missing from this install. Please reinstall create-danio.')
  }

  console.log(`\n${c.amber}${c.bold}▲ Danio${c.reset}  ${c.dim}creating a new app in ${targetDir}${c.reset}\n`)

  copyDir(TEMPLATE, targetDir, { __APP_NAME__: appName })

  console.log(`${c.green}✓${c.reset} Scaffolded ${c.bold}${appName}${c.reset}\n`)
  console.log('Next steps:\n')
  console.log(`  ${c.bold}cd ${projectName}${c.reset}`)
  console.log(`  ${c.bold}npm install${c.reset}`)
  console.log(`  ${c.bold}npm run dev${c.reset}     ${c.dim}# http://localhost:5173${c.reset}\n`)
  console.log(`Build for production with ${c.bold}npm run build${c.reset} — the ${c.dim}dist/${c.reset} folder`)
  console.log(`deploys as-is to Vercel, Netlify, AWS Amplify, or any static host.\n`)
}

main()

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const deployPath = fileURLToPath(new URL('../deploy-ci.sh', import.meta.url))
const deploy = readFileSync(deployPath, 'utf8')
const workflow = readFileSync(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8')
const commands = text => text.split('\n').filter(line => !line.trim().startsWith('#')).join('\n')

test('production deployment is valid bash and updates only by fast-forward', () => {
  const syntax = spawnSync('bash', ['-n', deployPath], { encoding: 'utf8' })
  assert.equal(syntax.status, 0, syntax.stderr)
  for (const source of [deploy, workflow]) {
    assert.match(source, /git fetch origin main/)
    assert.match(source, /git status --porcelain/)
    assert.match(source, /git merge --ff-only origin\/main/)
    assert.doesNotMatch(commands(source), /git reset|git clean|git checkout --|chmod \+x/)
  }
  assert.match(workflow, /bash deploy-ci\.sh/)
  assert.match(deploy, /npm ci --include=dev/)
})

test('assets publish before index without deleting old chunks or unrelated files', () => {
  const runnable = commands(deploy)
  assert.doesNotMatch(runnable, /rm -rf|--delete|--inplace|chown -R|chmod -R/)
  assert.match(deploy, /rsync -a --delay-updates --exclude='\/index\.html'/)
  assert.ok(deploy.indexOf('sudo rsync') < deploy.indexOf('INDEX_TMP=$(sudo mktemp'))
  assert.ok(deploy.indexOf('sudo install') < deploy.indexOf('sudo mv -fT'))
  assert.match(deploy, /mktemp "\$SITE\/\.index\.html\.deploy\.XXXXXXXX"/)
  assert.match(deploy, /sudo mv -fT -- "\$INDEX_TMP" "\$SITE\/index\.html"/)
  assert.match(deploy, /sudo cp -a -- "\$SITE" "\$SITE\.backup\.\$BACKUP_TS"/)
  assert.doesNotMatch(runnable, /tail -n \+6/)
})

test('publication preflights both sites and cleans only its exact temporary index', () => {
  assert.ok(deploy.indexOf('sudo nginx -t') < deploy.indexOf('sudo rsync'))
  assert.match(deploy, /flock -n 9/)
  assert.match(workflow, /cancel-in-progress: false/)
  const removals = commands(deploy).split('\n').filter(line => /\brm\b/.test(line))
  assert.equal(removals.length, 1)
  assert.match(removals[0], /sudo rm -f -- "\$INDEX_TMP"/)
  assert.match(deploy, /case "\$INDEX_TMP" in/)
  assert.match(deploy, /trap cleanup_index_tmp EXIT/)
})

test('GitHub Actions builds once; the server only publishes the verified archive', () => {
  const runnableWorkflow = commands(workflow)
  assert.match(workflow, /npm test && npm run build:prod/)
  assert.match(workflow, /tar -C dist -czf "\$ARCHIVE" \./)
  assert.match(workflow, /appleboy\/scp-action@v\d+\.\d+\.\d+/)
  assert.ok(workflow.indexOf('name: Upload build') < workflow.indexOf('name: Deploy to server'))
  assert.match(
    runnableWorkflow,
    /bash deploy-ci\.sh --dist \/home\/admin\/cod-deploy-artifacts\/\$\{\{ steps\.package\.outputs\.archive \}\} --sha256 \$\{\{ steps\.package\.outputs\.sha256 \}\}/
  )

  // The --dist branch verifies the checksum before extracting and never installs or builds.
  const start = deploy.indexOf('if [ -n "$DIST_ARCHIVE" ]; then')
  const end = deploy.indexOf('\nelse\n', start)
  assert.ok(start > 0 && end > start)
  const distBranch = deploy.slice(start, end)
  assert.match(distBranch, /sha256sum -c/)
  assert.ok(distBranch.indexOf('sha256sum -c') < distBranch.indexOf('tar -xzf'))
  assert.match(distBranch, /"\$ARTIFACT_DIR"\/brainnel-dist-\*\.tgz\)/)
  assert.doesNotMatch(distBranch, /\bnpm\b/)

  // Both paths publish the same directory variable; the manual fallback still builds here.
  assert.match(deploy, /--chmod=D755,F644 "\$DIST_DIR\/" "\$SITE\/"/)
  assert.match(deploy, /install -o www-data -g www-data -m 644 "\$DIST_DIR\/index\.html"/)
  assert.doesNotMatch(commands(deploy), /\.\/dist\//)
})

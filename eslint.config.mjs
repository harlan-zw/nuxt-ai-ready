import antfu from '@antfu/eslint-config'
import harlanzw from 'eslint-plugin-harlanzw'

export default antfu({
  ignores: [
    '.migration-sources/**',
    '.migration-checkouts/**',
    '.migration-artifacts/**',
    '.migration-*.json',
    'migration-sources.json',
    'migration-artifacts.json',
    '.benchmark/**',
    'scripts/migration-lock.yaml',
    'CLAUDE.md',
    'ARCHITECTURE.md',
    'test/fixtures/**',
    'playground/**',
  ],
  rules: {
    'node/prefer-global/process': 'off',
    'no-use-before-define': 'off',
    'node/prefer-global/buffer': 'off',
  },
}, ...harlanzw())

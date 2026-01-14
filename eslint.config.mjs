import antfu from '@antfu/eslint-config'

export default antfu({
  ignores: [
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
})

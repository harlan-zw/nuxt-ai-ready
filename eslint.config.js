import antfu from '@antfu/eslint-config'

export default antfu({
  ignores: [
    '**/*.md',
    '**/ARCHITECTURE.md',
    '**/README.md',
    'docs/**/*.md',
  ],
  rules: {
    'node/prefer-global/process': 'off',
    'no-use-before-define': 'off',
  },
})

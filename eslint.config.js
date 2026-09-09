// @ts-check
import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ['dist/**', 'coverage/**', 'test-results/**', 'node_modules/**'],
  },
  {
    files: ['src/sim/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/render/**', '**/ui/**', '**/input/**'],
              message: 'src/sim must not import renderer, UI or input code.',
            },
          ],
        },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Use src/sim/rng.ts — the sim must be deterministic.',
        },
        {
          object: 'Date',
          property: 'now',
          message: 'The sim must be deterministic.',
        },
      ],
    },
  },
)

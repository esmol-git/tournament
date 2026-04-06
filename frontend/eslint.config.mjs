// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt({
  rules: {
    // PrimeVue: PascalCase / camelCase props are normal; hyphenation fights the library.
    'vue/attribute-hyphenation': 'off',
    'vue/attributes-order': 'off',
    'vue/html-self-closing': 'off',
    'vue/require-default-prop': 'off',
    'vue/no-v-html': 'warn',
    'vue/v-on-event-hyphenation': 'off',

    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-dynamic-delete': 'off',
    '@typescript-eslint/unified-signatures': 'off',
    '@typescript-eslint/no-unused-vars': [
      'warn',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      },
    ],
    '@typescript-eslint/ban-ts-comment': 'off',

    'import/first': 'off',
    'import/no-duplicates': 'warn',

    'nuxt/prefer-import-meta': 'off',

    'vue/no-ref-as-operand': 'warn',
    'prefer-const': 'warn',
  },
})

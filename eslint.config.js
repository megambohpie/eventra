import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/.expo/**', 'apps/api/prisma/migrations/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      // Semua HTTP frontend wajib lewat Axios client bersama (AGENTS.md).
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'Gunakan Axios dari @eventra/api-client.' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'window', property: 'fetch', message: 'Gunakan Axios dari @eventra/api-client.' },
        {
          object: 'globalThis',
          property: 'fetch',
          message: 'Gunakan Axios dari @eventra/api-client.',
        },
      ],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}', 'apps/mobile/**/*.{ts,tsx}'],
    ...reactHooks.configs.flat.recommended,
  },
);

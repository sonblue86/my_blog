import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    // DOM-dependent tests opt in with: // @vitest-environment happy-dom
  },
});

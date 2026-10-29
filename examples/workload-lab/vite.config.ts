import { defineConfig } from 'vite';
import { gyral } from '@gyral/core/vite';
export default defineConfig({ plugins: [gyral({ clientOnly: true })] });

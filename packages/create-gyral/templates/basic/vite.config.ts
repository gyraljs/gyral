import { defineConfig } from 'vite';
import { gyralVitePreset } from '@gyral/core/vite';

// gyralVitePreset(): the template compiler (`vite build` checks and precompiles templates).
export default defineConfig({ ...gyralVitePreset() });

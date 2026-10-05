import { defineConfig } from 'vite';
import { gyralVitePreset } from '@gyral/core/vite';

// gyralVitePreset(): one copy of Lit, and Lit's modules pre-bundled.
export default defineConfig({ ...gyralVitePreset() });

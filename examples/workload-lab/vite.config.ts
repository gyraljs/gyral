import { defineConfig } from 'vite';
import { gyralVitePreset } from '@gyral/core/vite';
export default defineConfig(gyralVitePreset({ clientOnly: true }));

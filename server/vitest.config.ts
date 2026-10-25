import {defineConfig} from 'vitest/config';
export default defineConfig({test:{include:['tests/**/*.test.ts'],fileParallelism:false,hookTimeout:120000,testTimeout:30000}});

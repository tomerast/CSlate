import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@main': resolve(__dirname, 'src/main') }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@preload': resolve(__dirname, 'src/preload') }
    }
  },
  renderer: {
    plugins: [react()],
    resolve: {
      alias: { '@renderer': resolve(__dirname, 'src/renderer') }
    },
    css: {
      postcss: './postcss.config.js'
    }
  }
})

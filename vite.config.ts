import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  base: mode === 'github-pages' ? '/AnswerBook/' : '/',
  plugins: [react()],
  server: {
    proxy:{'/api':'http://127.0.0.1:5129'},
    // Content publication and .NET builds must not reload an open questionnaire.
    watch:{ignored:['**/server/**','**/artifacts/**','**/android/**','**/.tools/**']},
  },
}))

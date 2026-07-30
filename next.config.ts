import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Det ligger package-lock.json lenger opp i mappetreet på denne maskinen;
  // uten dette gjetter Turbopack feil rotmappe.
  turbopack: {
    root: fileURLToPath(new URL('.', import.meta.url)),
  },
}

export default nextConfig

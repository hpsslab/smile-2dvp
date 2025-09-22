# SMILE-2DVP

React + Vite frontend for visualizing and experimenting with SMILE-2DVP results.

## Prerequisites

- Node.js 18 or newer
- npm (bundled with Node)

## Quick Start

1) Clone the repo
   git clone https://github.com/hpsslab/smile-2dvp.git
   cd smile-2dvp

2) Install dependencies
   npm install

3) Run the dev server
   npm run dev
   (open the URL printed in the terminal, usually http://localhost:5173)

## Build and Local Preview

- Build production assets
  npm run build

- Preview the production build locally
  npm run preview
  (open the URL printed in the terminal)

## Project Structure

```text
smile-2dvp/
├─ public/              (static assets)
├─ src/                 (components, pages, hooks, utilities)
├─ index.html           (app entry)
├─ package.json         (scripts and dependencies)
├─ vite.config.*        (Vite configuration)
└─ tailwind.config.*    (Tailwind configuration if present)
```

## Editing and Experimenting

- All source code is under src
- Start the dev server, edit files in src, save changes, and the app hot reloads
- If you change dependencies, re-run npm install if needed

## Notes

- If the dev server port is busy, Vite will prompt for a new port
- If Node is older than 18, upgrade Node to avoid build errors

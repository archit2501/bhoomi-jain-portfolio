---
title: 'SmartBlog AI'
kind: 'project'
resumeRef: 'projects/smartblog-ai'
order: 1
pinned: true
date: '2024'
dateLabel: '2024 – 2025'
org: 'Full-stack project'
media:
  - type: 'text'
    headline: 'SmartBlog AI'
    detail: 'Full-stack AI blogging platform'
  - type: 'diagram'
    title: 'How SmartBlog AI fits together'
    nodes:
      - id: 'spa'
        label: 'React SPA'
        detail: 'React Router · Tailwind · React Query'
      - id: 'api'
        label: 'Node.js / Express REST API'
        detail: 'JWT auth · bcrypt'
      - id: 'db'
        label: 'MongoDB'
        detail: 'Mongoose schemas'
    edges:
      - from: 'spa'
        to: 'api'
        label: 'REST + JWT'
      - from: 'api'
        to: 'db'
        label: 'Mongoose'
  - type: 'text'
    headline: '~45%'
    detail: 'fewer redundant network calls with React Query caching'
  - type: 'text'
    headline: 'JWT + bcrypt'
    detail: 'Protected routes on a Node.js/Express REST API with MongoDB'
tldr: 'Full-stack AI blogging app: a React SPA on a Node/Express REST API and MongoDB, with JWT auth and ~45% fewer redundant calls thanks to React Query.'
figures:
  - 'network-calls'
---

A responsive single-page web app in ReactJS with reusable functional components, React Router navigation and Tailwind styling, built mobile-first across 320px–1440px breakpoints.

Authentication uses JWT, React Context and bcrypt-hashed credentials, with frontend forms talking to a Node.js/Express REST API and Mongoose-backed MongoDB schemas. The dashboard is split into composable UI primitives, and client-side caching with React Query cut redundant network calls by about 45%. Component logic is covered by unit and integration tests.

**Stack:** ReactJS · Tailwind · React Router · React Query · Node.js · MongoDB · JWT

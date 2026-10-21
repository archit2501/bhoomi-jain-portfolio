---
title: 'Conversational AI Web App'
kind: 'project'
resumeRef: 'projects/conversational-ai-web-app'
order: 2
pinned: true
date: '2024'
dateLabel: '2024'
org: 'Full-stack project'
media:
  - type: 'text'
    headline: 'Conversational AI'
    detail: 'Real-time chat in React on a FastAPI backend'
  - type: 'text'
    headline: '40%'
    detail: 'lower end-to-end latency on AWS EC2'
  - type: 'text'
    headline: '500+'
    detail: 'test sessions without UI regressions'
figures:
  - 'latency'
  - 'test-sessions'
---

A real-time chat interface in ReactJS with optimistic UI updates, controlled inputs and custom hooks for streaming responses. It held up through 500+ test sessions without UI regressions.

The React client talks to a FastAPI backend over REST and runs on AWS EC2. Request batching, lazy loading and asset compression cut end-to-end latency by 40%.

Stack: ReactJS · JavaScript · CSS3 · FastAPI · REST · AWS EC2

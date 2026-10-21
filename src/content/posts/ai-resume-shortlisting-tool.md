---
title: 'AI Resume Shortlisting Tool'
kind: 'project'
resumeRef: 'projects/ai-resume-shortlisting-tool'
order: 3
pinned: true
date: '2024'
dateLabel: '2024'
org: 'Web UI project'
media:
  - type: 'text'
    headline: 'AI Resume Shortlisting'
    detail: 'A recruiter-facing web interface'
  - type: 'diagram'
    title: 'How the shortlisting tool fits together'
    nodes:
      - id: 'ui'
        label: 'Recruiter web UI'
        detail: 'Bootstrap · drag-and-drop upload'
      - id: 'api'
        label: 'Flask backend'
    edges:
      - from: 'ui'
        to: 'api'
        label: 'Résumé upload'
  - type: 'text'
    headline: '<1.5s'
    detail: 'perceived response time for skill-gap insights'
tldr: 'A recruiter-facing web UI: drag-and-drop résumé upload, client-side validation and skill-gap insights at <1.5s perceived response time.'
figures:
  - 'response-time'
---

A recruiter-facing web interface on a Bootstrap grid, with client-side form validation and drag-and-drop resume upload. It surfaces skill-gap insights with a perceived response time under 1.5 seconds.

**Stack:** JavaScript · HTML5 · CSS3 · Bootstrap · Flask

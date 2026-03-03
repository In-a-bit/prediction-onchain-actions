# Agent Team Design — Prediction Onchain Actions

## Overview

Five persistent expert agents defined in `.claude/agents/`, each a domain specialist in a flat team structure coordinated by the Project Manager.

## Stack Context

- Next.js 16, React 19, TypeScript, Tailwind CSS v4
- ethers.js v6, TypeChain, Polygon Amoy testnet
- shadcn/ui + Radix for UI components
- Vitest + Playwright for testing

## Agents

### 1. Project Manager (`project-manager.md`)
Orchestrator. Breaks features into tasks, assigns to specialists, tracks progress, enforces git workflow. General-purpose agent with all tools.

### 2. Web3 Developer (`web3-developer.md`)
Full-stack Web3 TypeScript expert. Owns contract interaction (ethers.js v6, TypeChain), API routes, server actions, wallet logic. Uses generated types from `types/contracts/`, references addresses from `.env`. General-purpose agent with all tools.

### 3. Product Owner (`product-owner.md`)
Defines what to build. Writes user stories, acceptance criteria, prioritizes backlog. Understands prediction market domain. Read-only — doesn't write code.

### 4. UI/UX Expert (`ui-ux-expert.md`)
Builds all frontend. Expert in React 19 server/client components, Next.js App Router, shadcn/ui + Radix, Tailwind v4. Accessible, responsive, Web3 UX patterns. General-purpose agent with all tools.

### 5. QA Engineer (`qa-engineer.md`)
Owns all testing. Vitest for unit/integration, Playwright for E2E. Mocks blockchain calls in unit tests, uses testnet for E2E. Coverage targets: >80% business logic, >60% overall. General-purpose agent with all tools.

## Team Structure

```
Project Manager (orchestrator)
├── Web3 Developer (contracts + API + full-stack TS)
├── Product Owner (specs, acceptance criteria, priorities)
├── UI/UX Expert (components, layouts, design system)
└── QA Engineer (tests, coverage, E2E validation)
```

## Decisions

- Flat specialist team — no sub-teams or pods
- Product Owner is read-only (doesn't write code)
- All other agents have full tool access
- shadcn/ui + Radix for component library
- Vitest + Playwright for testing stack

# AppTrack

AppTrack is a full-stack job application tracking platform built to replace spreadsheet-based workflows with a centralized dashboard for managing job applications.

The system allows users to track applications across different stages of the hiring process, monitor response rates, and visualize application trends over time.

The application is built using a modern full-stack architecture with a React frontend, a Node.js/Express backend, and a PostgreSQL database.

---

# Features

## Application Management
- Create, update, and delete job applications
- Track application status (Applied, OA, Interview, Offer, Rejected, Withdrawn)
- Add optional details such as job URLs and notes
- Inline editing for quick updates

## Dashboard Analytics
- Total applications overview
- Pending applications tracking
- Response rate calculation
- Success rate tracking
- Application trends over time

## Data Visualization
- Bar chart for application status breakdown
- Pie chart for status distribution
- Area chart for application activity trends
- Recent applications list

## Application Table
- Search applications by company name
- Filter by application status
- Sort by application date
- Server-side pagination
- Status dropdown for quick updates

## Authentication
- User signup and login
- Session-based authentication
- Protected routes for authenticated users

## Validation
- Input validation using Zod
- Status and date validation
- Field length validation

---

# Architecture

AppTrack follows a typical three-layer architecture:

```
Frontend (React + TypeScript)
        ↓
REST API (Node.js + Express)
        ↓
Database (PostgreSQL)
```

## Frontend
- React 18
- TypeScript
- Vite
- Refine for data management
- React Table for tabular data
- Recharts for analytics dashboards
- Tailwind CSS for styling
- GSAP for UI animations

## Backend
- Node.js
- Express
- TypeScript
- Drizzle ORM
- Zod validation

## Database
- PostgreSQL
- Relational schema with application status enums
- Migration-based schema management

---

# API Overview

## Applications

```
GET    /applications
POST   /applications
GET    /applications/:id
PUT    /applications/:id
DELETE /applications/:id
GET    /applications/stats
```

The stats endpoint aggregates:

- total applications
- status breakdown
- monthly application trends
- response rate
- success rate

---

# Tech Stack

## Frontend
- React
- TypeScript
- Vite
- Refine
- React Table
- Recharts
- Tailwind CSS
- Lucide Icons
- Sonner
- GSAP

## Backend
- Node.js
- Express
- TypeScript
- Drizzle ORM
- Zod

## Database
- PostgreSQL

# Developer Tooling

- GitHub for version control
- CodeRabbit for automated pull request reviews and AI-assisted code feedback
- TypeScript for type safety
- Zod for schema validation
---

# Example Application Status Flow

```
Applied → OA → Interview → Offer
                         ↘
                        Rejected
```

This allows the system to track application progression and compute metrics like response rate and success rate.

---

# Planned Improvements

Future enhancements include:

- User-specific data isolation
- Export functionality (CSV or PDF)
- Advanced filtering (date ranges and multiple status filters)
- Docker-based deployment
- Automated testing
- API documentation

---

# Running the Project

## Backend

Install dependencies

```
npm install
```

Run database migrations

```
npm run migrate
```

Start server

```
npm run dev
```

---

## Frontend

Install dependencies

```
npm install
```

Start development server

```
npm run dev
```

---

# Project Motivation

Job searching often involves tracking dozens of applications across multiple companies and stages. Many people rely on spreadsheets or scattered notes, which makes it difficult to understand progress and trends.

AppTrack was built to provide a centralized system that helps users manage applications more efficiently and gain insight into their job search through simple analytics and visualization.

---

# Author

Harshith Peta  
Computer Science, University of Wisconsin–Madison
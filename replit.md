# Agentic AI L3 IT Support Dashboard

## Overview

This is a full-stack application built to demonstrate an Agentic AI system for Level 3 IT support automation. The system provides a comprehensive dashboard for monitoring incidents, tracking root cause analysis (RCA) workflows, managing AI-driven actions, and handling escalations. It features real-time updates, automated troubleshooting capabilities, and a knowledge base that learns from resolved incidents.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite with custom configuration for development and production
- **UI Library**: Shadcn/ui components built on Radix UI primitives
- **Styling**: Tailwind CSS with custom dark theme variables
- **State Management**: TanStack Query (React Query) for server state management
- **Routing**: Wouter for lightweight client-side routing
- **Real-time Communication**: WebSocket integration for live updates

### Backend Architecture
- **Runtime**: Node.js with Express.js server
- **Language**: TypeScript with ES modules
- **Database**: PostgreSQL with Drizzle ORM
- **Database Provider**: Neon serverless PostgreSQL
- **Session Management**: Express sessions with PostgreSQL store
- **WebSocket**: Built-in WebSocket server for real-time updates
- **API Design**: RESTful endpoints with structured error handling

### Database Schema
The system uses a comprehensive schema designed for incident management:
- **Users**: Authentication and user management
- **Incidents**: Core incident tracking with severity levels, status, and metadata
- **RCA Workflows**: Step-by-step root cause analysis tracking
- **Actions**: AI-driven automated actions with execution results
- **Knowledge Base**: Self-updating knowledge repository
- **Escalations**: Human escalation management
- **System Metrics**: Performance and system health tracking

## Key Components

### Dashboard Components
- **Metrics Cards**: Real-time system performance indicators
- **Active Incidents**: Critical incident monitoring with severity-based filtering
- **RCA Workflow**: Visual representation of automated analysis steps
- **Recent Actions**: AI action history with success/failure tracking
- **Knowledge Base**: Dynamic knowledge repository updates
- **Escalation Queue**: Human intervention queue management

### AI Workflow Engine
- **Automated Detection**: Continuous monitoring and alert processing
- **Root Cause Analysis**: Multi-step diagnostic workflows
- **Action Execution**: Automated remediation with rollback capabilities
- **Knowledge Learning**: Pattern recognition and solution documentation
- **Escalation Logic**: Confidence-based human handoff decisions

### Real-time Features
- **WebSocket Integration**: Live updates across all dashboard components
- **Connection Status**: Visual connection state indicators
- **Automatic Reconnection**: Resilient WebSocket connection handling
- **Broadcast System**: Efficient update distribution to connected clients

## Data Flow

1. **Alert Detection**: Monitoring systems trigger incident creation
2. **RCA Initiation**: Automated workflow begins with data collection
3. **Analysis Phase**: Multi-step diagnostic process with confidence scoring
4. **Action Planning**: AI determines appropriate remediation steps
5. **Execution**: Automated actions with validation and rollback capability
6. **Knowledge Update**: Successful resolutions update the knowledge base
7. **Escalation**: Low-confidence or failed resolutions trigger human intervention

## External Dependencies

### Core Dependencies
- **@neondatabase/serverless**: Serverless PostgreSQL database connection
- **drizzle-orm**: Type-safe database ORM with schema validation
- **@tanstack/react-query**: Powerful data fetching and caching
- **@radix-ui/***: Comprehensive UI component primitives
- **tailwindcss**: Utility-first CSS framework
- **zod**: Runtime type validation and schema parsing

### Development Dependencies
- **vite**: Fast build tool with HMR support
- **tsx**: TypeScript execution for development
- **esbuild**: Fast JavaScript bundler for production builds

### Replit Integration
- **@replit/vite-plugin-runtime-error-modal**: Development error handling
- **@replit/vite-plugin-cartographer**: Development environment integration

## Deployment Strategy

### Development Mode
- **Hot Module Replacement**: Instant updates during development
- **TypeScript Compilation**: Real-time type checking and compilation
- **WebSocket Development**: Live connection testing and debugging
- **Database Migrations**: Automatic schema synchronization

### Production Build
- **Static Asset Generation**: Optimized client-side bundle creation
- **Server Bundle**: ESM-format server compilation with external dependencies
- **Database Preparation**: Schema migration and seeding
- **Environment Configuration**: Production-ready configuration management

### Environment Variables
- **DATABASE_URL**: PostgreSQL connection string (required)
- **NODE_ENV**: Environment specification (development/production)
- **REPL_ID**: Replit environment identifier (optional)

## Changelog

```
Changelog:
- July 01, 2025. Initial setup
- July 04, 2025. Integrated OpenAI GPT-4o for real AI-powered log analysis, RCA workflows, and action recommendations. System includes graceful fallback when API limits are reached.
- July 04, 2025. Added automatic RCA workflow progression system that advances IN_PROGRESS steps to COMPLETED after 45 seconds. Fixed Active Alerts filtering to display ACTIVE status incidents properly.
- July 04, 2025. Integrated Google Gemini AI as primary AI service to address OpenAI quota limitations. Enhanced fallback system with Oracle-specific error detection and recommendations for database constraint violations.
- July 07, 2025. Fixed AI service to use real AI models (Gemini 2.5 Flash → OpenAI GPT-4o → Fallback). Enhanced fallback system with Java NPE detection and technology-specific actions. System now provides genuine AI-powered analysis instead of pattern matching.
- July 07, 2025. Added comprehensive Angular pattern recognition with TypeScript and RxJS support. Enhanced intelligent fallback system to detect Angular component lifecycle issues, dependency conflicts, template validation errors, Observable memory leaks, and TypeScript type checking problems.
- July 15, 2025. Implemented prioritized AI analysis system: 1) Internal documentation first, 2) Code repository content second, 3) General knowledge only as fallback. Enhanced RAG system to explicitly prioritize internal sources over web-based suggestions for more accurate context-aware recommendations.
- July 15, 2025. Enhanced action generation to include source document information with document names, locations, and file paths with line numbers for code references. Actions now display source metadata in structured format with 📄 Source and 📍 Location indicators.
- July 17, 2025. Implemented complete GitHub integration with pull request workflow. When GitHub token is provided, approved code fixes automatically create feature branches, apply changes, and generate pull requests with incident context. Added GitHub status indicators, permission validation, and clear buttons for document management.
- July 17, 2025. Added individual repository deletion functionality. Users can now delete specific repositories with confirmation dialog. System automatically removes repository and all associated documents/embeddings. Enhanced sync error handling with automatic main/master branch detection.
- July 17, 2025. Successfully implemented complete GitHub integration with "Approve and Create PR" button functionality. Enhanced approval system recognizes CODE_IMPLEMENTATION actions, extracts code changes from metadata, matches repositories automatically, and applies changes locally while attempting GitHub integration with multiple fallback approaches (fork-based, tree API, direct changes). System now provides comprehensive code modification workflow with proper error handling and clear status messages.
- July 17, 2025. Fixed repository sync functionality permanently with comprehensive error handling. Implemented GitHub token validation, improved sync status tracking (AUTH_ERROR, ACCESS_DENIED, NOT_FOUND, RATE_LIMITED), proper error messaging, and graceful fallback when GitHub is unavailable. Added GitHub validation endpoint for real-time token verification and detailed permission checking.
- July 17, 2025. MAJOR MILESTONE: GitHub integration now fully operational with direct commit capabilities. "Approve and Create PR" button successfully creates pull requests (https://github.com/amitbhagra/customer/pull/2), manages feature branches, handles new file creation, and provides complete GitHub workflow automation. System now enables seamless code deployment from AI suggestions to GitHub repositories with automatic PR generation.
- July 18, 2025. Implemented comprehensive ServiceNow integration with full database schema, API endpoints, and polling functionality. System now supports ServiceNow incident creation with log attachments, automatic polling for new incidents, bidirectional sync, and complete configuration management. Active Alerts page enhanced with ServiceNow polling button for real-time incident synchronization.
- July 18, 2025. Enhanced AI-powered log analysis for ServiceNow incidents. System now automatically extracts log files from ServiceNow attachments, uses AI to analyze log content for intelligent root cause analysis, generates contextual RCA workflows with AI-powered insights, creates actionable recommendations based on log patterns, and updates knowledge base with AI-derived solutions. All RCA workflows and actions are now generated from actual log file content rather than generic templates.
- July 21, 2025. Fixed critical documentation prioritization issue in AI analysis. Root cause: OpenAI quota exceeded prevents embeddings creation, causing documentation to score low (20) vs code files (100) in text-based search fallback. Enhanced search algorithm now gives documentation files +50 base priority score, +30 for exception-related queries, and +30 for controller/service queries. Documentation now properly scores 100+ and gets marked as used_in_solution, ensuring AI recommendations reference architectural guidance over raw code files.
```

## User Preferences

```
Preferred communication style: Simple, everyday language.
```
**Steps to run the L3 Support App locally:**

**Prerequisites:**
- Node.js v18+ installed
- npm or yarn package manager

**Basic Setup (In-Memory Mode - No Database Required):**

```bash
# 1. Clone the repository
git clone https://github.com/amitbhagra/l3-support-app.git
cd l3-support-app

# 2. Install dependencies
npm install

# 3. Start the development server
npm run dev
```

The app will be available at http://localhost:5000

**Full Setup (With Database & AI Features):**

```bash
# Set environment variables before running
export DATABASE_URL="postgresql://user:password@host:5432/database"
export OPENAI_API_KEY="your-openai-api-key"
export GEMINI_API_KEY="your-gemini-api-key"
export GITHUB_TOKEN="your-github-token"  # For repository integration

# Then run
npm run dev
```

**Optional Environment Variables:**
- `DATABASE_URL` - PostgreSQL connection (uses Neon serverless)
- `OPENAI_API_KEY` - For document embeddings and semantic search
- `GEMINI_API_KEY` - For AI-powered log analysis
- `GITHUB_TOKEN` - For code repository integration

Without these variables, the app runs with in-memory storage and sample data, which is great for testing and development.

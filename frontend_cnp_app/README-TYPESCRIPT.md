Career Navigator Frontend — TypeScript Setup Notes

- This app uses Create React App with TypeScript.
- Run: npm install
- Development: npm start
- Type Check: npm run typecheck
- Build: npm run build

Environment variables required:
- REACT_APP_SUPABASE_URL
- REACT_APP_SUPABASE_KEY

These must be provided by the orchestrator in the container .env. Do not hardcode credentials.

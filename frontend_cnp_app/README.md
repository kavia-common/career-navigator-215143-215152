# Lightweight React Template for KAVIA

This project provides a minimal React template with a clean, modern UI and minimal dependencies.

## Features
- Sponsors and Notifications pages added to the left navigation. These allow managing your own sponsors and notifications (RLS enforced).

- **Lightweight**: No heavy UI frameworks - uses only vanilla CSS and React
- **Modern UI**: Clean, responsive design with KAVIA brand styling
- **Fast**: Minimal dependencies for quick loading times
- **Simple**: Easy to understand and modify

## Getting Started

In the project directory, you can run:

### `npm start`

Runs the app in development mode.
- To bind on all interfaces for preview environments, use:
  HOST=0.0.0.0 PORT=3000 npm start
- Default healthcheck path: GET /health/supabase (renders a small status panel in development)
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

### `npm test`

Launches the test runner in interactive watch mode.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

## Environment Variables (Supabase)

The app reads Supabase credentials from:
- REACT_APP_SUPABASE_URL
- REACT_APP_SUPABASE_KEY

For convenience, if only SUPABASE_URL and SUPABASE_KEY exist in the environment, the app will fall back to those. Create React App only exposes variables prefixed with REACT_APP_ at build time, so prefer the REACT_ variants whenever possible.

Minimal .env example:
```
REACT_APP_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
REACT_APP_SUPABASE_KEY=YOUR_ANON_PUBLIC_KEY
```

If either variable is missing, the app will show a small warning in the header and log a descriptive message to the console.

## Health Check

A lightweight Supabase connectivity health page is available at:
- /health/supabase

It attempts:
- supabase.auth.getSession()
- select id from profiles limit 1

It displays:
- Connected (green) on success
- Error (red) with a brief message otherwise (details in the browser console)

Note: In production (NODE_ENV=production), the component renders null by default to remain unobtrusive, but the route remains available in development.

## Customization

### Colors

The main brand colors are defined as CSS variables in `src/App.css`:

```css
:root {
  --kavia-orange: #E87A41;
  --kavia-dark: #1A1A1A;
  --text-color: #ffffff;
  --text-secondary: rgba(255, 255, 255, 0.7);
  --border-color: rgba(255, 255, 255, 0.1);
}
```

### Components

This template uses pure HTML/CSS components instead of a UI framework. You can find component styles in `src/App.css`. 

Common components include:
- Buttons (`.btn`, `.btn-large`)
- Container (`.container`)
- Navigation (`.navbar`)
- Typography (`.title`, `.subtitle`, `.description`)

## Learn More

To learn React, check out the [React documentation](https://reactjs.org/).

### Code Splitting

This section has moved here: [https://facebook.github.io/create-react-app/docs/code-splitting](https://facebook.github.io/create-react-app/docs/code-splitting)

### Analyzing the Bundle Size

This section has moved here: [https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size](https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size)

### Making a Progressive Web App

This section has moved here: [https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app](https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app)

### Advanced Configuration

This section has moved here: [https://facebook.github.io/create-react-app/docs/advanced-configuration](https://facebook.github.io/create-react-app/docs/advanced-configuration)

### Deployment

This section has moved here: [https://facebook.github.io/create-react-app/docs/deployment](https://facebook.github.io/create-react-app/docs/deployment)

### Dependency install note (TypeScript + CRA)

Create React App (react-scripts@5) declares a peerOptional dependency on TypeScript ^3 or ^4.  
This project uses TypeScript 5.x and works fine, but npm may error on install due to peer resolution.  
If you encounter installation issues, use:

- npm ci --legacy-peer-deps
- or npm install --legacy-peer-deps

This is a known ecosystem mismatch and does not affect runtime.

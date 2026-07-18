// Funzione serverless Vercel: inoltra ogni richiesta /api/* all'app Express.
// Il file _server.mjs viene generato al build da scripts/build-vercel.mjs.
export { default } from "./_server.mjs";

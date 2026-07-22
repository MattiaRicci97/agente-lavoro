// Entry point per Vercel: esporta l'app Express senza mettersi in ascolto
// su una porta (in serverless è la piattaforma a gestire le richieste).
import "./env";
import app from "./app";

export default app;

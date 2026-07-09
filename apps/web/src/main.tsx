import { createRoot } from "react-dom/client";
import { setBaseUrl } from "@sillabo/api-client-react";
import App from "./App";
import "./index.css";

// In sviluppo le chiamate /api passano dal proxy di Vite verso l'API locale.
// In produzione, se l'API e' su un dominio diverso, impostare VITE_API_URL.
const apiUrl = import.meta.env.VITE_API_URL as string | undefined;
if (apiUrl) {
  setBaseUrl(apiUrl);
}

createRoot(document.getElementById("root")!).render(<App />);

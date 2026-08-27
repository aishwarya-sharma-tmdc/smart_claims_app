import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { ThemeProvider } from "./theme";
import { BootGate } from "./components/SplashScreen";
import "./index.css";

const TWO_HOURS = 2 * 60 * 60 * 1000;
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, staleTime: TWO_HOURS, gcTime: TWO_HOURS, retry: 1 },
  },
});

const basename = new URL(document.baseURI).pathname.replace(/\/$/, "");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <BootGate>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter basename={basename}>
            <App />
          </BrowserRouter>
        </QueryClientProvider>
      </BootGate>
    </ThemeProvider>
  </React.StrictMode>
);

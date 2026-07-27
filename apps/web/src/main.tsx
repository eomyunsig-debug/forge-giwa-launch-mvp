import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router";

import { App } from "./App";
import { WalletProvider } from "./wallet";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 4_000,
    },
  },
});

const root = document.getElementById("root");
if (!root) throw new Error("ROOT_ELEMENT_MISSING");

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <WalletProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </WalletProvider>
    </QueryClientProvider>
  </StrictMode>,
);

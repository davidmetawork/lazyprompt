import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

function App() {
  return <p style={{ fontFamily: "system-ui, sans-serif", margin: 12 }}>LazyPrompt widget</p>;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

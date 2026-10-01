import { StrictMode, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { connect, openPrompt, setView, store } from "./bridge";
import { Card } from "./card";
import { List } from "./list";
import "./styles.css";

function Root() {
  const { view, host } = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const style = {
    maxHeight: host.maxHeight ? `${host.maxHeight}px` : undefined,
    paddingTop: host.insets.top ? `${host.insets.top + 8}px` : undefined,
    paddingRight: host.insets.right ? `${host.insets.right + 12}px` : undefined,
    paddingBottom: host.insets.bottom ? `${host.insets.bottom + 8}px` : undefined,
    paddingLeft: host.insets.left ? `${host.insets.left + 12}px` : undefined,
  };
  return (
    <main className="shell" style={style} data-theme={host.theme} aria-busy={view.kind === "loading"}>
      {view.kind === "loading" ? <p className="message" role="status">{view.label}</p> : null}
      {view.kind === "message" ? <p className={`message ${view.tone}`} role={view.tone === "error" ? "alert" : "status"}>{view.text}</p> : null}
      {view.kind === "list" ? <List list={view.list} onOpen={(id) => void openPrompt(id, {}, view.list)} /> : null}
      {view.kind === "card" ? (
        <Card key={view.prompt.id} prompt={view.prompt} initialValues={view.initialValues} back={view.back}
          onBack={() => view.back && setView({ kind: "list", list: view.back })} />
      ) : null}
    </main>
  );
}

void connect();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);

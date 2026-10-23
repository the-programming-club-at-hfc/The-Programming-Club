import { useState } from "react";
import { Tabs } from "@base-ui/react/tabs";
// Only the Playwright module-response fixture exposes this internal component.
import { PanePanel } from "../../src/routes/hello-world/host.tsx?tsr-split=component";

const panes = [
  ["run", "Run"],
  ["scores", "Scores"],
  ["games", "Games"],
  ["tv", "TV"],
  ["players", "Players"],
];

export default function Panes() {
  const [pane, setPane] = useState("run");
  return (
    <section aria-label="Responsive panes">
      <Tabs.Root value={pane} onValueChange={setPane}>
        <Tabs.List className="grid grid-cols-5 lg:hidden" aria-label="Host controls">
          {panes.map(([value, label]) => (
            <Tabs.Tab key={value} value={value}>
              {label}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        {panes.map(([value, label]) => (
          <PanePanel key={value} value={value}>
            <h2>{label} controls</h2>
            <input className="field" aria-label={`${label} draft`} defaultValue="" />
          </PanePanel>
        ))}
      </Tabs.Root>
    </section>
  );
}

import { DiagramFigure, DiagramNode, DiagramArrow, ArrowheadDefs } from "@/components/diagram-figure";

/**
 * There is no single shared "knowledge base" datastore in this system - the
 * MAPE-K framing (Monitor-Analyze-Plan-Execute-Knowledge) used throughout the
 * docs to describe the architecture is a theoretical lens, not a literal
 * component. What actually exists is two distinct things per module, both
 * shown here: (1) each module's own private state, built up and consumed
 * only by itself (the plain boxes below each module - tone-less on purpose,
 * to read as clearly different from the module boxes above them), and (2)
 * the specific, real pieces of that state each module exposes to the others
 * (the three horizontal/arced arrows). Nothing is fed back upstream - every
 * arrow here runs one direction, matching how the live components actually
 * poll each other.
 */
export function KnowledgeDiagram() {
  return (
    <DiagramFigure
      viewBox="0 0 1000 420"
      minWidth={720}
      ariaLabel="Diagram: Module 1 sends its SHAP attribution to Module 2, and its predicted risk (residual stream) to Module 3. Module 2 sends its bandit state to Module 3, read-only. Below each module is a plain box showing what it privately maintains for itself: Module 1 keeps its trained model and a short rolling history; Module 2 keeps a per-node belief as Beta distributions; Module 3 keeps a PI controller integral term and a score/threshold history."
      caption="What each module shares with the others (top) versus what each one privately maintains only for itself (bottom, plain boxes) - there is no single shared knowledge-base component."
    >
      <ArrowheadDefs />

      {/* Cross-module sharing, top row - the only arrows that leave a module's own box */}
      <DiagramArrow
        points={[[260, 125], [390, 125]]}
        label="attribution"
        labelAt={[325, 112]}
      />
      <DiagramArrow
        points={[[610, 125], [740, 125]]}
        label="bandit state (read-only)"
        labelAt={[675, 112]}
      />
      {/* Arced above both, so it never crosses the two direct arrows below it */}
      <DiagramArrow
        points={[[150, 80], [150, 25], [850, 25], [850, 80]]}
        label="predicted risk (residual stream)"
        labelAt={[500, 18]}
      />

      {/* Each module maintaining its own state - short, undecorated, self-contained */}
      <DiagramArrow points={[[150, 170], [150, 280]]} label="maintains" labelAt={[160, 228]} labelAnchor="start" />
      <DiagramArrow points={[[500, 170], [500, 280]]} label="maintains" labelAt={[510, 228]} labelAnchor="start" />
      <DiagramArrow points={[[850, 170], [850, 280]]} label="maintains" labelAt={[860, 228]} labelAnchor="start" />

      <DiagramNode x={40} y={80} w={220} h={90} lines={["Module 1", "Signal Fusion"]} tone="orange" />
      <DiagramNode x={390} y={80} w={220} h={90} lines={["Module 2", "Co-Scheduling"]} tone="aqua" />
      <DiagramNode x={740} y={80} w={220} h={90} lines={["Module 3", "Adaptive Control"]} tone="yellow" />

      <DiagramNode x={40} y={280} w={220} h={100} lines={["Trained model +", "rolling history"]} />
      <DiagramNode x={390} y={280} w={220} h={100} lines={["Per-node belief", "(Beta distributions)"]} />
      <DiagramNode x={740} y={280} w={220} h={100} lines={["Integral term +", "score/threshold history"]} />
    </DiagramFigure>
  );
}

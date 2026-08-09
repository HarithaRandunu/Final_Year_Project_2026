import { DiagramFigure, DiagramNode, DiagramArrow, ArrowheadDefs } from "@/components/diagram-figure";

/**
 * The full offline data path, hand-placed to stay crossing-free: four raw
 * Alibaba tables -> two separate processing steps (most of them feed
 * build_features.py; MSResource and Node feed Module 2's own event
 * extraction instead) -> three modules training/validating independently
 * -> Phase 4's simulated closed loop. Module 3 only depends on Module 1's
 * output here (its residual stream) - the Module 2 -> Module 3 link shown
 * on the Knowledge page is a live-cluster-only connection (Phase 5+), not
 * part of this offline pipeline, so it's deliberately left out.
 */
export function PipelineDiagram() {
  return (
    <DiagramFigure
      viewBox="0 0 960 780"
      minWidth={720}
      ariaLabel="Diagram: MSRTQps and MSCallGraph feed Preprocessing (build_features.py); MSResource feeds both Preprocessing and Module 2's own event extraction; Node feeds only Module 2's extraction. Preprocessing produces a 360-row feature table that Module 1 trains and validates on. Module 2's extraction produces 306 static plus 87 churn placement events that Module 2 trains and validates on. Module 1 sends its attribution as context to Module 2, and its residual stream to Module 3, which trains and validates on it. All three modules' outputs feed Phase 4's simulated closed loop."
      caption="The offline data path: four raw Alibaba tables, two separate processing steps, three independently trained and validated modules, one combined Phase 4 check. MSResource is used twice, for two different purposes - once aggregated into Module 1's feature table, once scanned directly for Module 2's real placement events."
    >
      <ArrowheadDefs />

      {/* Raw tables -> processing */}
      <DiagramArrow points={[[125, 140], [180, 210]]} />
      <DiagramArrow points={[[355, 140], [430, 210]]} label="latency + load" labelAt={[300, 178]} labelAnchor="start" />
      <DiagramArrow points={[[590, 140], [510, 210]]} label="resource" labelAt={[560, 178]} labelAnchor="start" />
      <DiagramArrow points={[[590, 140], [620, 210]]} />
      <DiagramArrow points={[[825, 140], [780, 210]]} />

      {/* Processing -> module inputs */}
      <DiagramArrow points={[[310, 290], [270, 380]]} label="360 rows (270 train / 90 test)" labelAt={[318, 340]} labelAnchor="start" />
      <DiagramArrow points={[[740, 290], [740, 380]]} label="306 static + 87 churn events" labelAt={[750, 340]} labelAnchor="start" />

      {/* Module 1's own outputs, offline */}
      <DiagramArrow points={[[400, 425], [610, 425]]} label="attribution (context)" labelAt={[505, 412]} />
      <DiagramArrow points={[[270, 470], [430, 520]]} label="residual stream (predicted risk)" labelAt={[320, 500]} labelAnchor="start" />

      {/* Everything -> Phase 4 */}
      <DiagramArrow points={[[180, 470], [180, 640], [280, 640], [280, 660]]} />
      <DiagramArrow points={[[800, 470], [800, 640], [640, 640], [640, 660]]} />
      <DiagramArrow points={[[510, 610], [510, 660]]} />

      {/* Raw tables - plain, tone-less: not part of the framework, just the source */}
      <DiagramNode x={30} y={70} w={190} h={70} lines={["MSRTQps", "load / backlog"]} />
      <DiagramNode x={250} y={70} w={210} h={70} lines={["MSCallGraph", "latency (p95/p99)"]} />
      <DiagramNode x={490} y={70} w={200} h={70} lines={["MSResource", "CPU / mem / instances"]} />
      <DiagramNode x={730} y={70} w={190} h={70} lines={["Node", "headroom per node"]} />

      <DiagramNode x={100} y={210} w={420} h={80} lines={["Preprocessing", "build_features.py"]} tone="blue" />
      <DiagramNode x={560} y={210} w={360} h={80} lines={["Module 2's own extraction", "extract_events.py"]} tone="aqua" />

      <DiagramNode x={140} y={380} w={260} h={90} lines={["Module 1", "train + validate"]} tone="orange" />
      <DiagramNode x={610} y={380} w={260} h={90} lines={["Module 2", "train + validate"]} tone="aqua" />
      <DiagramNode x={380} y={520} w={260} h={90} lines={["Module 3", "train + validate"]} tone="yellow" />

      <DiagramNode x={240} y={660} w={440} h={80} lines={["Phase 4", "Simulated closed loop (offline)"]} tone="blue" />
    </DiagramFigure>
  );
}

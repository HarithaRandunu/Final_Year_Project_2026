import { DiagramFigure, DiagramNode, DiagramArrow, ArrowheadDefs } from "@/components/diagram-figure";

/**
 * Six components, hand-placed (not auto-laid-out) so none of the seven
 * connections cross one another:
 *  - App, Module 1 and Module 2 sit in a left column (Module 1 above,
 *    Module 2 below); Module 3 and the Actuator sit to the right, level
 *    with App - so the four "forward" arrows (App->M1, M1->M3, M2->M3,
 *    M3->Actuator) each get their own lane and never share a row.
 *  - Kubernetes itself - previously missing - is drawn as a wide bar
 *    underneath everything, since architecturally it *is* the foundation
 *    every other component sits on and talks through: it's what Module 2
 *    plugs into (as a scheduler extender) and what the Actuator's decision
 *    actually gets carried out by. Its three connections (to the Actuator,
 *    to Module 2, and back to the App) all route through the open space
 *    below Module 2's box, well clear of the four forward arrows above.
 */
export function ArchitectureDiagram() {
  return (
    <DiagramFigure
      viewBox="0 0 1100 700"
      minWidth={760}
      ariaLabel="Diagram: the application sends its current speed and load to Module 1, which sends a risk score and reason to Module 3. Module 2 sends machine health to Module 3. Module 3 sends its decision to the Actuator. The Actuator tells Kubernetes to change the replica count; Kubernetes carries that out on the application, and also hosts the scheduler that Module 2 plugs into to help place new copies."
      caption="The three modules, the actuator, and Kubernetes itself — the platform that actually carries out scaling and placement, and hosts the scheduler Module 2 plugs into."
    >
      <ArrowheadDefs />

      {/*
        Forward path: App -> Module 1 -> Module 3 -> Actuator, with Module 2
        feeding into Module 3 separately. Every label is pulled off to the
        side of its own line (never centered on top of it) and anchored with
        "start" or "end" so it reads outward into open space instead of
        straddling the stroke - that's what was making lines look like they
        cut through the label text. The text halo in DiagramArrow is a second,
        redundant safety net in case any label still ends up near a line.
      */}
      <DiagramArrow
        points={[[200, 255], [260, 255], [260, 95], [320, 95]]}
        label="speed & load"
        labelAt={[272, 185]}
        labelAnchor="start"
      />
      <DiagramArrow
        points={[[520, 95], [580, 95], [580, 255], [640, 255]]}
        label="risk + reason"
        labelAt={[592, 185]}
        labelAnchor="start"
      />
      <DiagramArrow
        points={[[520, 455], [600, 455], [600, 295], [640, 295]]}
        label="machine health"
        labelAt={[612, 385]}
        labelAnchor="start"
      />
      <DiagramArrow
        points={[[840, 275], [900, 275]]}
        label="decision"
        labelAt={[870, 250]}
      />

      {/* The Actuator's decision goes to Kubernetes, not straight to the app - Kubernetes is what actually changes the replica count. */}
      <DiagramArrow
        points={[[985, 330], [985, 635], [900, 635]]}
        label="change replica count"
        labelAt={[1015, 480]}
      />
      {/* Kubernetes carries the change out on the app, routed well below Module 2 (bottom edge y=510) so it can't cross anything above. */}
      <DiagramArrow
        points={[[400, 590], [400, 550], [110, 550], [110, 330]]}
        label="scales the app"
        labelAt={[250, 538]}
      />
      {/*
        Kubernetes' own scheduler calls out to Module 2 for help scoring
        candidate nodes. This line only runs y=510-590, too short to hold its
        own label without colliding with "scales the app" next to it, so the
        label sits to the right of the line in the clear strip below Module 2
        and above Kubernetes, well clear of every other line and label.
      */}
      <DiagramArrow points={[[450, 590], [450, 510]]} />
      <text
        x={466}
        y={555}
        fontSize={12}
        paintOrder="stroke"
        stroke="var(--card)"
        strokeWidth={5}
        strokeLinejoin="round"
        className="fill-muted-foreground"
      >
        asks which node is best
      </text>

      {/*
        Tones match the ablation-arm palette used elsewhere in the app
        (lib/colors.ts): Module 1 orange, Module 2 aqua, Module 3 yellow -
        the same colors that later represent each module's own contribution
        in the results charts. The Actuator gets magenta (the "full
        framework" arm color), since it's where all three modules'
        signals converge into one action. Kubernetes gets blue ("baseline"),
        as the underlying platform everything else sits on. The App itself
        stays neutral - it's the external subject being scaled, not a part
        of the framework.
      */}
      <DiagramNode x={20} y={220} w={180} h={110} lines={["The Application", "being scaled"]} />
      <DiagramNode x={320} y={40} w={200} h={110} lines={["Module 1", "Estimates risk"]} tone="orange" />
      <DiagramNode x={320} y={400} w={200} h={110} lines={["Module 2", "Picks best machine"]} tone="aqua" />
      <DiagramNode x={640} y={220} w={200} h={110} lines={["Module 3", "Sets sensitivity"]} tone="yellow" />
      <DiagramNode x={900} y={220} w={170} h={110} lines={["Actuator", "Scale up or down?"]} tone="magenta" />
      <DiagramNode
        x={280}
        y={590}
        w={620}
        h={90}
        lines={["Kubernetes", "Carries out the scaling, and hosts", "the scheduler Module 2 plugs into"]}
        tone="blue"
      />
    </DiagramFigure>
  );
}

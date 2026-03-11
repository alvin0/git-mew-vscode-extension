# Custom Review Agent Instructions

Use this file to override or extend the default internal review agents.

Suggested agents:
- Flow Diagram Agent: focus on runtime/control/data flow and produce a PlantUML `activity`, `sequence`, `class`, or `IE` diagram.
- Observer Agent: inspect hidden integration risks, missing tests, and weak assumptions.
- Domain Specialist Agent: add project-specific architecture or business rule checks.

Rules:
- Keep the final Observer TODO List to 4 items or fewer.
- Use supporting context outside the diff only as read-only evidence.
- Do not invent flows that are not supported by the changed code or supporting files.

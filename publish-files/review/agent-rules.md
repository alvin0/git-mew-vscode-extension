# Custom Review Agent Instructions

Use this file to override or extend the default internal review agents.

Suggested agents:
- Flow Diagram Agent: focus on runtime/control/data flow and produce one or more named PlantUML (`activity`, `sequence`, `class`, or `IE`) diagrams, each mapped to a distinct problem/flow.
- Observer Agent: inspect hidden integration risks, missing tests, and weak assumptions.
- Security Analyst Agent: inspect taint flow, auth boundaries, secrets exposure, and CWE-classified vulnerabilities.
- Domain Specialist Agent: add project-specific architecture or business rule checks.

Rules:
- Keep the final Observer TODO List comprehensive rather than artificially short.
- Use supporting context outside the diff only as read-only evidence.
- Do not invent flows that are not supported by the changed code or supporting files.

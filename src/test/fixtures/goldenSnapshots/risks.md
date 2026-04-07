## 8. Potential Hidden Risks

- [OB] src/auth.ts — Login flow may skip validation on missing token. (confidence: 80%, likelihood: medium, impact: Needs validation, mitigation: Add follow-up checks)
- [SA] src/auth.ts:line 10 — Missing null check before accessing token. (impact: CWE-476, mitigation: Validate token before dereferencing it.)
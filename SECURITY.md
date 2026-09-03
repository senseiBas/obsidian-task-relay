# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub's **Security → Report a vulnerability** flow when available. Do not include vault contents, personal notes, tokens, or other sensitive data in a public issue.

## Security posture

- The plugin runs locally and does not make network requests.
- The plugin does not collect telemetry or analytics.
- The plugin does not execute downloaded or remote code.
- Runtime code avoids Node.js and Electron APIs for mobile compatibility.
- Vault notes are treated as read-only browsing input.

Security fixes are prioritized and documented in release notes without disclosing exploit details before users can update.

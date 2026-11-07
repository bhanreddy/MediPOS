# Phase 3 implementation plan

The prescription queue already stores files and matched items in PostgreSQL. The older H1 report infers its rows from current product labels and omits statutory evidence. The Phase 1 trigger blocks all restricted checkout. Main web billing is GST-inclusive and existing receipts already show batch, expiry and drug licence when available, but they lack immutable tax breakdown and clinical evidence.

1. Add per-store dispensing readiness and registered pharmacist credentials. Extend prescription review and the main counter to verify a written prescription, link the same patient, match exact medicines and quantities, and attest to the physical signature and register annotation. Keep offline, legacy and uncontrolled paths fail-closed.
2. Add a PostgreSQL authorization and append-only register lines in the checkout transaction. Split Schedule H1 register output from the prescription register. Schedule X additionally needs Form 20F, secured stock, a retained duplicate and a bound register page. NDPS remains outside this workflow. Preserve clinical evidence and avoid claiming that an application export replaces a physical register.
3. Persist invoice tax and product snapshots. Derive intra/inter-State treatment from validated place of supply, then display tax values, registration and batch details in server and receipt outputs. Preserve old invoices and their recorded GST rates.
4. Replace inferred registers with scoped exports, add management report endpoints and expose them in Reports Hub. Validate local output and identify any requirements needing an external portal or licensed-site verification.

Official references checked before implementation include CDSCO Drugs Rules Rule 65(2), (3), (4), (7), (9)–(12) and (21), recent CDSCO Gazette entries, CBIC CGST Rule 46 and GST Portal GSTR-1 utility guidance.

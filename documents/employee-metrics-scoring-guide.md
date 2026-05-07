# Employee Metrics Scoring Guide

This document explains how employee performance scoring is calculated in the system.

## 1) Data Source

The Employee Metrics dashboard pulls its data from:

- API endpoint: `/api/performance/employees`
- Backend implementation: `server.ts` (route handler for `GET /api/performance/employees`)
- Frontend scoring logic: `src/components/screens/manager/EmployeeMetricsDashboard.tsx`

The metrics are data-driven from database records. The scoring formula is fixed business logic applied to those records.

## 2) What Counts as a Completed/Countable Form

Only fully completed/verified/acknowledged records are counted in form-related metrics.

### Appraisals
Counted when:

- `verified = 1`

### Discipline Records
Counted when either:

- Full signature chain exists (`preparer_signature`, `supervisor_signature`, `employee_signature`), OR
- Acknowledged state exists (`is_acknowledged = 1` or `acknowledged_at IS NOT NULL`)

### Suggestions
Counted when both signatures exist:

- `employee_signature`
- `supervisor_signature`

### Onboarding
Counted when both signatures exist:

- `employee_signature`
- `hr_signature`

### Property Accountability
Counted when all required signatures exist:

- `turnover_by_sig`
- `noted_by_sig`
- `received_by_sig`
- `audited_by_sig`

### Exit Interviews
Counted when both signatures exist:

- `employee_sig`
- `interviewer_sig`

## 3) Score Components

The final score is built from 6 component scores:

- Achievement score
- Rating score
- Forms score
- Revision score
- Discipline score
- Risk score

### Achievement Score
Built from goal execution signals:

- Goal completion rate
- Average progress
- Proof approval ratio

### Rating Score
Built from quality signals:

- Proof ratings
- Appraisal average rating

If no rating signals exist, a fallback baseline is used.

### Forms Score
Built from form activity signals:

- Performance evaluation/appraisal signals
- Self-assessments
- 360 feedback
- Other completed form signals

### Revision Score
Penalty-based component:

- Goal revisions
- Needs-revision proof outcomes
- Unrated delegated goals

### Discipline Score
Penalty-based component:

- Disciplinary record count
- Violation entries
- Disciplinary actions

### Risk Score
Penalty-based component:

- Goals at risk
- Overdue goals
- Open recovery tasks
- PIP/IDP pressure factors

## 4) Weighted Composite

Base composite score is:

- `0.30 * Achievement`
- `0.20 * Rating`
- `0.15 * Forms`
- `0.15 * Revision`
- `0.10 * Discipline`
- `0.10 * Risk`

All component values are clamped to a 0-100 range.

## 5) Signal Coverage Cap

After computing the base composite, the system applies a cap to avoid inflated scores when there is too little non-goal evidence:

- Low signal coverage: max 82
- Medium signal coverage: max 90
- Higher signal coverage: max 98

Final score = `min(baseComposite, cap)` then rounded/clamped.

## 6) Underperforming Classification (Related)

A person can be marked underperforming based on severe risk patterns even if some score components are healthy. Conditions include combinations of:

- Multiple overdue/at-risk goals
- Low proof ratings
- Multiple disciplinary actions
- Low score with weak evaluation-form signal

## 7) Practical Interpretation

- Goals show delivery execution.
- Forms show validated and acknowledged performance evidence.
- The final score combines both to avoid over-relying on either raw goal progress or paperwork alone.

## 8) File References in Code

- Backend data aggregation: `server.ts`
- Frontend scoring math: `src/components/screens/manager/EmployeeMetricsDashboard.tsx`

These two files are the source of truth for how employee metrics are calculated and displayed.

# Implementation Plan

## Task 1: Payroll Analytics Dashboard (New HR Screen - A10)

### Server: New API endpoint
- Add `GET /api/payroll-analytics` endpoint in `server.ts`
- Returns aggregated payroll data: total payroll, avg salary, salary by department, headcount by dept, salary distribution ranges

### Frontend: New screen `PayrollAnalytics.tsx`
- Create `src/components/screens/hr/PayrollAnalytics.tsx`
- **Stat cards** (grid of 4): Total Payroll Cost, Avg Salary, Total Headcount, Departments
- **Charts** (using recharts — already in deps):
  - BarChart: Salary by department (avg)
  - PieChart: Headcount by department
  - BarChart: Salary distribution ranges ($0-30k, $30-50k, $50-80k, $80k+)
- Follow existing patterns: Card component, SectionHeader, StatCard pattern from CareerDashboard

### App.tsx Registration
- Add screen code `A10` for PayrollAnalytics
- Add route `/admin/payroll-analytics`
- Add sidebar item under HR with `DollarSign` icon: "Payroll Analytics"
- Add to `renderScreen` switch

### Add Payroll Metrics to Existing Dashboards
- **Manager OKR Planner (B1)**: Add a stat card showing team total payroll cost
- **Employee CareerDashboard (C1)**: Add stat card showing the employee's own salary

---

## Task 2: Fix Manager & HR Profile Display

### Root Cause
Manager (`manager_bob`) and HR (`hr_admin`) have `employee_id = NULL`, so `employee_name`, `position`, `dept` are never fetched. Full names ARE set (`full_name` column) but the sidebar uses `employee_name || full_name || email` chain — if `full_name` is null or empty, email shows.

### Fixes
- **server.ts seed data**: Update demo seed to set proper full names: `Bob Johnson / Senior Manager` and `Maria Cruz / HR Director`
- **PUT /api/account-info**: Allow users without `employee_id` to update their own `full_name` directly on the `users` table (currently it errors with "No linked employee")
- **Login response**: Ensure `full_name` is always included and the client stores it

---

## Task 3: Enhance Audit Logs UI

### Current State
- Basic table with 9 columns, minimal animations (just page fade-in)
- Filter bar with text inputs
- Modal for JSON details

### Enhancements
- **Staggered row animations**: Use `motion.tr` with stagger delay for row entrance
- **Action badges**: Color-coded badges for create/update/delete (green/blue/red)
- **Improved filter bar**: Styled with icons, dropdown for action type instead of free text
- **Stat summary cards** at top: Total events, Creates, Updates, Deletes
- **Better JSON modal**: Syntax-highlighted, side-by-side before/after diff view
- **Relative timestamps**: "2 hours ago" instead of raw ISO dates
- **Row expansion**: Click to expand row inline instead of modal for quick viewing

-- ============================================================
--  TalentFlow PostgreSQL — Quick View Queries
--  Highlight any block and press Ctrl+Enter to run it
-- ============================================================

-- 1. List all tables
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;

-- 2. Employees
SELECT * FROM employees;

-- 3. Users
SELECT id, username, role, employee_id FROM users;

-- 4. Goals
SELECT * FROM goals;

-- 5. Appraisals
SELECT * FROM appraisals;

-- 6. Coaching Logs
SELECT * FROM coaching_logs;

-- 7. Coaching Chats
SELECT * FROM coaching_chats;

-- 8. Discipline Records
SELECT * FROM discipline_records;

-- 9. Suggestions
SELECT * FROM suggestions;

-- 10. Applicants
SELECT id, name, position, status, overall_rating, created_at FROM applicants;

-- 11. Requisitions
SELECT id, job_title, department, position_status, created_at FROM requisitions;

-- 12. Offboarding
SELECT * FROM offboarding;

-- 13. Exit Interviews
SELECT * FROM exit_interviews;

-- 14. PIP Plans
SELECT * FROM pip_plans;

-- 15. Development Plans
SELECT * FROM development_plans;

-- 16. Self Assessments
SELECT * FROM self_assessments;

-- 17. Feedback 360
SELECT * FROM feedback_360;

-- 18. Onboarding
SELECT * FROM onboarding;

-- 19. Property Accountability
SELECT * FROM property_accountability;

-- 20. eLearning Courses
SELECT * FROM elearning_courses;

-- 21. eLearning Recommendations
SELECT * FROM elearning_recommendations;

-- 22. Notifications
SELECT * FROM notifications;

-- 23. Password Resets
SELECT * FROM password_resets;

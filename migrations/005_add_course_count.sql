-- Add course_count column to courses table
ALTER TABLE courses ADD COLUMN course_count INT DEFAULT 0;

-- Create a temporary table with the counts
CREATE TEMPORARY TABLE temp_courses AS
SELECT id, (@row_number:=@row_number + 1) AS row_num
FROM courses, (SELECT @row_number:=0) AS t
ORDER BY id;

-- Update the courses table using the temporary table
UPDATE courses c
JOIN temp_courses t ON c.id = t.id
SET c.course_count = t.row_num;

-- Drop the temporary table
DROP TEMPORARY TABLE IF EXISTS temp_courses; 
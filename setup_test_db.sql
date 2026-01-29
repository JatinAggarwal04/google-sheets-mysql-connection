CREATE DATABASE IF NOT EXISTS demo_db;
CREATE USER IF NOT EXISTS 'demo_user'@'localhost' IDENTIFIED BY 'password123';
GRANT ALL PRIVILEGES ON demo_db.* TO 'demo_user'@'localhost';
FLUSH PRIVILEGES;

-- Create a sample table
USE demo_db;
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO users (name, email) VALUES 
('Alice', 'alice@example.com'),
('Bob', 'bob@example.com'),
('Charlie', 'charlie@example.com');

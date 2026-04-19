-- ============================================
-- BudgetBukas Database Schema
-- Financial Transparency System for JPCS
-- Database: budgetbukas
-- ============================================

CREATE DATABASE IF NOT EXISTS budgetbukas;
USE budgetbukas;

-- ============================================
-- TABLE: users
-- Stores all system users (officers + members)
-- ============================================
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role ENUM('officer', 'member') NOT NULL DEFAULT 'member',
  avatar_url VARCHAR(500) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ============================================
-- TABLE: transactions
-- Parent table for all financial movements
-- Normalized: type determines child table
-- ============================================
CREATE TABLE transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  type ENUM('income', 'expense') NOT NULL,
  amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  date DATE NOT NULL,
  user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  INDEX idx_date (date),
  INDEX idx_type (type),
  INDEX idx_user_id (user_id)
) ENGINE=InnoDB;

-- ============================================
-- TABLE: income
-- Child of transactions (type = 'income')
-- Stores the source of income
-- ============================================
CREATE TABLE income (
  id INT AUTO_INCREMENT PRIMARY KEY,
  transaction_id INT NOT NULL UNIQUE,
  source VARCHAR(255) NOT NULL,
  FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================
-- TABLE: expenses
-- Child of transactions (type = 'expense')
-- Stores category + description
-- ============================================
CREATE TABLE expenses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  transaction_id INT NOT NULL UNIQUE,
  category VARCHAR(100) NOT NULL,
  description TEXT,
  FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================
-- TABLE: receipts
-- Linked to expenses, stores uploaded images
-- ============================================
CREATE TABLE receipts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  expense_id INT NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  original_name VARCHAR(255),
  extracted_text TEXT,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================
-- TABLE: audit_log
-- Automatically tracks changes via triggers
-- ============================================
CREATE TABLE audit_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  action VARCHAR(50) NOT NULL,
  table_name VARCHAR(50) NOT NULL,
  record_id INT,
  user_info VARCHAR(255),
  performed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ============================================
-- VIEW: total_balance
-- Shows total income, expenses, and remaining
-- ============================================
CREATE OR REPLACE VIEW total_balance AS
SELECT 
  COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS total_income,
  COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS total_expenses,
  COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) 
    - COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS remaining_balance
FROM transactions;

-- ============================================
-- TRIGGER: after_transaction_insert
-- Logs every new transaction to audit_log
-- ============================================
DELIMITER //
CREATE TRIGGER after_transaction_insert
AFTER INSERT ON transactions
FOR EACH ROW
BEGIN
  INSERT INTO audit_log (action, table_name, record_id, user_info)
  VALUES ('INSERT', 'transactions', NEW.id, CONCAT('user_id:', NEW.user_id));
END //
DELIMITER ;

-- ============================================
-- TRIGGER: after_transaction_update
-- Logs every transaction update
-- ============================================
DELIMITER //
CREATE TRIGGER after_transaction_update
AFTER UPDATE ON transactions
FOR EACH ROW
BEGIN
  INSERT INTO audit_log (action, table_name, record_id, user_info)
  VALUES ('UPDATE', 'transactions', NEW.id, CONCAT('user_id:', NEW.user_id));
END //
DELIMITER ;

-- ============================================
-- TRIGGER: after_transaction_delete
-- Logs every transaction deletion
-- ============================================
DELIMITER //
CREATE TRIGGER after_transaction_delete
AFTER DELETE ON transactions
FOR EACH ROW
BEGIN
  INSERT INTO audit_log (action, table_name, record_id, user_info)
  VALUES ('DELETE', 'transactions', OLD.id, CONCAT('user_id:', OLD.user_id));
END //
DELIMITER ;

-- ============================================
-- STORED PROCEDURE: monthly_report
-- Generates income/expense summary for a given month
-- ============================================
DELIMITER //
CREATE PROCEDURE monthly_report(IN report_month INT, IN report_year INT)
BEGIN
  SELECT 
    type,
    SUM(amount) AS total_amount,
    COUNT(*) AS transaction_count,
    AVG(amount) AS average_amount,
    MAX(amount) AS largest_transaction
  FROM transactions
  WHERE MONTH(date) = report_month AND YEAR(date) = report_year
  GROUP BY type;
END //
DELIMITER ;

-- ============================================
-- STORED PROCEDURE: category_breakdown
-- Shows expense breakdown by category
-- ============================================
DELIMITER //
CREATE PROCEDURE category_breakdown(IN report_month INT, IN report_year INT)
BEGIN
  SELECT 
    e.category,
    SUM(t.amount) AS total_amount,
    COUNT(*) AS transaction_count
  FROM transactions t
  JOIN expenses e ON e.transaction_id = t.id
  WHERE t.type = 'expense' 
    AND MONTH(t.date) = report_month 
    AND YEAR(t.date) = report_year
  GROUP BY e.category
  ORDER BY total_amount DESC;
END //
DELIMITER ;

-- ============================================
-- SEED DATA: Default admin officer account
-- Password: admin123 (bcrypt hash)
-- ============================================
-- Note: Insert this after running the backend setup
-- The backend will handle password hashing

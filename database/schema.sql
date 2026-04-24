-- ============================================
-- PondoSync Database Schema (PostgreSQL / Neon)
-- Financial Transparency System for JPCS
-- ============================================

-- ============================================
-- TABLE: users
-- ============================================
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('officer', 'member')),
  avatar_url VARCHAR(500) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Function to handle automated updated_at
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();


-- ============================================
-- TABLE: transactions
-- ============================================
CREATE TABLE transactions (
  id SERIAL PRIMARY KEY,
  type VARCHAR(20) NOT NULL CHECK (type IN ('income', 'expense')),
  amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  date DATE NOT NULL,
  user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX idx_transactions_date ON transactions(date);
CREATE INDEX idx_transactions_type ON transactions(type);
CREATE INDEX idx_transactions_user_id ON transactions(user_id);

CREATE TRIGGER trg_transactions_updated_at
BEFORE UPDATE ON transactions
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();


-- ============================================
-- TABLE: income
-- ============================================
CREATE TABLE income (
  id SERIAL PRIMARY KEY,
  transaction_id INT NOT NULL UNIQUE,
  source VARCHAR(255) NOT NULL,
  FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
);


-- ============================================
-- TABLE: expenses
-- ============================================
CREATE TABLE expenses (
  id SERIAL PRIMARY KEY,
  transaction_id INT NOT NULL UNIQUE,
  category VARCHAR(100) NOT NULL,
  description TEXT,
  FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
);


-- ============================================
-- TABLE: receipts
-- ============================================
CREATE TABLE receipts (
  id SERIAL PRIMARY KEY,
  expense_id INT NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  original_name VARCHAR(255),
  extracted_text TEXT,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE
);


-- ============================================
-- TABLE: audit_log
-- ============================================
CREATE TABLE audit_log (
  id SERIAL PRIMARY KEY,
  action VARCHAR(50) NOT NULL,
  table_name VARCHAR(50) NOT NULL,
  record_id INT,
  user_info VARCHAR(255),
  performed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ============================================
-- VIEW: total_balance
-- ============================================
CREATE OR REPLACE VIEW total_balance AS
SELECT 
  COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS total_income,
  COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS total_expenses,
  COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) 
    - COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS remaining_balance
FROM transactions;


-- ============================================
-- TRANSACTIONS AUDIT TRIGGERS
-- ============================================
CREATE OR REPLACE FUNCTION audit_insert_fn() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_log (action, table_name, record_id, user_info)
  VALUES ('INSERT', 'transactions', NEW.id, 'user_id:' || NEW.user_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER after_transaction_insert
AFTER INSERT ON transactions
FOR EACH ROW EXECUTE FUNCTION audit_insert_fn();

CREATE OR REPLACE FUNCTION audit_update_fn() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_log (action, table_name, record_id, user_info)
  VALUES ('UPDATE', 'transactions', NEW.id, 'user_id:' || NEW.user_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER after_transaction_update
AFTER UPDATE ON transactions
FOR EACH ROW EXECUTE FUNCTION audit_update_fn();

CREATE OR REPLACE FUNCTION audit_delete_fn() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_log (action, table_name, record_id, user_info)
  VALUES ('DELETE', 'transactions', OLD.id, 'user_id:' || OLD.user_id);
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER after_transaction_delete
AFTER DELETE ON transactions
FOR EACH ROW EXECUTE FUNCTION audit_delete_fn();


-- ============================================
-- STORED FUNCTION: monthly_report
-- ============================================
CREATE OR REPLACE FUNCTION monthly_report(report_month INT, report_year INT)
RETURNS TABLE (
    record_type VARCHAR, 
    total_amount DECIMAL, 
    transaction_count BIGINT, 
    average_amount DECIMAL, 
    largest_transaction DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.type::VARCHAR,
    SUM(t.amount),
    COUNT(*),
    AVG(t.amount),
    MAX(t.amount)
  FROM transactions t
  WHERE EXTRACT(MONTH FROM t.date) = report_month 
    AND EXTRACT(YEAR FROM t.date) = report_year
  GROUP BY t.type;
END;
$$ LANGUAGE plpgsql;


-- ============================================
-- STORED FUNCTION: category_breakdown
-- ============================================
CREATE OR REPLACE FUNCTION category_breakdown(report_month INT, report_year INT)
RETURNS TABLE (
    category_name VARCHAR, 
    total_amount DECIMAL, 
    transaction_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.category::VARCHAR,
    SUM(t.amount),
    COUNT(*)
  FROM transactions t
  JOIN expenses e ON e.transaction_id = t.id
  WHERE t.type = 'expense' 
    AND EXTRACT(MONTH FROM t.date) = report_month 
    AND EXTRACT(YEAR FROM t.date) = report_year
  GROUP BY e.category
  ORDER BY SUM(t.amount) DESC;
END;
$$ LANGUAGE plpgsql;

CREATE DATABASE IF NOT EXISTS wayanad_dairy_it;
USE wayanad_dairy_it;
CREATE TABLE IF NOT EXISTS departments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    dept_code VARCHAR(20) NOT NULL UNIQUE,
    dept_name VARCHAR(100) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    is_admin TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
INSERT IGNORE INTO departments (dept_code, dept_name, password_hash, is_admin) VALUES
('ADMIN', 'System Admin - Wayanad Dairy', '\$2b\$10\$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 1),
('MIS', 'MIS Dept - Wayanad Dairy', '\$2b\$10\$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 0);
CREATE TABLE IF NOT EXISTS master_products (id INT AUTO_INCREMENT PRIMARY KEY, product_name VARCHAR(50) NOT NULL UNIQUE);
INSERT IGNORE INTO master_products (product_name) VALUES ('COMPUTER'),('SWITCHES'),('PRINTER'),('SERVER'),('CCTV');
CREATE TABLE IF NOT EXISTS master_vendors (id INT AUTO_INCREMENT PRIMARY KEY, vendor_name VARCHAR(150) NOT NULL UNIQUE, contact_info VARCHAR(150));
CREATE TABLE IF NOT EXISTS amc_assets (
    id INT AUTO_INCREMENT PRIMARY KEY, dept_code VARCHAR(20) NOT NULL, product_category VARCHAR(50) NOT NULL,
    model VARCHAR(100) NOT NULL, serial_number VARCHAR(100) NOT NULL UNIQUE, amc_start_date DATE NOT NULL,
    amc_end_date DATE NOT NULL, vendor_name VARCHAR(100), remarks TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (dept_code) REFERENCES departments(dept_code)
);
CREATE TABLE IF NOT EXISTS section_purchases (
    id INT AUTO_INCREMENT PRIMARY KEY, dept_code VARCHAR(20) NOT NULL, item_name VARCHAR(150) NOT NULL,
    purpose VARCHAR(255) NOT NULL, amount DECIMAL(10, 2) NOT NULL, vendor VARCHAR(150) NOT NULL,
    purchase_date DATE NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (dept_code) REFERENCES departments(dept_code)
);
CREATE TABLE IF NOT EXISTS cartridge_ledger (
    id INT AUTO_INCREMENT PRIMARY KEY, dept_code VARCHAR(20) NOT NULL, printer_asset_id INT NULL,
    printer_model VARCHAR(100) NOT NULL, cartridge_model VARCHAR(100) NOT NULL, refill_date DATE NOT NULL,
    vendor VARCHAR(150) NOT NULL, cost DECIMAL(10, 2) NOT NULL, remarks VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (dept_code) REFERENCES departments(dept_code),
    FOREIGN KEY (printer_asset_id) REFERENCES amc_assets(id) ON DELETE SET NULL
);

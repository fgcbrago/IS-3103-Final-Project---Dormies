-- Generated from backend/prisma/schema.prisma by `npm run db:sql`. Do not edit by hand.
-- Tables for the Dormies MySQL database (16 tables from the data dictionary + settings + announcement_reads).

CREATE TABLE IF NOT EXISTS roles (
  role_id INT NOT NULL AUTO_INCREMENT,
  role_name VARCHAR(20) NOT NULL UNIQUE,
  description VARCHAR(255) NULL,
  PRIMARY KEY (role_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS users (
  user_id INT NOT NULL AUTO_INCREMENT,
  role_id INT NOT NULL,
  full_name VARCHAR(100) NOT NULL DEFAULT '',
  username VARCHAR(50) NOT NULL UNIQUE,
  email VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  failed_attempts INT NOT NULL DEFAULT 0,
  locked_until DATETIME NULL,
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_users_role_id FOREIGN KEY (role_id) REFERENCES roles(role_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS residents (
  resident_id INT NOT NULL AUTO_INCREMENT,
  user_id INT NULL UNIQUE,
  first_name VARCHAR(50) NOT NULL,
  last_name VARCHAR(50) NOT NULL,
  gender VARCHAR(15) NULL,
  phone_number VARCHAR(20) NULL,
  email VARCHAR(100) NULL,
  id_number VARCHAR(30) NULL,
  is_archived TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (resident_id),
  CONSTRAINT fk_residents_user_id FOREIGN KEY (user_id) REFERENCES users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS emergency_contacts (
  contact_id INT NOT NULL AUTO_INCREMENT,
  resident_id INT NOT NULL,
  contact_name VARCHAR(100) NOT NULL,
  relationship VARCHAR(50) NULL,
  phone_number VARCHAR(20) NOT NULL,
  address VARCHAR(255) NULL,
  is_primary TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (contact_id),
  CONSTRAINT fk_emergency_contacts_resident_id FOREIGN KEY (resident_id) REFERENCES residents(resident_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS buildings (
  building_id INT NOT NULL AUTO_INCREMENT,
  building_name VARCHAR(100) NOT NULL,
  building_code VARCHAR(10) NOT NULL UNIQUE,
  address VARCHAR(255) NULL,
  total_floors INT NOT NULL DEFAULT 1,
  PRIMARY KEY (building_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rooms (
  room_id INT NOT NULL AUTO_INCREMENT,
  building_id INT NOT NULL,
  room_number VARCHAR(20) NOT NULL,
  floor_level INT NOT NULL DEFAULT 1,
  room_type VARCHAR(20) NOT NULL,
  capacity INT NOT NULL,
  base_monthly_rate DECIMAL(10,2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'Available',
  PRIMARY KEY (room_id),
  UNIQUE KEY ux_rooms_building_id_room_number (building_id, room_number),
  CONSTRAINT fk_rooms_building_id FOREIGN KEY (building_id) REFERENCES buildings(building_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS beds (
  bed_id INT NOT NULL AUTO_INCREMENT,
  room_id INT NOT NULL,
  bed_code VARCHAR(20) NOT NULL UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'Available',
  PRIMARY KEY (bed_id),
  CONSTRAINT fk_beds_room_id FOREIGN KEY (room_id) REFERENCES rooms(room_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS bed_assignments (
  assignment_id INT NOT NULL AUTO_INCREMENT,
  resident_id INT NOT NULL,
  bed_id INT NOT NULL,
  move_in_date DATE NOT NULL,
  expected_move_out_date DATE NULL,
  move_out_date DATE NULL,
  deposit_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  deposit_status VARCHAR(20) NOT NULL DEFAULT 'Held',
  refund_amount DECIMAL(10,2) NULL,
  deposit_notes VARCHAR(255) NULL,
  deposit_settled_at DATETIME NULL,
  inspection_condition VARCHAR(50) NULL,
  inspection_notes VARCHAR(500) NULL,
  inspected_by_user_id INT NULL,
  assignment_status VARCHAR(20) NOT NULL DEFAULT 'Active',
  active_flag INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (assignment_id),
  UNIQUE KEY ux_one_active_per_resident (resident_id, active_flag),
  UNIQUE KEY ux_one_active_per_bed (bed_id, active_flag),
  CONSTRAINT fk_bed_assignments_resident_id FOREIGN KEY (resident_id) REFERENCES residents(resident_id),
  CONSTRAINT fk_bed_assignments_bed_id FOREIGN KEY (bed_id) REFERENCES beds(bed_id),
  CONSTRAINT fk_bed_assignments_inspected_by_user_id FOREIGN KEY (inspected_by_user_id) REFERENCES users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS bills (
  bill_id INT NOT NULL AUTO_INCREMENT,
  assignment_id INT NOT NULL,
  resident_id INT NOT NULL,
  room_id INT NOT NULL,
  billing_period VARCHAR(7) NOT NULL,
  rent_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  electricity_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  water_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  internet_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  penalty_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  due_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'Unpaid',
  is_confirmed TINYINT(1) NOT NULL DEFAULT 0,
  confirmed_by_user_id INT NULL,
  confirmed_at DATETIME NULL,
  generated_by_user_id INT NULL,
  generated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (bill_id),
  UNIQUE KEY ux_bills_resident_id_billing_period (resident_id, billing_period),
  KEY ix_bills_resident (resident_id),
  CONSTRAINT fk_bills_assignment_id FOREIGN KEY (assignment_id) REFERENCES bed_assignments(assignment_id),
  CONSTRAINT fk_bills_resident_id FOREIGN KEY (resident_id) REFERENCES residents(resident_id),
  CONSTRAINT fk_bills_room_id FOREIGN KEY (room_id) REFERENCES rooms(room_id),
  CONSTRAINT fk_bills_confirmed_by_user_id FOREIGN KEY (confirmed_by_user_id) REFERENCES users(user_id),
  CONSTRAINT fk_bills_generated_by_user_id FOREIGN KEY (generated_by_user_id) REFERENCES users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS payments (
  payment_id INT NOT NULL AUTO_INCREMENT,
  bill_id INT NOT NULL,
  recorded_by_user_id INT NOT NULL,
  amount_paid DECIMAL(10,2) NOT NULL,
  payment_date DATE NOT NULL,
  payment_method VARCHAR(20) NOT NULL,
  reference_number VARCHAR(50) NULL,
  receipt_number VARCHAR(30) NOT NULL UNIQUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (payment_id),
  KEY ix_payments_bill (bill_id),
  CONSTRAINT fk_payments_bill_id FOREIGN KEY (bill_id) REFERENCES bills(bill_id),
  CONSTRAINT fk_payments_recorded_by_user_id FOREIGN KEY (recorded_by_user_id) REFERENCES users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS maintenance_requests (
  request_id INT NOT NULL AUTO_INCREMENT,
  resident_id INT NOT NULL,
  room_id INT NULL,
  location VARCHAR(150) NULL,
  issue_category VARCHAR(50) NOT NULL,
  description TEXT NOT NULL,
  urgency VARCHAR(20) NOT NULL DEFAULT 'Medium',
  status VARCHAR(20) NOT NULL DEFAULT 'Pending',
  assigned_to_user_id INT NULL,
  remarks TEXT NULL,
  target_date DATE NULL,
  submitted_by_user_id INT NULL,
  submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL,
  resolved_at DATETIME NULL,
  PRIMARY KEY (request_id),
  CONSTRAINT fk_maintenance_requests_resident_id FOREIGN KEY (resident_id) REFERENCES residents(resident_id),
  CONSTRAINT fk_maintenance_requests_room_id FOREIGN KEY (room_id) REFERENCES rooms(room_id),
  CONSTRAINT fk_maintenance_requests_assigned_to_user_id FOREIGN KEY (assigned_to_user_id) REFERENCES users(user_id),
  CONSTRAINT fk_maintenance_requests_submitted_by_user_id FOREIGN KEY (submitted_by_user_id) REFERENCES users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS transfer_requests (
  transfer_id INT NOT NULL AUTO_INCREMENT,
  resident_id INT NOT NULL,
  current_bed_id INT NOT NULL,
  preferred_bed_id INT NOT NULL,
  reason VARCHAR(500) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'Pending',
  admin_remarks VARCHAR(500) NULL,
  transfer_date DATE NULL,
  submitted_by_user_id INT NULL,
  submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at DATETIME NULL,
  reviewed_by_user_id INT NULL,
  PRIMARY KEY (transfer_id),
  CONSTRAINT fk_transfer_requests_resident_id FOREIGN KEY (resident_id) REFERENCES residents(resident_id),
  CONSTRAINT fk_transfer_requests_current_bed_id FOREIGN KEY (current_bed_id) REFERENCES beds(bed_id),
  CONSTRAINT fk_transfer_requests_preferred_bed_id FOREIGN KEY (preferred_bed_id) REFERENCES beds(bed_id),
  CONSTRAINT fk_transfer_requests_submitted_by_user_id FOREIGN KEY (submitted_by_user_id) REFERENCES users(user_id),
  CONSTRAINT fk_transfer_requests_reviewed_by_user_id FOREIGN KEY (reviewed_by_user_id) REFERENCES users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS announcements (
  announcement_id INT NOT NULL AUTO_INCREMENT,
  posted_by_user_id INT NOT NULL,
  title VARCHAR(120) NOT NULL,
  content TEXT NOT NULL,
  priority VARCHAR(20) NOT NULL DEFAULT 'Normal',
  target_audience VARCHAR(20) NOT NULL DEFAULT 'All',
  status VARCHAR(20) NOT NULL DEFAULT 'Published',
  is_pinned TINYINT(1) NOT NULL DEFAULT 0,
  publish_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NULL,
  PRIMARY KEY (announcement_id),
  CONSTRAINT fk_announcements_posted_by_user_id FOREIGN KEY (posted_by_user_id) REFERENCES users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS announcement_reads (
  announcement_id INT NOT NULL,
  user_id INT NOT NULL,
  read_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (announcement_id, user_id),
  CONSTRAINT fk_announcement_reads_announcement_id FOREIGN KEY (announcement_id) REFERENCES announcements(announcement_id) ON DELETE CASCADE,
  CONSTRAINT fk_announcement_reads_user_id FOREIGN KEY (user_id) REFERENCES users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notifications (
  notification_id INT NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  title VARCHAR(100) NOT NULL,
  message VARCHAR(255) NOT NULL,
  type VARCHAR(20) NOT NULL,
  reference_id INT NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  email_status VARCHAR(20) NOT NULL DEFAULT 'Not sent',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (notification_id),
  KEY ix_notifications_user (user_id, is_read),
  CONSTRAINT fk_notifications_user_id FOREIGN KEY (user_id) REFERENCES users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS visitor_logs (
  log_id INT NOT NULL AUTO_INCREMENT,
  host_resident_id INT NOT NULL,
  logged_by_user_id INT NOT NULL,
  visitor_name VARCHAR(100) NOT NULL,
  contact_number VARCHAR(20) NULL,
  id_type VARCHAR(30) NULL,
  id_number VARCHAR(50) NULL,
  purpose VARCHAR(100) NOT NULL,
  notes VARCHAR(255) NULL,
  check_in_time DATETIME NOT NULL,
  expected_check_out_time DATETIME NULL,
  check_out_time DATETIME NULL,
  PRIMARY KEY (log_id),
  KEY ix_visitors_host (host_resident_id),
  CONSTRAINT fk_visitor_logs_host_resident_id FOREIGN KEY (host_resident_id) REFERENCES residents(resident_id),
  CONSTRAINT fk_visitor_logs_logged_by_user_id FOREIGN KEY (logged_by_user_id) REFERENCES users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS audit_logs (
  audit_id INT NOT NULL AUTO_INCREMENT,
  user_id INT NULL,
  action VARCHAR(30) NOT NULL,
  entity_affected VARCHAR(50) NOT NULL,
  entity_id INT NULL,
  details TEXT NULL,
  ip_address VARCHAR(45) NULL,
  timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (audit_id),
  KEY ix_audit_time (timestamp),
  CONSTRAINT fk_audit_logs_user_id FOREIGN KEY (user_id) REFERENCES users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS settings (
  setting_key VARCHAR(50) NOT NULL,
  setting_value VARCHAR(255) NULL,
  PRIMARY KEY (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

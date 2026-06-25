-- ============================================================
-- JISHLink Supabase Database Schema
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard
-- ============================================================

-- WORKPLACES
create table if not exists workplaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  client_name text,
  address     text,
  city        text,
  state       text,
  pincode     text,
  contact     text,
  created_at  timestamptz default now()
);

-- EMPLOYEES
create table if not exists employees (
  id                      uuid primary key default gen_random_uuid(),
  employee_code           text unique,
  full_name               text not null,
  dob                     date,
  gender                  text,
  blood_group             text,
  marital_status          text,
  qualification           text,
  contact_number          text,
  email                   text,
  address                 text,
  emergency_contact       text,
  nominee_name            text,
  nominee_relation        text,
  aadhar_number           text,
  pan_number              text,
  pf_number               text,
  esi_number              text,
  uan_number              text,
  bank_name               text,
  bank_branch             text,
  account_number          text,
  ifsc_code               text,
  aadhar_doc_url          text,
  pan_doc_url             text,
  bank_doc_url            text,
  photo_url               text,
  driving_license_number  text,
  vehicle_details         text,
  designation             text,
  employment_type         text,
  date_of_joining         date,
  employment_status       text default 'active',
  workplace_id            uuid references workplaces(id) on delete set null,
  reporting_manager_id    uuid references employees(id) on delete set null,
  username                text unique,
  password_hash           text,
  password_changed        boolean default false,
  role                    text default 'employee',  -- 'admin' | 'recruiter' | 'employee'
  shift_start_time        text,
  shift_end_time          text,
  shift_days              text default 'Mon,Tue,Wed,Thu,Fri,Sat',
  created_by              uuid references employees(id) on delete set null,
  created_at              timestamptz default now(),
  updated_at              timestamptz default now()
);

-- ATTENDANCE LOGS
create table if not exists attendance_logs (
  id               uuid primary key default gen_random_uuid(),
  employee_id      uuid not null references employees(id) on delete cascade,
  type             text not null,  -- 'login' | 'signoff'
  timestamp        timestamptz not null default now(),
  latitude         double precision,
  longitude        double precision,
  resolved_address text,
  created_at       timestamptz default now()
);

-- PENDING SUBMISSIONS (Google Form intake)
create table if not exists pending_submissions (
  id                 uuid primary key default gen_random_uuid(),
  source             text default 'google_form',
  submitted_data     jsonb not null,
  validation_results jsonb,
  status             text default 'submitted',  -- 'submitted' | 'approved' | 'rejected'
  admin_remarks      text,
  submitted_at       timestamptz default now(),
  reviewed_at        timestamptz,
  reviewed_by        uuid references employees(id) on delete set null
);

-- ABSENCE NOTES
create table if not exists absence_notes (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references employees(id) on delete cascade,
  recruiter_id uuid references employees(id) on delete set null,
  date         date not null,
  reason       text not null,
  notes        text,
  created_at   timestamptz default now()
);

-- NOTIFICATIONS
create table if not exists notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references employees(id) on delete cascade,
  message    text not null,
  read       boolean default false,
  created_at timestamptz default now()
);

-- AUDIT LOGS
create table if not exists audit_logs (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid references employees(id) on delete set null,
  action       text not null,
  target_table text,
  target_id    text,
  old_value    jsonb,
  new_value    jsonb,
  timestamp    timestamptz default now()
);

-- ============================================================
-- INDEXES
-- ============================================================
create index if not exists idx_employees_workplace on employees(workplace_id);
create index if not exists idx_employees_manager on employees(reporting_manager_id);
create index if not exists idx_employees_role on employees(role);
create index if not exists idx_attendance_employee on attendance_logs(employee_id);
create index if not exists idx_attendance_timestamp on attendance_logs(timestamp desc);
create index if not exists idx_submissions_status on pending_submissions(status);
create index if not exists idx_notifications_user on notifications(user_id);
create index if not exists idx_audit_actor on audit_logs(actor_id);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- We use Service Role key in the API, so RLS is advisory.
-- Disable RLS so the service role can do all operations.
-- ============================================================
alter table workplaces         disable row level security;
alter table employees          disable row level security;
alter table attendance_logs    disable row level security;
alter table pending_submissions disable row level security;
alter table absence_notes      disable row level security;
alter table notifications      disable row level security;
alter table audit_logs         disable row level security;

-- ============================================================
-- SEED: Create the first admin user
-- Password: Admin@123  (change immediately after first login)
-- bcrypt hash of "Admin@123" with 12 rounds:
-- ============================================================
insert into workplaces (id, name, client_name, address)
values ('00000000-0000-0000-0000-000000000001', 'Head Office', 'JISHLink Consulting', 'India')
on conflict do nothing;

insert into employees (
  id, employee_code, full_name, username, password_hash, role,
  designation, employment_status, password_changed, workplace_id
)
values (
  '00000000-0000-0000-0000-000000000002',
  'ADM0001',
  'System Admin',
  'admin',
  '$2b$12$cwSkyDS.gMIo9IWAFPc8Ouhrz8W49jnZAFGk.3uDDvD37MvUJwt4S',
  'admin',
  'System Administrator',
  'active',
  true,
  '00000000-0000-0000-0000-000000000001'
)
on conflict (username) do nothing;

-- ============================================================
-- NOTE: The password hash above is for "Admin@123"
-- Log in with: username=admin, password=Admin@123
-- Then go to Settings > Change Password to set a new one.
-- ============================================================
-- Add recruiter_name column to employees table
alter table employees add column if not exists recruiter_name text;

-- Add index for faster lookups
create index if not exists idx_employees_recruiter_name on employees(recruiter_name);


-- Add resubmission tracking
alter table pending_submissions add column if not exists parent_submission_id uuid references pending_submissions(id);
alter table pending_submissions add column if not exists resubmit_count integer default 0;
alter table pending_submissions add column if not exists previous_data jsonb;


-- Add custom_id column for manual employee/recruiter IDs
alter table employees add column if not exists custom_id text unique;

-- Add index for faster lookups
create index if not exists idx_employees_custom_id on employees(custom_id);

-- Create employee_documents table
CREATE TABLE IF NOT EXISTS employee_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('aadhar', 'pan', 'bank', 'photo')),
  extracted_data JSONB,
  google_drive_url TEXT,
  uploaded_by UUID NOT NULL REFERENCES employees(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_employee_docs_employee_id ON employee_documents(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_docs_type ON employee_documents(doc_type);

-- Enable RLS
ALTER TABLE employee_documents ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Employees can view their own documents"
  ON employee_documents FOR SELECT
  USING (employee_id = auth.uid());

CREATE POLICY "Employees can upload their own documents"
  ON employee_documents FOR INSERT
  WITH CHECK (employee_id = auth.uid());

  -- Create table to store Google OAuth refresh tokens
CREATE TABLE IF NOT EXISTS user_google_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  refresh_token TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE user_google_tokens ENABLE ROW LEVEL SECURITY;

-- Only allow users to view their own tokens
CREATE POLICY "Users can view own tokens"
  ON user_google_tokens FOR SELECT
  USING (user_id = auth.uid());

-- Only allow users to update their own tokens
CREATE POLICY "Users can update own tokens"
  ON user_google_tokens FOR ALL
  USING (user_id = auth.uid());



  -- ============================================================
-- ADD NEW COLUMNS TO employee_documents TABLE
-- For image upload tracking and color original validation
-- ============================================================

-- Add image_drive_url to store Google Drive link for the uploaded document image
ALTER TABLE employee_documents 
ADD COLUMN IF NOT EXISTS image_drive_url TEXT;

-- Add is_color_original flag for Aadhar card validation (mandatory requirement)
ALTER TABLE employee_documents 
ADD COLUMN IF NOT EXISTS is_color_original BOOLEAN DEFAULT NULL;

-- Add document_image_url to store direct image URL (if needed for quick preview)
ALTER TABLE employee_documents 
ADD COLUMN IF NOT EXISTS document_image_url TEXT;

-- Add file_name to track the original uploaded file name
ALTER TABLE employee_documents 
ADD COLUMN IF NOT EXISTS file_name TEXT;

-- Add file_size to track uploaded file size in bytes
ALTER TABLE employee_documents 
ADD COLUMN IF NOT EXISTS file_size INTEGER;

-- Add mime_type to track file type (image/jpeg, image/png, etc.)
ALTER TABLE employee_documents 
ADD COLUMN IF NOT EXISTS mime_type TEXT;

-- Add validation_status for document quality checks
ALTER TABLE employee_documents 
ADD COLUMN IF NOT EXISTS validation_status TEXT DEFAULT 'pending' 
CHECK (validation_status IN ('pending', 'approved', 'rejected'));

-- Add validation_remarks for rejection reasons
ALTER TABLE employee_documents 
ADD COLUMN IF NOT EXISTS validation_remarks TEXT;

-- Add indexes for new columns
CREATE INDEX IF NOT EXISTS idx_employee_docs_image_url ON employee_documents(image_drive_url);
CREATE INDEX IF NOT EXISTS idx_employee_docs_color_original ON employee_documents(is_color_original);
CREATE INDEX IF NOT EXISTS idx_employee_docs_validation ON employee_documents(validation_status);

-- ============================================================
-- UPDATE RLS POLICIES for employee_documents
-- (if you want to keep RLS enabled, though currently disabled)
-- ============================================================

-- Drop existing insert policy if it exists (to recreate with broader permissions)
DROP POLICY IF EXISTS "Employees can upload their own documents" ON employee_documents;

-- Recreate policy allowing employees, recruiters, and admins to upload
CREATE POLICY "Users can upload documents"
  ON employee_documents FOR INSERT
  WITH CHECK (
    employee_id = auth.uid() 
    OR EXISTS (
      SELECT 1 FROM employees 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'recruiter')
    )
  );

-- ============================================================
-- OPTIONAL: Add document verification log table
-- For tracking who verified which document and when
-- ============================================================
CREATE TABLE IF NOT EXISTS document_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES employee_documents(id) ON DELETE CASCADE,
  verified_by UUID NOT NULL REFERENCES employees(id),
  verification_status TEXT NOT NULL CHECK (verification_status IN ('approved', 'rejected')),
  remarks TEXT,
  verified_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_doc_verifications_document ON document_verifications(document_id);
CREATE INDEX IF NOT EXISTS idx_doc_verifications_verifier ON document_verifications(verified_by);

-- Disable RLS for verification table (service role handles this)
ALTER TABLE document_verifications DISABLE ROW LEVEL SECURITY;
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
  '$2a$12$GpCpckSNX/bxJCFD5NNpjuJZhCcJPYMwfPQlsq5fMiG.aBKMUzTfG',
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

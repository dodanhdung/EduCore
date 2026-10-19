-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING_ACTIVATION', 'ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('ACTIVATION', 'PASSWORD_RESET');

-- CreateEnum
CREATE TYPE "AccessScopeKind" AS ENUM ('TENANT', 'CLASS', 'STUDENT');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'COMPLETED', 'WITHDRAWN', 'TRANSFERRED');

-- CreateEnum
CREATE TYPE "ResourceKind" AS ENUM ('TEACHER', 'STUDENT', 'ROOM');

-- CreateEnum
CREATE TYPE "ResourceUnavailabilityStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeliveryMode" AS ENUM ('ONSITE', 'ONLINE');

-- CreateEnum
CREATE TYPE "ClassSessionStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SessionParticipantKind" AS ENUM ('REGULAR', 'MAKEUP');

-- CreateEnum
CREATE TYPE "ResourceBookingStatus" AS ENUM ('ACTIVE', 'RELEASED');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('ATTENDED', 'EXCUSED', 'UNEXCUSED');

-- CreateEnum
CREATE TYPE "PriceScopeKind" AS ENUM ('COURSE', 'CLASS', 'SESSION');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InvoiceDiscountKind" AS ENUM ('SIBLING');

-- CreateEnum
CREATE TYPE "InvoiceAdjustmentKind" AS ENUM ('AMOUNT', 'CANCELLATION');

-- CreateEnum
CREATE TYPE "InvoiceAdjustmentStatus" AS ENUM ('PROPOSED', 'APPLIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER');

-- CreateEnum
CREATE TYPE "PaymentExcessResolutionStatus" AS ENUM ('PENDING_RESOLUTION', 'RESOLVED');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SubmissionVersionStatus" AS ENUM ('SUBMITTED');

-- CreateEnum
CREATE TYPE "StoredFileStatus" AS ENUM ('STAGING', 'READY', 'ORPHANED');

-- CreateEnum
CREATE TYPE "GradeStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'NEEDS_INFORMATION', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ApprovalDecisionKind" AS ENUM ('APPROVE', 'REJECT', 'REQUEST_INFO');

-- CreateEnum
CREATE TYPE "AutomationJobStatus" AS ENUM ('READY', 'RUNNING', 'NEEDS_INFORMATION', 'PENDING_APPROVAL', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "OutboxEventStatus" AS ENUM ('NEW', 'PROCESSING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('SCHEDULE_CHANGED', 'ASSIGNMENT_PUBLISHED', 'ADMIN_ALERT');

-- CreateEnum
CREATE TYPE "AuditActorKind" AS ENUM ('USER', 'WORKER', 'OPERATOR');

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
    "status" TEXT NOT NULL,
    "activated_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_versions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "version_code" TEXT NOT NULL,
    "effective_from" TIMESTAMPTZ(6) NOT NULL,
    "effective_to" TIMESTAMPTZ(6),
    "config_snapshot" JSONB NOT NULL,
    "content_hash" TEXT NOT NULL,
    "created_by_membership_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email_normalized" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING_ACTIVATION',
    "activated_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credentials" (
    "user_id" UUID NOT NULL,
    "password_hash" TEXT NOT NULL,
    "password_changed_at" TIMESTAMPTZ(6) NOT NULL,
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(6),

    CONSTRAINT "credentials_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "active_tenant_id" UUID,
    "refresh_token_hash" TEXT NOT NULL,
    "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "last_used_at" TIMESTAMPTZ(6),

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_otps" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "purpose" "OtpPurpose" NOT NULL,
    "otp_hash" TEXT NOT NULL,
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL,

    CONSTRAINT "password_reset_otps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_memberships" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tenant_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_system_seeded" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "is_sensitive" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_roles" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "assigned_by_membership_id" UUID NOT NULL,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "membership_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_scopes" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "membership_role_id" UUID NOT NULL,
    "scope_kind" "AccessScopeKind" NOT NULL,
    "class_id" UUID,
    "student_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "access_scopes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_profiles" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "membership_id" UUID,
    "teacher_code" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "contact" TEXT,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "teacher_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_profiles" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "membership_id" UUID,
    "student_code" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "date_of_birth" DATE,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "student_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "levels" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject_id" UUID NOT NULL,
    "level_id" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classes" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "course_id" UUID NOT NULL,
    "capacity" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "start_date" DATE,
    "end_date" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_competencies" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "level_id" UUID NOT NULL,
    "verified_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "teacher_competencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_teacher_assignments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "role_kind" TEXT NOT NULL,
    "valid_from" TIMESTAMPTZ(6) NOT NULL,
    "valid_to" TIMESTAMPTZ(6),
    "assigned_by_membership_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "class_teacher_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "status" "EnrollmentStatus" NOT NULL,
    "effective_from" TIMESTAMPTZ(6) NOT NULL,
    "effective_to" TIMESTAMPTZ(6),
    "prior_enrollment_id" UUID,
    "created_by_membership_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollment_transfers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "source_enrollment_id" UUID NOT NULL,
    "target_class_id" UUID NOT NULL,
    "effective_at" TIMESTAMPTZ(6) NOT NULL,
    "status" TEXT NOT NULL,
    "target_enrollment_id" UUID,
    "requested_by_membership_id" UUID NOT NULL,
    "confirmed_by_membership_id" UUID,
    "approval_request_id" UUID,
    "reason" TEXT NOT NULL,
    "operation_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "enrollment_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parent_student_links" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "parent_membership_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "relationship" TEXT NOT NULL,
    "verified_at" TIMESTAMPTZ(6),
    "verified_by_membership_id" UUID,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "parent_student_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verified_sibling_relationships" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "student_a_id" UUID NOT NULL,
    "student_b_id" UUID NOT NULL,
    "verified_by_membership_id" UUID NOT NULL,
    "verified_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "evidence_note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "verified_sibling_relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL,
    "location" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedulable_resources" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "resource_kind" "ResourceKind" NOT NULL,
    "teacher_id" UUID,
    "student_id" UUID,
    "room_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "schedulable_resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_unavailability" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "resource_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "status" "ResourceUnavailabilityStatus" NOT NULL,
    "reason" TEXT NOT NULL,
    "created_by_membership_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "resource_unavailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_series" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "weekday" SMALLINT NOT NULL,
    "local_start_time" TIME(0) NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE NOT NULL,
    "timezone" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "schedule_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_sessions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "series_id" UUID,
    "teacher_id" UUID NOT NULL,
    "room_id" UUID,
    "delivery_mode" "DeliveryMode" NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "status" "ClassSessionStatus" NOT NULL,
    "cancel_reason" TEXT,
    "revision" INTEGER NOT NULL,
    "policy_version_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "class_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_participants" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "enrollment_id" UUID,
    "participant_kind" "SessionParticipantKind" NOT NULL,
    "added_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "session_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_bookings" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "resource_id" UUID NOT NULL,
    "session_id" UUID,
    "unavailability_id" UUID,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "status" "ResourceBookingStatus" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "resource_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "absence_requests" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "participant_id" UUID NOT NULL,
    "requester_membership_id" UUID NOT NULL,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL,
    "reason" TEXT NOT NULL,
    "is_late_notice" BOOLEAN NOT NULL,
    "status" TEXT NOT NULL,
    "approved_by_membership_id" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "approval_request_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "absence_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_finalizations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "confirmed_by_membership_id" UUID NOT NULL,
    "confirmed_at" TIMESTAMPTZ(6) NOT NULL,
    "locked_at" TIMESTAMPTZ(6),
    "revision" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "attendance_finalizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "participant_id" UUID NOT NULL,
    "finalization_id" UUID,
    "attendance_status" "AttendanceStatus" NOT NULL,
    "recorded_by_membership_id" UUID NOT NULL,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL,
    "revision" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_corrections" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "attendance_id" UUID NOT NULL,
    "old_status" "AttendanceStatus" NOT NULL,
    "new_status" "AttendanceStatus" NOT NULL,
    "reason" TEXT NOT NULL,
    "requested_by_membership_id" UUID NOT NULL,
    "approved_by_membership_id" UUID,
    "corrected_at" TIMESTAMPTZ(6) NOT NULL,
    "approval_request_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_rules" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "scope_kind" "PriceScopeKind" NOT NULL,
    "course_id" UUID,
    "class_id" UUID,
    "session_id" UUID,
    "unit_price_vnd" BIGINT NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "policy_version_id" UUID NOT NULL,
    "created_by_membership_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "price_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_periods" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "month_start" DATE NOT NULL,
    "month_end" DATE NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "billing_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_runs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "operation_key" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "policy_version_id" UUID NOT NULL,
    "input_snapshot_hash" TEXT NOT NULL,
    "computed_at" TIMESTAMPTZ(6),
    "requested_by_membership_id" UUID,
    "error_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "billing_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "billing_run_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "invoice_number" TEXT,
    "status" "InvoiceStatus" NOT NULL,
    "gross_vnd" BIGINT NOT NULL,
    "discount_vnd" BIGINT NOT NULL,
    "total_vnd" BIGINT NOT NULL,
    "issued_at" TIMESTAMPTZ(6),
    "issued_by_membership_id" UUID,
    "due_at" TIMESTAMPTZ(6),
    "policy_version_id" UUID NOT NULL,
    "snapshot_json" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_lines" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "participant_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "attendance_id" UUID,
    "price_rule_id" UUID,
    "source_status" TEXT NOT NULL,
    "charge_units" SMALLINT NOT NULL,
    "unit_price_vnd" BIGINT NOT NULL,
    "base_amount_vnd" BIGINT NOT NULL,
    "reason_code" TEXT NOT NULL,
    "source_snapshot_json" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_discounts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "kind" "InvoiceDiscountKind" NOT NULL,
    "sequence_no" INTEGER NOT NULL,
    "rate" DECIMAL(6,5) NOT NULL,
    "raw_discount_decimal" DECIMAL(20,6) NOT NULL,
    "evidence_snapshot_json" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "invoice_discounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoiced_participation_claims" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "participant_id" UUID NOT NULL,
    "invoice_line_id" UUID NOT NULL,
    "claimed_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoiced_participation_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_adjustments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "approval_request_id" UUID NOT NULL,
    "adjustment_kind" "InvoiceAdjustmentKind" NOT NULL,
    "delta_vnd" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "InvoiceAdjustmentStatus" NOT NULL,
    "applied_at" TIMESTAMPTZ(6),
    "applied_by_membership_id" UUID,
    "operation_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "invoice_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "amount_vnd" BIGINT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "external_reference" TEXT,
    "paid_at" TIMESTAMPTZ(6) NOT NULL,
    "recorded_by_membership_id" UUID NOT NULL,
    "evidence_note" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_reversals" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "amount_vnd" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "reversed_by_membership_id" UUID NOT NULL,
    "reversed_at" TIMESTAMPTZ(6) NOT NULL,
    "approval_request_id" UUID,
    "operation_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_reversals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receivable_allocations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "amount_vnd" BIGINT NOT NULL,
    "allocated_at" TIMESTAMPTZ(6) NOT NULL,
    "operation_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receivable_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_excess_resolutions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "trigger_adjustment_id" UUID NOT NULL,
    "amount_vnd" BIGINT NOT NULL,
    "status" "PaymentExcessResolutionStatus" NOT NULL,
    "resolution_kind" TEXT,
    "approval_request_id" UUID,
    "reason" TEXT NOT NULL,
    "resolved_at" TIMESTAMPTZ(6),
    "operation_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payment_excess_resolutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "class_id" UUID,
    "created_by_teacher_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priority" SMALLINT NOT NULL,
    "deadline_at" TIMESTAMPTZ(6) NOT NULL,
    "published_at" TIMESTAMPTZ(6),
    "status" "AssignmentStatus" NOT NULL,
    "revision" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_recipients" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "enrollment_id" UUID,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "deadline_override_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "assignment_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submissions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "recipient_id" UUID NOT NULL,
    "current_version_id" UUID,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submission_versions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "version_no" INTEGER NOT NULL,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL,
    "answer_text" TEXT,
    "is_late" BOOLEAN NOT NULL,
    "status" "SubmissionVersionStatus" NOT NULL,
    "content_hash" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submission_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stored_files" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "uploaded_by_membership_id" UUID NOT NULL,
    "private_storage_key" TEXT NOT NULL,
    "original_filename" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "sha256" TEXT NOT NULL,
    "storage_status" "StoredFileStatus" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "stored_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submission_files" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "submission_version_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "sort_order" SMALLINT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submission_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grades" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "submission_version_id" UUID NOT NULL,
    "revision_no" INTEGER NOT NULL,
    "score" DECIMAL(3,1) NOT NULL,
    "feedback" TEXT,
    "graded_by_teacher_id" UUID NOT NULL,
    "graded_at" TIMESTAMPTZ(6) NOT NULL,
    "status" "GradeStatus" NOT NULL,
    "published_at" TIMESTAMPTZ(6),
    "reason_for_revision" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "grades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_requests" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "operation_type" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" UUID NOT NULL,
    "requester_membership_id" UUID,
    "policy_version_id" UUID NOT NULL,
    "status" "ApprovalStatus" NOT NULL,
    "reason" TEXT NOT NULL,
    "payload_snapshot_json" JSONB NOT NULL,
    "correlation_id" UUID NOT NULL,
    "decided_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_decisions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "approval_request_id" UUID NOT NULL,
    "decided_by_membership_id" UUID NOT NULL,
    "decision" "ApprovalDecisionKind" NOT NULL,
    "reason" TEXT NOT NULL,
    "decided_at" TIMESTAMPTZ(6) NOT NULL,
    "self_approved" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_jobs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "job_kind" TEXT NOT NULL,
    "operation_key" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "policy_version_id" UUID NOT NULL,
    "trigger_event_id" UUID,
    "actor_membership_id" UUID,
    "correlation_id" UUID NOT NULL,
    "status" "AutomationJobStatus" NOT NULL,
    "attempt_count" INTEGER NOT NULL,
    "next_attempt_at" TIMESTAMPTZ(6) NOT NULL,
    "lease_owner" TEXT,
    "lease_until" TIMESTAMPTZ(6),
    "last_error_code" TEXT,
    "payload_json" JSONB NOT NULL,
    "result_json" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "automation_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_attempts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "attempt_no" INTEGER NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "finished_at" TIMESTAMPTZ(6),
    "outcome" TEXT NOT NULL,
    "error_code" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "operation_type" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "result_ref_type" TEXT,
    "result_ref_id" UUID,
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "event_key" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "aggregate_type" TEXT NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "payload_json" JSONB NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "status" "OutboxEventStatus" NOT NULL,
    "attempt_count" INTEGER NOT NULL,
    "available_at" TIMESTAMPTZ(6) NOT NULL,
    "correlation_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "recipient_membership_id" UUID NOT NULL,
    "outbox_event_id" UUID NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "actor_user_id" UUID,
    "actor_membership_id" UUID,
    "actor_kind" "AuditActorKind" NOT NULL,
    "event_type" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "before_json" JSONB,
    "after_json" JSONB,
    "policy_version_id" UUID,
    "correlation_id" UUID NOT NULL,
    "ip_address" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_code_key" ON "tenants"("code");

-- CreateIndex
CREATE INDEX "policy_versions_tenant_id_effective_from_idx" ON "policy_versions"("tenant_id", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "policy_versions_tenant_id_id_key" ON "policy_versions"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "policy_versions_tenant_id_version_code_key" ON "policy_versions"("tenant_id", "version_code");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_normalized_key" ON "users"("email_normalized");

-- CreateIndex
CREATE INDEX "auth_sessions_user_id_revoked_at_expires_at_idx" ON "auth_sessions"("user_id", "revoked_at", "expires_at");

-- CreateIndex
CREATE INDEX "auth_sessions_active_tenant_id_idx" ON "auth_sessions"("active_tenant_id");

-- CreateIndex
CREATE INDEX "password_reset_otps_user_id_purpose_consumed_at_expires_at_idx" ON "password_reset_otps"("user_id", "purpose", "consumed_at", "expires_at");

-- CreateIndex
CREATE INDEX "tenant_memberships_user_id_idx" ON "tenant_memberships"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_memberships_tenant_id_id_key" ON "tenant_memberships"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_memberships_tenant_id_user_id_key" ON "tenant_memberships"("tenant_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_tenant_id_id_key" ON "roles"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_tenant_id_code_key" ON "roles"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE INDEX "role_permissions_permission_id_idx" ON "role_permissions"("permission_id");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_tenant_id_id_key" ON "role_permissions"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_tenant_id_role_id_permission_id_key" ON "role_permissions"("tenant_id", "role_id", "permission_id");

-- CreateIndex
CREATE INDEX "membership_roles_tenant_id_membership_id_revoked_at_idx" ON "membership_roles"("tenant_id", "membership_id", "revoked_at");

-- CreateIndex
CREATE INDEX "membership_roles_tenant_id_role_id_idx" ON "membership_roles"("tenant_id", "role_id");

-- CreateIndex
CREATE INDEX "membership_roles_tenant_id_assigned_by_membership_id_idx" ON "membership_roles"("tenant_id", "assigned_by_membership_id");

-- CreateIndex
CREATE UNIQUE INDEX "membership_roles_tenant_id_id_key" ON "membership_roles"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "access_scopes_tenant_id_membership_role_id_scope_kind_idx" ON "access_scopes"("tenant_id", "membership_role_id", "scope_kind");

-- CreateIndex
CREATE INDEX "access_scopes_tenant_id_class_id_idx" ON "access_scopes"("tenant_id", "class_id");

-- CreateIndex
CREATE INDEX "access_scopes_tenant_id_student_id_idx" ON "access_scopes"("tenant_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "access_scopes_tenant_id_id_key" ON "access_scopes"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_profiles_tenant_id_id_key" ON "teacher_profiles"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_profiles_tenant_id_teacher_code_key" ON "teacher_profiles"("tenant_id", "teacher_code");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_profiles_tenant_id_membership_id_key" ON "teacher_profiles"("tenant_id", "membership_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_profiles_tenant_id_id_key" ON "student_profiles"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "student_profiles_tenant_id_student_code_key" ON "student_profiles"("tenant_id", "student_code");

-- CreateIndex
CREATE UNIQUE INDEX "student_profiles_tenant_id_membership_id_key" ON "student_profiles"("tenant_id", "membership_id");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_tenant_id_id_key" ON "subjects"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_tenant_id_code_key" ON "subjects"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "levels_tenant_id_id_key" ON "levels"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "levels_tenant_id_code_key" ON "levels"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "courses_tenant_id_subject_id_level_id_idx" ON "courses"("tenant_id", "subject_id", "level_id");

-- CreateIndex
CREATE UNIQUE INDEX "courses_tenant_id_id_key" ON "courses"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "courses_tenant_id_code_key" ON "courses"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "classes_tenant_id_status_idx" ON "classes"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "classes_tenant_id_course_id_idx" ON "classes"("tenant_id", "course_id");

-- CreateIndex
CREATE UNIQUE INDEX "classes_tenant_id_id_key" ON "classes"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "classes_tenant_id_code_key" ON "classes"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "teacher_competencies_tenant_id_subject_id_level_id_idx" ON "teacher_competencies"("tenant_id", "subject_id", "level_id");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_competencies_tenant_id_id_key" ON "teacher_competencies"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_competencies_tenant_id_teacher_id_subject_id_level__key" ON "teacher_competencies"("tenant_id", "teacher_id", "subject_id", "level_id");

-- CreateIndex
CREATE INDEX "class_teacher_assignments_tenant_id_class_id_valid_from_idx" ON "class_teacher_assignments"("tenant_id", "class_id", "valid_from");

-- CreateIndex
CREATE INDEX "class_teacher_assignments_tenant_id_teacher_id_valid_from_idx" ON "class_teacher_assignments"("tenant_id", "teacher_id", "valid_from");

-- CreateIndex
CREATE INDEX "class_teacher_assignments_tenant_id_assigned_by_membership__idx" ON "class_teacher_assignments"("tenant_id", "assigned_by_membership_id");

-- CreateIndex
CREATE UNIQUE INDEX "class_teacher_assignments_tenant_id_id_key" ON "class_teacher_assignments"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "enrollments_tenant_id_class_id_status_effective_from_idx" ON "enrollments"("tenant_id", "class_id", "status", "effective_from");

-- CreateIndex
CREATE INDEX "enrollments_tenant_id_student_id_status_idx" ON "enrollments"("tenant_id", "student_id", "status");

-- CreateIndex
CREATE INDEX "enrollments_tenant_id_prior_enrollment_id_idx" ON "enrollments"("tenant_id", "prior_enrollment_id");

-- CreateIndex
CREATE INDEX "enrollments_tenant_id_created_by_membership_id_idx" ON "enrollments"("tenant_id", "created_by_membership_id");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_tenant_id_id_key" ON "enrollments"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_tenant_id_student_id_id_key" ON "enrollments"("tenant_id", "student_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_tenant_id_class_id_id_key" ON "enrollments"("tenant_id", "class_id", "id");

-- CreateIndex
CREATE INDEX "enrollment_transfers_tenant_id_source_enrollment_id_status_idx" ON "enrollment_transfers"("tenant_id", "source_enrollment_id", "status");

-- CreateIndex
CREATE INDEX "enrollment_transfers_tenant_id_target_class_id_status_idx" ON "enrollment_transfers"("tenant_id", "target_class_id", "status");

-- CreateIndex
CREATE INDEX "enrollment_transfers_tenant_id_target_enrollment_id_idx" ON "enrollment_transfers"("tenant_id", "target_enrollment_id");

-- CreateIndex
CREATE INDEX "enrollment_transfers_tenant_id_approval_request_id_idx" ON "enrollment_transfers"("tenant_id", "approval_request_id");

-- CreateIndex
CREATE UNIQUE INDEX "enrollment_transfers_tenant_id_id_key" ON "enrollment_transfers"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "enrollment_transfers_tenant_id_operation_key_key" ON "enrollment_transfers"("tenant_id", "operation_key");

-- CreateIndex
CREATE INDEX "parent_student_links_tenant_id_parent_membership_id_revoked_idx" ON "parent_student_links"("tenant_id", "parent_membership_id", "revoked_at");

-- CreateIndex
CREATE INDEX "parent_student_links_tenant_id_student_id_revoked_at_idx" ON "parent_student_links"("tenant_id", "student_id", "revoked_at");

-- CreateIndex
CREATE INDEX "parent_student_links_tenant_id_verified_by_membership_id_idx" ON "parent_student_links"("tenant_id", "verified_by_membership_id");

-- CreateIndex
CREATE UNIQUE INDEX "parent_student_links_tenant_id_id_key" ON "parent_student_links"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "verified_sibling_relationships_tenant_id_student_a_id_revok_idx" ON "verified_sibling_relationships"("tenant_id", "student_a_id", "revoked_at");

-- CreateIndex
CREATE INDEX "verified_sibling_relationships_tenant_id_student_b_id_revok_idx" ON "verified_sibling_relationships"("tenant_id", "student_b_id", "revoked_at");

-- CreateIndex
CREATE INDEX "verified_sibling_relationships_tenant_id_verified_by_member_idx" ON "verified_sibling_relationships"("tenant_id", "verified_by_membership_id");

-- CreateIndex
CREATE UNIQUE INDEX "verified_sibling_relationships_tenant_id_id_key" ON "verified_sibling_relationships"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_tenant_id_id_key" ON "rooms"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_tenant_id_code_key" ON "rooms"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "schedulable_resources_tenant_id_id_key" ON "schedulable_resources"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "schedulable_resources_tenant_id_teacher_id_key" ON "schedulable_resources"("tenant_id", "teacher_id");

-- CreateIndex
CREATE UNIQUE INDEX "schedulable_resources_tenant_id_student_id_key" ON "schedulable_resources"("tenant_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "schedulable_resources_tenant_id_room_id_key" ON "schedulable_resources"("tenant_id", "room_id");

-- CreateIndex
CREATE INDEX "resource_unavailability_tenant_id_resource_id_status_starts_idx" ON "resource_unavailability"("tenant_id", "resource_id", "status", "starts_at");

-- CreateIndex
CREATE INDEX "resource_unavailability_tenant_id_created_by_membership_id_idx" ON "resource_unavailability"("tenant_id", "created_by_membership_id");

-- CreateIndex
CREATE UNIQUE INDEX "resource_unavailability_tenant_id_id_key" ON "resource_unavailability"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "resource_unavailability_tenant_id_resource_id_id_key" ON "resource_unavailability"("tenant_id", "resource_id", "id");

-- CreateIndex
CREATE INDEX "schedule_series_tenant_id_class_id_valid_from_idx" ON "schedule_series"("tenant_id", "class_id", "valid_from");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_series_tenant_id_id_key" ON "schedule_series"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_series_tenant_id_class_id_id_key" ON "schedule_series"("tenant_id", "class_id", "id");

-- CreateIndex
CREATE INDEX "class_sessions_tenant_id_class_id_starts_at_idx" ON "class_sessions"("tenant_id", "class_id", "starts_at");

-- CreateIndex
CREATE INDEX "class_sessions_tenant_id_teacher_id_starts_at_idx" ON "class_sessions"("tenant_id", "teacher_id", "starts_at");

-- CreateIndex
CREATE INDEX "class_sessions_tenant_id_room_id_starts_at_idx" ON "class_sessions"("tenant_id", "room_id", "starts_at");

-- CreateIndex
CREATE INDEX "class_sessions_tenant_id_series_id_starts_at_idx" ON "class_sessions"("tenant_id", "series_id", "starts_at");

-- CreateIndex
CREATE INDEX "class_sessions_tenant_id_policy_version_id_idx" ON "class_sessions"("tenant_id", "policy_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "class_sessions_tenant_id_id_key" ON "class_sessions"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "session_participants_tenant_id_student_id_session_id_idx" ON "session_participants"("tenant_id", "student_id", "session_id");

-- CreateIndex
CREATE INDEX "session_participants_tenant_id_enrollment_id_idx" ON "session_participants"("tenant_id", "enrollment_id");

-- CreateIndex
CREATE UNIQUE INDEX "session_participants_tenant_id_id_key" ON "session_participants"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "session_participants_tenant_id_session_id_id_key" ON "session_participants"("tenant_id", "session_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "session_participants_tenant_id_session_id_student_id_key" ON "session_participants"("tenant_id", "session_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "sp_tenant_session_student_id_uq" ON "session_participants"("tenant_id", "session_id", "student_id", "id");

-- CreateIndex
CREATE INDEX "resource_bookings_tenant_id_resource_id_status_starts_at_idx" ON "resource_bookings"("tenant_id", "resource_id", "status", "starts_at");

-- CreateIndex
CREATE INDEX "resource_bookings_tenant_id_session_id_idx" ON "resource_bookings"("tenant_id", "session_id");

-- CreateIndex
CREATE INDEX "resource_bookings_tenant_id_unavailability_id_idx" ON "resource_bookings"("tenant_id", "unavailability_id");

-- CreateIndex
CREATE UNIQUE INDEX "resource_bookings_tenant_id_id_key" ON "resource_bookings"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "absence_requests_tenant_id_participant_id_status_idx" ON "absence_requests"("tenant_id", "participant_id", "status");

-- CreateIndex
CREATE INDEX "absence_requests_tenant_id_requester_membership_id_idx" ON "absence_requests"("tenant_id", "requester_membership_id");

-- CreateIndex
CREATE INDEX "absence_requests_tenant_id_approved_by_membership_id_idx" ON "absence_requests"("tenant_id", "approved_by_membership_id");

-- CreateIndex
CREATE INDEX "absence_requests_tenant_id_approval_request_id_idx" ON "absence_requests"("tenant_id", "approval_request_id");

-- CreateIndex
CREATE UNIQUE INDEX "absence_requests_tenant_id_id_key" ON "absence_requests"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "attendance_finalizations_tenant_id_confirmed_by_membership__idx" ON "attendance_finalizations"("tenant_id", "confirmed_by_membership_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_finalizations_tenant_id_id_key" ON "attendance_finalizations"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_finalizations_tenant_id_session_id_key" ON "attendance_finalizations"("tenant_id", "session_id");

-- CreateIndex
CREATE UNIQUE INDEX "af_tenant_session_id_uq" ON "attendance_finalizations"("tenant_id", "session_id", "id");

-- CreateIndex
CREATE INDEX "attendance_records_tenant_id_finalization_id_idx" ON "attendance_records"("tenant_id", "finalization_id");

-- CreateIndex
CREATE INDEX "ar_tenant_session_finalization_idx" ON "attendance_records"("tenant_id", "session_id", "finalization_id");

-- CreateIndex
CREATE INDEX "attendance_records_tenant_id_recorded_by_membership_id_idx" ON "attendance_records"("tenant_id", "recorded_by_membership_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_tenant_id_id_key" ON "attendance_records"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_tenant_id_participant_id_id_key" ON "attendance_records"("tenant_id", "participant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_tenant_id_participant_id_key" ON "attendance_records"("tenant_id", "participant_id");

-- CreateIndex
CREATE UNIQUE INDEX "ar_tenant_session_participant_uq" ON "attendance_records"("tenant_id", "session_id", "participant_id");

-- CreateIndex
CREATE INDEX "attendance_corrections_tenant_id_attendance_id_corrected_at_idx" ON "attendance_corrections"("tenant_id", "attendance_id", "corrected_at");

-- CreateIndex
CREATE INDEX "attendance_corrections_tenant_id_requested_by_membership_id_idx" ON "attendance_corrections"("tenant_id", "requested_by_membership_id");

-- CreateIndex
CREATE INDEX "attendance_corrections_tenant_id_approved_by_membership_id_idx" ON "attendance_corrections"("tenant_id", "approved_by_membership_id");

-- CreateIndex
CREATE INDEX "attendance_corrections_tenant_id_approval_request_id_idx" ON "attendance_corrections"("tenant_id", "approval_request_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_corrections_tenant_id_id_key" ON "attendance_corrections"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "price_rules_tenant_id_course_id_effective_from_idx" ON "price_rules"("tenant_id", "course_id", "effective_from");

-- CreateIndex
CREATE INDEX "price_rules_tenant_id_class_id_effective_from_idx" ON "price_rules"("tenant_id", "class_id", "effective_from");

-- CreateIndex
CREATE INDEX "price_rules_tenant_id_session_id_effective_from_idx" ON "price_rules"("tenant_id", "session_id", "effective_from");

-- CreateIndex
CREATE INDEX "price_rules_tenant_id_policy_version_id_idx" ON "price_rules"("tenant_id", "policy_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "price_rules_tenant_id_id_key" ON "price_rules"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "billing_periods_tenant_id_id_key" ON "billing_periods"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "billing_periods_tenant_id_month_start_key" ON "billing_periods"("tenant_id", "month_start");

-- CreateIndex
CREATE INDEX "billing_runs_tenant_id_student_id_state_idx" ON "billing_runs"("tenant_id", "student_id", "state");

-- CreateIndex
CREATE INDEX "billing_runs_tenant_id_policy_version_id_idx" ON "billing_runs"("tenant_id", "policy_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "billing_runs_tenant_id_id_key" ON "billing_runs"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "billing_runs_tenant_id_id_student_id_period_id_key" ON "billing_runs"("tenant_id", "id", "student_id", "period_id");

-- CreateIndex
CREATE UNIQUE INDEX "billing_runs_tenant_id_period_id_student_id_key" ON "billing_runs"("tenant_id", "period_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "billing_runs_tenant_id_operation_key_key" ON "billing_runs"("tenant_id", "operation_key");

-- CreateIndex
CREATE INDEX "invoices_tenant_id_status_issued_at_idx" ON "invoices"("tenant_id", "status", "issued_at");

-- CreateIndex
CREATE INDEX "invoices_tenant_id_student_id_period_id_idx" ON "invoices"("tenant_id", "student_id", "period_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_tenant_id_id_key" ON "invoices"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_tenant_id_billing_run_id_key" ON "invoices"("tenant_id", "billing_run_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_tenant_id_billing_run_id_student_id_period_id_key" ON "invoices"("tenant_id", "billing_run_id", "student_id", "period_id");

-- CreateIndex
CREATE UNIQUE INDEX "inv_tenant_id_student_uq" ON "invoices"("tenant_id", "id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_tenant_id_period_id_student_id_key" ON "invoices"("tenant_id", "period_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_tenant_id_invoice_number_key" ON "invoices"("tenant_id", "invoice_number");

-- CreateIndex
CREATE INDEX "invoice_lines_tenant_id_session_id_idx" ON "invoice_lines"("tenant_id", "session_id");

-- CreateIndex
CREATE INDEX "invoice_lines_tenant_id_attendance_id_idx" ON "invoice_lines"("tenant_id", "attendance_id");

-- CreateIndex
CREATE INDEX "invoice_lines_tenant_id_price_rule_id_idx" ON "invoice_lines"("tenant_id", "price_rule_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_lines_tenant_id_id_key" ON "invoice_lines"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_lines_tenant_id_participant_id_id_key" ON "invoice_lines"("tenant_id", "participant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_lines_tenant_id_invoice_id_participant_id_key" ON "invoice_lines"("tenant_id", "invoice_id", "participant_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_discounts_tenant_id_id_key" ON "invoice_discounts"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_discounts_tenant_id_invoice_id_sequence_no_key" ON "invoice_discounts"("tenant_id", "invoice_id", "sequence_no");

-- CreateIndex
CREATE UNIQUE INDEX "invoiced_participation_claims_tenant_id_id_key" ON "invoiced_participation_claims"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "invoiced_participation_claims_tenant_id_participant_id_key" ON "invoiced_participation_claims"("tenant_id", "participant_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoiced_participation_claims_tenant_id_invoice_line_id_key" ON "invoiced_participation_claims"("tenant_id", "invoice_line_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoiced_participation_claims_tenant_id_participant_id_invo_key" ON "invoiced_participation_claims"("tenant_id", "participant_id", "invoice_line_id");

-- CreateIndex
CREATE INDEX "invoice_adjustments_tenant_id_invoice_id_status_idx" ON "invoice_adjustments"("tenant_id", "invoice_id", "status");

-- CreateIndex
CREATE INDEX "invoice_adjustments_tenant_id_approval_request_id_idx" ON "invoice_adjustments"("tenant_id", "approval_request_id");

-- CreateIndex
CREATE INDEX "invoice_adjustments_tenant_id_applied_by_membership_id_idx" ON "invoice_adjustments"("tenant_id", "applied_by_membership_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_adjustments_tenant_id_id_key" ON "invoice_adjustments"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_adjustments_tenant_id_invoice_id_id_key" ON "invoice_adjustments"("tenant_id", "invoice_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_adjustments_tenant_id_operation_key_key" ON "invoice_adjustments"("tenant_id", "operation_key");

-- CreateIndex
CREATE INDEX "payments_tenant_id_invoice_id_paid_at_idx" ON "payments"("tenant_id", "invoice_id", "paid_at");

-- CreateIndex
CREATE INDEX "payments_tenant_id_recorded_by_membership_id_idx" ON "payments"("tenant_id", "recorded_by_membership_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_tenant_id_id_key" ON "payments"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_tenant_id_id_invoice_id_key" ON "payments"("tenant_id", "id", "invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_tenant_id_idempotency_key_key" ON "payments"("tenant_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "payment_reversals_tenant_id_approval_request_id_idx" ON "payment_reversals"("tenant_id", "approval_request_id");

-- CreateIndex
CREATE INDEX "payment_reversals_tenant_id_reversed_by_membership_id_idx" ON "payment_reversals"("tenant_id", "reversed_by_membership_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_reversals_tenant_id_id_key" ON "payment_reversals"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_reversals_tenant_id_payment_id_key" ON "payment_reversals"("tenant_id", "payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_reversals_tenant_id_operation_key_key" ON "payment_reversals"("tenant_id", "operation_key");

-- CreateIndex
CREATE INDEX "receivable_allocations_tenant_id_invoice_id_allocated_at_idx" ON "receivable_allocations"("tenant_id", "invoice_id", "allocated_at");

-- CreateIndex
CREATE UNIQUE INDEX "receivable_allocations_tenant_id_id_key" ON "receivable_allocations"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "receivable_allocations_tenant_id_payment_id_key" ON "receivable_allocations"("tenant_id", "payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "receivable_allocations_tenant_id_payment_id_invoice_id_key" ON "receivable_allocations"("tenant_id", "payment_id", "invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "receivable_allocations_tenant_id_operation_key_key" ON "receivable_allocations"("tenant_id", "operation_key");

-- CreateIndex
CREATE INDEX "payment_excess_resolutions_tenant_id_invoice_id_status_idx" ON "payment_excess_resolutions"("tenant_id", "invoice_id", "status");

-- CreateIndex
CREATE INDEX "payment_excess_resolutions_tenant_id_trigger_adjustment_id_idx" ON "payment_excess_resolutions"("tenant_id", "trigger_adjustment_id");

-- CreateIndex
CREATE INDEX "payment_excess_resolutions_tenant_id_approval_request_id_idx" ON "payment_excess_resolutions"("tenant_id", "approval_request_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_excess_resolutions_tenant_id_id_key" ON "payment_excess_resolutions"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_excess_resolutions_tenant_id_operation_key_key" ON "payment_excess_resolutions"("tenant_id", "operation_key");

-- CreateIndex
CREATE INDEX "assignments_tenant_id_class_id_status_idx" ON "assignments"("tenant_id", "class_id", "status");

-- CreateIndex
CREATE INDEX "assignments_tenant_id_created_by_teacher_id_status_idx" ON "assignments"("tenant_id", "created_by_teacher_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "assignments_tenant_id_id_key" ON "assignments"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "assignment_recipients_tenant_id_student_id_revoked_at_idx" ON "assignment_recipients"("tenant_id", "student_id", "revoked_at");

-- CreateIndex
CREATE INDEX "assignment_recipients_tenant_id_enrollment_id_idx" ON "assignment_recipients"("tenant_id", "enrollment_id");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_recipients_tenant_id_id_key" ON "assignment_recipients"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_recipients_tenant_id_assignment_id_student_id_key" ON "assignment_recipients"("tenant_id", "assignment_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "submissions_tenant_id_id_key" ON "submissions"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "submissions_tenant_id_id_current_version_id_key" ON "submissions"("tenant_id", "id", "current_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "submissions_tenant_id_recipient_id_key" ON "submissions"("tenant_id", "recipient_id");

-- CreateIndex
CREATE INDEX "submission_versions_tenant_id_submitted_at_idx" ON "submission_versions"("tenant_id", "submitted_at");

-- CreateIndex
CREATE UNIQUE INDEX "submission_versions_tenant_id_id_key" ON "submission_versions"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "submission_versions_tenant_id_submission_id_id_key" ON "submission_versions"("tenant_id", "submission_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "submission_versions_tenant_id_submission_id_version_no_key" ON "submission_versions"("tenant_id", "submission_id", "version_no");

-- CreateIndex
CREATE INDEX "stored_files_tenant_id_uploaded_by_membership_id_created_at_idx" ON "stored_files"("tenant_id", "uploaded_by_membership_id", "created_at");

-- CreateIndex
CREATE INDEX "stored_files_tenant_id_storage_status_created_at_idx" ON "stored_files"("tenant_id", "storage_status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "stored_files_tenant_id_id_key" ON "stored_files"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "stored_files_tenant_id_private_storage_key_key" ON "stored_files"("tenant_id", "private_storage_key");

-- CreateIndex
CREATE INDEX "submission_files_tenant_id_file_id_idx" ON "submission_files"("tenant_id", "file_id");

-- CreateIndex
CREATE UNIQUE INDEX "submission_files_tenant_id_id_key" ON "submission_files"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "submission_files_tenant_id_submission_version_id_file_id_key" ON "submission_files"("tenant_id", "submission_version_id", "file_id");

-- CreateIndex
CREATE INDEX "grades_tenant_id_graded_by_teacher_id_graded_at_idx" ON "grades"("tenant_id", "graded_by_teacher_id", "graded_at");

-- CreateIndex
CREATE INDEX "grades_tenant_id_submission_version_id_status_published_at_idx" ON "grades"("tenant_id", "submission_version_id", "status", "published_at");

-- CreateIndex
CREATE UNIQUE INDEX "grades_tenant_id_id_key" ON "grades"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "grades_tenant_id_submission_version_id_revision_no_key" ON "grades"("tenant_id", "submission_version_id", "revision_no");

-- CreateIndex
CREATE INDEX "approval_requests_tenant_id_status_created_at_idx" ON "approval_requests"("tenant_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "approval_requests_tenant_id_target_type_target_id_idx" ON "approval_requests"("tenant_id", "target_type", "target_id");

-- CreateIndex
CREATE INDEX "approval_requests_tenant_id_requester_membership_id_created_idx" ON "approval_requests"("tenant_id", "requester_membership_id", "created_at");

-- CreateIndex
CREATE INDEX "approval_requests_tenant_id_correlation_id_idx" ON "approval_requests"("tenant_id", "correlation_id");

-- CreateIndex
CREATE INDEX "approval_requests_tenant_id_policy_version_id_idx" ON "approval_requests"("tenant_id", "policy_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "approval_requests_tenant_id_id_key" ON "approval_requests"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "approval_decisions_tenant_id_approval_request_id_decided_at_idx" ON "approval_decisions"("tenant_id", "approval_request_id", "decided_at");

-- CreateIndex
CREATE INDEX "approval_decisions_tenant_id_decided_by_membership_id_decid_idx" ON "approval_decisions"("tenant_id", "decided_by_membership_id", "decided_at");

-- CreateIndex
CREATE UNIQUE INDEX "approval_decisions_tenant_id_id_key" ON "approval_decisions"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "automation_jobs_status_next_attempt_at_idx" ON "automation_jobs"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "automation_jobs_tenant_id_status_next_attempt_at_idx" ON "automation_jobs"("tenant_id", "status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "automation_jobs_tenant_id_idempotency_key_idx" ON "automation_jobs"("tenant_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "automation_jobs_tenant_id_trigger_event_id_idx" ON "automation_jobs"("tenant_id", "trigger_event_id");

-- CreateIndex
CREATE INDEX "automation_jobs_tenant_id_correlation_id_idx" ON "automation_jobs"("tenant_id", "correlation_id");

-- CreateIndex
CREATE UNIQUE INDEX "automation_jobs_tenant_id_id_key" ON "automation_jobs"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "automation_jobs_tenant_id_operation_key_key" ON "automation_jobs"("tenant_id", "operation_key");

-- CreateIndex
CREATE INDEX "job_attempts_tenant_id_job_id_started_at_idx" ON "job_attempts"("tenant_id", "job_id", "started_at");

-- CreateIndex
CREATE UNIQUE INDEX "job_attempts_tenant_id_id_key" ON "job_attempts"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "job_attempts_tenant_id_job_id_attempt_no_key" ON "job_attempts"("tenant_id", "job_id", "attempt_no");

-- CreateIndex
CREATE INDEX "idempotency_records_tenant_id_status_created_at_idx" ON "idempotency_records"("tenant_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "idempotency_records_tenant_id_expires_at_idx" ON "idempotency_records"("tenant_id", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_tenant_id_id_key" ON "idempotency_records"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_tenant_id_operation_type_idempotency_ke_key" ON "idempotency_records"("tenant_id", "operation_type", "idempotency_key");

-- CreateIndex
CREATE INDEX "outbox_events_status_available_at_idx" ON "outbox_events"("status", "available_at");

-- CreateIndex
CREATE INDEX "outbox_events_tenant_id_status_available_at_idx" ON "outbox_events"("tenant_id", "status", "available_at");

-- CreateIndex
CREATE INDEX "outbox_events_tenant_id_aggregate_type_aggregate_id_idx" ON "outbox_events"("tenant_id", "aggregate_type", "aggregate_id");

-- CreateIndex
CREATE INDEX "outbox_events_tenant_id_correlation_id_idx" ON "outbox_events"("tenant_id", "correlation_id");

-- CreateIndex
CREATE UNIQUE INDEX "outbox_events_tenant_id_id_key" ON "outbox_events"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "outbox_events_tenant_id_event_key_key" ON "outbox_events"("tenant_id", "event_key");

-- CreateIndex
CREATE INDEX "notifications_tenant_id_recipient_membership_id_created_at_idx" ON "notifications"("tenant_id", "recipient_membership_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_tenant_id_recipient_membership_id_read_at_idx" ON "notifications"("tenant_id", "recipient_membership_id", "read_at");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_tenant_id_id_key" ON "notifications"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_tenant_id_outbox_event_id_recipient_membershi_key" ON "notifications"("tenant_id", "outbox_event_id", "recipient_membership_id", "kind");

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_created_at_idx" ON "audit_logs"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_entity_type_entity_id_created_at_idx" ON "audit_logs"("tenant_id", "entity_type", "entity_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_correlation_id_idx" ON "audit_logs"("tenant_id", "correlation_id");

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_actor_membership_id_created_at_idx" ON "audit_logs"("tenant_id", "actor_membership_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_actor_user_id_created_at_idx" ON "audit_logs"("tenant_id", "actor_user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "audit_logs_tenant_id_id_key" ON "audit_logs"("tenant_id", "id");

-- AddForeignKey
ALTER TABLE "policy_versions" ADD CONSTRAINT "policy_versions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_versions" ADD CONSTRAINT "policy_versions_tenant_id_created_by_membership_id_fkey" FOREIGN KEY ("tenant_id", "created_by_membership_id") REFERENCES "tenant_memberships"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_active_tenant_id_fkey" FOREIGN KEY ("active_tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_otps" ADD CONSTRAINT "password_reset_otps_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_tenant_id_role_id_fkey" FOREIGN KEY ("tenant_id", "role_id") REFERENCES "roles"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_roles" ADD CONSTRAINT "membership_roles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_roles" ADD CONSTRAINT "membership_roles_tenant_id_membership_id_fkey" FOREIGN KEY ("tenant_id", "membership_id") REFERENCES "tenant_memberships"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_roles" ADD CONSTRAINT "membership_roles_tenant_id_role_id_fkey" FOREIGN KEY ("tenant_id", "role_id") REFERENCES "roles"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_roles" ADD CONSTRAINT "membership_roles_tenant_id_assigned_by_membership_id_fkey" FOREIGN KEY ("tenant_id", "assigned_by_membership_id") REFERENCES "tenant_memberships"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_scopes" ADD CONSTRAINT "access_scopes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_scopes" ADD CONSTRAINT "access_scopes_tenant_id_membership_role_id_fkey" FOREIGN KEY ("tenant_id", "membership_role_id") REFERENCES "membership_roles"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_scopes" ADD CONSTRAINT "access_scopes_tenant_id_class_id_fkey" FOREIGN KEY ("tenant_id", "class_id") REFERENCES "classes"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_scopes" ADD CONSTRAINT "access_scopes_tenant_id_student_id_fkey" FOREIGN KEY ("tenant_id", "student_id") REFERENCES "student_profiles"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_profiles" ADD CONSTRAINT "teacher_profiles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_profiles" ADD CONSTRAINT "teacher_profiles_tenant_id_membership_id_fkey" FOREIGN KEY ("tenant_id", "membership_id") REFERENCES "tenant_memberships"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_tenant_id_membership_id_fkey" FOREIGN KEY ("tenant_id", "membership_id") REFERENCES "tenant_memberships"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "levels" ADD CONSTRAINT "levels_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_tenant_id_subject_id_fkey" FOREIGN KEY ("tenant_id", "subject_id") REFERENCES "subjects"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_tenant_id_level_id_fkey" FOREIGN KEY ("tenant_id", "level_id") REFERENCES "levels"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_tenant_id_course_id_fkey" FOREIGN KEY ("tenant_id", "course_id") REFERENCES "courses"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_competencies" ADD CONSTRAINT "teacher_competencies_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_competencies" ADD CONSTRAINT "teacher_competencies_tenant_id_teacher_id_fkey" FOREIGN KEY ("tenant_id", "teacher_id") REFERENCES "teacher_profiles"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_competencies" ADD CONSTRAINT "teacher_competencies_tenant_id_subject_id_fkey" FOREIGN KEY ("tenant_id", "subject_id") REFERENCES "subjects"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_competencies" ADD CONSTRAINT "teacher_competencies_tenant_id_level_id_fkey" FOREIGN KEY ("tenant_id", "level_id") REFERENCES "levels"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_teacher_assignments" ADD CONSTRAINT "class_teacher_assignments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_teacher_assignments" ADD CONSTRAINT "class_teacher_assignments_tenant_id_class_id_fkey" FOREIGN KEY ("tenant_id", "class_id") REFERENCES "classes"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_teacher_assignments" ADD CONSTRAINT "class_teacher_assignments_tenant_id_teacher_id_fkey" FOREIGN KEY ("tenant_id", "teacher_id") REFERENCES "teacher_profiles"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_teacher_assignments" ADD CONSTRAINT "class_teacher_assignments_tenant_id_assigned_by_membership_fkey" FOREIGN KEY ("tenant_id", "assigned_by_membership_id") REFERENCES "tenant_memberships"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_tenant_id_student_id_fkey" FOREIGN KEY ("tenant_id", "student_id") REFERENCES "student_profiles"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_tenant_id_class_id_fkey" FOREIGN KEY ("tenant_id", "class_id") REFERENCES "classes"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_tenant_id_student_id_prior_enrollment_id_fkey" FOREIGN KEY ("tenant_id", "student_id", "prior_enrollment_id") REFERENCES "enrollments"("tenant_id", "student_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_tenant_id_created_by_membership_id_fkey" FOREIGN KEY ("tenant_id", "created_by_membership_id") REFERENCES "tenant_memberships"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment_transfers" ADD CONSTRAINT "enrollment_transfers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment_transfers" ADD CONSTRAINT "enrollment_transfers_tenant_id_source_enrollment_id_fkey" FOREIGN KEY ("tenant_id", "source_enrollment_id") REFERENCES "enrollments"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment_transfers" ADD CONSTRAINT "enrollment_transfers_tenant_id_target_class_id_fkey" FOREIGN KEY ("tenant_id", "target_class_id") REFERENCES "classes"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment_transfers" ADD CONSTRAINT "enrollment_transfers_tenant_id_target_class_id_target_enro_fkey" FOREIGN KEY ("tenant_id", "target_class_id", "target_enrollment_id") REFERENCES "enrollments"("tenant_id", "class_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment_transfers" ADD CONSTRAINT "enrollment_transfers_tenant_id_requested_by_membership_id_fkey" FOREIGN KEY ("tenant_id", "requested_by_membership_id") REFERENCES "tenant_memberships"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment_transfers" ADD CONSTRAINT "enrollment_transfers_tenant_id_confirmed_by_membership_id_fkey" FOREIGN KEY ("tenant_id", "confirmed_by_membership_id") REFERENCES "tenant_memberships"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment_transfers" ADD CONSTRAINT "enrollment_transfers_tenant_id_approval_request_id_fkey" FOREIGN KEY ("tenant_id", "approval_request_id") REFERENCES "approval_requests"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_student_links" ADD CONSTRAINT "parent_student_links_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_student_links" ADD CONSTRAINT "parent_student_links_tenant_id_parent_membership_id_fkey" FOREIGN KEY ("tenant_id", "parent_membership_id") REFERENCES "tenant_memberships"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_student_links" ADD CONSTRAINT "parent_student_links_tenant_id_student_id_fkey" FOREIGN KEY ("tenant_id", "student_id") REFERENCES "student_profiles"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_student_links" ADD CONSTRAINT "parent_student_links_tenant_id_verified_by_membership_id_fkey" FOREIGN KEY ("tenant_id", "verified_by_membership_id") REFERENCES "tenant_memberships"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verified_sibling_relationships" ADD CONSTRAINT "verified_sibling_relationships_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verified_sibling_relationships" ADD CONSTRAINT "verified_sibling_relationships_tenant_id_student_a_id_fkey" FOREIGN KEY ("tenant_id", "student_a_id") REFERENCES "student_profiles"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verified_sibling_relationships" ADD CONSTRAINT "verified_sibling_relationships_tenant_id_student_b_id_fkey" FOREIGN KEY ("tenant_id", "student_b_id") REFERENCES "student_profiles"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verified_sibling_relationships" ADD CONSTRAINT "verified_sibling_relationships_tenant_id_verified_by_membe_fkey" FOREIGN KEY ("tenant_id", "verified_by_membership_id") REFERENCES "tenant_memberships"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedulable_resources" ADD CONSTRAINT "schedulable_resources_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedulable_resources" ADD CONSTRAINT "schedulable_resources_tenant_id_teacher_id_fkey" FOREIGN KEY ("tenant_id", "teacher_id") REFERENCES "teacher_profiles"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedulable_resources" ADD CONSTRAINT "schedulable_resources_tenant_id_student_id_fkey" FOREIGN KEY ("tenant_id", "student_id") REFERENCES "student_profiles"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedulable_resources" ADD CONSTRAINT "schedulable_resources_tenant_id_room_id_fkey" FOREIGN KEY ("tenant_id", "room_id") REFERENCES "rooms"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_unavailability" ADD CONSTRAINT "resource_unavailability_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_unavailability" ADD CONSTRAINT "resource_unavailability_tenant_id_resource_id_fkey" FOREIGN KEY ("tenant_id", "resource_id") REFERENCES "schedulable_resources"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_unavailability" ADD CONSTRAINT "resource_unavailability_tenant_id_created_by_membership_id_fkey" FOREIGN KEY ("tenant_id", "created_by_membership_id") REFERENCES "tenant_memberships"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_series" ADD CONSTRAINT "schedule_series_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_series" ADD CONSTRAINT "schedule_series_tenant_id_class_id_fkey" FOREIGN KEY ("tenant_id", "class_id") REFERENCES "classes"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_tenant_id_class_id_fkey" FOREIGN KEY ("tenant_id", "class_id") REFERENCES "classes"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_tenant_id_class_id_series_id_fkey" FOREIGN KEY ("tenant_id", "class_id", "series_id") REFERENCES "schedule_series"("tenant_id", "class_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_tenant_id_teacher_id_fkey" FOREIGN KEY ("tenant_id", "teacher_id") REFERENCES "teacher_profiles"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_tenant_id_room_id_fkey" FOREIGN KEY ("tenant_id", "room_id") REFERENCES "rooms"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_tenant_id_policy_version_id_fkey" FOREIGN KEY ("tenant_id", "policy_version_id") REFERENCES "policy_versions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_participants" ADD CONSTRAINT "session_participants_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_participants" ADD CONSTRAINT "session_participants_tenant_id_session_id_fkey" FOREIGN KEY ("tenant_id", "session_id") REFERENCES "class_sessions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_participants" ADD CONSTRAINT "session_participants_tenant_id_student_id_fkey" FOREIGN KEY ("tenant_id", "student_id") REFERENCES "student_profiles"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_participants" ADD CONSTRAINT "session_participants_tenant_id_student_id_enrollment_id_fkey" FOREIGN KEY ("tenant_id", "student_id", "enrollment_id") REFERENCES "enrollments"("tenant_id", "student_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_bookings" ADD CONSTRAINT "resource_bookings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_bookings" ADD CONSTRAINT "resource_bookings_tenant_id_resource_id_fkey" FOREIGN KEY ("tenant_id", "resource_id") REFERENCES "schedulable_resources"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_bookings" ADD CONSTRAINT "resource_bookings_tenant_id_session_id_fkey" FOREIGN KEY ("tenant_id", "session_id") REFERENCES "class_sessions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_bookings" ADD CONSTRAINT "resource_bookings_tenant_id_resource_id_unavailability_id_fkey" FOREIGN KEY ("tenant_id", "resource_id", "unavailability_id") REFERENCES "resource_unavailability"("tenant_id", "resource_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "absence_requests" ADD CONSTRAINT "absence_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "absence_requests" ADD CONSTRAINT "absence_requests_tenant_id_participant_id_fkey" FOREIGN KEY ("tenant_id", "participant_id") REFERENCES "session_participants"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "absence_requests" ADD CONSTRAINT "absence_requests_tenant_id_requester_membership_id_fkey" FOREIGN KEY ("tenant_id", "requester_membership_id") REFERENCES "tenant_memberships"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "absence_requests" ADD CONSTRAINT "absence_requests_tenant_id_approved_by_membership_id_fkey" FOREIGN KEY ("tenant_id", "approved_by_membership_id") REFERENCES "tenant_memberships"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "absence_requests" ADD CONSTRAINT "absence_requests_tenant_id_approval_request_id_fkey" FOREIGN KEY ("tenant_id", "approval_request_id") REFERENCES "approval_requests"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_finalizations" ADD CONSTRAINT "attendance_finalizations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_finalizations" ADD CONSTRAINT "attendance_finalizations_tenant_id_session_id_fkey" FOREIGN KEY ("tenant_id", "session_id") REFERENCES "class_sessions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_finalizations" ADD CONSTRAINT "attendance_finalizations_tenant_id_confirmed_by_membership_fkey" FOREIGN KEY ("tenant_id", "confirmed_by_membership_id") REFERENCES "tenant_memberships"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "ar_participant_session_fk" FOREIGN KEY ("tenant_id", "session_id", "participant_id") REFERENCES "session_participants"("tenant_id", "session_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "ar_finalization_session_fk" FOREIGN KEY ("tenant_id", "session_id", "finalization_id") REFERENCES "attendance_finalizations"("tenant_id", "session_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_tenant_id_recorded_by_membership_id_fkey" FOREIGN KEY ("tenant_id", "recorded_by_membership_id") REFERENCES "tenant_memberships"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_tenant_id_attendance_id_fkey" FOREIGN KEY ("tenant_id", "attendance_id") REFERENCES "attendance_records"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_tenant_id_requested_by_membership_i_fkey" FOREIGN KEY ("tenant_id", "requested_by_membership_id") REFERENCES "tenant_memberships"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_tenant_id_approved_by_membership_id_fkey" FOREIGN KEY ("tenant_id", "approved_by_membership_id") REFERENCES "tenant_memberships"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_tenant_id_approval_request_id_fkey" FOREIGN KEY ("tenant_id", "approval_request_id") REFERENCES "approval_requests"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_rules" ADD CONSTRAINT "price_rules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_rules" ADD CONSTRAINT "price_rules_tenant_id_course_id_fkey" FOREIGN KEY ("tenant_id", "course_id") REFERENCES "courses"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_rules" ADD CONSTRAINT "price_rules_tenant_id_class_id_fkey" FOREIGN KEY ("tenant_id", "class_id") REFERENCES "classes"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_rules" ADD CONSTRAINT "price_rules_tenant_id_session_id_fkey" FOREIGN KEY ("tenant_id", "session_id") REFERENCES "class_sessions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_rules" ADD CONSTRAINT "price_rules_tenant_id_policy_version_id_fkey" FOREIGN KEY ("tenant_id", "policy_version_id") REFERENCES "policy_versions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_rules" ADD CONSTRAINT "price_rules_tenant_id_created_by_membership_id_fkey" FOREIGN KEY ("tenant_id", "created_by_membership_id") REFERENCES "tenant_memberships"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_periods" ADD CONSTRAINT "billing_periods_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_runs" ADD CONSTRAINT "billing_runs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_runs" ADD CONSTRAINT "billing_runs_tenant_id_period_id_fkey" FOREIGN KEY ("tenant_id", "period_id") REFERENCES "billing_periods"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_runs" ADD CONSTRAINT "billing_runs_tenant_id_student_id_fkey" FOREIGN KEY ("tenant_id", "student_id") REFERENCES "student_profiles"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_runs" ADD CONSTRAINT "billing_runs_tenant_id_policy_version_id_fkey" FOREIGN KEY ("tenant_id", "policy_version_id") REFERENCES "policy_versions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_runs" ADD CONSTRAINT "billing_runs_tenant_id_requested_by_membership_id_fkey" FOREIGN KEY ("tenant_id", "requested_by_membership_id") REFERENCES "tenant_memberships"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_billing_run_id_student_id_period_id_fkey" FOREIGN KEY ("tenant_id", "billing_run_id", "student_id", "period_id") REFERENCES "billing_runs"("tenant_id", "id", "student_id", "period_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_student_id_fkey" FOREIGN KEY ("tenant_id", "student_id") REFERENCES "student_profiles"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_period_id_fkey" FOREIGN KEY ("tenant_id", "period_id") REFERENCES "billing_periods"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_issued_by_membership_id_fkey" FOREIGN KEY ("tenant_id", "issued_by_membership_id") REFERENCES "tenant_memberships"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_policy_version_id_fkey" FOREIGN KEY ("tenant_id", "policy_version_id") REFERENCES "policy_versions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "il_invoice_student_fk" FOREIGN KEY ("tenant_id", "invoice_id", "student_id") REFERENCES "invoices"("tenant_id", "id", "student_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "il_participant_student_fk" FOREIGN KEY ("tenant_id", "session_id", "student_id", "participant_id") REFERENCES "session_participants"("tenant_id", "session_id", "student_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_tenant_id_session_id_fkey" FOREIGN KEY ("tenant_id", "session_id") REFERENCES "class_sessions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_tenant_id_participant_id_attendance_id_fkey" FOREIGN KEY ("tenant_id", "participant_id", "attendance_id") REFERENCES "attendance_records"("tenant_id", "participant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_tenant_id_price_rule_id_fkey" FOREIGN KEY ("tenant_id", "price_rule_id") REFERENCES "price_rules"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_discounts" ADD CONSTRAINT "invoice_discounts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_discounts" ADD CONSTRAINT "invoice_discounts_tenant_id_invoice_id_fkey" FOREIGN KEY ("tenant_id", "invoice_id") REFERENCES "invoices"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoiced_participation_claims" ADD CONSTRAINT "invoiced_participation_claims_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoiced_participation_claims" ADD CONSTRAINT "invoiced_participation_claims_tenant_id_participant_id_fkey" FOREIGN KEY ("tenant_id", "participant_id") REFERENCES "session_participants"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoiced_participation_claims" ADD CONSTRAINT "invoiced_participation_claims_tenant_id_participant_id_inv_fkey" FOREIGN KEY ("tenant_id", "participant_id", "invoice_line_id") REFERENCES "invoice_lines"("tenant_id", "participant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_adjustments" ADD CONSTRAINT "invoice_adjustments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_adjustments" ADD CONSTRAINT "invoice_adjustments_tenant_id_invoice_id_fkey" FOREIGN KEY ("tenant_id", "invoice_id") REFERENCES "invoices"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_adjustments" ADD CONSTRAINT "invoice_adjustments_tenant_id_applied_by_membership_id_fkey" FOREIGN KEY ("tenant_id", "applied_by_membership_id") REFERENCES "tenant_memberships"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_adjustments" ADD CONSTRAINT "invoice_adjustments_tenant_id_approval_request_id_fkey" FOREIGN KEY ("tenant_id", "approval_request_id") REFERENCES "approval_requests"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenant_id_invoice_id_fkey" FOREIGN KEY ("tenant_id", "invoice_id") REFERENCES "invoices"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenant_id_recorded_by_membership_id_fkey" FOREIGN KEY ("tenant_id", "recorded_by_membership_id") REFERENCES "tenant_memberships"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_reversals" ADD CONSTRAINT "payment_reversals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_reversals" ADD CONSTRAINT "payment_reversals_tenant_id_payment_id_fkey" FOREIGN KEY ("tenant_id", "payment_id") REFERENCES "payments"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_reversals" ADD CONSTRAINT "payment_reversals_tenant_id_reversed_by_membership_id_fkey" FOREIGN KEY ("tenant_id", "reversed_by_membership_id") REFERENCES "tenant_memberships"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_reversals" ADD CONSTRAINT "payment_reversals_tenant_id_approval_request_id_fkey" FOREIGN KEY ("tenant_id", "approval_request_id") REFERENCES "approval_requests"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivable_allocations" ADD CONSTRAINT "receivable_allocations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivable_allocations" ADD CONSTRAINT "receivable_allocations_tenant_id_invoice_id_fkey" FOREIGN KEY ("tenant_id", "invoice_id") REFERENCES "invoices"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivable_allocations" ADD CONSTRAINT "receivable_allocations_tenant_id_payment_id_invoice_id_fkey" FOREIGN KEY ("tenant_id", "payment_id", "invoice_id") REFERENCES "payments"("tenant_id", "id", "invoice_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_excess_resolutions" ADD CONSTRAINT "payment_excess_resolutions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_excess_resolutions" ADD CONSTRAINT "payment_excess_resolutions_tenant_id_invoice_id_fkey" FOREIGN KEY ("tenant_id", "invoice_id") REFERENCES "invoices"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_excess_resolutions" ADD CONSTRAINT "payment_excess_resolutions_tenant_id_invoice_id_trigger_ad_fkey" FOREIGN KEY ("tenant_id", "invoice_id", "trigger_adjustment_id") REFERENCES "invoice_adjustments"("tenant_id", "invoice_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_excess_resolutions" ADD CONSTRAINT "payment_excess_resolutions_tenant_id_approval_request_id_fkey" FOREIGN KEY ("tenant_id", "approval_request_id") REFERENCES "approval_requests"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_tenant_id_class_id_fkey" FOREIGN KEY ("tenant_id", "class_id") REFERENCES "classes"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_tenant_id_created_by_teacher_id_fkey" FOREIGN KEY ("tenant_id", "created_by_teacher_id") REFERENCES "teacher_profiles"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_recipients" ADD CONSTRAINT "assignment_recipients_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_recipients" ADD CONSTRAINT "assignment_recipients_tenant_id_assignment_id_fkey" FOREIGN KEY ("tenant_id", "assignment_id") REFERENCES "assignments"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_recipients" ADD CONSTRAINT "assignment_recipients_tenant_id_student_id_fkey" FOREIGN KEY ("tenant_id", "student_id") REFERENCES "student_profiles"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_recipients" ADD CONSTRAINT "assignment_recipients_tenant_id_student_id_enrollment_id_fkey" FOREIGN KEY ("tenant_id", "student_id", "enrollment_id") REFERENCES "enrollments"("tenant_id", "student_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_tenant_id_recipient_id_fkey" FOREIGN KEY ("tenant_id", "recipient_id") REFERENCES "assignment_recipients"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_tenant_id_id_current_version_id_fkey" FOREIGN KEY ("tenant_id", "id", "current_version_id") REFERENCES "submission_versions"("tenant_id", "submission_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_versions" ADD CONSTRAINT "submission_versions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_versions" ADD CONSTRAINT "submission_versions_tenant_id_submission_id_fkey" FOREIGN KEY ("tenant_id", "submission_id") REFERENCES "submissions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_tenant_id_uploaded_by_membership_id_fkey" FOREIGN KEY ("tenant_id", "uploaded_by_membership_id") REFERENCES "tenant_memberships"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_files" ADD CONSTRAINT "submission_files_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_files" ADD CONSTRAINT "submission_files_tenant_id_submission_version_id_fkey" FOREIGN KEY ("tenant_id", "submission_version_id") REFERENCES "submission_versions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_files" ADD CONSTRAINT "submission_files_tenant_id_file_id_fkey" FOREIGN KEY ("tenant_id", "file_id") REFERENCES "stored_files"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grades" ADD CONSTRAINT "grades_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grades" ADD CONSTRAINT "grades_tenant_id_submission_version_id_fkey" FOREIGN KEY ("tenant_id", "submission_version_id") REFERENCES "submission_versions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grades" ADD CONSTRAINT "grades_tenant_id_graded_by_teacher_id_fkey" FOREIGN KEY ("tenant_id", "graded_by_teacher_id") REFERENCES "teacher_profiles"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_tenant_id_requester_membership_id_fkey" FOREIGN KEY ("tenant_id", "requester_membership_id") REFERENCES "tenant_memberships"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_tenant_id_policy_version_id_fkey" FOREIGN KEY ("tenant_id", "policy_version_id") REFERENCES "policy_versions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_decisions" ADD CONSTRAINT "approval_decisions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_decisions" ADD CONSTRAINT "approval_decisions_tenant_id_approval_request_id_fkey" FOREIGN KEY ("tenant_id", "approval_request_id") REFERENCES "approval_requests"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_decisions" ADD CONSTRAINT "approval_decisions_tenant_id_decided_by_membership_id_fkey" FOREIGN KEY ("tenant_id", "decided_by_membership_id") REFERENCES "tenant_memberships"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_jobs" ADD CONSTRAINT "automation_jobs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_jobs" ADD CONSTRAINT "automation_jobs_tenant_id_policy_version_id_fkey" FOREIGN KEY ("tenant_id", "policy_version_id") REFERENCES "policy_versions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_jobs" ADD CONSTRAINT "automation_jobs_tenant_id_trigger_event_id_fkey" FOREIGN KEY ("tenant_id", "trigger_event_id") REFERENCES "outbox_events"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_jobs" ADD CONSTRAINT "automation_jobs_tenant_id_actor_membership_id_fkey" FOREIGN KEY ("tenant_id", "actor_membership_id") REFERENCES "tenant_memberships"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_attempts" ADD CONSTRAINT "job_attempts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_attempts" ADD CONSTRAINT "job_attempts_tenant_id_job_id_fkey" FOREIGN KEY ("tenant_id", "job_id") REFERENCES "automation_jobs"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_recipient_membership_id_fkey" FOREIGN KEY ("tenant_id", "recipient_membership_id") REFERENCES "tenant_memberships"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_outbox_event_id_fkey" FOREIGN KEY ("tenant_id", "outbox_event_id") REFERENCES "outbox_events"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_actor_membership_id_fkey" FOREIGN KEY ("tenant_id", "actor_membership_id") REFERENCES "tenant_memberships"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_policy_version_id_fkey" FOREIGN KEY ("tenant_id", "policy_version_id") REFERENCES "policy_versions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

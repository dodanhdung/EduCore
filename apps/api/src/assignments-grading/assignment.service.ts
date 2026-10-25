import { AuthService } from '../identity-access/auth.service.js';
import { RuntimeService } from '../workflow-approval/runtime.service.js';

/** R4 owns the authenticated transaction; the restricted SQL commands recheck
 * current permission and resource lineage after the User/Tenant locks. */
export class AssignmentService extends RuntimeService {
  constructor(auth: AuthService) {
    super(auth);
  }
  command(token: string, tenant: string, body: Record<string, unknown>) {
    return this.run(
      token,
      'SELECT educore_r5.assignment($1::uuid,$2::jsonb) result',
      tenant,
      JSON.stringify(body),
    );
  }
  list(token: string, tenant: string, query: Record<string, unknown>) {
    return this.run<{ items: unknown[] }>(
      token,
      'SELECT educore_r5.assignments($1::uuid,$2::jsonb) result',
      tenant,
      JSON.stringify(query),
    );
  }
  recipients(token: string, tenant: string, id: string) {
    return this.run(
      token,
      'SELECT educore_r5.recipients($1::uuid,$2::uuid) result',
      tenant,
      id,
    );
  }
  teacherClasses(token: string, tenant: string) {
    return this.run(token, 'SELECT educore_r5.teacher_classes($1::uuid) result', tenant);
  }
  teacherAssignments(token: string, tenant: string) {
    return this.run(token, 'SELECT educore_r5.teacher_assignments($1::uuid) result', tenant);
  }
  teacherRecipients(token: string, tenant: string, id: string) {
    return this.run(token, 'SELECT educore_r5.teacher_recipients($1::uuid,$2::uuid) result', tenant, id);
  }
  myAssignments(token: string, tenant: string) {
    return this.run(token, 'SELECT educore_r5.my_assignments($1::uuid) result', tenant);
  }
  changeRecipient(
    token: string,
    tenant: string,
    body: Record<string, unknown>,
  ) {
    return this.run(
      token,
      'SELECT educore_r5.recipient_change($1::uuid,$2::jsonb) result',
      tenant,
      JSON.stringify(body),
    );
  }
}

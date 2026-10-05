import supabase from '../config/supabase.js';
import { ApiError } from '../utils/ApiError.js';

/** Platform statistics + moderation actions. Admin only (enforced in routes). */
export async function getStats() {
  const count = async (table, apply) => {
    const q = supabase.from(table).select('id', { count: 'exact', head: true });
    const { count: c, error } = apply ? await apply(q) : await q;
    if (error) throw ApiError.internal(error.message);
    return c || 0;
  };

  const [users, employers, seekers, admins, companies, jobs, activeJobs, applications, openReports, pendingCompanies] =
    await Promise.all([
      count('profiles'),
      count('profiles', (q) => q.eq('role', 'employer')),
      count('profiles', (q) => q.eq('role', 'seeker')),
      count('profiles', (q) => q.eq('role', 'admin')),
      count('companies'),
      count('jobs'),
      count('jobs', (q) => q.eq('status', 'active')),
      count('applications'),
      count('job_reports', (q) => q.eq('status', 'open')),
      count('companies', (q) => q.eq('status', 'pending')),
    ]);

  const { data: byStatus } = await supabase.from('applications').select('status');
  const statusBreakdown = (byStatus || []).reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});

  return {
    users: { total: users, employers, seekers, admins },
    companies: { total: companies, pendingApproval: pendingCompanies },
    jobs: { total: jobs, active: activeJobs },
    applications: { total: applications, byStatus: statusBreakdown },
    reports: { open: openReports },
  };
}

export async function listUsers({ role, search, limit = 50 }) {
  let q = supabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(limit);
  if (role) q = q.eq('role', role);
  if (search) q = q.ilike('full_name', `%${String(search).replace(/[,()%_]/g, ' ')}%`);
  const { data, error } = await q;
  if (error) throw ApiError.internal(error.message);
  return (data || []).map((u) => ({
    id: u.id, fullName: u.full_name, role: u.role, phone: u.phone,
    isActive: u.is_active !== false, emailVerified: u.email_verified === true,
    createdAt: u.created_at,
  }));
}

export async function setUserActive(userId, isActive) {
  const { data, error } = await supabase
    .from('profiles').update({ is_active: !!isActive, updated_at: new Date().toISOString() })
    .eq('id', userId).select('id, full_name, is_active').single();
  if (error) throw ApiError.internal(error.message);
  return { id: data.id, fullName: data.full_name, isActive: data.is_active !== false };
}

export async function listJobs({ status, limit = 50 }) {
  let q = supabase
    .from('jobs')
    .select('id, title, company, status, created_at, employer_id, employer:profiles!jobs_employer_id_fkey(full_name)')
    .order('created_at', { ascending: false }).limit(limit);
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw ApiError.internal(error.message);
  return (data || []).map((j) => ({
    id: j.id, title: j.title, company: j.company, status: j.status,
    createdAt: j.created_at, employerName: j.employer?.full_name,
  }));
}

export async function adminDeleteJob(jobId) {
  const { error } = await supabase.from('jobs').delete().eq('id', jobId);
  if (error) throw ApiError.internal(error.message);
  return { message: 'Job removed.' };
}

export async function setCompanyStatus(companyId, status) {
  if (!['pending', 'approved', 'rejected'].includes(status))
    throw ApiError.badRequest('Invalid company status.');
  const { data, error } = await supabase
    .from('companies').update({ status, updated_at: new Date().toISOString() })
    .eq('id', companyId).select('id, name, status').single();
  if (error) throw ApiError.internal(error.message);
  return data;
}

/**
 * List companies for the admin approvals queue.
 *
 * WHY THIS EXISTS: `setCompanyStatus` could change a company's status but
 * there was no way to SEE which companies were pending, so the feature was
 * unreachable. An endpoint nobody can call is not a feature.
 */
export async function listCompanies({ status, search, limit = 50 } = {}) {
  let q = supabase
    .from('companies')
    .select('id, name, industry, size, location, status, is_verified, created_at, owner:profiles!companies_owner_id_fkey(full_name)')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (status) q = q.eq('status', status);
  if (search) q = q.ilike('name', `%${String(search).replace(/[,()%_]/g, ' ')}%`);

  const { data, error } = await q;
  if (error) throw ApiError.internal(error.message);

  return (data || []).map((c) => ({
    id: c.id,
    name: c.name,
    industry: c.industry,
    size: c.size,
    location: c.location,
    status: c.status,
    isVerified: c.is_verified === true,
    createdAt: c.created_at,
    ownerName: c.owner?.full_name,
  }));
}

export async function listReports({ status = 'open' } = {}) {
  const { data, error } = await supabase
    .from('job_reports')
    .select('*, job:jobs(id, title, company), reporter:profiles!job_reports_reporter_id_fkey(full_name)')
    .eq('status', status)
    .order('created_at', { ascending: false }).limit(100);
  if (error) throw ApiError.internal(error.message);
  return (data || []).map((r) => ({
    id: r.id,
    reason: r.reason,
    details: r.details,
    status: r.status,
    createdAt: r.created_at,
    job: r.job ? { id: r.job.id, title: r.job.title, company: r.job.company } : null,
    reporterName: r.reporter?.full_name,
  }));
}

export async function resolveReport(reportId, status) {
  if (!['open', 'reviewing', 'resolved', 'dismissed'].includes(status))
    throw ApiError.badRequest('Invalid report status.');
  const { data, error } = await supabase
    .from('job_reports').update({ status }).eq('id', reportId).select('id, status').single();
  if (error) throw ApiError.internal(error.message);
  return data;
}
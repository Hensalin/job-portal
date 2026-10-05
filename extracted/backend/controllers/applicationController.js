import supabase from '../config/supabase.js';
import { getJob } from '../services/jobService.js';

export async function apply(req, res) {
  const { jobId, coverLetter } = req.body;
  if (!jobId) return res.status(400).json({ error: 'jobId is required.' });

  const job = await getJob(jobId);
  if (!job) return res.status(404).json({ error: 'Job not found.' });

  const { data, error } = await supabase
    .from('applications')
    .insert({ job_id: jobId, applicant_id: req.user.id, cover_letter: coverLetter || null })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'You already applied to this job.' });
    return res.status(400).json({ error: error.message });
  }
  res.status(201).json(data);
}

export async function myApplications(req, res) {
  const { data, error } = await supabase
    .from('applications')
    .select('*, jobs(title, company, location)')
    .eq('applicant_id', req.user.id)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
}

export async function jobApplications(req, res) {
  const job = await getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found.' });
  if (job.employer_id !== req.user.id) return res.status(403).json({ error: 'Not your job.' });

  const { data, error } = await supabase
    .from('applications')
    .select('*, profiles(full_name)')
    .eq('job_id', job.id)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
}

export async function updateStatus(req, res) {
  const { status } = req.body;
  if (!['pending', 'accepted', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Status must be pending, accepted or rejected.' });
  }
  const { data: app } = await supabase
    .from('applications')
    .select('id, jobs(employer_id)')
    .eq('id', req.params.id)
    .single();
  if (!app) return res.status(404).json({ error: 'Application not found.' });
  if (app.jobs.employer_id !== req.user.id) return res.status(403).json({ error: 'Not your job.' });

  const { data, error } = await supabase
    .from('applications')
    .update({ status })
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
}

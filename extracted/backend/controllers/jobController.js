import * as jobService from '../services/jobService.js';

const REQUIRED = ['title', 'company', 'location', 'description'];

export async function getJobs(req, res) {
  try {
    res.json(await jobService.listJobs(req.query));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function getJobById(req, res) {
  const job = await jobService.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found.' });
  res.json(job);
}

export async function getMyJobs(req, res) {
  try {
    res.json(await jobService.listJobsByEmployer(req.user.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function createJob(req, res) {
  const missing = REQUIRED.filter((f) => !req.body[f]);
  if (missing.length) return res.status(400).json({ error: `Missing: ${missing.join(', ')}` });
  try {
    res.status(201).json(await jobService.createJob(req.user.id, req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

async function ownJob(req, res) {
  const job = await jobService.getJob(req.params.id);
  if (!job) {
    res.status(404).json({ error: 'Job not found.' });
    return null;
  }
  if (job.employer_id !== req.user.id) {
    res.status(403).json({ error: 'You can only change your own jobs.' });
    return null;
  }
  return job;
}

export async function updateJob(req, res) {
  if (!(await ownJob(req, res))) return;
  try {
    res.json(await jobService.updateJob(req.params.id, req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function deleteJob(req, res) {
  if (!(await ownJob(req, res))) return;
  try {
    await jobService.deleteJob(req.params.id);
    res.json({ message: 'Job deleted.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

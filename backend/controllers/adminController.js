import * as alertService from '../services/alertService.js';
import * as adminService from '../services/adminService.js';
import { ApiError } from '../utils/ApiError.js';

// ---------------------------------------------------------------- alerts

export async function listAlerts(req, res, next) {
  try { res.json({ alerts: await alertService.listAlerts(req.user.id) }); }
  catch (e) { next(e); }
}

export async function createAlert(req, res, next) {
  try { res.status(201).json({ alert: await alertService.createAlert(req.user.id, req.body) }); }
  catch (e) { next(e); }
}

export async function updateAlert(req, res, next) {
  try { res.json({ alert: await alertService.updateAlert(req.user.id, req.params.id, req.body) }); }
  catch (e) { next(e); }
}

export async function deleteAlert(req, res, next) {
  try { res.json(await alertService.deleteAlert(req.user.id, req.params.id)); }
  catch (e) { next(e); }
}

export async function runAlert(req, res, next) {
  try {
    const alerts = await alertService.listAlerts(req.user.id);
    const alert = alerts.find((a) => a.id === req.params.id);
    if (!alert) throw ApiError.notFound('Alert not found.');
    res.json(await alertService.runAlert(alert, req.user.id));
  } catch (e) { next(e); }
}

// ---------------------------------------------------------------- admin

export async function stats(_req, res, next) {
  try { res.json(await adminService.getStats()); }
  catch (e) { next(e); }
}

export async function users(req, res, next) {
  try { res.json({ users: await adminService.listUsers(req.query) }); }
  catch (e) { next(e); }
}

export async function setUserActive(req, res, next) {
  try {
    if (req.params.id === req.user.id) throw ApiError.badRequest('You cannot suspend your own account.');
    res.json({ user: await adminService.setUserActive(req.params.id, req.body.isActive) });
  } catch (e) { next(e); }
}

export async function jobs(req, res, next) {
  try { res.json({ jobs: await adminService.listJobs(req.query) }); }
  catch (e) { next(e); }
}

export async function deleteJob(req, res, next) {
  try { res.json(await adminService.adminDeleteJob(req.params.id)); }
  catch (e) { next(e); }
}

export async function companies(req, res, next) {
  try { res.json({ companies: await adminService.listCompanies(req.query) }); }
  catch (e) { next(e); }
}

export async function setCompanyStatus(req, res, next) {
  try { res.json({ company: await adminService.setCompanyStatus(req.params.id, req.body.status) }); }
  catch (e) { next(e); }
}

export async function reports(req, res, next) {
  try { res.json({ reports: await adminService.listReports(req.query) }); }
  catch (e) { next(e); }
}

export async function resolveReport(req, res, next) {
  try { res.json({ report: await adminService.resolveReport(req.params.id, req.body.status) }); }
  catch (e) { next(e); }
}
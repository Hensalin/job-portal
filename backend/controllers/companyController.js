import * as companyService from '../services/companyService.js';
import { ApiError } from '../utils/ApiError.js';
import * as resumeService from '../services/resumeService.js';

export async function getMine(req, res, next) {
  try {
    res.json({ company: await companyService.getCompanyByOwner(req.user.id) });
  } catch (e) { next(e); }
}

/** POST /api/company  (upsert - one company per employer) */
export async function upsert(req, res, next) {
  try {
    res.status(200).json({ company: await companyService.upsertCompany(req.user.id, req.body) });
  } catch (e) { next(e); }
}

export async function getPublic(req, res, next) {
  try {
    res.json(await companyService.getCompanyPublic(req.params.id));
  } catch (e) { next(e); }
}

export async function listResumes(req, res, next) {
  try { res.json({ resumes: await resumeService.listResumes(req.user.id) }); }
  catch (e) { next(e); }
}

export async function addResume(req, res, next) {
  try {
    if (!req.file) throw ApiError.badRequest('No file was uploaded.');
    res.status(201).json({ resume: await resumeService.addResume({ profileId: req.user.id, file: req.file }) });
  } catch (e) { next(e); }
}

export async function deleteResume(req, res, next) {
  try { res.json(await resumeService.deleteResume({ profileId: req.user.id, id: req.params.id })); }
  catch (e) { next(e); }
}

export async function defaultResume(req, res, next) {
  try { res.json(await resumeService.setDefaultResume({ profileId: req.user.id, id: req.params.id })); }
  catch (e) { next(e); }
}
import * as profileService from '../services/profileService.js';
import { ApiError } from '../utils/ApiError.js';

/** GET /api/profile - the signed-in user's own full profile. */
export async function getMe(req, res, next) {
  try {
    const profile = await profileService.getProfile(req.user.id);
    // email lives in auth.users, so merge it in from the token
    res.json({ ...profile, email: req.user.email, role: req.user.role });
  } catch (e) { next(e); }
}

/** PATCH /api/profile */
export async function updateMe(req, res, next) {
  try {
    const profile = await profileService.updateProfile(req.user.id, req.body);
    res.json({ ...profile, email: req.user.email, role: req.user.role });
  } catch (e) { next(e); }
}

/** GET /api/profile/:id - public view for employers. */
export async function getPublic(req, res, next) {
  try {
    res.json(await profileService.getPublicProfile(req.params.id));
  } catch (e) { next(e); }
}

/** Generic CRUD for education / experience / certifications. */
function childHandlers(kind) {
  return {
    list: async (req, res, next) => {
      try { res.json(await profileService.listChildren(req.user.id, kind)); }
      catch (e) { next(e); }
    },
    create: async (req, res, next) => {
      try { res.status(201).json(await profileService.addChild(req.user.id, kind, req.body)); }
      catch (e) { next(e); }
    },
    update: async (req, res, next) => {
      try { res.json(await profileService.updateChild(req.user.id, kind, req.params.id, req.body)); }
      catch (e) { next(e); }
    },
    remove: async (req, res, next) => {
      try { res.json(await profileService.deleteChild(req.user.id, kind, req.params.id)); }
      catch (e) { next(e); }
    },
  };
}

export const education = childHandlers('education');
export const experience = childHandlers('experience');
export const certifications = childHandlers('certifications');
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Blocks non-admin users from mutating requests (priest remains read-only). */
export function requireAdminForMutations(req, res, next) {
  if (!MUTATING.has(req.method)) return next();
  if (req.user?.role === 'admin') return next();
  return res.status(403).json({ message: 'Admin access required.' });
}

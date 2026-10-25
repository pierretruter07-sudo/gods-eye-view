/**
 * Role-based access control (RBAC) for God's Eye View API.
 * Deny by default: callers must explicitly pass a permission check.
 *
 * Role hierarchy (higher index inherits all permissions below):
 *   guest < user < operator < admin
 */

const ROLE_RANK = Object.freeze({
  guest: 0,
  user: 1,
  operator: 2,
  admin: 3,
});

/**
 * Map of permission names to the minimum role required to hold them.
 * Add entries here as new protected actions are introduced.
 */
const PERMISSION_MAP = Object.freeze({
  'api:read': 'user',
  'api:write': 'operator',
  'api:admin': 'admin',
  'cctv:view': 'user',
  'flights:view': 'user',
  'vessels:view': 'user',
  'military:view': 'operator',
  'military:admin': 'admin',
});

/**
 * Returns the numeric rank of a role, or -1 for unknown roles (deny by default).
 * @param {string} role
 * @returns {number}
 */
function rankOf(role) {
  return ROLE_RANK[role] ?? -1;
}

/**
 * Returns true when the payload's role meets or exceeds the required role.
 * @param {{ role?: string }} payload - JWT payload or user object.
 * @param {string} requiredRole
 * @returns {boolean}
 */
function hasRole(payload, requiredRole) {
  return rankOf(payload?.role) >= rankOf(requiredRole);
}

/**
 * Returns true when the payload's role grants the named permission.
 * @param {{ role?: string }} payload
 * @param {string} permission
 * @returns {boolean}
 */
function hasPermission(payload, permission) {
  const minRole = PERMISSION_MAP[permission];
  if (!minRole) return false; // unknown permission → deny
  return hasRole(payload, minRole);
}

/**
 * Asserts the payload's role meets or exceeds `requiredRole`.
 * Throws a 403-style Error when the check fails.
 * @param {{ role?: string }} payload
 * @param {string} requiredRole
 */
function requireRole(payload, requiredRole) {
  if (!hasRole(payload, requiredRole)) {
    throw Object.assign(
      new Error(`Forbidden: requires role '${requiredRole}'`),
      { status: 403 },
    );
  }
}

/**
 * Asserts the payload holds the named permission.
 * Throws a 403-style Error when the check fails.
 * @param {{ role?: string }} payload
 * @param {string} permission
 */
function requirePermission(payload, permission) {
  if (!hasPermission(payload, permission)) {
    throw Object.assign(
      new Error(`Forbidden: requires permission '${permission}'`),
      { status: 403 },
    );
  }
}

export { hasRole, hasPermission, requireRole, requirePermission, PERMISSION_MAP };

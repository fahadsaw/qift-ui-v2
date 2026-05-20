// RBAC catalog — code-only foundation for the unified W1 permission
// system.
//
// THIS MODULE IS UNWIRED.
// Nothing in here is consumed by production guards yet. Existing
// authorization continues to flow through the coarse `user.role`
// field and the legacy presentation catalog in lib/opsRoles.ts. A
// later PR will introduce `hasPermission(user, perm)` on top of the
// constants exported here and migrate guards endpoint-by-endpoint
// behind a kill-switch flag.
//
// PURPOSE OF THIS PR
// Lay down the catalog so the target shape is reviewable and
// referenceable, without changing any current behaviour.
//
// LAYOUT
// - lib/rbac/permissions.ts  — every named Permission, grouped by
//                              domain
// - lib/rbac/roles.ts        — every named Role (legacy + QIFT +
//                              merchant + user), plus the
//                              backward-compat bridge legacyRoleFor()
// - lib/rbac/roleMap.ts      — Record<Role, readonly Permission[]>
//                              with helpers
//
// RELATIONSHIP TO lib/opsRoles.ts
// lib/opsRoles.ts is the existing presentation-only catalog mirroring
// the backend ops-roles service. Its role names + permission strings
// are a subset of what's exported here. A follow-up PR will refactor
// lib/opsRoles.ts to re-export from this module so there is one
// catalog rather than two.

export {
  ADMIN_PERMISSIONS,
  FINANCE_PERMISSIONS,
  REVIEW_PERMISSIONS,
  AUDIT_PERMISSIONS,
  FLAG_PERMISSIONS,
  MERCHANT_PERMISSIONS,
  MERCHANT_FINANCE_PERMISSIONS,
  USER_PERMISSIONS,
  PERMISSIONS,
  isPermission,
  type Permission,
  type AdminPermission,
  type FinancePermission,
  type ReviewPermission,
  type AuditPermission,
  type FlagPermission,
  type MerchantPermission,
  type MerchantFinancePermission,
  type UserPermission,
} from './permissions'

export {
  LEGACY_ROLES,
  QIFT_ROLES,
  MERCHANT_ROLES,
  USER_ROLES,
  ROLES,
  isRole,
  legacyRoleFor,
  type Role,
  type LegacyRole,
  type QiftRole,
  type MerchantRole,
  type UserRole,
} from './roles'

export {
  ROLE_PERMISSIONS,
  permissionsForRoles,
  roleHasPermission,
  rolesWithPermission,
} from './roleMap'

export {
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  permissionsForUser,
  type UserLike,
} from './hasPermission'

export { arePermissionChecksEnabled } from './permissionChecksFlag'

// tenantManager.ts — 多租户SaaS架构
// userId → tenantId映射，每个租户独立资源配额

export interface Tenant {
  tenantId: string;
  name: string;
  type: "personal" | "enterprise";
  tier: "free" | "pro" | "vip";
  maxUsers: number;
  userQuota: {
    llmPerDay: number;
    ttsPerDay: number;
    avatarPerDay: number;
    maxCostPerDay: number;  // 分
  };
  usedThisMonth: number;    // 分
  monthlyBudget: number;    // 分
  createdAt: number;
  active: boolean;
}

// ─── 内存存储 ───────────────────────────────────────────────
const tenants = new Map<string, Tenant>();
const userTenantMap = new Map<string, string>(); // userId → tenantId

// ─── 注册租户 ───────────────────────────────────────────────
export function registerTenant(tenant: Tenant): void {
  tenants.set(tenant.tenantId, tenant);
}

// ─── 绑定用户到租户 ─────────────────────────────────────────
export function bindUserToTenant(userId: string, tenantId: string): void {
  if (!tenants.has(tenantId)) {
    throw new Error("Tenant not found: " + tenantId);
  }
  userTenantMap.set(userId, tenantId);
}

// ─── 获取用户所属租户 ───────────────────────────────────────
export function getUserTenant(userId: string): Tenant | null {
  const tenantId = userTenantMap.get(userId);
  if (!tenantId) {
    // 无租户 = 默认个人免费租户
    return getOrCreateDefaultTenant(userId);
  }
  return tenants.get(tenantId) || null;
}

// ─── 默认个人租户 ───────────────────────────────────────────
function getOrCreateDefaultTenant(userId: string): Tenant {
  const tenantId = "personal:" + userId;
  const existing = tenants.get(tenantId);
  if (existing) return existing;

  const tenant: Tenant = {
    tenantId,
    name: userId,
    type: "personal",
    tier: "free",
    maxUsers: 1,
    userQuota: {
      llmPerDay: 20,
      ttsPerDay: 10,
      avatarPerDay: 0,
      maxCostPerDay: 100,
    },
    usedThisMonth: 0,
    monthlyBudget: 100,
    createdAt: Date.now(),
    active: true,
  };
  tenants.set(tenantId, tenant);
  userTenantMap.set(userId, tenantId);
  return tenant;
}

// ─── 检查租户预算 ───────────────────────────────────────────
export function checkTenantBudget(tenantId: string): {
  allowed: boolean;
  remaining: number;
  usedPercent: number;
} {
  const tenant = tenants.get(tenantId);
  if (!tenant || !tenant.active) {
    return { allowed: false, remaining: 0, usedPercent: 100 };
  }

  const usedPercent = tenant.monthlyBudget > 0
    ? (tenant.usedThisMonth / tenant.monthlyBudget) * 100
    : 0;

  return {
    allowed: tenant.usedThisMonth < tenant.monthlyBudget,
    remaining: tenant.monthlyBudget - tenant.usedThisMonth,
    usedPercent,
  };
}

// ─── 记录租户消费 ───────────────────────────────────────────
export function recordTenantCost(tenantId: string, costCents: number): void {
  const tenant = tenants.get(tenantId);
  if (tenant) {
    tenant.usedThisMonth += costCents;
  }
}

// ─── 统计 ───────────────────────────────────────────────────
export function getTenantStats(): {
  total: number;
  active: number;
  enterprise: number;
} {
  let active = 0;
  let enterprise = 0;
  for (const t of tenants.values()) {
    if (t.active) active++;
    if (t.type === "enterprise") enterprise++;
  }
  return { total: tenants.size, active, enterprise };
}

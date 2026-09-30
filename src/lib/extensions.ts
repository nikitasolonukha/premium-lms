/** Integration boundaries only; no unfinished capability is advertised in the UI. */
export type AccessGrantSource = 'manual' | 'purchase' | 'subscription' | 'organization';
export type AccessDecision =
  | { allowed: true }
  | {
      allowed: false;
      reason: 'not-enrolled' | 'unpublished' | 'sequential' | 'scheduled';
      opensAt?: string;
    };
export interface AvailabilityExtension {
  evaluate(input: {
    userId: string;
    courseId: string;
    lessonId: string;
    publishedAt: string;
    now: string;
  }): Promise<AccessDecision>;
}
export interface BillingEntitlementEvent {
  provider: string;
  eventId: string;
  userId: string;
  courseId: string;
  source: 'purchase' | 'subscription';
  active: boolean;
  expiresAt?: string;
}
export interface BillingWebhookAdapter {
  /** Verify the raw body first; persist eventId with a unique constraint before granting access. */
  verifyAndDecode(
    rawBody: Uint8Array,
    headers: Readonly<Record<string, string>>,
  ): Promise<BillingEntitlementEvent>;
}
export interface IdentityProviderAdapter {
  /** Bind an external identity to Supabase Auth; never accept roles from user-controlled metadata. */
  provider: string;
  authorize(callbackUrl: string): Promise<{ url: string; state: string }>;
}
export interface LearningExtension {
  kind: 'assignment' | 'exam' | 'certificate' | 'community';
  /** Each implementation requires its own persistence, access policies and release QA. */
  courseId: string;
  lessonId?: string;
  schemaVersion: number;
}
export const implementedOptionalCapabilities = {
  payments: false,
  subscriptions: false,
  organizations: false,
  community: false,
  assignments: false,
  exams: false,
  certificates: false,
  sso: false,
  drm: false,
  mux: false,
  cloudflareStream: false,
} as const;

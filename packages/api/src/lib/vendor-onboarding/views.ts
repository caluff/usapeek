import type { MedusaContainer } from "@medusajs/framework/types";
import type SellerModule from "@mercurjs/core/modules/seller";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { MercurModules } from "@mercurjs/types";
import { onboardingService, loadApplicant, requireReviewer, requireVendorAccess, type ApplicantIdentity } from "./access";
import { ApplicationViewSchema, ApplicationNotificationSchema, AdminApplicationEventSchema, type ApplicationResponse, type ApplicationView, type AdminApplicationResponse, type AdminApplicationListResponse, type SellerSummary, type SetupCheck, type VendorOnboardingResponse } from "./schemas";
import type { ApplicationRecord } from "../../modules/vendor-onboarding/service";
import { OnboardingError } from "./errors";
import { isTestEmailVerificationEnabled } from "./verification";

const iso = (date: Date | string | null | undefined) => date ? new Date(date).toISOString() : null;
export async function unreadCount(container: MedusaContainer, customerId: string) {
  const [, count] = await onboardingService(container).listAndCountVendorApplicationEvents({ customer_id: customerId, read_at: null }, { take: 1 });
  return count;
}
export async function applicationView(container: MedusaContainer, app: ApplicationRecord, verified = false): Promise<ApplicationView> {
  const native = container.resolve<InstanceType<typeof SellerModule.service>>(MercurModules.SELLER);
  let seller: Awaited<ReturnType<typeof native.listSellers>>[number] | null = null;
  let access = false;
  if (app.member_id && app.seller_id && app.status === "approved") {
    try { seller = (await requireVendorAccess(container, app.member_id, app.seller_id)).seller; access = true; }
    catch (error) { if (!(error instanceof OnboardingError)) throw error; }
  }
  if (!seller && app.seller_id) seller = (await native.listSellers({ id: app.seller_id }))[0] ?? null;
  const editable = ["draft", "changes_requested"].includes(app.status) && app.approval_state !== "processing";
  return ApplicationViewSchema.parse({ id: app.id, status: app.status, version: app.version, current_step: app.current_step, data: app.data, submitted_data: app.submitted_data, submission_revision: app.submission_revision, submitted_at: iso(app.submitted_at), reviewed_at: iso(app.reviewed_at), created_at: iso(app.created_at), updated_at: iso(app.updated_at), review: app.review, approval_state: app.approval_state, seller: seller ? { id: seller.id, name: seller.name, handle: seller.handle, status: seller.status, currency_code: seller.currency_code } : null, can_edit: editable, can_submit: editable && verified, can_access_vendor: access });
}
export async function applicantResponse(container: MedusaContainer, input: ApplicantIdentity): Promise<ApplicationResponse> {
  const live = await loadApplicant(container, input);
  const [applications, unread_count] = await Promise.all([
    onboardingService(container).listVendorApplications({ customer_id: input.customer_id }),
    unreadCount(container, input.customer_id),
  ]);
  const app = applications[0];
  if (app && app.auth_identity_id !== input.auth_identity_id) throw new OnboardingError("identity_changed");
  const application = app ? await applicationView(container, app, live.emailVerified) : null;
  let existingAccess = Boolean(application?.can_access_vendor && live.memberships.some(membership => membership.member_id === app?.member_id && membership.seller_id === app?.seller_id));
  for (const membership of live.memberships) {
    if (existingAccess) break;
    // applicationView just checked this same membership; do not repeat a denial.
    if (app?.status === "approved" && membership.member_id === app.member_id && membership.seller_id === app.seller_id) continue;
    try { await requireVendorAccess(container, membership.member_id, membership.seller_id); existingAccess = true; break; }
    catch (error) { if (!(error instanceof OnboardingError)) throw error; }
  }
  return { application, applicant: { email: live.email, email_verified: live.emailVerified, existing_vendor_access: existingAccess, email_verification_test_mode: isTestEmailVerificationEnabled() }, unread_count };
}
export async function notificationsResponse(container: MedusaContainer, input: ApplicantIdentity, pagination: { limit: number; offset: number }) {
  await loadApplicant(container, input);
  const [[events, count], unread_count] = await Promise.all([
    onboardingService(container).listAndCountVendorApplicationEvents({ customer_id: input.customer_id }, { take: pagination.limit, skip: pagination.offset, order: { created_at: "DESC", id: "DESC" } }),
    unreadCount(container, input.customer_id),
  ]);
  return { notifications: events.map(event => ApplicationNotificationSchema.parse({ id: event.id, type: event.type, reason: event.reason, created_at: iso(event.created_at), read_at: iso(event.read_at) })), count, ...pagination, unread_count };
}
export async function adminApplicationResponse(container: MedusaContainer, userId: string, id: string): Promise<AdminApplicationResponse> {
  await requireReviewer(container, userId, "read");
  const service = onboardingService(container);
  const app = (await service.listVendorApplications({ id }))[0];
  if (!app) throw new OnboardingError("application_not_found", 404);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const [{ data: customers }, history, view] = await Promise.all([
    query.graph({ entity: "customer", fields: ["id", "email", "first_name", "last_name"], filters: { id: app.customer_id } }, { cache: { enable: false } }),
    service.listVendorApplicationEvents({ application_id: id }, { take: 1000, order: { created_at: "DESC", id: "DESC" } }),
    applicationView(container, app),
  ]);
  const customer = customers[0];
  if (!customer?.email) throw new OnboardingError("identity_changed");
  return { application: { ...view, customer: { id: customer.id, email: customer.email, first_name: customer.first_name, last_name: customer.last_name }, history: history.map(event => AdminApplicationEventSchema.parse({ id: event.id, type: event.type, reason: event.reason, created_at: iso(event.created_at), read_at: iso(event.read_at), reviewer_id: event.reviewer_id, submission_revision: event.submission_revision, submitted_data: event.submitted_data })), approval_error_code: app.approval_error_code } };
}
export async function adminApplicationList(container: MedusaContainer, userId: string, input: { status: ApplicationRecord["status"]; limit: number; offset: number; q?: string }): Promise<AdminApplicationListResponse> {
  await requireReviewer(container, userId, "read");
  const [apps, count] = await onboardingService(container).listApplicationQueue(input);
  if (!apps.length) return { applications: [], count, limit: input.limit, offset: input.offset };
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data: customers } = await query.graph({ entity: "customer", fields: ["id", "email", "first_name", "last_name"], filters: { id: apps.map(app => app.customer_id) } }, { cache: { enable: false } });
  const applications = apps.map(app => {
    const customer = customers.find(customer => customer.id === app.customer_id);
    if (!customer?.email) throw new OnboardingError("identity_changed");
    const data = ApplicationViewSchema.shape.data.parse(app.submitted_data || app.data);
    return { id: app.id, status: app.status, version: app.version, approval_state: app.approval_state, submitted_at: iso(app.submitted_at), reviewed_at: iso(app.reviewed_at), created_at: iso(app.created_at)!, updated_at: iso(app.updated_at)!, customer: { id: customer.id, email: customer.email, first_name: customer.first_name, last_name: customer.last_name }, store_name: data.store.name, business_type: data.activity.business_type };
  });
  return { applications, count, limit: input.limit, offset: input.offset };
}
export async function vendorOnboardingResponse(container: MedusaContainer, memberId: string, sellerId: string): Promise<VendorOnboardingResponse> {
  const { seller } = await requireVendorAccess(container, memberId, sellerId);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const [locations, products, offers] = await Promise.all([
    query.graph({ entity: "stock_location_seller", fields: ["stock_location_id"], filters: { seller_id: sellerId } }, { cache: { enable: false } }),
    query.graph({ entity: "product_change_action", fields: ["product_id"], filters: { action: "PRODUCT_ADD", product_change: { created_by: sellerId } } }, { cache: { enable: false } }),
    query.graph({ entity: "offer", fields: ["id", "manage_inventory", "inventory_items.location_levels.location_id"], filters: { seller_id: sellerId } }, { cache: { enable: false } }),
  ]);
  const ownedProductIds = products.data.flatMap(action => action.product_id ? [action.product_id] : []);
  const ownedProducts = ownedProductIds.length ? await query.graph({ entity: "product", fields: ["id"], filters: { id: ownedProductIds }, pagination: { take: 1 } }, { cache: { enable: false } }) : { data: [] };
  const locationIds = new Set(locations.data.map(location => location.stock_location_id));
  const inventoryComplete = offers.data.some(offer => offer.manage_inventory === false || offer.inventory_items?.some(item => item?.location_levels?.some(level => level && locationIds.has(level.location_id))));
  const checks: SetupCheck[] = [
    { key: "profile", status: seller.name && seller.description ? "complete" : "incomplete", reason: null },
    { key: "location", status: locations.data.length ? "complete" : "incomplete", reason: null },
    { key: "first_product", status: ownedProducts.data.length || offers.data.length ? "complete" : "incomplete", reason: null },
    { key: "inventory", status: inventoryComplete ? "complete" : "incomplete", reason: inventoryComplete ? null : "inventory_not_configured" },
  ];
  return { seller: { id: seller.id, name: seller.name, handle: seller.handle, status: seller.status, currency_code: seller.currency_code } as SellerSummary, checks, completed_count: checks.filter(check => check.status === "complete").length, total_count: checks.length };
}

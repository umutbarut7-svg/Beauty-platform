# Main başlangıç envanteri

Temel: `20550365a19d090221108f3a7fbffe8190647bd3`. Dosya/API listesi; varlık uçtan uca kabul anlamına gelmez.

## HTTP controller kaynakları

### `apps/api/src/ai/agent.controller.ts`

- `@Controller("businesses/:businessId/ai/sessions")`
- `@Post() create(`
- `@Get(":sessionId") get(`
- `@Post(":sessionId/messages") message(`
- `@Post(":sessionId/confirm") confirm(`
- `@Post(":sessionId/reject") reject(`

### `apps/api/src/app.controller.ts`

- `@Controller()`
- `@Get("health")`

### `apps/api/src/appointments/appointments.controller.ts`

- `@Controller("businesses/:businessId")`
- `@Get("availability") availability(`
- `@Get("appointments") list(`
- `@Get("appointments/:appointmentId") get(`
- `@Post("appointments") create(`
- `@Patch("appointments/:appointmentId") update(`
- `@Post("appointments/:appointmentId/cancel") cancel(`
- `@Patch("appointments/:appointmentId/status") status(`
- `@Get("appointments/:appointmentId/status-history") history(`
- `@Controller("businesses/:businessId/staff/:memberId")`
- `@Get("working-hours") hours(`
- `@Put("working-hours") replaceHours(`
- `@Get("time-off") timeOff(`
- `@Post("time-off") addTimeOff(`
- `@Delete("time-off/:timeOffId") @HttpCode(204) deleteTimeOff(`
- `@Patch("time-off/:timeOffId") updateTimeOff(`

### `apps/api/src/auth/auth.controller.ts`

- `@Controller("auth")`
- `@Post("register")`
- `@Post("login")`
- `@Post("refresh")`
- `@Post("logout") logout(@Body() dto: LogoutDto) {`
- `@Get("me") me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {`

### `apps/api/src/automations/automations.controller.ts`

- `@Controller("businesses/:businessId/automations")`
- `@Get() list(`
- `@Post() create(`
- `@Get(":id") get(`
- `@Patch(":id") update(`
- `@Delete(":id") archive(`
- `@Post(":id/activate") activate(`
- `@Post(":id/pause") pause(`
- `@Get(":id/executions") executions(`
- `@Post("events/process") process(`

### `apps/api/src/beauty-dna/beauty-dna.controller.ts`

- `@Controller("businesses/:businessId/customers/:customerId/beauty-dna")`
- `@Get() get(`
- `@Get("history") history(`
- `@Put("traits") declare(`
- `@Delete("traits/:category/:traitType") deactivate(`
- `@Post("recalculate") recalculate(`
- `@Post("prediction-inference") predictionInference(`

### `apps/api/src/business-intelligence/business-intelligence.controller.ts`

- `@Controller("businesses/:businessId/intelligence")`
- `@Get() overview(`
- `@Get("metrics") metrics(`
- `@Get("insights") insights(`
- `@Get("opportunities") opportunities(`
- `@Get("risks") risks(`
- `@Get("recommendations") recommendations(`
- `@Post("recalculate") recalculate(`
- `@Get("experiments") experiments(`
- `@Post("experiments") create(`
- `@Post("experiments/:id/result") result(`
- `@Post("experiments/:id/:state") transition(`
- `@Get("benchmarks/:metric") benchmark(`
- `@Get("versions") versions(`

### `apps/api/src/businesses/businesses.controller.ts`

- `@Controller("businesses")`
- `@Post() create(`
- `@Get() list(@CurrentUser() user: AuthenticatedUser) {`
- `@Get(":businessId") get(`
- `@Patch(":businessId") update(`
- `@Controller("businesses/:businessId/locations")`
- `@Post() create(`
- `@Get() list(`
- `@Get(":locationId") get(`
- `@Patch(":locationId") update(`
- `@Delete(":locationId") @HttpCode(204) remove(`
- `@Controller("businesses/:businessId/staff")`
- `@Post() create(`
- `@Get() list(`
- `@Get(":staffId") get(`
- `@Patch(":staffId") update(`
- `@Delete(":staffId") @HttpCode(204) remove(`
- `@Post(":staffId/services/:serviceId") addService(`
- `@Delete(":staffId/services/:serviceId") @HttpCode(204) removeService(`
- `@Controller("businesses/:businessId/services")`
- `@Post() create(`
- `@Get() list(`
- `@Get(":serviceId") get(`
- `@Patch(":serviceId") update(`
- `@Delete(":serviceId") @HttpCode(204) remove(`

### `apps/api/src/businesses/catalog.controller.ts`

- `@Controller("businesses/:businessId/service-categories")`
- `@Post() create(`
- `@Get() list(`
- `@Get(":categoryId") get(`
- `@Patch(":categoryId") update(`
- `@Delete(":categoryId") @HttpCode(204) remove(`
- `@Controller("businesses/:businessId/services")`
- `@Post() create(`
- `@Get() list(`
- `@Get(":serviceId") get(`
- `@Patch(":serviceId") update(`
- `@Delete(":serviceId") @HttpCode(204) remove(`
- `@Controller("businesses/:businessId/staff/:memberId/services")`
- `@Post() assign(`
- `@Get() list(`
- `@Patch(":serviceId") update(`
- `@Delete(":serviceId") @HttpCode(204) remove(`

### `apps/api/src/businesses/salon-core.controller.ts`

- `@Controller("businesses/:businessId/members")`
- `@Get() list(`
- `@Get("me") me(`
- `@Post() add(`
- `@Patch(":memberId") update(`
- `@Delete(":memberId") @HttpCode(204) remove(`
- `@Controller("businesses/:businessId/branches")`
- `@Get() list(`
- `@Post() create(`
- `@Get(":branchId") get(`
- `@Patch(":branchId") update(`
- `@Controller("businesses/:businessId/settings")`
- `@Get() get(`
- `@Patch() update(`
- `@Controller("businesses/:businessId/working-hours")`
- `@Get() get(`
- `@Put() update(`

### `apps/api/src/categories/category.controller.ts`

- `@Controller("categories")`
- `@Get() registry() {`
- `@Controller("businesses/:businessId/category-configurations")`
- `@Get() list(`
- `@Put()`

### `apps/api/src/customers/customers.controller.ts`

- `@Controller("businesses/:businessId/customers")`
- `@Post() create(`
- `@Get() list(`
- `@Get(":customerId") detail(`
- `@Patch(":customerId") update(`
- `@Delete(":customerId") remove(`
- `@Get(":customerId/history") history(`
- `@Get(":customerId/summary") summary(`
- `@Get(":customerId/notes") notes(`
- `@Post(":customerId/notes") addNote(`
- `@Patch(":customerId/notes/:noteId") updateNote(`
- `@Delete(":customerId/notes/:noteId") deleteNote(`
- `@Post(":customerId/tags/:tagId") assignTag(`
- `@Delete(":customerId/tags/:tagId") removeTag(`
- `@Controller("businesses/:businessId/customer-tags")`
- `@Get() list(`
- `@Post() create(`
- `@Patch(":tagId") update(`
- `@Delete(":tagId") remove(`

### `apps/api/src/customers/segments/segments.controller.ts`

- `@Controller("businesses/:businessId/customer-segments")`
- `@Get() list(`
- `@Post() create(`
- `@Get(":segmentId") get(`
- `@Patch(":segmentId") update(`
- `@Delete(":segmentId") remove(`
- `@Post(":segmentId/customers/:customerId") add(`
- `@Delete(":segmentId/customers/:customerId") drop(`
- `@Get(":segmentId/customers") customers(`
- `@Controller("businesses/:businessId")`
- `@Get("customer-insights") insights(`
- `@Get("customers/:customerId/metrics") metrics(`

### `apps/api/src/discovery/discovery.controller.ts`

- `@Controller("discovery")`
- `@Get("search")`
- `@Get("businesses")`
- `@Get("services")`
- `@Get("professionals")`
- `@Post("match")`

### `apps/api/src/globalization/globalization.controller.ts`

- `@Controller("businesses/:businessId/globalization")`
- `@Get("context") context(`
- `@Put() configure(`

### `apps/api/src/governance/governance.controller.ts`

- `@Controller("businesses/:businessId/governance")`
- `@Post("policies") createPolicy(`
- `@Post("policy-versions/:versionId/transition") transitionPolicy(`
- `@Post("evaluate") evaluate(`
- `@Post("evaluations/:evaluationId/override") override(`
- `@Post("disputes") dispute(`
- `@Post("disputes/:disputeId/transition") disputeTransition(`
- `@Post("consents") consent(`
- `@Post("privacy-requests") privacy(`
- `@Post("privacy-requests/:requestId/transition") privacyTransition(`
- `@Post("enforcement-actions") enforcement(`
- `@Post("enforcement-actions/:actionId/transition") enforcementTransition(`

### `apps/api/src/growth/growth.controller.ts`

- `@Controller()`
- `@Get("growth/referrals/resolve/:code")`
- `@Get("businesses/:businessId/growth/programs")`
- `@Post("businesses/:businessId/growth/programs")`
- `@Post("businesses/:businessId/growth/codes")`
- `@Post("businesses/:businessId/growth/referrals")`
- `@Post("businesses/:businessId/growth/referrals/:referralId/transition")`
- `@Post("businesses/:businessId/growth/referrals/:referralId/rewards")`
- `@Post("businesses/:businessId/growth/rewards/:rewardId/reverse")`
- `@Post("businesses/:businessId/growth/experiments/:experimentId/assignment")`
- `@Post("businesses/:businessId/growth/attribution")`
- `@Post("businesses/:businessId/growth/challenges/:challengeId/progress")`

### `apps/api/src/infrastructure/health.controller.ts`

- `@Controller("health")`
- `@Get()`
- `@Get("ready")`

### `apps/api/src/marketplace-liquidity/marketplace-liquidity.controller.ts`

- `@Controller("businesses/:businessId/marketplace")`
- `@Get("liquidity") liquidity(`
- `@Get("demand") demand(`
- `@Get("supply") supply(`
- `@Get("capacity") capacity(`
- `@Get("supply-gaps") gaps(`
- `@Get("opportunities") opportunities(`
- `@Post("recalculate") recalculate(`

### `apps/api/src/monetization/monetization.controller.ts`

- `@Controller("businesses/:businessId/financial")`
- `@Get("plans") plans(`
- `@Get("subscription") subscription(`
- `@Post("subscriptions/:subscriptionId/transition") transition(`
- `@Post("usage") usage(`
- `@Post("refunds") refund(`
- `@Get("summary") summary(`
- `@Get("settlements") settlements(`
- `@Get("credits") credits(`
- `@Post("forecast") forecast(`

### `apps/api/src/notifications/communication.controller.ts`

- `@Controller("businesses/:businessId/push-devices")`
- `@Get() list(`
- `@Post() register(`
- `@Delete(":id") revoke(`
- `@Controller("businesses/:businessId/conversations")`
- `@Post() create(`
- `@Get() list(`
- `@Get(":id") detail(`
- `@Get(":id/messages") messages(`
- `@Post(":id/messages") send(`
- `@Post(":id/messages/:messageId/read") read(`

### `apps/api/src/notifications/notifications.controller.ts`

- `@Controller("businesses/:businessId/notification-templates")`
- `@Post() create(`
- `@Get() list(`
- `@Get(":id") get(`
- `@Patch(":id") update(`
- `@Delete(":id") archive(`
- `@Controller("businesses/:businessId/notifications")`
- `@Post() create(`
- `@Get() list(`
- `@Get("unread-count") unread(`
- `@Post("mark-all-read") markAll(`
- `@Post(":id/read") read(`
- `@Get(":id") get(`
- `@Post(":id/send") send(`
- `@Post(":id/cancel") cancel(`
- `@Post(":id/retry") retry(`
- `@Controller("businesses/:businessId/notification-preferences")`
- `@Get() get(`
- `@Put() set(`
- `@Controller("businesses/:businessId/notification-provider-configs")`
- `@Get()`
- `@Put()`

### `apps/api/src/predictions/predictions.controller.ts`

- `@Controller("businesses/:businessId/customers/:customerId/predictions")`
- `@Get() list(`
- `@Get(":idOrType") get(`
- `@Post("refresh") refresh(`
- `@Post(":predictionId/feedback") feedback(`
- `@Post(":predictionId/outcome") outcome(`
- `@Controller("businesses/:businessId/prediction-insights")`
- `@Get() get(`

### `apps/api/src/professional-intelligence/professional-intelligence.controller.ts`

- `@Controller("businesses/:businessId/professionals/:professionalId/intelligence")`
- `@Get() get(`
- `@Get("skills") skills(`
- `@Get("skills/:skillId/evidence") evidence(`
- `@Put("skills") declare(`
- `@Delete("skills/:category/:skillCode") deactivate(`
- `@Get("experience") experience(`
- `@Post("experience") addExperience(`
- `@Get("credentials") credentials(`
- `@Post("credentials") addCredential(`
- `@Post("credentials/:credentialId/verify") verifyCredential(`
- `@Get("timeline") timeline(`
- `@Get("performance") performance(`
- `@Get("specializations") specializations(`
- `@Get("history") history(`

### `apps/api/src/public-api/developer-applications.controller.ts`

- `@Controller("businesses/:businessId/integrations")`
- `@Post("applications") create(`
- `@Post("clients/:clientId/credentials") issue(`

### `apps/api/src/public-api/public-api.controller.ts`

- `@Controller("api/public/v1")`
- `@Get("business") business(@ApiPrincipalParam() p: ApiPrincipal) {`
- `@Get("categories") categories(@ApiPrincipalParam() p: ApiPrincipal) {`
- `@Get("globalization/context") globalizationContext(`
- `@Get("services") services(@ApiPrincipalParam() p: ApiPrincipal) {`
- `@Get("professionals") professionals(@ApiPrincipalParam() p: ApiPrincipal) {`
- `@Get("availability") availability(`
- `@Get("bookings/:id") booking(`
- `@Post("bookings") createBooking(`
- `@Delete("bookings/:id") cancelBooking(`
- `@Get("results/:id") result(`
- `@Get("discovery") discovery(`
- `@Get("ai/tools") tools() {`
- `@Post("webhooks") createWebhook(`
- `@Post("ai/authorize") authorizeAi(`

### `apps/api/src/public-api/public-contract.controller.ts`

- `@Controller("api/public/v1")`
- `@Get("openapi.json") contract() {`

## Mevcut Prisma modelleri

`User`, `Business`, `AuditLog`, `SecurityEvent`, `AbuseLimitBucket`, `IdempotencyRecord`, `InfrastructureCacheEntry`, `BackgroundJob`, `BusinessMember`, `Branch`, `BusinessSettings`, `WorkingHour`, `RefreshSession`, `Customer`, `BusinessCustomer`, `CustomerTag`, `CustomerTagAssignment`, `CustomerSegment`, `CustomerSegmentMembership`, `Automation`, `AutomationEvent`, `AutomationExecution`, `NotificationTemplate`, `Notification`, `NotificationDelivery`, `NotificationPreference`, `NotificationProviderConfig`, `PushDevice`, `Conversation`, `ConversationParticipant`, `Message`, `MessageReceipt`, `CommunicationOutbox`, `CustomerNote`, `Location`, `Staff`, `Service`, `ServiceCategory`, `StaffLocation`, `StaffProfileService`, `StaffService`, `StaffWorkingHour`, `StaffTimeOff`, `Appointment`, `AppointmentStatusHistory`, `Review`, `AgentSession`, `AgentTurn`, `AgentPendingAction`, `AgentToolExecution`, `AIRun`, `AITraceEvent`, `AIEvaluation`, `AISafetyIncident`, `AIKillSwitch`, `PredictionStrategyVersion`, `Prediction`, `PredictionSignal`, `PredictionEvidence`, `PredictionFeedback`, `PredictionOutcome`, `PredictionEvent`, `BeautyDNAProfile`, `BeautyDNATrait`, `BeautyDNAEvidence`, `BeautyDNAVersion`, `BeautyDNAEvent`, `ProfessionalIntelligenceProfile`, `ProfessionalSkill`, `ProfessionalSkillEvidence`, `ProfessionalExperience`, `ProfessionalCredential`, `ProfessionalCareerEvent`, `ProfessionalPerformanceSignal`, `ProfessionalIntelligenceVersion`, `BusinessIntelligenceProfile`, `BusinessMetricDefinition`, `BusinessMetricObservation`, `BusinessMetricSnapshot`, `BusinessInsight`, `BusinessOpportunity`, `BusinessRiskSignal`, `BusinessBenchmark`, `BusinessGrowthRecommendation`, `BusinessGrowthExperiment`, `BusinessGrowthExperimentResult`, `BusinessIntelligenceVersion`, `MarketplaceLiquidityProfile`, `MarketplaceDemandSignal`, `MarketplaceSupplySignal`, `MarketplaceCapacityObservation`, `MarketplaceLiquiditySnapshot`, `MarketplaceSupplyGap`, `MarketplaceSupplyOpportunity`, `MarketplaceNetworkSignal`, `MarketplaceLiquidityVersion`, `APIApplication`, `APIClient`, `APICredential`, `APIGrant`, `WebhookEndpoint`, `WebhookDelivery`, `WebhookAttempt`, `APIUsageRecord`, `APIRateLimitBucket`, `PlatformCategory`, `PlatformSubcategory`, `PlatformServiceType`, `PlatformCategoryCapability`, `CategoryAttributeDefinition`, `CategoryAttributeOption`, `TenantCategoryConfiguration`, `ServiceAttributeValue`, `PlatformResourceType`, `PlatformResource`, `ServiceResourceRequirement`, `ProfessionalCategoryAssignment`, `ProfessionalServiceTypeAssignment`, `CategoryResultSchema`, `Market`, `MarketConfiguration`, `TenantGlobalizationProfile`, `MarketTranslation`, `CurrencyDefinition`, `FxRateSnapshot`, `MarketCategoryAvailability`, `MonetizationPlan`, `MonetizationPlanVersion`, `PlanEntitlement`, `MonetizationPriceVersion`, `BillingAccount`, `MonetizationSubscription`, `SubscriptionItem`, `SubscriptionChange`, `MonetizationUsageMeter`, `MonetizationUsageRecord`, `FinancialPricingRule`, `CommissionRule`, `FinancialPromotion`, `PromotionRedemption`, `FinancialLedgerEntry`, `RefundRecord`, `FinancialCreditGrant`, `FinancialCreditConsumption`, `FinancialSettlement`, `FinancialPayout`, `AICostConfiguration`, `FinancialMetricSnapshot`, `UnitEconomicsSnapshot`, `PaymentWebhookEvent`, `ReferralProgram`, `ReferralProgramVersion`, `ReferralCode`, `Referral`, `ReferralTransition`, `GrowthReward`, `GrowthRiskAssessment`, `GrowthCampaign`, `GrowthChallenge`, `ChallengeProgress`, `ChallengeProgressEvent`, `AttributionTouch`, `GrowthExperiment`, `ExperimentVariant`, `ExperimentAssignment`, `GrowthEvent`, `GrowthMetricSnapshot`, `GrowthInvite`, `GrowthStreak`, `CustomerLifecycleState`, `AudienceDefinition`, `AudienceMembership`, `GovernancePolicy`, `GovernancePolicyVersion`, `PolicyEvaluation`, `HumanOverride`, `GovernanceDispute`, `DisputeTransition`, `GovernanceAppeal`, `ConsentRecord`, `PrivacyRequest`, `PrivacyRequestTransition`, `RetentionPolicy`, `EnforcementAction`, `GovernanceEvent`

## UI / worker

- Mobile: `apps/mobile/App.tsx` başlangıç ekranı.
- Admin: `apps/admin/app/page.tsx` başlangıç ekranı.
- Kalıcı job: `apps/api/src/infrastructure/background-jobs.service.ts`.
- Redis/S3/OpenAI/pgvector adapter veya worker entrypoint temelde yok.

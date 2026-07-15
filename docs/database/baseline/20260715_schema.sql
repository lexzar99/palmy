-- CreateEnum
CREATE TYPE "RestaurantAcceptingOrdersMode" AS ENUM ('SCHEDULED', 'FORCE_OPEN', 'FORCE_CLOSED');

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "restaurantId" TEXT,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "price" INTEGER NOT NULL,
    "vatPercent" INTEGER,
    "localPriceLocked" BOOLEAN NOT NULL DEFAULT false,
    "categoryId" TEXT NOT NULL,
    "imageUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isVegan" BOOLEAN NOT NULL DEFAULT false,
    "isVegetarian" BOOLEAN NOT NULL DEFAULT false,
    "isGlutenFree" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "displayMode" TEXT NOT NULL DEFAULT 'FULL',
    "hideDescription" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "discountPercent" INTEGER,
    "discountPrice" INTEGER,
    "discountImageUrl" TEXT,
    "discountLabel" TEXT,
    "discountActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtraGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'CHECKBOX',
    "required" BOOLEAN NOT NULL DEFAULT false,
    "minSelections" INTEGER NOT NULL DEFAULT 0,
    "maxSelections" INTEGER NOT NULL DEFAULT 99,
    "displayStyle" TEXT NOT NULL DEFAULT 'LIST',
    "allowQuantity" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "restaurantId" TEXT,

    CONSTRAINT "ExtraGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductExtraGroup" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "extraGroupId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductExtraGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Extra" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceAddon" INTEGER NOT NULL DEFAULT 0,
    "imageUrl" TEXT,
    "extraGroupId" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Extra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "clientRequestId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "type" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "customerEmail" TEXT,
    "deliveryStreet" TEXT,
    "deliveryCity" TEXT,
    "deliveryZip" TEXT,
    "deliveryLatitude" DOUBLE PRECISION,
    "deliveryLongitude" DOUBLE PRECISION,
    "deliveryNote" TEXT,
    "deliveryInstructions" TEXT,
    "total" INTEGER NOT NULL,
    "deliveryFee" INTEGER NOT NULL DEFAULT 0,
    "discountAmount" INTEGER NOT NULL DEFAULT 0,
    "foodDiscountAmount" INTEGER NOT NULL DEFAULT 0,
    "deliveryDiscountAmount" INTEGER NOT NULL DEFAULT 0,
    "smallOrderFee" INTEGER NOT NULL DEFAULT 0,
    "foodVatPercent" INTEGER NOT NULL DEFAULT 6,
    "deliveryVatPercent" INTEGER,
    "tipAmount" INTEGER NOT NULL DEFAULT 0,
    "discountCode" TEXT,
    "appliedDealId" TEXT,
    "appliedDealTitle" TEXT,
    "userDealId" TEXT,
    "userDealAmountKr" INTEGER,
    "stripePaymentIntentId" TEXT,
    "paymentProvider" TEXT NOT NULL,
    "molliePaymentId" TEXT,
    "adyenSessionId" TEXT,
    "adyenPspReference" TEXT,
    "accessToken" TEXT,
    "paymentStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "paymentEffectsCompletedAt" TIMESTAMP(3),
    "paymentMethod" TEXT NOT NULL DEFAULT 'ONLINE',
    "note" TEXT,
    "estimatedTime" INTEGER,
    "refundAmount" INTEGER,
    "refundReason" TEXT,
    "refundedAt" TIMESTAMP(3),
    "rating" INTEGER,
    "review" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewFlagged" BOOLEAN NOT NULL DEFAULT false,
    "reviewReply" TEXT,
    "likedItemIds" TEXT NOT NULL DEFAULT '[]',
    "reviewRepliedAt" TIMESTAMP(3),
    "allergens" TEXT NOT NULL DEFAULT '[]',
    "discountUsageCounted" BOOLEAN NOT NULL DEFAULT false,
    "preparingAt" TIMESTAMP(3),
    "deliveringAt" TIMESTAMP(3),
    "etaReadyAt" TIMESTAMP(3),
    "etaPickupAt" TIMESTAMP(3),
    "etaCustomerAt" TIMESTAMP(3),
    "etaCustomerMin" INTEGER,
    "etaPriorityScore" DOUBLE PRECISION,
    "etaReason" TEXT,
    "scheduledFor" TIMESTAMP(3),
    "liveActivityToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "restaurantId" TEXT,
    "userId" TEXT,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentRefund" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "paymentRef" TEXT NOT NULL,
    "refundRef" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "cumulativeAmount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "source" TEXT NOT NULL,
    "actorAdminId" TEXT,
    "reason" TEXT,
    "providerCreatedAt" TIMESTAMP(3),
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentRefund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Courier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "phone" TEXT,
    "personalNumber" TEXT,
    "address" TEXT,
    "profileImageUrl" TEXT,
    "city" TEXT NOT NULL DEFAULT 'Lund',
    "vehicle" TEXT NOT NULL DEFAULT 'BIKE',
    "payoutAccount" TEXT,
    "ratePerKm" INTEGER NOT NULL DEFAULT 1500,
    "online" BOOLEAN NOT NULL DEFAULT false,
    "sessionStartedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "currentLat" DOUBLE PRECISION,
    "currentLng" DOUBLE PRECISION,
    "lastSeenAt" TIMESTAMP(3),
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "fcmToken" TEXT,
    "fcmPlatform" TEXT,
    "apnsDeviceToken" TEXT,
    "apnsPlatform" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Courier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourierPushSubscription" (
    "id" TEXT NOT NULL,
    "courierId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourierPushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Delivery" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "courierId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'EN_ROUTE_PICKUP',
    "distanceKm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ratePerKmOre" INTEGER NOT NULL DEFAULT 0,
    "payOre" INTEGER NOT NULL DEFAULT 0,
    "tipOre" INTEGER NOT NULL DEFAULT 0,
    "proofMethod" TEXT,
    "proofPhotoUrl" TEXT,
    "proofPhotoKey" TEXT,
    "proofMessage" TEXT,
    "proofExpiresAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pickedUpAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Delivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourierApplication" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "city" TEXT NOT NULL DEFAULT 'Lund',
    "vehicle" TEXT NOT NULL DEFAULT 'BIKE',
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "CourierApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "basePrice" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "note" TEXT,
    "selectedExtras" TEXT NOT NULL DEFAULT '[]',
    "subtotal" INTEGER NOT NULL,
    "vatPercent" INTEGER NOT NULL DEFAULT 6,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscountCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'PERCENTAGE',
    "value" INTEGER NOT NULL,
    "minOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "maxUsages" INTEGER,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "applicableCategoryIds" TEXT NOT NULL DEFAULT '[]',
    "restaurantId" TEXT,
    "applicableRestaurantIds" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "freeDelivery" BOOLEAN NOT NULL DEFAULT false,
    "platform" TEXT NOT NULL DEFAULT 'ALL',

    CONSTRAINT "DiscountCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deal" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "badgeText" TEXT,
    "popupHeadline" TEXT,
    "popupBody" TEXT,
    "popupCtaLabel" TEXT,
    "popupCode" TEXT,
    "popupOkOnly" BOOLEAN NOT NULL DEFAULT false,
    "triggerType" TEXT NOT NULL DEFAULT 'NONE',
    "discountType" TEXT NOT NULL DEFAULT 'PERCENTAGE',
    "discountValue" INTEGER NOT NULL,
    "minOrder" INTEGER NOT NULL DEFAULT 0,
    "comboProductIds" TEXT NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "showOnSite" BOOLEAN NOT NULL DEFAULT true,
    "popupEnabled" BOOLEAN NOT NULL DEFAULT true,
    "maxUsages" INTEGER,
    "maxUsesPerCustomer" INTEGER,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "restaurantId" TEXT,
    "isGlobal" BOOLEAN NOT NULL DEFAULT false,
    "applicableRestaurantIds" TEXT NOT NULL DEFAULT '[]',
    "triggerCategoryId" TEXT,
    "triggerQuantity" INTEGER NOT NULL DEFAULT 2,
    "rewardCategoryId" TEXT,
    "bogoExcludedProductIds" TEXT NOT NULL DEFAULT '[]',
    "bogoRewardProductIds" TEXT NOT NULL DEFAULT '[]',
    "bogoExcludedExtraIds" TEXT NOT NULL DEFAULT '[]',
    "bogoMaxRewardPriceOre" INTEGER,
    "bogoMinOrderAmountOre" INTEGER,
    "bogoTriggerProductIds" TEXT NOT NULL DEFAULT '[]',
    "bogoRewardsPerTrigger" INTEGER NOT NULL DEFAULT 1,
    "bogoMaxRewardsPerOrder" INTEGER DEFAULT 1,
    "showAsBanner" BOOLEAN NOT NULL DEFAULT false,
    "isPersonalTemplate" BOOLEAN NOT NULL DEFAULT false,
    "isTemplate" BOOLEAN NOT NULL DEFAULT false,
    "freeDelivery" BOOLEAN NOT NULL DEFAULT false,
    "appEnabled" BOOLEAN NOT NULL DEFAULT false,
    "appPlacement" TEXT NOT NULL DEFAULT 'HOME_TOP',
    "appAudience" TEXT NOT NULL DEFAULT 'ALL',
    "appTemplate" TEXT NOT NULL DEFAULT 'DEAL_HERO',
    "appSize" TEXT NOT NULL DEFAULT 'LARGE',
    "appRotating" BOOLEAN NOT NULL DEFAULT true,
    "appWeight" INTEGER NOT NULL DEFAULT 10,
    "appClaimRequired" BOOLEAN NOT NULL DEFAULT true,
    "appClaimExpiresMinutes" INTEGER,
    "appCooldownHours" INTEGER,
    "appCtaLabel" TEXT,
    "appCtaAction" TEXT DEFAULT 'CLAIM',
    "appCtaTarget" TEXT,
    "appTheme" TEXT,
    "brandId" TEXT,

    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealCampaign" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "segment" TEXT NOT NULL DEFAULT 'ALL',
    "restaurantId" TEXT,
    "brandId" TEXT,
    "variants" JSONB NOT NULL DEFAULT '[]',
    "capPerCustomer" INTEGER NOT NULL DEFAULT 1,
    "validDays" INTEGER NOT NULL DEFAULT 7,
    "scheduledAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HomeCategorySection" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "titleEn" TEXT,
    "slug" TEXT NOT NULL,
    "subtitle" TEXT,
    "subtitleEn" TEXT,
    "description" TEXT,
    "descriptionEn" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "filterMode" TEXT NOT NULL DEFAULT 'FILTER',
    "maxRestaurants" INTEGER NOT NULL DEFAULT 8,
    "manualRestaurantIds" TEXT NOT NULL DEFAULT '[]',
    "filters" TEXT NOT NULL DEFAULT '{}',
    "schedule" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HomeCategorySection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'STAFF',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "totpSecret" TEXT,
    "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "recoveryGeneratedAt" TIMESTAMP(3),
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantDevice" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "label" TEXT,
    "refreshTokenHash" TEXT,
    "pushToken" TEXT,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DevicePairingCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DevicePairingCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrustedDevice" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "deviceLabel" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "TrustedDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecoveryCode" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecoveryCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "adminId" TEXT,
    "adminEmail" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "changes" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantSettings" (
    "id" TEXT NOT NULL DEFAULT 'settings',
    "isOpen" BOOLEAN NOT NULL DEFAULT true,
    "deliveryFee" INTEGER NOT NULL DEFAULT 0,
    "minOrderAmount" INTEGER NOT NULL DEFAULT 0,
    "deliveryRadius" INTEGER NOT NULL DEFAULT 10,
    "estimatedPickupTime" INTEGER NOT NULL DEFAULT 20,
    "estimatedDeliveryTime" INTEGER NOT NULL DEFAULT 35,
    "notificationSound" TEXT NOT NULL DEFAULT 'signal-1',
    "openingHours" TEXT NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "phone" TEXT,
    "contactPhone" TEXT,
    "contactPhoneHours" TEXT,
    "contactEmail" TEXT,
    "contactAddress" TEXT,
    "aboutBody" TEXT,
    "companyName" TEXT,
    "organizationNumber" TEXT,
    "companyAddress" TEXT,
    "supportEmail" TEXT,
    "privacyEmail" TEXT,
    "noReplyEmail" TEXT,
    "showDiscountedRail" BOOLEAN NOT NULL DEFAULT true,
    "commissionSelfPct" INTEGER NOT NULL DEFAULT 10,
    "commissionPlatformPct" INTEGER NOT NULL DEFAULT 20,
    "vatCustomerPct" INTEGER NOT NULL DEFAULT 6,
    "vatPlatformFeePct" INTEGER NOT NULL DEFAULT 25,
    "tierGoldFee" INTEGER NOT NULL DEFAULT 100000,
    "tierSilverFee" INTEGER NOT NULL DEFAULT 70000,
    "tierStandardFee" INTEGER NOT NULL DEFAULT 0,
    "bannerMessage" TEXT,
    "bannerSeverity" TEXT,
    "bannerExpiresAt" TIMESTAMP(3),
    "platformOrdersPaused" BOOLEAN NOT NULL DEFAULT false,
    "platformPausedUntil" TIMESTAMP(3),
    "platformPauseReason" TEXT,
    "heroTitle" TEXT,
    "heroSubtitle" TEXT,
    "heroImageUrl" TEXT,
    "heroCtaLabel" TEXT,
    "heroCtaUrl" TEXT,
    "welcomeDealActive" BOOLEAN NOT NULL DEFAULT false,
    "welcomeDealId" TEXT,
    "welcomeAudience" TEXT NOT NULL DEFAULT 'FIRST_ORDER',
    "welcomeMaxOrders" INTEGER NOT NULL DEFAULT 1,
    "welcomeDealAmountKr" INTEGER NOT NULL DEFAULT 50,
    "welcomeDealPercent" INTEGER NOT NULL DEFAULT 20,
    "welcomeDealMinOrderKr" INTEGER NOT NULL DEFAULT 150,
    "welcomeDealExpiresDays" INTEGER NOT NULL DEFAULT 30,
    "referralEnabled" BOOLEAN NOT NULL DEFAULT false,
    "referralDealId" TEXT,
    "referralInviteeDealId" TEXT,
    "referralInviterDealId" TEXT,
    "referralCouponsPerSide" INTEGER NOT NULL DEFAULT 1,
    "referralRewardKr" INTEGER NOT NULL DEFAULT 50,
    "referralRewardPercent" INTEGER NOT NULL DEFAULT 20,
    "referralMinOrderKr" INTEGER NOT NULL DEFAULT 150,
    "referralMaxRewardsPerInviter" INTEGER NOT NULL DEFAULT 20,

    CONSTRAINT "RestaurantSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderDraft" (
    "id" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Restaurant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "cuisine" TEXT NOT NULL DEFAULT 'Blandat',
    "address" TEXT,
    "city" TEXT DEFAULT 'Lund',
    "zip" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "legalName" TEXT,
    "organizationNumber" TEXT,
    "imageUrl" TEXT,
    "heroImageUrl" TEXT,
    "offersImageUrl" TEXT,
    "rating" DOUBLE PRECISION DEFAULT 4.6,
    "ratingCount" INTEGER DEFAULT 120,
    "deliveryFee" INTEGER NOT NULL DEFAULT 0,
    "minOrderAmount" INTEGER NOT NULL DEFAULT 0,
    "etaMinutes" INTEGER NOT NULL DEFAULT 30,
    "etaCalculatedMinutes" INTEGER,
    "etaOverrideMinutes" INTEGER,
    "isOpen" BOOLEAN NOT NULL DEFAULT true,
    "scheduledOpenNow" BOOLEAN NOT NULL DEFAULT true,
    "acceptingOrdersMode" "RestaurantAcceptingOrdersMode" NOT NULL DEFAULT 'SCHEDULED',
    "acceptingOrdersOverrideUntil" TIMESTAMP(3),
    "acceptingOrdersOverrideReason" TEXT,
    "comingSoon" BOOLEAN NOT NULL DEFAULT false,
    "draft" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "tags" TEXT NOT NULL DEFAULT '[]',
    "openingHours" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "featuredClass" INTEGER NOT NULL DEFAULT 3,
    "internalInfo" TEXT,
    "adminEmail" TEXT,
    "logoutCode" TEXT,
    "pausedUntil" TIMESTAMP(3),
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "placeId" TEXT,
    "deliveryRadius" DOUBLE PRECISION NOT NULL DEFAULT 5.0,
    "cityId" TEXT,
    "deliveryZones" TEXT NOT NULL DEFAULT '[]',
    "freeDeliveryAbove" INTEGER,
    "adminUserId" TEXT,
    "announcementText" TEXT,
    "vatPercent" INTEGER,
    "selfDelivery" BOOLEAN NOT NULL DEFAULT false,
    "commissionPctOverride" INTEGER,
    "brandId" TEXT,

    CONSTRAINT "Restaurant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Brand" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logoUrl" TEXT,
    "masterRestaurantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "authorId" TEXT,
    "authorName" TEXT NOT NULL,
    "restaurantId" TEXT,
    "orderId" TEXT,
    "customerPhone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "City" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deliveryMode" TEXT NOT NULL DEFAULT 'ALL',
    "zones" TEXT NOT NULL DEFAULT '[]',
    "polygon" TEXT,
    "centerLat" DOUBLE PRECISION,
    "centerLng" DOUBLE PRECISION,
    "radiusKm" DOUBLE PRECISION NOT NULL DEFAULT 10.0,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "freeDeliveryAbove" INTEGER NOT NULL DEFAULT 0,
    "ordersPaused" BOOLEAN NOT NULL DEFAULT false,
    "ordersPausedUntil" TIMESTAMP(3),
    "ordersPauseReason" TEXT,
    "parentCityId" TEXT,
    "aliases" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "City_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "name" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "address" TEXT,
    "city" TEXT,
    "zip" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "isGuest" BOOLEAN NOT NULL DEFAULT false,
    "convertedFromGuestAt" TIMESTAMP(3),
    "conversionSource" TEXT,
    "oauthProvider" TEXT,
    "oauthId" TEXT,
    "image" TEXT,
    "allergens" TEXT NOT NULL DEFAULT '[]',
    "pushToken" TEXT,
    "apnsDeviceToken" TEXT,
    "internalInfo" TEXT,
    "deletedAt" TIMESTAMP(3),
    "claimedDealIds" TEXT NOT NULL DEFAULT '[]',
    "referralCode" TEXT,
    "referredByCode" TEXT,
    "deviceFingerprint" TEXT,
    "lastSeenIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserDeal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "code" TEXT,
    "dealId" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "amountKr" INTEGER,
    "discountPercent" INTEGER,
    "discountType" TEXT,
    "freeDelivery" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3),
    "usedOnOrderId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserDeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Referral" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "shareCode" TEXT,
    "inviterUserId" TEXT NOT NULL,
    "inviteeUserId" TEXT,
    "inviterPhone" TEXT,
    "inviteePhone" TEXT,
    "inviteeEmail" TEXT,
    "inviteeIP" TEXT,
    "inviteeDeviceId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "fraudFlags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "inviteeOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "registeredAt" TIMESTAMP(3),
    "rewardedAt" TIMESTAMP(3),
    "revertedAt" TIMESTAMP(3),
    "revertedBy" TEXT,
    "revertReason" TEXT,
    "channel" TEXT,
    "inviteeFingerprint" TEXT,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InviteClick" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InviteClick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantPayout" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "grossSales" INTEGER NOT NULL DEFAULT 0,
    "orderCount" INTEGER NOT NULL DEFAULT 0,
    "commissionAmount" INTEGER NOT NULL DEFAULT 0,
    "subscriptionAmount" INTEGER NOT NULL DEFAULT 0,
    "manualAdjustmentAmount" INTEGER NOT NULL DEFAULT 0,
    "lateRefundAdjustmentAmount" INTEGER NOT NULL DEFAULT 0,
    "payoutAmount" INTEGER NOT NULL DEFAULT 0,
    "commissionPctSnapshot" INTEGER,
    "feeVatPctSnapshot" INTEGER,
    "selfDeliverySnapshot" BOOLEAN,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "payoutReference" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "paidAt" TIMESTAMP(3),
    "paidBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantPayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayoutRecoveryAllocation" (
    "id" TEXT NOT NULL,
    "sourcePayoutId" TEXT NOT NULL,
    "targetPayoutId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RESERVED',
    "reservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "releaseReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayoutRecoveryAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantPrinter" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "connectionType" TEXT NOT NULL DEFAULT 'NETWORK',
    "address" TEXT NOT NULL,
    "paperWidth" TEXT NOT NULL DEFAULT '80mm',
    "copies" INTEGER NOT NULL DEFAULT 1,
    "autoPrint" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "receiptMode" TEXT NOT NULL DEFAULT 'STANDARD',
    "notes" TEXT,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantPrinter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceiptTemplate" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "paperWidth" TEXT NOT NULL DEFAULT '80mm',
    "platformName" TEXT NOT NULL DEFAULT 'ViaEats',
    "elements" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReceiptTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedAddress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Hem',
    "street" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "zip" TEXT NOT NULL,
    "note" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "discountType" TEXT NOT NULL DEFAULT 'PERCENTAGE',
    "discountValue" INTEGER NOT NULL,
    "minOrder" INTEGER NOT NULL DEFAULT 0,
    "maxUsagesPerCustomer" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerDeal" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT,
    "phone" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "maxUsages" INTEGER NOT NULL DEFAULT 1,
    "isUsed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerDeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LaunchLead" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "couponCode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'INTERESTED',
    "marketingConsentAt" TIMESTAMP(3) NOT NULL,
    "couponSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LaunchLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationCode" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupOrder" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "ownerId" TEXT,
    "ownerName" TEXT NOT NULL,
    "ownerPhone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "shareCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupOrderItem" (
    "id" TEXT NOT NULL,
    "groupOrderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "basePrice" INTEGER NOT NULL,
    "selectedExtras" TEXT NOT NULL DEFAULT '[]',
    "note" TEXT,
    "subtotal" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushLog" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "target" TEXT NOT NULL,
    "identifier" TEXT,
    "city" TEXT,
    "cohort" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "deeplink" TEXT,
    "count" INTEGER NOT NULL DEFAULT 0,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "error" TEXT,
    "sentBy" TEXT,

    CONSTRAINT "PushLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledPush" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "target" TEXT NOT NULL,
    "identifier" TEXT,
    "city" TEXT,
    "cohort" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "deeplink" TEXT,
    "sentAt" TIMESTAMP(3),
    "sentCount" INTEGER,
    "sentSuccess" BOOLEAN,
    "sentError" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdBy" TEXT,

    CONSTRAINT "ScheduledPush_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceInstallation" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "provider" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "platform" TEXT,
    "tokenCiphertext" TEXT,
    "tokenHash" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSuccessAt" TIMESTAMP(3),
    "lastFailureAt" TIMESTAMP(3),
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceInstallation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceOrderSubscription" (
    "id" TEXT NOT NULL,
    "deviceInstallationId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceOrderSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationOutbox" (
    "id" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "userId" TEXT,
    "orderId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseOwner" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 8,
    "acceptedCount" INTEGER NOT NULL DEFAULT 0,
    "invalidCount" INTEGER NOT NULL DEFAULT 0,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" TEXT NOT NULL,
    "outboxId" TEXT NOT NULL,
    "deviceInstallationId" TEXT,
    "provider" TEXT NOT NULL,
    "attemptNo" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "errorCode" TEXT,
    "errorDetail" TEXT,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiUsageCounter" (
    "id" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiUsageCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EngineSetting" (
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "params" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EngineSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "EngineEvent" (
    "id" TEXT NOT NULL,
    "engine" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EngineEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE INDEX "Category_restaurantId_position_idx" ON "Category"("restaurantId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");

-- CreateIndex
CREATE INDEX "Product_categoryId_isActive_position_idx" ON "Product"("categoryId", "isActive", "position");

-- CreateIndex
CREATE INDEX "ExtraGroup_restaurantId_idx" ON "ExtraGroup"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductExtraGroup_productId_extraGroupId_key" ON "ProductExtraGroup"("productId", "extraGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Order_clientRequestId_key" ON "Order"("clientRequestId");

-- CreateIndex
CREATE INDEX "Order_restaurantId_status_createdAt_idx" ON "Order"("restaurantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Order_customerPhone_idx" ON "Order"("customerPhone");

-- CreateIndex
CREATE INDEX "Order_stripePaymentIntentId_idx" ON "Order"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "Order_molliePaymentId_idx" ON "Order"("molliePaymentId");

-- CreateIndex
CREATE INDEX "Order_adyenPspReference_idx" ON "Order"("adyenPspReference");

-- CreateIndex
CREATE INDEX "Order_userId_idx" ON "Order"("userId");

-- CreateIndex
CREATE INDEX "Order_appliedDealId_idx" ON "Order"("appliedDealId");

-- CreateIndex
CREATE INDEX "Order_status_createdAt_idx" ON "Order"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Order_paymentStatus_createdAt_idx" ON "Order"("paymentStatus", "createdAt");

-- CreateIndex
CREATE INDEX "Order_etaCustomerAt_idx" ON "Order"("etaCustomerAt");

-- CreateIndex
CREATE INDEX "Order_restaurantId_etaCustomerAt_idx" ON "Order"("restaurantId", "etaCustomerAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRefund_idempotencyKey_key" ON "PaymentRefund"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRefund_provider_refundRef_key" ON "PaymentRefund"("provider", "refundRef");

-- CreateIndex
CREATE INDEX "PaymentRefund_orderId_createdAt_idx" ON "PaymentRefund"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentRefund_provider_status_lastSeenAt_idx" ON "PaymentRefund"("provider", "status", "lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "Courier_email_key" ON "Courier"("email");

-- CreateIndex
CREATE INDEX "Courier_online_city_isActive_idx" ON "Courier"("online", "city", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "CourierPushSubscription_endpoint_key" ON "CourierPushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "CourierPushSubscription_courierId_idx" ON "CourierPushSubscription"("courierId");

-- CreateIndex
CREATE UNIQUE INDEX "Delivery_orderId_key" ON "Delivery"("orderId");

-- CreateIndex
CREATE INDEX "Delivery_courierId_status_idx" ON "Delivery"("courierId", "status");

-- CreateIndex
CREATE INDEX "Delivery_proofExpiresAt_idx" ON "Delivery"("proofExpiresAt");

-- CreateIndex
CREATE INDEX "CourierApplication_status_createdAt_idx" ON "CourierApplication"("status", "createdAt");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "OrderItem_productId_idx" ON "OrderItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscountCode_code_key" ON "DiscountCode"("code");

-- CreateIndex
CREATE INDEX "Deal_isActive_restaurantId_validUntil_idx" ON "Deal"("isActive", "restaurantId", "validUntil");

-- CreateIndex
CREATE INDEX "Deal_isActive_isGlobal_idx" ON "Deal"("isActive", "isGlobal");

-- CreateIndex
CREATE INDEX "Deal_restaurantId_triggerType_idx" ON "Deal"("restaurantId", "triggerType");

-- CreateIndex
CREATE INDEX "Deal_appEnabled_appPlacement_idx" ON "Deal"("appEnabled", "appPlacement");

-- CreateIndex
CREATE INDEX "Deal_appAudience_idx" ON "Deal"("appAudience");

-- CreateIndex
CREATE INDEX "Deal_brandId_idx" ON "Deal"("brandId");

-- CreateIndex
CREATE INDEX "DealCampaign_status_scheduledAt_idx" ON "DealCampaign"("status", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "HomeCategorySection_slug_key" ON "HomeCategorySection"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantDevice_deviceId_key" ON "RestaurantDevice"("deviceId");

-- CreateIndex
CREATE INDEX "RestaurantDevice_restaurantId_idx" ON "RestaurantDevice"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "DevicePairingCode_code_key" ON "DevicePairingCode"("code");

-- CreateIndex
CREATE INDEX "DevicePairingCode_restaurantId_idx" ON "DevicePairingCode"("restaurantId");

-- CreateIndex
CREATE INDEX "TrustedDevice_adminId_idx" ON "TrustedDevice"("adminId");

-- CreateIndex
CREATE INDEX "TrustedDevice_expiresAt_idx" ON "TrustedDevice"("expiresAt");

-- CreateIndex
CREATE INDEX "RecoveryCode_adminId_idx" ON "RecoveryCode"("adminId");

-- CreateIndex
CREATE INDEX "AuditLog_adminId_createdAt_idx" ON "AuditLog"("adminId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_resourceType_resourceId_idx" ON "AuditLog"("resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Restaurant_slug_key" ON "Restaurant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Restaurant_adminUserId_key" ON "Restaurant"("adminUserId");

-- CreateIndex
CREATE INDEX "Restaurant_featuredClass_idx" ON "Restaurant"("featuredClass");

-- CreateIndex
CREATE INDEX "Restaurant_city_idx" ON "Restaurant"("city");

-- CreateIndex
CREATE INDEX "Restaurant_cityId_idx" ON "Restaurant"("cityId");

-- CreateIndex
CREATE INDEX "Restaurant_brandId_idx" ON "Restaurant"("brandId");

-- CreateIndex
CREATE INDEX "Restaurant_archivedAt_idx" ON "Restaurant"("archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Brand_slug_key" ON "Brand"("slug");

-- CreateIndex
CREATE INDEX "Note_restaurantId_createdAt_idx" ON "Note"("restaurantId", "createdAt");

-- CreateIndex
CREATE INDEX "Note_orderId_createdAt_idx" ON "Note"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "Note_customerPhone_createdAt_idx" ON "Note"("customerPhone", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "City_name_key" ON "City"("name");

-- CreateIndex
CREATE UNIQUE INDEX "City_slug_key" ON "City"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");

-- CreateIndex
CREATE UNIQUE INDEX "UserDeal_code_key" ON "UserDeal"("code");

-- CreateIndex
CREATE INDEX "UserDeal_userId_status_idx" ON "UserDeal"("userId", "status");

-- CreateIndex
CREATE INDEX "UserDeal_code_status_idx" ON "UserDeal"("code", "status");

-- CreateIndex
CREATE INDEX "UserDeal_type_idx" ON "UserDeal"("type");

-- CreateIndex
CREATE UNIQUE INDEX "Referral_code_key" ON "Referral"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Referral_inviteeUserId_key" ON "Referral"("inviteeUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Referral_inviteePhone_key" ON "Referral"("inviteePhone");

-- CreateIndex
CREATE INDEX "Referral_inviterUserId_idx" ON "Referral"("inviterUserId");

-- CreateIndex
CREATE INDEX "Referral_shareCode_idx" ON "Referral"("shareCode");

-- CreateIndex
CREATE INDEX "Referral_status_idx" ON "Referral"("status");

-- CreateIndex
CREATE INDEX "Referral_inviteeFingerprint_status_idx" ON "Referral"("inviteeFingerprint", "status");

-- CreateIndex
CREATE INDEX "InviteClick_fingerprint_expiresAt_idx" ON "InviteClick"("fingerprint", "expiresAt");

-- CreateIndex
CREATE INDEX "InviteClick_token_idx" ON "InviteClick"("token");

-- CreateIndex
CREATE INDEX "RestaurantPayout_status_periodStart_periodEnd_idx" ON "RestaurantPayout"("status", "periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantPayout_restaurantId_periodStart_periodEnd_key" ON "RestaurantPayout"("restaurantId", "periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutRecoveryAllocation_sourcePayoutId_targetPayoutId_key" ON "PayoutRecoveryAllocation"("sourcePayoutId", "targetPayoutId");

-- CreateIndex
CREATE INDEX "PayoutRecoveryAllocation_sourcePayoutId_status_idx" ON "PayoutRecoveryAllocation"("sourcePayoutId", "status");

-- CreateIndex
CREATE INDEX "PayoutRecoveryAllocation_targetPayoutId_status_idx" ON "PayoutRecoveryAllocation"("targetPayoutId", "status");

-- CreateIndex
CREATE INDEX "RestaurantPrinter_restaurantId_isDefault_idx" ON "RestaurantPrinter"("restaurantId", "isDefault");

-- CreateIndex
CREATE INDEX "RestaurantPrinter_restaurantId_isActive_idx" ON "RestaurantPrinter"("restaurantId", "isActive");

-- CreateIndex
CREATE INDEX "SavedAddress_userId_idx" ON "SavedAddress"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerDeal_code_key" ON "CustomerDeal"("code");

-- CreateIndex
CREATE UNIQUE INDEX "LaunchLead_email_key" ON "LaunchLead"("email");

-- CreateIndex
CREATE UNIQUE INDEX "LaunchLead_couponCode_key" ON "LaunchLead"("couponCode");

-- CreateIndex
CREATE INDEX "LaunchLead_createdAt_idx" ON "LaunchLead"("createdAt");

-- CreateIndex
CREATE INDEX "LaunchLead_status_createdAt_idx" ON "LaunchLead"("status", "createdAt");

-- CreateIndex
CREATE INDEX "VerificationCode_phone_idx" ON "VerificationCode"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "GroupOrder_shareCode_key" ON "GroupOrder"("shareCode");

-- CreateIndex
CREATE INDEX "GroupOrder_restaurantId_idx" ON "GroupOrder"("restaurantId");

-- CreateIndex
CREATE INDEX "GroupOrder_shareCode_idx" ON "GroupOrder"("shareCode");

-- CreateIndex
CREATE INDEX "PushLog_createdAt_idx" ON "PushLog"("createdAt");

-- CreateIndex
CREATE INDEX "ScheduledPush_sentAt_scheduledFor_idx" ON "ScheduledPush"("sentAt", "scheduledFor");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceInstallation_tokenHash_key" ON "DeviceInstallation"("tokenHash");

-- CreateIndex
CREATE INDEX "DeviceInstallation_userId_active_idx" ON "DeviceInstallation"("userId", "active");

-- CreateIndex
CREATE INDEX "DeviceInstallation_provider_active_idx" ON "DeviceInstallation"("provider", "active");

-- CreateIndex
CREATE INDEX "DeviceInstallation_lastSeenAt_idx" ON "DeviceInstallation"("lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceInstallation_provider_installationId_key" ON "DeviceInstallation"("provider", "installationId");

-- CreateIndex
CREATE INDEX "DeviceOrderSubscription_orderId_revokedAt_expiresAt_idx" ON "DeviceOrderSubscription"("orderId", "revokedAt", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceOrderSubscription_deviceInstallationId_orderId_key" ON "DeviceOrderSubscription"("deviceInstallationId", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationOutbox_dedupeKey_key" ON "NotificationOutbox"("dedupeKey");

-- CreateIndex
CREATE INDEX "NotificationOutbox_status_availableAt_idx" ON "NotificationOutbox"("status", "availableAt");

-- CreateIndex
CREATE INDEX "NotificationOutbox_leaseExpiresAt_idx" ON "NotificationOutbox"("leaseExpiresAt");

-- CreateIndex
CREATE INDEX "NotificationOutbox_userId_createdAt_idx" ON "NotificationOutbox"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationOutbox_orderId_createdAt_idx" ON "NotificationOutbox"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationDelivery_outboxId_status_idx" ON "NotificationDelivery"("outboxId", "status");

-- CreateIndex
CREATE INDEX "NotificationDelivery_deviceInstallationId_attemptedAt_idx" ON "NotificationDelivery"("deviceInstallationId", "attemptedAt");

-- CreateIndex
CREATE INDEX "NotificationDelivery_provider_status_attemptedAt_idx" ON "NotificationDelivery"("provider", "status", "attemptedAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDelivery_outboxId_deviceInstallationId_attemptN_key" ON "NotificationDelivery"("outboxId", "deviceInstallationId", "attemptNo");

-- CreateIndex
CREATE INDEX "ApiUsageCounter_service_idx" ON "ApiUsageCounter"("service");

-- CreateIndex
CREATE UNIQUE INDEX "ApiUsageCounter_service_period_key" ON "ApiUsageCounter"("service", "period");

-- CreateIndex
CREATE INDEX "EngineEvent_engine_createdAt_idx" ON "EngineEvent"("engine", "createdAt");

-- Runtime integrity constraints not represented by Prisma's datamodel.
ALTER TABLE "Product" ADD CONSTRAINT "Product_vatPercent_check"
  CHECK ("vatPercent" IS NULL OR "vatPercent" IN (0, 6, 12, 25));

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_discount_components_nonnegative_check"
    CHECK (
      "foodDiscountAmount" >= 0
      AND "deliveryDiscountAmount" >= 0
      AND "smallOrderFee" >= 0
    ),
  ADD CONSTRAINT "Order_foodVatPercent_check"
    CHECK ("foodVatPercent" IN (0, 6, 12, 25)),
  ADD CONSTRAINT "Order_deliveryVatPercent_check"
    CHECK ("deliveryVatPercent" IS NULL OR "deliveryVatPercent" IN (0, 6, 12, 25));

ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_vatPercent_check"
  CHECK ("vatPercent" IN (0, 6, 12, 25));

ALTER TABLE "PaymentRefund"
  ADD CONSTRAINT "PaymentRefund_amount_check"
    CHECK ("amount" > 0 AND "cumulativeAmount" >= "amount"),
  ADD CONSTRAINT "PaymentRefund_provider_check"
    CHECK ("provider" IN ('mollie', 'stripe', 'adyen')),
  ADD CONSTRAINT "PaymentRefund_status_check"
    CHECK ("status" IN (
      'REQUESTED', 'QUEUED', 'PENDING', 'PROCESSING',
      'REFUNDED', 'FAILED', 'CANCELED', 'UNKNOWN'
    )),
  ADD CONSTRAINT "PaymentRefund_source_check"
    CHECK ("source" IN (
      'ADMIN', 'WEBHOOK', 'REFUND_RECONCILE', 'PAYOUT_PREFLIGHT',
      'PAYMENT_STATUS', 'STRIPE_SYNC', 'ADYEN_WEBHOOK'
    )),
  ADD CONSTRAINT "PaymentRefund_refs_nonblank_check"
    CHECK (
      btrim("paymentRef") <> ''
      AND btrim("idempotencyKey") <> ''
      AND ("refundRef" IS NULL OR btrim("refundRef") <> '')
    ),
  ADD CONSTRAINT "PaymentRefund_lifecycle_timestamps_check"
    CHECK (
      ("status" <> 'REFUNDED' OR "completedAt" IS NOT NULL)
      AND ("status" NOT IN ('FAILED', 'CANCELED') OR "failedAt" IS NOT NULL)
    );

ALTER TABLE "RestaurantPayout"
  ADD CONSTRAINT "RestaurantPayout_lateRefundAdjustmentAmount_nonnegative_check"
    CHECK ("lateRefundAdjustmentAmount" >= 0);

ALTER TABLE "PayoutRecoveryAllocation"
  ADD CONSTRAINT "PayoutRecoveryAllocation_amount_positive_check" CHECK ("amount" > 0),
  ADD CONSTRAINT "PayoutRecoveryAllocation_status_check"
    CHECK ("status" IN ('RESERVED', 'APPLIED', 'RELEASED')),
  ADD CONSTRAINT "PayoutRecoveryAllocation_distinct_payouts_check"
    CHECK ("sourcePayoutId" <> "targetPayoutId");

CREATE OR REPLACE FUNCTION viaeats_block_order_hard_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Hard delete of Order is disabled; use status/tombstone'
    USING ERRCODE = '23503';
END;
$$;

CREATE TRIGGER "Order_block_hard_delete"
  BEFORE DELETE ON "Order"
  FOR EACH ROW EXECUTE FUNCTION viaeats_block_order_hard_delete();

CREATE OR REPLACE FUNCTION viaeats_validate_payment_refund_update()
RETURNS trigger AS $$
BEGIN
  IF
    NEW."id" IS DISTINCT FROM OLD."id" OR
    NEW."orderId" IS DISTINCT FROM OLD."orderId" OR
    NEW."provider" IS DISTINCT FROM OLD."provider" OR
    NEW."paymentRef" IS DISTINCT FROM OLD."paymentRef" OR
    NEW."idempotencyKey" IS DISTINCT FROM OLD."idempotencyKey" OR
    NEW."amount" IS DISTINCT FROM OLD."amount" OR
    NEW."cumulativeAmount" IS DISTINCT FROM OLD."cumulativeAmount" OR
    NEW."source" IS DISTINCT FROM OLD."source" OR
    NEW."actorAdminId" IS DISTINCT FROM OLD."actorAdminId" OR
    NEW."reason" IS DISTINCT FROM OLD."reason" OR
    NEW."firstSeenAt" IS DISTINCT FROM OLD."firstSeenAt" OR
    NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'PaymentRefund economic/source fields are immutable';
  END IF;
  IF OLD."refundRef" IS NOT NULL AND NEW."refundRef" IS DISTINCT FROM OLD."refundRef" THEN
    RAISE EXCEPTION 'PaymentRefund refundRef may only be attached once';
  END IF;
  IF OLD."providerCreatedAt" IS NOT NULL
     AND NEW."providerCreatedAt" IS DISTINCT FROM OLD."providerCreatedAt" THEN
    RAISE EXCEPTION 'PaymentRefund providerCreatedAt may only be attached once';
  END IF;
  IF OLD."completedAt" IS NOT NULL THEN
    NEW."completedAt" := OLD."completedAt";
  END IF;
  IF OLD."failedAt" IS NOT NULL THEN
    NEW."failedAt" := OLD."failedAt";
  END IF;
  IF NEW."lastSeenAt" < OLD."lastSeenAt" THEN
    NEW."lastSeenAt" := OLD."lastSeenAt";
  END IF;
  IF OLD."status" = 'REFUNDED' AND NEW."status" <> 'REFUNDED' THEN
    RAISE EXCEPTION 'A refunded PaymentRefund lifecycle may not regress';
  END IF;
  IF OLD."status" IN ('FAILED', 'CANCELED')
     AND NEW."status" NOT IN (OLD."status", 'REFUNDED') THEN
    RAISE EXCEPTION 'A terminal PaymentRefund lifecycle may not regress';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PaymentRefund_validate_update"
  BEFORE UPDATE ON "PaymentRefund"
  FOR EACH ROW EXECUTE FUNCTION viaeats_validate_payment_refund_update();

CREATE OR REPLACE FUNCTION viaeats_block_payment_refund_hard_delete()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Hard delete of PaymentRefund is disabled; retain the accounting trail'
    USING ERRCODE = '23503';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PaymentRefund_block_hard_delete"
  BEFORE DELETE ON "PaymentRefund"
  FOR EACH ROW EXECUTE FUNCTION viaeats_block_payment_refund_hard_delete();

CREATE OR REPLACE FUNCTION viaeats_block_restaurant_payout_hard_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Hard delete of RestaurantPayout is disabled; use an adjustment entry'
    USING ERRCODE = '23503';
END;
$$;

CREATE TRIGGER "RestaurantPayout_block_hard_delete"
  BEFORE DELETE ON "RestaurantPayout"
  FOR EACH ROW EXECUTE FUNCTION viaeats_block_restaurant_payout_hard_delete();

CREATE OR REPLACE FUNCTION viaeats_validate_payout_recovery_allocation()
RETURNS trigger AS $$
DECLARE
  source_restaurant TEXT;
  source_status TEXT;
  target_restaurant TEXT;
  target_status TEXT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD."status" = 'APPLIED' AND (
      NEW."sourcePayoutId" IS DISTINCT FROM OLD."sourcePayoutId" OR
      NEW."targetPayoutId" IS DISTINCT FROM OLD."targetPayoutId" OR
      NEW."amount" IS DISTINCT FROM OLD."amount" OR
      NEW."status" IS DISTINCT FROM OLD."status" OR
      NEW."reservedAt" IS DISTINCT FROM OLD."reservedAt" OR
      NEW."appliedAt" IS DISTINCT FROM OLD."appliedAt"
    ) THEN
      RAISE EXCEPTION 'Applied payout recovery allocations are immutable';
    END IF;
    IF NEW."sourcePayoutId" IS DISTINCT FROM OLD."sourcePayoutId" OR
       NEW."targetPayoutId" IS DISTINCT FROM OLD."targetPayoutId" THEN
      RAISE EXCEPTION 'Payout recovery source and target are immutable';
    END IF;
  END IF;

  SELECT "restaurantId", "status" INTO source_restaurant, source_status
  FROM "RestaurantPayout" WHERE "id" = NEW."sourcePayoutId";
  SELECT "restaurantId", "status" INTO target_restaurant, target_status
  FROM "RestaurantPayout" WHERE "id" = NEW."targetPayoutId";
  IF source_restaurant IS NULL OR target_restaurant IS NULL OR source_restaurant <> target_restaurant THEN
    RAISE EXCEPTION 'Payout recovery source and target must belong to the same restaurant';
  END IF;
  IF source_status <> 'PAID' THEN
    RAISE EXCEPTION 'Payout recovery source must be PAID';
  END IF;
  IF NEW."status" = 'RESERVED' AND target_status <> 'APPROVED' THEN
    RAISE EXCEPTION 'Reserved payout recovery target must be APPROVED';
  END IF;
  IF NEW."status" = 'APPLIED' AND target_status <> 'PAID' THEN
    RAISE EXCEPTION 'Applied payout recovery target must be PAID';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PayoutRecoveryAllocation_validate"
  BEFORE INSERT OR UPDATE ON "PayoutRecoveryAllocation"
  FOR EACH ROW EXECUTE FUNCTION viaeats_validate_payout_recovery_allocation();

CREATE OR REPLACE FUNCTION viaeats_block_payout_recovery_hard_delete()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Hard delete of PayoutRecoveryAllocation is disabled; release the reservation instead';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PayoutRecoveryAllocation_block_hard_delete"
  BEFORE DELETE ON "PayoutRecoveryAllocation"
  FOR EACH ROW EXECUTE FUNCTION viaeats_block_payout_recovery_hard_delete();

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtraGroup" ADD CONSTRAINT "ExtraGroup_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductExtraGroup" ADD CONSTRAINT "ProductExtraGroup_extraGroupId_fkey" FOREIGN KEY ("extraGroupId") REFERENCES "ExtraGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductExtraGroup" ADD CONSTRAINT "ProductExtraGroup_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Extra" ADD CONSTRAINT "Extra_extraGroupId_fkey" FOREIGN KEY ("extraGroupId") REFERENCES "ExtraGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRefund" ADD CONSTRAINT "PaymentRefund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourierPushSubscription" ADD CONSTRAINT "CourierPushSubscription_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "Courier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "Courier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantDevice" ADD CONSTRAINT "RestaurantDevice_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevicePairingCode" ADD CONSTRAINT "DevicePairingCode_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrustedDevice" ADD CONSTRAINT "TrustedDevice_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryCode" ADD CONSTRAINT "RecoveryCode_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Restaurant" ADD CONSTRAINT "Restaurant_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Restaurant" ADD CONSTRAINT "Restaurant_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "City" ADD CONSTRAINT "City_parentCityId_fkey" FOREIGN KEY ("parentCityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDeal" ADD CONSTRAINT "UserDeal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDeal" ADD CONSTRAINT "UserDeal_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_inviterUserId_fkey" FOREIGN KEY ("inviterUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_inviteeUserId_fkey" FOREIGN KEY ("inviteeUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantPayout" ADD CONSTRAINT "RestaurantPayout_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutRecoveryAllocation" ADD CONSTRAINT "PayoutRecoveryAllocation_sourcePayoutId_fkey" FOREIGN KEY ("sourcePayoutId") REFERENCES "RestaurantPayout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutRecoveryAllocation" ADD CONSTRAINT "PayoutRecoveryAllocation_targetPayoutId_fkey" FOREIGN KEY ("targetPayoutId") REFERENCES "RestaurantPayout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantPrinter" ADD CONSTRAINT "RestaurantPrinter_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedAddress" ADD CONSTRAINT "SavedAddress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerDeal" ADD CONSTRAINT "CustomerDeal_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerDeal" ADD CONSTRAINT "CustomerDeal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupOrder" ADD CONSTRAINT "GroupOrder_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupOrderItem" ADD CONSTRAINT "GroupOrderItem_groupOrderId_fkey" FOREIGN KEY ("groupOrderId") REFERENCES "GroupOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceInstallation" ADD CONSTRAINT "DeviceInstallation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceOrderSubscription" ADD CONSTRAINT "DeviceOrderSubscription_deviceInstallationId_fkey" FOREIGN KEY ("deviceInstallationId") REFERENCES "DeviceInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceOrderSubscription" ADD CONSTRAINT "DeviceOrderSubscription_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationOutbox" ADD CONSTRAINT "NotificationOutbox_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationOutbox" ADD CONSTRAINT "NotificationOutbox_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_outboxId_fkey" FOREIGN KEY ("outboxId") REFERENCES "NotificationOutbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_deviceInstallationId_fkey" FOREIGN KEY ("deviceInstallationId") REFERENCES "DeviceInstallation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

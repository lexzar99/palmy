-- Welcome-deal pekar nu på en Personal Template-Deal precis som referral.
-- Admin skapar mallen i /marketing-referrals och pekar hit via welcomeDealId.
ALTER TABLE "RestaurantSettings" ADD COLUMN IF NOT EXISTS "welcomeDealId" TEXT;

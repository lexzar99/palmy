import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticate, requireSuperAdmin } from '../middleware/auth';
import { getShowcaseAdmin } from '../lib/showcase';
import { isHomeCategoryVisibleNow, serializeHomeCategorySection } from '../lib/homeCategorySections';
import { readAllSponsors } from './sponsors';
import { readAllAds } from './ads';
import {
  resolveContentStatus,
  type ContentPlacementRecord,
} from '../lib/contentPlacement';

const router = Router();

router.get('/', authenticate, requireSuperAdmin, async (_req, res) => {
  try {
    const now = new Date();
    const [settings, categoryRows, showcase, sponsors, ads] = await Promise.all([
      prisma.restaurantSettings.findUnique({ where: { id: 'settings' } }),
      prisma.homeCategorySection.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
      getShowcaseAdmin(now),
      readAllSponsors(),
      readAllAds(),
    ]);

    const heroHasContent = Boolean(settings?.heroTitle || settings?.heroSubtitle || settings?.heroImageUrl);
    const records: ContentPlacementRecord[] = [
      {
        id: 'hero:platform',
        sourceId: 'settings',
        type: 'HERO',
        placement: 'HOME_HERO',
        title: settings?.heroTitle || 'Hero på hemskärmen',
        subtitle: settings?.heroSubtitle || null,
        status: resolveContentStatus({ isActive: true, hasContent: heroHasContent, now }),
        sortOrder: -2000,
        layout: 'HERO',
        editTarget: '/homepage?tab=hero',
      },
      ...categoryRows.map((row) => {
        const section = serializeHomeCategorySection(row);
        const visibleNow = row.isActive && isHomeCategoryVisibleNow(section.schedule);
        return {
          id: `rail:${row.id}`,
          sourceId: row.id,
          type: 'CATEGORY_RAIL' as const,
          placement: 'HOME_RAIL' as const,
          title: row.title,
          subtitle: row.subtitle,
          status: !row.isActive ? 'PAUSED' as const : section.schedule.enabled && !visibleNow ? 'SCHEDULED' as const : 'LIVE' as const,
          sortOrder: row.sortOrder,
          layout: 'RAIL' as const,
          editTarget: `/homepage?tab=rails&section=${row.id}`,
          metadata: {
            visibleNow,
            maxRestaurants: row.maxRestaurants,
            filterMode: row.filterMode,
          },
        };
      }),
      ...showcase.map((surface, index) => ({
        id: `showcase:${surface.surface}`,
        sourceId: surface.surface,
        type: 'SHOWCASE' as const,
        placement: 'HOME_FEATURED' as const,
        title: {
          champion: 'Veckans favorit',
          discounts: 'Rabatter',
          trending: 'Trendar',
          new: 'Ny i stan',
        }[surface.surface],
        subtitle: `${surface.shown.length} kort · rotation ${surface.rotationHours} h`,
        status: resolveContentStatus({ isActive: true, hasContent: surface.shown.length > 0, now }),
        sortOrder: -1000 + index,
        layout: 'LARGE_CARD' as const,
        editTarget: `/homepage?tab=cards&surface=${surface.surface}`,
        metadata: { shown: surface.shown.length, candidates: surface.candidates.length },
      })),
      ...sponsors.map((sponsor) => ({
        id: `sponsor:${sponsor.id}`,
        sourceId: sponsor.id,
        type: 'SPONSOR' as const,
        placement: sponsor.placement || 'HOME_FEATURED',
        title: sponsor.name,
        subtitle: sponsor.tagline || sponsor.category || null,
        status: resolveContentStatus({
          isActive: sponsor.isActive,
          hasContent: Boolean(sponsor.name && (sponsor.imageUrl || sponsor.cardType === 'TEXT')),
          startsAt: sponsor.startsAt,
          endsAt: sponsor.endsAt,
          now,
        }),
        sortOrder: sponsor.sortOrder,
        startsAt: sponsor.startsAt || null,
        endsAt: sponsor.endsAt || null,
        layout: sponsor.layout || 'LARGE_CARD',
        editTarget: `/homepage?tab=cards&type=sponsors&id=${sponsor.id}`,
      })),
      ...ads.map((ad) => ({
        id: `advertisement:${ad.id}`,
        sourceId: ad.id,
        type: 'ADVERTISEMENT' as const,
        placement: ad.placement || 'ORDER_TRACKING',
        title: ad.title || ad.brand,
        subtitle: ad.brand,
        status: resolveContentStatus({
          isActive: ad.isActive,
          hasContent: Boolean(ad.brand && ad.title),
          startsAt: ad.startsAt,
          endsAt: ad.endsAt,
          now,
        }),
        sortOrder: ad.sortOrder,
        startsAt: ad.startsAt || null,
        endsAt: ad.endsAt || null,
        layout: ad.layout || 'BANNER',
        editTarget: `/homepage?tab=cards&type=ads&id=${ad.id}`,
      })),
    ];

    const order = ['HOME_HERO', 'HOME_FEATURED', 'HOME_INLINE', 'HOME_RAIL', 'ORDER_TRACKING', 'POST_ORDER'];
    records.sort((a, b) => order.indexOf(a.placement) - order.indexOf(b.placement) || a.sortOrder - b.sortOrder);

    res.json({
      records,
      summary: {
        total: records.length,
        live: records.filter((record) => record.status === 'LIVE').length,
        scheduled: records.filter((record) => record.status === 'SCHEDULED').length,
        paused: records.filter((record) => record.status === 'PAUSED').length,
        draft: records.filter((record) => record.status === 'DRAFT').length,
        ended: records.filter((record) => record.status === 'ENDED').length,
      },
    });
  } catch (error: any) {
    console.error('[content placements] error:', error?.message);
    res.status(500).json({ error: 'Kunde inte hämta hemskärmens placements' });
  }
});

export default router;

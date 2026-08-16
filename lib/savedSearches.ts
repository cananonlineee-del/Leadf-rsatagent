import { createClient } from './supabase/client'
import type { Lead } from '../app/api/analyze/route'

export interface SavedSearch {
  id: string
  name: string | null
  sector: string
  city: string
  leads: Lead[]
  lead_count: number
  created_at: string
}

/**
 * Kaydedilecek lead'i önemli alanlarla sınırlar.
 * Büyük nested nesneleri (platforms, gaps[], lighthouse verisi) çıkarır.
 * Kart görünümü için gereken tüm alanlar korunur.
 */
function trimLeadForStorage(lead: Lead): Partial<Lead> {
  const {
    // Kart görünümü için zorunlu
    name, address, placeId, score, odemeGucu, acikSiddeti,
    phone, website, googleMapsUri, googleBusinessScore,
    rating, reviewCount, negativeReviewRate,
    instagramHandle, businessStatus, hasGoogleDescription,
    pitch, categoryProfile,
    // Hafif alt nesneler
    instagram, facebook, tiktok, metaAds, topCompetitor,
    youtubeHandle,
    siteAnalysis,
  } = lead

  const slimSite = siteAnalysis ? {
    emailAddress:      siteAnalysis.emailAddress,
    hasCorpEmail:      siteAnalysis.hasCorpEmail,
    hasPixel:          siteAnalysis.hasPixel,
    hasGoogleAds:      siteAnalysis.hasGoogleAds,
    mobileScore:       siteAnalysis.mobileScore,
    hasSocialLinks:    siteAnalysis.hasSocialLinks,
    hasAnalytics:      siteAnalysis.hasAnalytics,
    hasWhatsApp:       siteAnalysis.hasWhatsApp,
    hasClickablePhone: siteAnalysis.hasClickablePhone,
    hasOnlinePayment:  siteAnalysis.hasOnlinePayment,
    ssl:               siteAnalysis.ssl,
  } as Lead['siteAnalysis'] : null

  const slimInstagram = instagram ? {
    handle:          instagram.handle,
    activity:        instagram.activity,
    confidence:      instagram.confidence,
    confidenceReason: instagram.confidenceReason,
    followersCount:  instagram.followersCount,
    engagementRate:  instagram.engagementRate,
    weeklyPostFreq:  instagram.weeklyPostFreq,
    bioLength:       instagram.bioLength,
    bioHasPhone:     instagram.bioHasPhone,
    bioHasUrl:       instagram.bioHasUrl,
    usesReels:       instagram.usesReels,
    isPrivate:       instagram.isPrivate,
    postsCount:      instagram.postsCount,
    bio:             instagram.bio,
    lastPostDate:    instagram.lastPostDate,
  } as Lead['instagram'] : null

  return {
    name, address, placeId, score, odemeGucu, acikSiddeti,
    phone, website, googleMapsUri, googleBusinessScore,
    rating, reviewCount, negativeReviewRate,
    instagramHandle, businessStatus, hasGoogleDescription,
    pitch, categoryProfile,
    youtubeHandle,
    instagram:    slimInstagram,
    facebook,
    tiktok,
    metaAds,
    topCompetitor,
    siteAnalysis: slimSite,
    // gaps, platforms, domainInfo, _preScore, _candidateCount atlandı
  }
}

export async function saveSearch(
  sector: string,
  city: string,
  leads: Lead[],
  name?: string
): Promise<SavedSearch> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('saved_searches')
    .insert({
      sector,
      city,
      leads: leads.map(trimLeadForStorage),
      lead_count: leads.length,
      name: name ?? null,
    })
    .select()
    .single()

  if (error) throw error
  return data as SavedSearch
}

export async function listSearches(): Promise<SavedSearch[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('saved_searches')
    .select('id, name, sector, city, lead_count, created_at')
    .order('created_at', { ascending: false })
    .limit(20)
  return (data as SavedSearch[]) ?? []
}

export async function loadSearch(id: string): Promise<SavedSearch | null> {
  const supabase = createClient()
  const { data } = await supabase
    .from('saved_searches')
    .select('*')
    .eq('id', id)
    .single()
  return data as SavedSearch | null
}

export async function deleteSearch(id: string): Promise<void> {
  const supabase = createClient()
  await supabase.from('saved_searches').delete().eq('id', id)
}
